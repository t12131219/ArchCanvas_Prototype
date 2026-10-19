const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const root=path.resolve(__dirname,'..'),load=name=>JSON.parse(fs.readFileSync(path.join(root,'data/semantic/architecture',name+'.json')));
function fixture(size=3,cycle=false){return {schema:'archcanvas-source-semantic/2',title:'Unfamiliar',nodes:[{id:'root',kind:'composite',label:'Unknown pipeline',parent:null,source:[]},...Array.from({length:size},(_,i)=>({id:'n'+i,parent:'root',kind:'compute',operator:'foreign',label:'foreign_'+i,source:[]}))],edges:Array.from({length:size-1},(_,i)=>({id:'e'+i,source:'n'+i,target:'n'+(i+1),source_port:'out',target_port:'arg:0',kind:'data',evidence:'static-source'})),motifs:[] ,...(cycle?{}:{})};}
function accounted(ir,g){for(const [key,items]of [['edge_accounting',ir.edges],['node_accounting',ir.nodes]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length,key);assert.deepEqual(ids.sort(),items.map(x=>x.id).sort());}}
function full(ir,extra={}){return E.project(ir,{view:'publication',paperAuto:false,open:[...E.viewIndex(ir,{view:'publication'}).children.keys()].filter(Boolean),...extra});}
function noOverlap(g){const rows=new Map();for(const n of g.nodes){if(!rows.has(n.parent))rows.set(n.parent,[]);rows.get(n.parent).push(g.positions.get(n.id));}for(const ps of rows.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)assert.ok(!R.overlap(ps[i],ps[j]),`overlap ${ps[i].id} ${ps[j].id}`);}
function diamond(){
  const ir=fixture(8);ir.edges=[['n0','n1'],['n1','n2'],['n2','n7'],['n0','n3'],['n3','n4'],['n4','n7'],['n0','n5'],['n5','n6'],['n6','n7']].map(([source,target],i)=>({id:'d'+i,source,target,source_port:'out',target_port:'value:'+i,kind:'data',evidence:'source-dependency'}));
  return ir;
}
test('unfamiliar fork/join paths form reversible regions with exact entry and exit cuts',()=>{
  const ir=diamond(),before=JSON.stringify(ir);ir.nodes.find(n=>n.id==='n4').kind='opaque';
  const canonical=JSON.stringify(ir),p=P.plan(ir),f=p.findings.find(f=>f.rule==='branch-region');
  assert.ok(f);assert.equal(f.roles.entry,'n0');assert.equal(f.roles.exit,'n7');assert.equal(f.roles.paths.length,3);
  assert.equal(f.roles.execution_parallelism,'not-asserted');
  const group=p.nodes.find(n=>n.id===f.id);assert.equal(group.paper.unknown_count,1);
  assert.equal(group.boundary_ports.length,6);assert.ok(!group.canonical_members.includes('n0')&&!group.canonical_members.includes('n7'));
  for(const focus of [null,f.id,...f.roles.paths]){const out=R.render(ir,{paperFocus:focus});accounted(ir,out.graph);noOverlap(out.graph);assert.equal(out.prepared.quality.route_failures.length,0);}
  assert.equal(JSON.stringify(ir),canonical);assert.notEqual(canonical,before);
  const renamed=E.clone(ir);renamed.title='BertMoELSTM';for(const n of renamed.nodes)n.label='new name';
  assert.deepEqual(P.plan(renamed).findings.map(f=>[f.rule,f.members,f.roles]),p.findings.map(f=>[f.rule,f.members,f.roles]));
});
test('fork/join grouping rejects side exits, shared interiors, feedback and effect boundaries',()=>{
  for(const mutate of [
    ir=>ir.edges.push({...ir.edges[0],id:'side-exit',source:'n1',target:'n6'}),
    ir=>ir.edges.push({...ir.edges[0],id:'feedback',source:'n4',target:'n0'}),
    ir=>ir.edges.push({...ir.edges[0],id:'side-input',source:'n7',target:'n3'}),
    ir=>ir.nodes.find(n=>n.id==='n3').mutable=true,
    ir=>ir.edges[0].condition={branch:'guard',outcome:'true'}
  ]){const ir=diamond();mutate(ir);assert.ok(!P.plan(ir).findings.some(f=>f.rule==='branch-region'));accounted(ir,E.project(ir,{view:'publication'}));}
});
test('inner branch regions compose into outer paths without turning a nested DAG into a chain',()=>{
  const ir=diamond();ir.nodes.push(...['a','b','c','d'].map(id=>({id,parent:'root',kind:'compute',operator:'foreign',label:id,source:[]})));
  ir.edges=ir.edges.filter(e=>!(e.source==='n1'&&e.target==='n2'));
  for(const [source,target]of [['n1','a'],['a','b'],['b','n2'],['n1','c'],['c','d'],['d','n2']])ir.edges.push({id:'nested'+ir.edges.length,source,target,source_port:'out',target_port:'in',kind:'data',evidence:'source-dependency'});
  const p=P.plan(ir),groups=p.findings.filter(f=>f.rule==='branch-region');assert.equal(groups.length,2);
  const inner=groups.find(f=>f.roles.entry==='n1'),outer=groups.find(f=>f.roles.entry==='n0');assert.ok(inner&&outer);
  let parent=p.nodes.find(n=>n.id===inner.id).parent;assert.ok(outer.roles.paths.includes(parent));
  for(const focus of [null,inner.id,outer.id]){const out=R.render(ir,{paperFocus:focus});accounted(ir,out.graph);noOverlap(out.graph);}
});
test('cross-scope inputs and escaping results prevent a false isolated branch region',()=>{
  for(const direction of ['input','output']){
    const ir=diamond();for(const n of ir.nodes)if(n.parent==='root')n.parent='scope';
    ir.nodes.push({id:'scope',parent:'root',kind:'composite',label:'scope',source:[]},{id:'external',parent:'root',kind:'compute',operator:'foreign',label:'outside',source:[]});
    ir.edges.push({id:'cross-scope',source:direction==='input'?'external':'n1',target:direction==='input'?'n1':'external',source_port:'out',target_port:'in',kind:'data',evidence:'source-dependency'});
    assert.ok(!P.plan(ir).findings.some(f=>f.rule==='branch-region'));
    accounted(ir,E.project(ir,{view:'publication',paperFocus:'scope'}));
  }
});
test('AST-derived foreign composition keeps three branch paths, opaque kernel and framework state roles',()=>{
  const ir=load('BranchMosaic'),p=P.plan(ir),f=p.findings.find(f=>f.rule==='branch-region');assert.ok(f);
  assert.equal(f.roles.paths.length,3);
  const group=p.nodes.find(n=>n.id===f.id);assert.equal(group.paper.unknown_count,1);
  const opaque=ir.nodes.find(n=>n.kind==='opaque');assert.ok(group.canonical_members.includes(opaque.id));
  assert.ok(p.nodes.filter(n=>n.kind==='composite').every(n=>!['MoE','LSTM'].includes(n.label)));
  for(const focus of [null,f.id,...f.roles.paths]){const out=R.render(ir,{paperFocus:focus});accounted(ir,out.graph);noOverlap(out.graph);assert.deepEqual(out.prepared.quality.issues,[]);}
});
test('mutable arithmetic keeps a visible effect caption instead of a pure algebra symbol',()=>{
  const ir=fixture(2);Object.assign(ir.nodes.find(n=>n.id==='n1'),{operator:'add',mutable:true});
  const out=R.render(ir,{}),node=out.graph.nodes.find(n=>n.id==='n1');
  assert.equal(node.paper.symbol,null);assert.match(node.paper.caption,/In-place update/);
  assert.match(out.svg,/In-place update/);accounted(ir,out.graph);
});
test('publication is reversible and accounts for every original node and edge',()=>{for(const name of ['ForeignComposition','BrokenCell','UnknownFusion','LoopWithBoundary','SharedBranches']){const ir=load(name),before=JSON.stringify(ir),p=P.plan(ir);for(const n of ir.nodes)assert.ok(p.nodes.some(v=>v.id===n.id));for(const g of [E.project(ir,{view:'publication'}),full(ir)]){accounted(ir,g);noOverlap(g);}assert.equal(JSON.stringify(ir),before);}});
test('focused panel records exact cuts with original endpoints, slots and evidence',()=>{const ir=load('ForeignComposition'),p=P.plan(ir);for(const focus of p.nodes.filter(n=>n.kind==='composite'&&n.parent)){const g=E.project(ir,{view:'publication',paperFocus:focus.id}),inside=new Set([focus.id]),idx=E.index(p),todo=[focus.id];for(let i=0;i<todo.length;i++)for(const id of idx.children.get(todo[i])||[]){inside.add(id);todo.push(id);}const cut=ir.edges.filter(e=>inside.has(e.source)!==inside.has(e.target));assert.deepEqual(g.publication.boundary.map(e=>e.id).sort(),cut.map(e=>e.id).sort());for(const e of g.publication.boundary){assert.ok(g.positions.has(e.visible_node));if(e.presentation!=='attached-resource')assert.ok(g.idx.nodes.has(e.port_node));const raw=ir.edges.find(v=>v.id===e.id);for(const k of ['source','target','source_port','target_port','evidence'])assert.deepEqual(e[k],raw[k]);}accounted(ir,g);}});
test('closed source modules keep canonical input bindings without internal-consumer duplicates',()=>{const ir=load('ForeignComposition'),g=E.project(ir,{view:'publication'}),n=ir.nodes.find(n=>n.module_path==='piece'&&n.kind==='composite');assert.ok(n);const edges=g.edges.filter(e=>e.target===n.id);assert.equal(edges.length,2);assert.deepEqual(edges.map(e=>e.target_port).sort(),['state','x']);assert.ok(edges.every(e=>e.kind==='interface-binding'));});
test('unknown kernels survive, and a partial cell is never named full LSTM',()=>{const ir=load('UnknownFusion'),g=full(ir);for(const n of ir.nodes.filter(n=>n.kind==='opaque'))assert.ok(g.nodes.some(v=>v.id===n.id&&v.paper.category==='unknown'));assert.ok(P.plan(load('BrokenCell')).nodes.every(n=>n.operator!=='lstm'));});
test('large unfamiliar DAG, broad fanout and SCC terminate with stable presentation-only regions',()=>{for(const shape of ['serial','fanout','cycle']){const ir=fixture(65);if(shape==='fanout')for(const e of ir.edges)e.source='n0';if(shape==='cycle')ir.edges.push({...ir.edges[0],id:'feedback',source:'n64',target:'n0'});const p=P.plan(ir);assert.ok(p.publication.structural_regions>0);assert.ok(p.nodes.length<ir.nodes.length*2);for(const g of [E.project(ir,{view:'publication'}),full(ir)]){accounted(ir,g);noOverlap(g);for(const v of g.positions.values())assert.ok(['x','y','w','h'].every(k=>Number.isFinite(v[k])));}assert.deepEqual(P.plan(E.clone(ir)).findings,p.findings);}});
test('model and class names do not select geometry templates',()=>{const ir=load('ForeignComposition'),renamed=E.clone(ir);renamed.title='ResNetBertLSTMMoE';for(const n of renamed.nodes){n.label='LSTM';n.source_class='Bert';}assert.deepEqual(P.plan(renamed).findings.map(f=>[f.rule,f.members]),P.plan(ir).findings.map(f=>[f.rule,f.members]));});
test('synthetic identifiers cannot collide with canonical node identifiers',()=>{const ir=fixture(24),first=P.plan(ir).nodes.find(n=>n.presentation_only);assert.ok(first);ir.nodes.push({id:first.id,parent:'root',kind:'opaque',label:'foreign',source:[]});const p=P.plan(E.clone(ir));assert.equal(new Set(p.nodes.map(n=>n.id)).size,p.nodes.length);assert.equal(p.nodes.find(n=>n.id===first.id).kind,'opaque');});
test('Q K V roles require final-axis transpose and softmax evidence',()=>{const ir=load('ForeignComposition'),roles=g=>g.edges.flatMap(e=>e.paper_labels).filter(l=>['Q','K','V'].includes(l.text)).map(l=>l.text).sort();assert.deepEqual(roles(full(ir)),['K','Q','V']);for(const mutate of [x=>{x.nodes.find(n=>n.function_target?.endsWith('.transpose')).arguments.args=[0,1];},x=>{x.nodes.find(n=>n.operator==='softmax').arguments.kwargs.dim=0;}]){const wrong=E.clone(ir);mutate(wrong);assert.deepEqual(roles(full(wrong)),[]);}});
test('tuple alias and identity interface compose LSTM h and c slots without losing producer',()=>{const ir=fixture(0);ir.nodes.push({id:'cell',parent:'root',kind:'compute',operator:'lstm',label:'cell',source:[]},{id:'pair',parent:'root',kind:'value-alias',slot:'1',label:'state',source:[]},{id:'hidden',parent:'root',kind:'value-alias',slot:'0',label:'hidden',source:[]},{id:'inner',parent:'root',kind:'composite',label:'inner',source:[]},{id:'identity',parent:'inner',kind:'interface',role:'output',label:'identity',source:[]},{id:'out',parent:'root',kind:'interface',role:'output',label:'out',source:[]});ir.edges=[['cell','pair','1'],['pair','hidden','0'],['hidden','identity','out'],['identity','out','out']].map(([source,target,source_port],i)=>({id:'e'+i,source,target,source_port,target_port:'in',kind:'alias',evidence:'static-source'}));const g=full(ir),e=g.edges.find(e=>e.target==='out');assert.equal(e.resolved_source,'cell');assert.equal(e.source_port,'1.0');assert.ok(e.paper_labels.some(l=>l.text==='hₙ'));accounted(ir,g);});
test('SVG has physical dimensions, complete labels and serialized node accounting',()=>{const ir=fixture(1);ir.nodes[1].label='Unfamiliar_Long_完整模块名称_'.repeat(8);const out=R.render(ir,{});assert.ok(out.prepared.quality.width_mm<=180);assert.ok(out.prepared.quality.height_mm<=240);assert.match(out.svg,/width="[0-9.]+mm"/);assert.equal(P.wrap(ir.nodes[1].label,184).join('').replaceAll(' ',''),ir.nodes[1].label);assert.ok(out.document.layout.node_accounting);assert.equal(out.document.diagnostics.publication.height_mm,Number((out.document.layout.bounds.h/out.document.layout.bounds.w*out.prepared.quality.width_mm).toFixed(1)));});
test('atlas exports all source composites, saved documents reopen, strict quality remains measurable',()=>{const os=require('node:os'),{exportAtlas,readInput}=require('../tools/export_publication.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'publication-test-'));try{const ir=load('ForeignComposition'),m=exportAtlas(ir,dir,{textQA:true});assert.ok(m.complete);assert.match(fs.readFileSync(path.join(dir,m.text_qa),'utf8'),new RegExp(m.audit_digest));assert.ok(m.panels.length>4);assert.ok(fs.existsSync(path.join(dir,'index.html')));for(const p of m.panels){const saved=readInput(path.join(dir,p.document));assert.deepEqual(saved.ir,ir);const doc=JSON.parse(fs.readFileSync(path.join(dir,p.document)));accounted(ir,doc.layout);assert.ok(m.panels.some(v=>v.svg===p.svg));}const limited=exportAtlas(ir,path.join(dir,'limited'),{maxPanels:1});assert.equal(limited.complete,false);assert.ok(limited.omitted_panels.length);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('focused portals are visible even when the true interface belongs to a closed child',()=>{const ir=fixture(3);ir.nodes.push({id:'child',parent:'root',kind:'composite',label:'child',source:[]},{id:'interface',parent:'child',kind:'interface',role:'input',label:'argument',source:[]});ir.edges.push({id:'cut',source:'n0',target:'interface',source_port:'1.0',target_port:'x',kind:'interface-binding',evidence:'source-dependency'});ir.nodes.find(n=>n.id==='n1').parent='child';ir.nodes.push({id:'panel',parent:'root',kind:'composite',label:'panel',source:[]});ir.nodes.find(n=>n.id==='child').parent='panel';const g=E.project(ir,{view:'publication',paperFocus:'panel'});assert.ok(g.publication.boundary.length);for(const e of g.edges){assert.ok(g.positions.has(e.source),e.id);assert.ok(g.positions.has(e.target),e.id);}for(const p of g.publication.boundary)assert.ok(g.positions.has(p.port_node));});
test('runtime mode drops stale source focus and uses observed nodes only',()=>{const ir=load('ForeignComposition-runtime'),source=ir.nodes.find(n=>n.module_path==='piece'&&n.kind==='composite');const g=E.project(ir,{view:'publication',mode:'runtime',paperFocus:source.id});assert.equal(g.publication.focus,'runtime-observations');assert.ok(g.nodes.every(n=>n.id==='runtime-observations'||n.id.startsWith('runtime:')||n.presentation_only));accounted(ir,g);});
test('large boundary bundles keep every canonical value and distinct physical terminals',()=>{const ir=fixture(9);ir.nodes.push({id:'panel',parent:'root',kind:'composite',label:'panel',source:[]},{id:'sink',parent:'panel',kind:'compute',label:'foreign fusion',operator:'foreign',source:[]});ir.edges=ir.nodes.filter(n=>n.id.startsWith('n')).map((n,i)=>({id:'cut'+i,source:n.id,target:'sink',source_port:String(i),target_port:'arg:'+i,kind:'data',evidence:'static-source'}));const before=JSON.stringify(ir),out=R.render(ir,{paperFocus:'panel'}),g=out.graph;assert.equal(g.publication.boundary.length,9);assert.equal(new Set(g.publication.boundary.map(e=>e.port_node)).size,9);assert.equal(new Set(g.publication.boundary.map(e=>e.visible_node)).size,1);assert.equal(new Set(out.prepared.routes.map(e=>JSON.stringify(e.route.points[0]))).size,9);for(const e of g.publication.boundary)assert.ok(g.idx.nodes.has(e.port_node));accounted(ir,g);assert.equal(JSON.stringify(ir),before);});
test('an unobserved model cannot be presented as a runtime figure',()=>{assert.throws(()=>R.render(load('BrokenCell'),{mode:'runtime'}),/没有 CPU 执行轨迹/);});
test('an incoming arrow and outgoing fold on the same side have distinct terminals',()=>{const L=require('../semantic_studio/architecture-layout'),ir=fixture(3),p=new Map([['n0',{x:0,y:0,w:100,h:60}],['n1',{x:0,y:180,w:100,h:60}],['n2',{x:150,y:0,w:100,h:60}]]);p.context={idx:E.index(ir),edges:ir.edges,feedback:new Set()};const inbound=L.route(ir.edges[0],p),outbound=L.route(ir.edges[1],p);assert.equal(inbound.target_side,'top');assert.equal(outbound.source_side,'top');assert.notDeepEqual(inbound.points.at(-1),outbound.points[0]);assert.ok(inbound.ok&&outbound.ok);});
test('parallel branch labels fit without notes, overlap or covering another edge',()=>{const ir=fixture(2);ir.edges=Array.from({length:4},(_,i)=>({id:'branch'+i,source:'n0',target:'n1',source_port:'value:'+i,target_port:'result:'+i,kind:'data',evidence:'source-dependency',condition:{branch:'guard',outcome:i%2?'true':'false'}}));const out=R.render(ir,{}),labels=out.prepared.labeling.placed;assert.equal(labels.length,4);assert.equal(out.prepared.labeling.suppressed.length,0);assert.ok(labels.some(l=>l.knockout));for(let i=0;i<labels.length;i++){for(let j=i+1;j<labels.length;j++)assert.ok(!R.overlap(labels[i],labels[j]));for(const n of out.graph.nodes){const p=out.graph.positions.get(n.id),box=p.expanded?{...p,h:p.header-10}:p;assert.ok(!R.overlap(labels[i],box));}}assert.equal(out.prepared.quality.line_geometry.overlapping_paths.length,0);accounted(ir,out.graph);});
test('short state edges can carry full labels above or below the path',()=>{const ir=fixture(2);ir.nodes[1].operator='rnn';ir.edges[0].source_port='1';const out=R.render(ir,{});assert.equal(out.prepared.labeling.suppressed.length,0);assert.ok(out.prepared.labeling.placed.some(l=>l.text==='hₙ'));});

test('branch detail aligns independent paths, shares the input value and attaches parameter cuts',()=>{
  const ir=load('BranchMosaic'),f=P.plan(ir).findings.find(f=>f.rule==='branch-region'),out=R.render(ir,{paperFocus:f.id}),g=out.graph;
  const paths=f.roles.paths.map(id=>g.positions.get(id));
  assert.equal(new Set(paths.map(p=>p.y)).size,1,'independent paths must share a row');
  assert.ok(paths.every((p,i)=>paths.every((q,j)=>i===j||p.x+p.w<=q.x||q.x+q.w<=p.x)));
  const cuts=g.publication.boundary,resourceCuts=cuts.filter(c=>c.presentation==='attached-resource');
  assert.equal(resourceCuts.length,2);
  for(const cut of resourceCuts){assert.ok(g.edge_accounting.attached.includes(cut.id));assert.ok(g.positions.has(cut.visible_node));assert.ok(g.annotations.get(cut.visible_node).some(a=>a.edge.id===cut.id));}
  const dataInputs=cuts.filter(c=>c.direction==='input'&&c.presentation!=='attached-resource');
  assert.equal(dataInputs.length,3);assert.equal(new Set(dataInputs.map(c=>c.port_node)).size,1);
  assert.deepEqual(g.nodes.filter(n=>n.boundary_edge&&n.role==='output').map(n=>n.label).sort(),['slot 0','slot 1','slot 2']);
  assert.ok(g.nodes.filter(n=>n.boundary_edge).every(n=>g.edges.some(e=>e.source===n.id||e.target===n.id)),'no orphan boundary inputs');
  accounted(ir,g);noOverlap(g);assert.deepEqual(out.prepared.quality.issues,[]);
});
test('a modified parameter remains a real data boundary rather than an attached constant resource',()=>{
  const ir=fixture(2);ir.nodes.push({id:'weight',parent:'root',kind:'parameter',label:'weight',source:[]},{id:'panel',parent:'root',kind:'composite',label:'panel',source:[]});
  ir.nodes.find(n=>n.id==='n1').parent='panel';
  ir.edges.push({id:'read',source:'weight',target:'n1',source_port:'out',target_port:'weight',kind:'data',evidence:'source-dependency'},
    {id:'write',source:'n0',target:'weight',source_port:'out',target_port:'value',kind:'state-write',evidence:'source-dependency'});
  const g=E.project(ir,{view:'publication',paperFocus:'panel'}),cut=g.publication.boundary.find(e=>e.id==='read');
  assert.notEqual(cut.presentation,'attached-resource');assert.ok(g.edges.some(e=>e.id==='read'));accounted(ir,g);
});

test('a nested unfamiliar serial container can use two fold columns to retain print readability',()=>{
  const ir=fixture(9);ir.nodes.push({id:'serial',parent:'root',kind:'composite',semantic_type:'sequential',label:'custom stages',source:[]},
    {id:'input',parent:'root',kind:'interface',role:'input',label:'input',source:[]},{id:'output',parent:'root',kind:'interface',role:'output',label:'output',source:[]});
  for(const n of ir.nodes)if(n.id.startsWith('n'))n.parent='serial';
  ir.edges.push({id:'in',source:'input',target:'n0',source_port:'out',target_port:'arg:0',kind:'data',evidence:'source-dependency'},
    {id:'out',source:'n8',target:'output',source_port:'out',target_port:'return',kind:'data',evidence:'source-dependency'});
  const out=R.render(ir,{});assert.ok(out.prepared.quality.min_print_font_pt>=8);assert.deepEqual(out.prepared.quality.issues,[]);
  assert.ok(out.graph.positions.get('serial').expanded);accounted(ir,out.graph);noOverlap(out.graph);
});

test('identifier wrapping uses word and acronym boundaries without changing source text',()=>{
  assert.deepEqual(P.wrap('TransformerEncoderLayer',128),['Transformer','EncoderLayer']);
  assert.deepEqual(P.wrap('HTTPFeatureProjection',128),['HTTPFeature','Projection']);
  for(const text of ['foreignFeatureTransform','HTTPFeatureProjection','未命名FeatureTransform','x_state2Projection'])
    assert.equal(P.wrap(text,94).join(''),text);
  const ir=load('BranchMosaic'),n=P.plan(ir).nodes.find(n=>n.operator==='encoder-layer');
  assert.ok(n.paper.lines.includes('EncoderLayer'));assert.ok(!n.paper.lines.includes('yer'));
});
test('wide unfamiliar branch panels remain readable and reversible from 4 through 48 paths',()=>{
  const {branches}=require('./publication-fixtures.cjs');
  for(const count of [4,6,8,12,24,48]){
    const ir=branches(count),before=JSON.stringify(ir),p=P.plan(ir),f=p.findings.find(f=>f.rule==='branch-region');
    assert.equal(f.roles.paths.length,count);assert.equal(f.roles.execution_parallelism,'not-asserted');
    const idx=E.index(p),branch=p.nodes.find(n=>n.id===f.id);assert.equal(branch.paper.unknown_count,1);
    assert.equal(branch.canonical_members.length,2*count);
    for(const n of p.nodes.filter(n=>n.kind==='composite')){
      if(['branch-panel','branch-region'].includes(n.semantic_type))assert.ok((idx.children.get(n.id)||[]).length<=3);
      const out=R.render(ir,{paperFocus:n.id}),g=out.graph;accounted(ir,g);noOverlap(g);
      assert.deepEqual(out.prepared.quality.issues,[],`${count} paths: ${n.label}`);
      const expandedEdges=g.edges.flatMap(e=>e.bundle_members||[e]);
      assert.deepEqual(expandedEdges.map(e=>e.id).sort(),g.edge_accounting.visible.slice().sort());
      for(const cut of g.publication.boundary)assert.ok(g.positions.has(cut.visible_node));
    }
    assert.equal(JSON.stringify(ir),before);
  }
});
test('ribbons distinguish repeated input use from different outputs and retain every operand',()=>{
  const {branches}=require('./publication-fixtures.cjs'),ir=branches(12),p=P.plan(ir),f=p.findings.find(f=>f.rule==='branch-region');
  const out=R.render(ir,{paperFocus:f.id}),g=out.graph,bundles=g.edges.filter(e=>e.bundle_members);
  assert.ok(bundles.some(e=>e.bundle_values===1));assert.ok(bundles.some(e=>e.bundle_values>1));
  for(const edge of bundles){
    assert.equal(edge.tensor_equality,'not-asserted');assert.ok(!Object.hasOwn(edge,'canonical_source'));
    assert.equal(edge.paper_labels.length,1);
    assert.match(edge.paper_labels[0].text,edge.bundle_values===1?/ uses$/:/ values$/);
    for(const member of edge.bundle_members){const raw=ir.edges.find(e=>e.id===member.id);assert.ok(raw);assert.equal(member.canonical_source,raw.source);assert.equal(member.canonical_target,raw.target);assert.equal(member.target_port,raw.target_port);}
  }
  assert.match(out.svg,/data-bundle-members=/);accounted(ir,g);
  const detail=R.render(ir,{paperFocus:f.roles.paths[0]});assert.ok(detail.graph.edges.every(e=>!e.bundle_members));
});
test('eight AST source paths keep two unknown kernels and precise packed result slots in every panel',()=>{
  const ir=load('WideBranches'),p=P.plan(ir),f=p.findings.find(f=>f.rule==='branch-region');assert.ok(f);assert.equal(f.roles.paths.length,8);
  const root=p.nodes.find(n=>n.id===f.id);assert.equal(root.paper.unknown_count,2);
  for(const n of p.nodes.filter(n=>n.kind==='composite')){const out=R.render(ir,{paperFocus:n.id});accounted(ir,out.graph);noOverlap(out.graph);assert.deepEqual(out.prepared.quality.issues,[],n.label);}
  assert.ok(p.nodes.every(n=>!['MoE','LSTM'].includes(n.label)));
});
test('hybrid source module panels place ribbon labels beside short doglegs',()=>{
  const ir=load('BranchMosaic'),p=P.plan(ir);
  for(const n of p.nodes.filter(n=>n.kind==='composite')){
    const out=R.render(ir,{paperFocus:n.id});
    accounted(ir,out.graph);noOverlap(out.graph);
    assert.deepEqual(out.prepared.quality.issues,[],n.label);
    assert.equal(out.prepared.labeling.suppressed.length,0,n.label);
  }
});
test('shared-result DAGs use dependency frontiers without independent-path claims',()=>{
  const {woven}=require('./publication-fixtures.cjs');
  for(const [width,depth]of [[3,3],[4,3],[4,4],[6,4],[8,4],[4,8]]){
    const ir=woven(width,depth),canonical=JSON.stringify(ir),p=P.plan(ir),bands=p.findings.filter(f=>f.rule==='dependency-band');
    assert.equal(bands.length,depth);assert.ok(!p.findings.some(f=>f.rule==='branch-region'));
    for(const band of bands){
      assert.equal(band.roles.units.length,width);assert.equal(band.roles.execution_parallelism,'not-asserted');
      assert.ok(band.roles.units.every(id=>Number(id.match(/^n(\d+)_/)[1])===band.roles.dependency_depth));
    }
    for(const n of p.nodes.filter(n=>n.kind==='composite')){
      const out=R.render(ir,{paperFocus:n.id}),g=out.graph;accounted(ir,g);noOverlap(g);
      assert.deepEqual(out.prepared.quality.issues,[],`${width}×${depth} ${n.label}`);
      assert.deepEqual(g.edges.flatMap(e=>(e.bundle_members||[e]).map(m=>m.id)).sort(),g.edge_accounting.visible.slice().sort());
      for(const cut of g.publication.boundary)assert.ok(g.positions.has(cut.visible_node));
    }
    assert.equal(R.render(ir,{}).prepared.quality.line_geometry.crossings,0);
    assert.equal(JSON.stringify(ir),canonical);
  }
});
test('dependency bands preserve skips, conditions and state edges; feedback keeps the SCC view',()=>{
  const {woven}=require('./publication-fixtures.cjs'),ir=woven(4,4);
  ir.edges.push({id:'skip',source:'n0_0',target:'n3_0',source_port:'out',target_port:'arg:2',kind:'data',evidence:'source-dependency'},
    {id:'state',source:'n1_0',target:'n2_0',source_port:'state',target_port:'state',kind:'state-write',evidence:'source-dependency'},
    {id:'guarded',source:'n1_1',target:'n2_1',source_port:'out',target_port:'arg:2',kind:'data',evidence:'source-dependency',condition:{branch:'foreign-guard',outcome:'true'}});
  const out=R.render(ir,{}),edges=out.graph.edges.flatMap(e=>e.bundle_members||[e]);accounted(ir,out.graph);
  for(const id of ['skip','state','guarded'])assert.ok(edges.some(e=>e.id===id));
  assert.ok(out.graph.edges.some(e=>e.id==='state'&&!e.bundle_members));
  assert.deepEqual(out.graph.edges.find(e=>e.id==='guarded').condition,ir.edges.at(-1).condition);
  const renamed=E.clone(ir);renamed.title='LSTMTransformerMoE';for(const n of renamed.nodes)n.label='BERT';
  assert.deepEqual(P.plan(renamed).findings.map(f=>[f.rule,f.members,f.roles]),P.plan(ir).findings.map(f=>[f.rule,f.members,f.roles]));
  const cyclic=E.clone(ir);cyclic.edges.push({...ir.edges[0],id:'feedback',source:'n3_0',target:'n0_0'});
  assert.ok(!P.plan(cyclic).findings.some(f=>f.rule==='dependency-band'));
  accounted(cyclic,R.render(cyclic,{}).graph);
});
test('boundary groups count shared source values separately from their external uses',()=>{
  const {woven}=require('./publication-fixtures.cjs'),ir=woven(8,4),p=P.plan(ir),band=p.findings.find(f=>f.rule==='dependency-band'&&f.roles.dependency_depth===0);
  const g=R.render(ir,{paperFocus:band.id}).graph,outputs=g.nodes.find(n=>n.semantic_type==='boundary-interface-group'&&n.label==='External outputs');
  assert.equal(outputs.boundary_members.length,8);assert.equal(outputs.boundary_value_count,8);assert.equal(outputs.boundary_use_count,16);
  assert.equal(outputs.paper.caption,'8 values · 16 uses');
  assert.equal(g.publication.boundary.filter(e=>e.direction==='output').length,16);accounted(ir,g);
});
test('AST shared-result fusion retains unknown operations in every dependency panel',()=>{
  const ir=load('WovenFusion'),canonical=JSON.stringify(ir),p=P.plan(ir);
  assert.ok(p.findings.some(f=>f.rule==='dependency-band'));assert.ok(!p.findings.some(f=>f.rule==='branch-region'));
  assert.equal(R.render(ir,{}).graph.publication.unknowns,1);
  for(const n of p.nodes.filter(n=>n.kind==='composite')){const out=R.render(ir,{paperFocus:n.id});accounted(ir,out.graph);noOverlap(out.graph);assert.deepEqual(out.prepared.quality.issues,[],n.label);}
  assert.equal(JSON.stringify(ir),canonical);
});

test('open loop templates keep source boundaries instead of dependency bands',()=>{
  const {woven}=require('./publication-fixtures.cjs'),ir=woven(4,4);
  ir.nodes.find(n=>n.id==='root').semantic_type='loop-template';
  assert.ok(!P.plan(ir).findings.some(f=>f.rule==='dependency-band'));
  accounted(ir,R.render(ir,{}).graph);
});
test('parallel ribbons keep differing evidence and fit every label',()=>{
  const {woven}=require('./publication-fixtures.cjs'),ir=woven(4,4);
  for(const edge of ir.edges)if(edge.target_port==='arg:1')edge.evidence='framework-contract';
  const out=R.render(ir,{}),g=out.graph;
  assert.ok(g.edges.some((a,i)=>a.bundle_members&&g.edges.some((b,j)=>i!==j&&a.source===b.source&&a.target===b.target&&a.evidence!==b.evidence)));
  assert.deepEqual(out.prepared.quality.issues,[]);
  assert.equal(out.prepared.labeling.suppressed.length,0);accounted(ir,g);noOverlap(g);
});
test('shared external results retain every consumer and exact operand at one result terminal',()=>{
  const ir=load('WovenFusion'),p=P.plan(ir),band=p.findings.find(f=>f.rule==='dependency-band'&&f.roles.dependency_depth===2);
  const out=R.render(ir,{paperFocus:band.id}),g=out.graph,ports=g.nodes.filter(n=>n.boundary_uses?.length>1);
  assert.equal(ports.length,3);assert.equal(new Set(ports.map(n=>n.label)).size,3);
  for(const port of ports){
    assert.equal(port.boundary_uses.length,2);assert.equal(port.paper.caption,'2 external uses');
    for(const use of port.boundary_uses){const cut=g.publication.boundary.find(e=>e.id===use.id);assert.equal(cut.port_node,port.id);assert.deepEqual(ir.edges.find(e=>e.id===use.id),use);}
  }
  assert.equal(g.publication.boundary.filter(e=>e.direction==='output').length,6);
  assert.equal(out.prepared.quality.line_geometry.crossings,0);
  assert.deepEqual(out.prepared.quality.issues,[]);accounted(ir,g);noOverlap(g);
});
test('configuration cuts remain attached evidence without orphan synthetic data ports',()=>{
  const ir=fixture(2);ir.nodes.push({id:'scope',kind:'composite',label:'reshape section',parent:'root',source:[]},{id:'size',kind:'compute',operator:'shape',label:'size',parent:'root',source:[]});
  ir.nodes.find(n=>n.id==='n1').parent='scope';
  ir.edges.push({id:'configuration',source:'size',target:'n1',source_port:'out',target_port:'kw:size',kind:'data',evidence:'source-dependency'});
  const out=R.render(ir,{paperFocus:'scope'}),g=out.graph,cut=g.publication.boundary.find(e=>e.id==='configuration');
  assert.equal(cut.presentation,'attached-metadata');assert.ok(g.positions.has(cut.visible_node));assert.ok(g.edge_accounting.attached.includes(cut.id));
  assert.ok(g.annotations.get(cut.visible_node).some(a=>a.edge.id===cut.id));
  assert.ok(!g.nodes.some(n=>n.boundary_edge===cut.id));
  assert.ok(g.nodes.filter(n=>n.boundary_edge).every(n=>g.edges.some(e=>e.source===n.id||e.target===n.id)));
  accounted(ir,g);noOverlap(g);assert.deepEqual(out.prepared.quality.issues,[]);
});

function resultCuts(){
  const ir=fixture(0);
  ir.nodes.push({id:'scope',kind:'composite',parent:'root',label:'foreign section',source:[]},
    {id:'producer',kind:'opaque',parent:'scope',label:'foreign kernel',source:[]},
    ...['a','b'].map(id=>({id,kind:'compute',operator:'foreign',parent:'root',label:id,source:[]})));
  ir.edges=['a','b'].map((target,i)=>({id:'use'+i,source:'producer',target,source_port:'out',target_port:'arg:'+i,kind:'data',evidence:'source-dependency'}));
  return ir;
}
test('result sharing never merges differing slots, producers, evidence, kinds, conditions or state',()=>{
  for(const mutate of [
    ir=>ir.edges[1].source_port='1.0',
    ir=>{ir.nodes.push({...ir.nodes.find(n=>n.id==='producer'),id:'other'});ir.edges[1].source='other';},
    ir=>ir.edges[1].evidence='framework-contract',
    ir=>ir.edges[1].kind='alias',
    ir=>{for(const e of ir.edges)e.condition={branch:'guard',outcome:'true'};},
    ir=>{for(const e of ir.edges)e.kind='state-write';}
  ]){
    const ir=resultCuts();mutate(ir);const before=JSON.stringify(ir),g=R.render(ir,{paperFocus:'scope'}).graph;
    const cuts=g.publication.boundary.filter(e=>e.direction==='output');
    assert.equal(cuts.length,2);assert.equal(new Set(cuts.map(e=>e.port_node)).size,2);
    assert.ok(g.nodes.every(n=>!(n.boundary_uses?.length>1)));accounted(ir,g);assert.equal(JSON.stringify(ir),before);
  }
});
test('alias result sharing preserves exact use ids and tuple slots without asserting tensor equality',()=>{
  const ir=resultCuts();
  for(const [i,id]of ['alias-a','alias-b'].entries()){
    ir.nodes.push({id,kind:'value-alias',parent:'scope',slot:'1.0',label:id,source:[]});
    ir.edges.push({id:'binding'+i,source:'producer',target:id,source_port:'1.0',target_port:'in',kind:'alias',evidence:'source-dependency'});
    ir.edges[i].source=id;
  }
  const before=JSON.stringify(ir),out=R.render(ir,{paperFocus:'scope'}),g=out.graph,ports=g.nodes.filter(n=>n.boundary_uses?.length>1);
  assert.equal(ports.length,1);const port=ports[0];
  assert.deepEqual(port.boundary_value,{source:'producer',source_port:'1.0',identity_scope:'extracted-graph',tensor_equality:'not-asserted'});
  assert.match(port.label,/\[1\.0\]$/);assert.equal(port.canonical_endpoint,undefined);
  assert.deepEqual(port.boundary_uses,ir.edges.slice(0,2));
  assert.ok(g.nodes.some(n=>n.id==='producer'&&n.kind==='opaque'));
  assert.deepEqual(g.edges.flatMap(e=>(e.bundle_members||[e]).map(m=>m.id)).sort(),g.edge_accounting.visible.slice().sort());
  for(const cut of g.publication.boundary)assert.equal(cut.port_node,port.id);
  assert.equal(JSON.stringify(ir),before);accounted(ir,g);
});
test('conditional aliases do not collapse unrelated result identities',()=>{
  const ir=resultCuts();
  for(const [i,id]of ['alias-a','alias-b'].entries()){
    ir.nodes.push({id,kind:'value-alias',parent:'scope',slot:'0',label:id,source:[]});
    ir.edges.push({id:'binding'+i,source:'producer',target:id,source_port:'0',target_port:'in',kind:'alias',evidence:'source-dependency',condition:{branch:'guard',outcome:String(i)}});
    ir.edges[i].source=id;
  }
  const g=R.render(ir,{paperFocus:'scope'}).graph;
  assert.equal(new Set(g.publication.boundary.map(e=>e.port_node)).size,2);accounted(ir,g);
});
test('SVG result tooltips preserve every consumer and escape source labels and slots',()=>{
  const ir=resultCuts();ir.nodes.find(n=>n.id==='a').label='foreign <consumer> & "a"';ir.edges[0].target_port='kw:<x>';
  const out=R.render(ir,{paperFocus:'scope'}),g=out.graph,port=g.nodes.find(n=>n.boundary_uses?.length>1);
  const title=R.nodeTitle(port,g.idx);
  assert.match(title,/use0: foreign <consumer> & "a" \[kw:<x>\]/);assert.match(title,/use1: b \[arg:1\]/);
  assert.match(out.svg,/use0: foreign &lt;consumer&gt; &amp; &quot;a&quot; \[kw:&lt;x&gt;\]/);
  assert.ok(!out.svg.includes('<consumer>'));assert.match(out.svg,/use1: b \[arg:1\]/);
});

test('neighbor-ordered terminals remove an artificial braid without changing operands',()=>{
  const ir=fixture(3);ir.edges=[{...ir.edges[0],id:'right',source:'n0',target:'n2',target_port:'kw:right'}, {...ir.edges[1],id:'left',source:'n0',target:'n1',target_port:'kw:left'}];
  const before=JSON.stringify(ir),out=R.render(ir,{}),g=out.graph;
  assert.equal(out.prepared.quality.route_strategy,'neighbors-short');assert.equal(out.prepared.quality.line_geometry.crossings,0);
  const left=out.prepared.routes.find(e=>e.id==='left'),right=out.prepared.routes.find(e=>e.id==='right');
  assert.ok(left.route.points[0].x<right.route.points[0].x);
  assert.equal(left.target_port,'kw:left');assert.equal(right.target_port,'kw:right');
  assert.equal(left.canonical_target,'n1');assert.equal(right.canonical_target,'n2');
  assert.deepEqual(out.prepared.quality.issues,[]);accounted(ir,g);assert.equal(JSON.stringify(ir),before);
});
test('route selection is repeatable and restores the selected route cache for interactive use',()=>{
  const ir=fixture(3);ir.edges=[{...ir.edges[0],id:'right',source:'n0',target:'n2'}, {...ir.edges[1],id:'left',source:'n0',target:'n1'}];
  const g=E.project(ir,{view:'publication'}),positions=JSON.stringify([...g.positions]),first=R.prepare(g),again=R.prepare(g);
  assert.deepEqual(first,again);assert.equal(JSON.stringify([...g.positions]),positions);
  assert.equal(g.positions.context.portOrder,'neighbors');
  for(const edge of again.routes)assert.deepEqual(E.route(edge,g.positions),edge.route);
  const simple=R.render(fixture(2),{});assert.equal(simple.prepared.quality.route_strategy,'canonical-short');
});

test('a focused pass-through alias stays connected to its panel input and output',()=>{
  const ir=fixture(2);ir.nodes.push({id:'scope',kind:'composite',parent:'root',label:'foreign identity',source:[]},{id:'local',kind:'value-alias',slot:null,parent:'scope',label:'local binding',source:[]});
  ir.edges=[{id:'incoming',source:'n0',target:'local',source_port:'out',target_port:'value',kind:'alias',evidence:'source-dependency'},
    {id:'outgoing',source:'local',target:'n1',source_port:'out',target_port:'arg:1',kind:'data',evidence:'source-dependency'}];
  const before=JSON.stringify(ir),out=R.render(ir,{paperFocus:'scope'}),g=out.graph;
  const input=g.publication.boundary.find(e=>e.id==='incoming'),output=g.publication.boundary.find(e=>e.id==='outgoing');
  assert.equal(g.idx.nodes.get(input.port_node).label,'local binding');
  const edge=g.edges.find(e=>e.id==='outgoing');assert.equal(edge.source,input.port_node);assert.equal(edge.target,output.port_node);
  assert.equal(edge.canonical_source,'local');assert.equal(edge.canonical_target,'n1');assert.equal(edge.target_port,'arg:1');
  assert.ok(edge.originals.includes('incoming'));assert.ok(g.edge_accounting.contracted.includes('incoming'));
  assert.ok(g.nodes.filter(n=>n.boundary_edge).every(n=>g.edges.some(e=>e.source===n.id||e.target===n.id)));
  assert.deepEqual(out.prepared.quality.issues,[]);accounted(ir,g);assert.equal(JSON.stringify(ir),before);
});

test('a cut into an external alias retains its output wire instead of being contracted',()=>{
  const ir=resultCuts();ir.nodes.find(n=>n.id==='a').kind='value-alias';ir.nodes.find(n=>n.id==='a').operator=undefined;
  ir.edges=[{...ir.edges[0],kind:'alias',target_port:'value'}];
  const out=R.render(ir,{paperFocus:'scope'}),g=out.graph,cut=g.publication.boundary[0];
  assert.ok(g.edges.some(e=>e.id==='use0'&&e.source==='producer'&&e.target===cut.port_node));
  assert.ok(g.edge_accounting.visible.includes('use0'));assert.ok(!g.edge_accounting.contracted.includes('use0'));
  assert.ok(g.nodes.filter(n=>n.boundary_edge).every(n=>g.edges.some(e=>e.source===n.id||e.target===n.id)));accounted(ir,g);
});

test('revisiting early wires reduces crossings while preserving operands, positions and interactive cache',()=>{
  const ir=fixture(8),pairs=[[0,7],[1,5],[2,5],[2,6],[3,6],[4,5],[6,7]];
  ir.edges=pairs.map(([a,b],i)=>({id:'e'+i,source:'n'+a,target:'n'+b,source_port:'out',target_port:'arg:'+i,kind:'data',evidence:'source-dependency'}));
  const canonical=JSON.stringify(ir),g=E.project(ir,{view:'publication',paperAuto:false,open:['root']}),positions=JSON.stringify([...g.positions]);
  const prepared=R.prepare(g),refined=prepared.routing.refinement;
  assert.ok(refined.accepted.length>0);assert.ok(refined.after_crossings<refined.before_crossings);
  assert.ok(refined.after_contacts<=refined.before_contacts);
  assert.ok(refined.attempts<=32);assert.deepEqual(prepared.quality.issues,[]);
  for(const edge of prepared.routes){
    const original=ir.edges.find(e=>e.id===edge.id);
    assert.equal(edge.target_port,original.target_port);assert.equal(edge.canonical_source,original.source);assert.equal(edge.canonical_target,original.target);
    assert.deepEqual(E.route(edge,g.positions),edge.route);
  }
  assert.equal(JSON.stringify([...g.positions]),positions);assert.equal(JSON.stringify(ir),canonical);accounted(ir,g);
  assert.deepEqual(R.prepare(g),prepared);
});

test('unrelated elbows that meet are recorded separately from strict crossings and shared values',()=>{
  const edge=(id,points)=>({id,resolved_source:id,source_port:'out',route:{points:points.map(([x,y])=>({x,y}))}});
  const a=edge('a',[[0,0],[10,0],[10,10]]),b=edge('b',[[10,-10],[10,0],[20,0]]);
  const geometry=R.lineGeometry([a,b]);assert.equal(geometry.crossings,0);
  assert.deepEqual(geometry.unrelated_contacts,[{edges:['a','b'],x:10,y:0}]);assert.deepEqual(geometry.overlapping_paths,[]);
  b.resolved_source='a';assert.deepEqual(R.lineGeometry([a,b]).unrelated_contacts,[]);
  const crossing=R.lineGeometry([edge('x',[[0,0],[20,0]]),edge('y',[[10,-10],[10,10]])]);
  assert.equal(crossing.crossings,1);assert.deepEqual(crossing.unrelated_contacts,[]);
});

test('contact repair reaches a zero-crossing diagram and keeps independent flows separate',()=>{
  const ir=fixture(8),pairs=[[0,7],[1,7],[2,6],[4,5]];
  ir.edges=pairs.map(([a,b],i)=>({id:'e'+i,source:'n'+a,target:'n'+b,source_port:'out',target_port:'arg:'+i,kind:'data',evidence:'source-dependency'}));
  const canonical=JSON.stringify(ir),g=E.project(ir,{view:'publication',paperAuto:false,open:['root']}),positions=JSON.stringify([...g.positions]);
  const prepared=R.prepare(g),contactFix=prepared.routing.refinement.accepted.find(a=>a.phase==='contacts');
  assert.ok(contactFix);assert.deepEqual(contactFix.crossings,[0,0]);assert.ok(contactFix.contacts[1]<contactFix.contacts[0]);
  assert.equal(prepared.quality.line_geometry.unrelated_contacts.length,0);assert.deepEqual(prepared.quality.issues,[]);
  assert.equal(JSON.stringify([...g.positions]),positions);assert.equal(JSON.stringify(ir),canonical);accounted(ir,g);
  for(const edge of prepared.routes){assert.equal(edge.target_port,ir.edges.find(e=>e.id===edge.id).target_port);assert.deepEqual(E.route(edge,g.positions),edge.route);}
  assert.deepEqual(R.prepare(g),prepared);
});

test('ambiguous contacts may become one explicit overpass within a bounded conflict budget',()=>{
  const ir=fixture(10),pairs=[[0,1],[3,2],[2,4],[1,4],[1,4],[2,5],[2,6],[4,7],[1,8],[8,9]];
  ir.edges=pairs.map(([a,b],i)=>({id:'e'+String(i).padStart(2,'0'),source:'n'+a,target:'n'+b,source_port:i===5?'1':i===6?'0':'out',target_port:'arg:'+i,kind:[1,2].includes(i)?'control':'data',evidence:'source-dependency'}));
  const canonical=JSON.stringify(ir),g=E.project(ir,{view:'publication',paperAuto:false,open:['root']});
  // Original tight geometry with an aligned elbow and a later skip edge.
  const boxes=[[85,96,154,44],[56,204,212,64],[296,204,212,78],[267,96,212,64],[296,326,212,94],[56,464,212,78],[296,464,212,78],[267,586,212,78],[56,326,212,64],[85,586,154,44]];
  for(let i=0;i<boxes.length;i++){const [x,y,w,h]=boxes[i];Object.assign(g.positions.get('n'+i),{x,y,w,h});}
  Object.assign(g.positions.get('root'),{x:32,y:30,w:500,h:658,header:66});
  g.bounds={x:18,y:16,w:528,h:686};const positions=JSON.stringify([...g.positions]),prepared=R.prepare(g),f=prepared.routing.refinement;
  assert.equal(f.after_contacts,0);assert.equal(f.after_crossings,2);assert.equal(f.before_crossings,1);
  const separated=f.accepted.filter(a=>a.tradeoff==='contacts-to-crossings');assert.equal(separated.length,1);
  assert.equal(separated[0].phase,'separation');assert.deepEqual(separated[0].crossings,[1,2]);assert.deepEqual(separated[0].contacts,[2,0]);
  assert.ok(f.attempts<=112);assert.deepEqual(prepared.quality.issues,[]);
  assert.equal(JSON.stringify([...g.positions]),positions);assert.equal(JSON.stringify(ir),canonical);accounted(ir,g);
  for(const e of prepared.routes)assert.deepEqual(E.route(e,g.positions),e.route);
  assert.deepEqual(R.prepare(g),prepared);
});

test('dependency inventories describe actual local units without naming a model family',()=>{
  const ir=load('WovenFusion'),canonical=JSON.stringify(ir),p=P.plan(ir),by=new Map(p.nodes.map(n=>[n.id,n]));
  const bands=p.findings.filter(f=>f.rule==='dependency-band').sort((a,b)=>a.roles.dependency_depth-b.roles.dependency_depth);
  assert.deepEqual(bands.map(f=>by.get(f.id).paper.caption),['Linear × 3','Add × 3','Tanh · ReLU · 1 unresolved','Add × 3','Linear × 3']);
  for(const f of bands){const n=by.get(f.id),c=n.content_inventory;
    assert.equal(c.basis,'direct-semantic-units');assert.equal(c.multiplicity,'extracted-units');
    for(const field of ['execution_order','parameter_sharing','tensor_equality'])assert.equal(c[field],'not-asserted');
    assert.deepEqual(c.units.map(u=>u.id),f.roles.units);assert.equal(c.terms.reduce((s,t)=>s+t.count,0),3);
    for(const unit of c.units)assert.equal(unit.label,by.get(unit.id).label);
  }
  const unknownBand=by.get(bands[2].id);assert.equal(unknownBand.paper.unknown_count,1);
  const title=R.nodeTitle(unknownBand,by);assert.match(title,/Unresolved × 1/);assert.match(title,/unfamiliar_kernel/);
  const out=R.render(ir,{});assert.match(out.svg,/Linear × 3/);assert.match(out.svg,/Tanh · ReLU/);accounted(ir,out.graph);
  assert.equal(JSON.stringify(ir),canonical);
});

test('suggestive source names and partial unknown structures cannot manufacture semantic terms',()=>{
  const ir=require('./publication-fixtures.cjs').woven(3,3);ir.title='BERT LSTM MoE';
  for(const n of ir.nodes)if(n.kind==='compute'||n.kind==='opaque')n.label='TransformerEncoder + CompleteLSTM + MoE';
  const p=P.plan(ir),groups=p.nodes.filter(n=>n.content_inventory);assert.ok(groups.length>0);
  for(const n of groups){
    assert.ok(n.content_inventory.terms.every(t=>['Other operation','Unresolved'].includes(t.label)));
    assert.equal(n.paper.caption_scope,undefined);assert.match(n.paper.caption,/units · dependency depth/);
    assert.ok(!/BERT|LSTM|Encoder|MoE/.test(n.content_inventory.terms.map(t=>t.label).join(' ')));
  }
  assert.ok(groups.some(n=>n.content_inventory.units.some(u=>u.origin==='unresolved')));
});

test('nested inventories count leaf units once and retain all kinds beyond the compact text budget',()=>{
  const ir=require('./publication-fixtures.cjs').woven(8,3),ops=['linear','convolution','normalization','activation','softmax','pooling','dropout','embedding'];
  for(let i=0;i<8;i++){const n=ir.nodes.find(n=>n.id==='n0_'+i);n.operator=ops[i];if(i===0)n.mutable=true;}
  const canonical=JSON.stringify(ir),p=P.plan(ir),by=new Map(p.nodes.map(n=>[n.id,n]));
  const first=p.findings.find(f=>f.rule==='dependency-band'&&f.roles.dependency_depth===0),band=by.get(first.id),c=band.content_inventory;
  assert.equal(c.units.length,8);assert.equal(new Set(c.units.map(u=>u.id)).size,8);
  assert.equal(c.terms.length,8);assert.equal(c.terms.find(t=>t.label==='Linear (in-place)').count,1);
  assert.ok(band.paper.inventory_summary.omitted_kinds>0);assert.match(band.paper.caption,/\+\d+ kinds/);
  assert.ok(band.paper.captions.length<=P.wrap(band.region_summary,184,13).length);
  for(const line of band.paper.captions)assert.ok(P.width(line,13)<=184);
  const detail=R.render(ir,{paperFocus:first.id}),frame=detail.graph.positions.get(first.id);
  const titleHeight=Math.max(66,24+band.paper.lines.length*20+P.wrap(band.region_summary,184,13).length*16);
  assert.equal(frame.header,titleHeight+20);assert.equal(frame.protected_header_height,titleHeight-10);
  for(const n of p.nodes.filter(n=>n.semantic_type==='dependency-panel')){
    const f=p.findings.find(f=>f.id===n.finding);assert.deepEqual(n.content_inventory.units.map(u=>u.id),f.roles.units);
    assert.ok(n.content_inventory.units.every(u=>ir.nodes.some(n=>n.id===u.id)));
  }
  const out=R.render(ir,{});accounted(ir,out.graph);assert.deepEqual(out.prepared.quality.issues,[]);assert.equal(JSON.stringify(ir),canonical);
});

test('unfamiliar gated composition retains nested algebra, outside uses and its unknown boundary',()=>{
  const ir=load('GatedMixture'),before=JSON.stringify(ir),plan=P.plan(ir),f=plan.findings.find(f=>f.rule==='gated-sum');
  assert.equal(f.presentation,'group');assert.equal(f.roles.state_update,'not-asserted');
  const focus=R.render(ir,{paperFocus:f.id}),n=focus.graph.idx.nodes.get(f.id);
  assert.equal(n.paper.category,'algebra');assert.equal(focus.graph.publication.unknowns,0);
  const leftBinding=ir.edges.find(e=>e.source===f.roles.terms[0].product&&e.kind==='alias').target;
  assert.ok(focus.graph.publication.boundary.some(e=>e.direction==='output'&&e.source===leftBinding));
  assert.deepEqual(focus.prepared.quality.issues,[]);accounted(ir,focus.graph);
  const overview=R.render(ir,{});assert.equal(overview.graph.publication.unknowns,1);
  assert.ok(overview.graph.nodes.some(n=>n.kind==='opaque'&&n.label==='unfamiliar_kernel'));
  for(const term of f.roles.terms)for(const id of [term.gate_edge,term.value_edge,term.sum_edge])assert.ok(ir.edges.some(e=>e.id===id));
  assert.deepEqual(R.render(overview.document.ir,overview.document.state).svg,overview.svg);
  assert.equal(JSON.stringify(ir),before);
});

test('port labels fit directly or retry row spacing while preserving operands and manual positions',()=>{
  const ir=load('GatedMixture'),base=E.project(ir,{view:'publication'}),baseline=R.prepare(base),out=R.render(ir,{paperRankStrategy:'earliest'});
  assert.deepEqual(out.prepared.quality.issues,[]);
  if(baseline.quality.unplaced_port_labels.length){
    assert.equal(out.prepared.routing.layout_refinement.before_unplaced_labels,baseline.quality.unplaced_port_labels.length);
    assert.equal(out.prepared.routing.layout_refinement.after_unplaced_labels,0);
  }else assert.ok(!out.prepared.routing.layout_refinement);
  assert.ok(out.prepared.quality.line_geometry.crossings<=baseline.quality.line_geometry.crossings);
  assert.equal(out.prepared.quality.line_geometry.unrelated_contacts.length,0);
  assert.ok(out.prepared.quality.min_print_font_pt>=8);assert.ok(out.prepared.quality.width_mm<=180);
  assert.deepEqual(out.graph.edges,base.edges);assert.deepEqual(out.graph.publication.boundary,base.publication.boundary);
  accounted(ir,out.graph);noOverlap(out.graph);
  for(const label of out.prepared.labeling.placed)for(const n of out.graph.nodes){const p=out.graph.positions.get(n.id);assert.ok(!R.overlap(label,p.expanded?{...p,h:p.header-10}:p));}
  const state={offsets:{[ir.nodes[0].id]:{x:23,y:11}}},manual=E.project(ir,{...state,view:'publication'}),preserved=R.prepareFigure(ir,state);
  assert.deepEqual([...preserved.graph.positions],[...manual.positions]);assert.ok(!preserved.prepared.routing.layout_refinement);
  const fixed=R.prepareFigure(ir,{paperAuto:false,open:base.publication.open});assert.ok(!fixed.prepared.routing.layout_refinement);
});

test('consumer ranks shorten slack paths while retaining interfaces, feedback and true dependencies',()=>{
  const L=require('../semantic_studio/architecture-layout.js'),ir=fixture(0);
  for(const id of ['in','a','b','c','side','join','out'])ir.nodes.push({id,parent:'root',kind:['in','out'].includes(id)?'interface':'compute',label:id,source:[]});
  ir.edges=[['in','a'],['a','b'],['b','c'],['in','side'],['side','join'],['c','join'],['join','out']].map(([source,target],i)=>({id:'e'+i,source,target,kind:i===4?'state-read':'data'}));
  const idx=E.index(ir),visible=new Set(ir.nodes.map(n=>n.id)),options={foldSerial:false,nodeSize:()=>({w:50,h:50})};
  const early=L.layout(idx,['root'],visible,ir.edges,{},options),late=L.layout(idx,['root'],visible,ir.edges,{},{...options,rankStrategy:'consumer'});
  assert.ok(late.get('side').y>early.get('side').y);assert.equal(late.get('side').y,late.get('c').y);
  for(const id of ['in','out'])assert.equal(late.get(id).y,early.get(id).y);
  for(const e of ir.edges)assert.ok(late.get(e.source).y+50<late.get(e.target).y);
  ir.edges.push({id:'feedback',source:'c',target:'b',kind:'data'});
  const cyclic=L.layout(idx,['root'],visible,ir.edges,{},{...options,rankStrategy:'consumer'});
  assert.equal(cyclic.get('b').y,cyclic.get('c').y);assert.ok(cyclic.context.feedback.has('feedback'));
  assert.ok(cyclic.get('b').cyclic&&cyclic.get('c').cyclic);
});

test('automatic topology choice preserves readability, accounting and cached routes when comparing fewer crossings',()=>{
  const ir=load('GatedMixture'),canonical=JSON.stringify(ir),before=R.render(ir,{paperRankStrategy:'earliest'}),out=R.render(ir,{}),t=out.prepared.routing.topology_refinement;
  assert.ok(before.prepared.quality.line_geometry.crossings>0);assert.equal(t.candidate.crossings,0);
  if(t.accepted){assert.equal(t.selected,'consumer');assert.equal(out.prepared.quality.line_geometry.crossings,0);}
  else {assert.equal(t.selected,'earliest');assert.ok(t.candidate.min_print_font_pt<t.before.min_print_font_pt);assert.equal(out.svg,before.svg);}
  assert.ok(out.prepared.quality.height_mm<=before.prepared.quality.height_mm);
  assert.ok(out.prepared.quality.min_print_font_pt>=before.prepared.quality.min_print_font_pt);
  assert.ok(out.prepared.quality.wire_length<=before.prepared.quality.wire_length*t.max_wire_ratio);
  assert.deepEqual(out.prepared.quality.issues,[]);assert.equal(out.graph.publication.unknowns,1);
  for(const key of ['node_accounting','edge_accounting','representatives','edges'])assert.deepEqual(out.graph[key],before.graph[key]);
  assert.deepEqual(out.graph.architecture.findings,before.graph.architecture.findings);
  assert.deepEqual(out.graph.publication.boundary,before.graph.publication.boundary);
  accounted(ir,out.graph);noOverlap(out.graph);
  for(const edge of out.prepared.routes)assert.deepEqual(E.route(edge,out.graph.positions),edge.route);
  assert.equal(R.render(out.document.ir,out.document.state).svg,out.svg);
  assert.equal(JSON.stringify(ir),canonical);
});

test('manual geometry and candidates without fewer crossings retain the original layout',()=>{
  const ir=load('ForeignComposition'),out=R.render(ir,{}),base=R.render(ir,{paperRankStrategy:'earliest'});
  assert.equal(out.prepared.routing.topology_refinement.accepted,false);assert.equal(out.svg,base.svg);
  const hybrid=load('GatedMixture');
  for(const state of [{paperAuto:false,open:[hybrid.nodes[0].id]},{offsets:{[hybrid.nodes[0].id]:{x:13,y:7}}}]){
    const g=E.project(hybrid,{...state,view:'publication'}),fixed=R.prepareFigure(hybrid,state);
    assert.deepEqual([...fixed.graph.positions],[...g.positions]);assert.equal(fixed.prepared.routing.topology_refinement,undefined);
  }
});

function configurationFixture(entry){
  return JSON.parse(fs.readFileSync(path.join(root,'tests/semantic_fixtures/configuration-ir.json'))).cases[entry];
}

test('literal dimension arithmetic becomes a source-backed configuration annotation in a hybrid',()=>{
  const ir=configurationFixture('ShapeDrivenFusion'),canonical=JSON.stringify(ir),out=R.render(ir,{}),g=out.graph;
  const scalar=ir.nodes.find(n=>n.source[0].expression==='4 * 2'),view=ir.nodes.find(n=>n.function_target?.endsWith('.view'));
  assert.ok(g.node_accounting.attached.includes(scalar.id));assert.ok(!g.nodes.some(n=>n.id===scalar.id));
  assert.equal(g.idx.nodes.get(view.id).paper.caption,'shape -1 × 8');
  const proof=g.publication.configuration_arithmetic.find(r=>r.node===scalar.id);
  assert.equal(proof.value_evaluation,'not-performed');assert.equal(proof.expression,'4 * 2');
  assert.deepEqual(proof.uses,ir.edges.filter(e=>e.source===scalar.id));
  assert.ok(g.annotations.get(view.id).some(n=>n.configuration_proof?.some(p=>p.node===scalar.id)));
  assert.equal(g.publication.unknowns,1);assert.ok(g.nodes.some(n=>n.kind==='opaque'&&n.label==='unfamiliar_fusion'));
  assert.deepEqual(out.prepared.quality.issues,[]);accounted(ir,g);noOverlap(g);
  assert.equal(R.render(out.document.ir,out.document.state).svg,out.svg);assert.equal(JSON.stringify(ir),canonical);
});

test('constant aliases attach only when every use is a configuration use, retaining the full proof chain',()=>{
  const ir=configurationFixture('ConfigurationBinding'),out=R.render(ir,{}),g=out.graph;
  const scalar=ir.nodes.find(n=>n.source[0].expression==='4 * 2'),alias=ir.nodes.find(n=>n.kind==='value-alias'),view=ir.nodes.find(n=>n.operator==='reshape');
  assert.ok(!g.nodes.some(n=>[scalar.id,alias.id].includes(n.id)));
  assert.deepEqual(new Set(g.publication.configuration_arithmetic.map(p=>p.kind)),new Set(['literal-arithmetic','literal-binding']));
  const note=g.annotations.get(view.id).find(n=>n.configuration_proof);
  assert.deepEqual(new Set(note.configuration_proof.map(p=>p.node)),new Set([scalar.id,alias.id]));
  const exposed=configurationFixture('ReturnedDimension'),before=JSON.stringify(exposed),visible=full(exposed);
  assert.deepEqual(visible.publication.configuration_arithmetic,[]);
  assert.ok(visible.nodes.some(n=>n.source[0]?.expression==='4 * 2'));accounted(exposed,visible);assert.equal(JSON.stringify(exposed),before);
});

test('scalar coefficients and unknown calls keep their arithmetic as real dataflow',()=>{
  for(const entry of ['FeatureCoefficient','UnknownConfiguration']){
    const ir=configurationFixture(entry);
    if(entry==='UnknownConfiguration')ir.nodes.find(n=>n.kind==='opaque').function_target='unfamiliar.view';
    const g=full(ir);assert.deepEqual(g.publication.configuration_arithmetic,[]);
    assert.ok(g.nodes.some(n=>n.source[0]?.expression==='4 * 2'));accounted(ir,g);
  }
});

test('suggestive literal text cannot override tensor, conditional, mutable or runtime dependencies',()=>{
  for(const change of [
    (ir,n)=>ir.edges.push({id:'tensor-dependency',source:ir.nodes.find(n=>n.role==='input').id,target:n.id,source_port:'out',target_port:'0',kind:'data',evidence:'source-dependency'}),
    (ir,n)=>{n.mutable=true;},(ir,n)=>{n.condition={branch:'foreign',outcome:'true'};},
    (ir,n)=>{n.evidence_status='runtime-only';},(ir,n)=>{n.runtime_evidence=[{event:1}];},
    (ir,n)=>{ir.edges.find(e=>e.source===n.id).condition={branch:'foreign',outcome:'true'};},
    (ir,n)=>{ir.edges.find(e=>e.source===n.id).evidence='runtime-tensor';},
    (ir,n)=>{ir.edges.find(e=>e.source===n.id).source_port='1';}
  ]){
    const ir=configurationFixture('ConfigurationBinding'),n=ir.nodes.find(n=>n.source[0].expression==='4 * 2');change(ir,n);
    const g=full(ir);assert.deepEqual(g.publication.configuration_arithmetic,[]);assert.ok(g.nodes.some(x=>x.id===n.id));accounted(ir,g);
  }
});

test('literal syntax recognition is bounded and excludes names, calls and malformed expressions',()=>{
  for(const expression of ['width * 2','factory() * 2','4 **','4 + "2"','4e2 * 2','4; dangerous()','('.repeat(20)+'4 * 2'+')'.repeat(20),'1 + '.repeat(50)+'2']){
    const ir=configurationFixture('ConfigurationBinding'),n=ir.nodes.find(n=>n.source[0].expression==='4 * 2');n.source[0].expression=expression;
    assert.deepEqual(full(ir).publication.configuration_arithmetic,[],expression);
  }
  const ir=configurationFixture('ConfigurationBinding');ir.nodes.find(n=>n.source[0].expression==='4 * 2').source[0].expression='(4_0 // 2) * -2';
  assert.equal(full(ir).publication.configuration_arithmetic.filter(n=>n.kind==='literal-arithmetic').length,1);
});

test('focused configuration cuts retain original slots and source proof without orphan ports',()=>{
  const ir=configurationFixture('ConfigurationBinding'),view=ir.nodes.find(n=>n.operator==='reshape');
  ir.nodes.push({id:'shape-panel',parent:ir.nodes[0].id,kind:'composite',label:'unfamiliar stage',source:[]});view.parent='shape-panel';
  const out=R.render(ir,{paperFocus:'shape-panel'}),g=out.graph,cut=ir.edges.find(e=>e.target===view.id&&e.target_port==='arg:1');
  const shown=g.publication.boundary.find(e=>e.id===cut.id);assert.equal(shown.presentation,'attached-metadata');
  for(const key of ['source','target','source_port','target_port','evidence'])assert.equal(shown[key],cut[key]);
  assert.ok(g.edge_accounting.attached.includes(cut.id));
  assert.ok(g.annotations.get(view.id).some(n=>n.configuration_proof?.some(p=>p.expression==='4 * 2')));
  for(const n of g.nodes.filter(n=>n.boundary_edge))assert.ok(g.edges.some(e=>e.source===n.id||e.target===n.id));
  assert.deepEqual(out.prepared.quality.issues,[]);accounted(ir,g);noOverlap(g);
});

test('reshape captions distinguish method shapes, functional inputs and unresolved dimensions',()=>{
  const node={kind:'compute',operator:'reshape',function_target:'x.view',arguments:{args:[-1,784],kwargs:{}}};
  assert.equal(P.configuration(node),'shape -1 × 784');
  assert.equal(P.configuration({...node,function_target:'torch.reshape',arguments:{args:[{unresolved:'x'},[-1,784]],kwargs:{}}}),'shape -1 × 784');
  for(const args of [[{unresolved:'dtype'}],[{unresolved:'batch'},784],['x',784]])assert.equal(P.configuration({...node,arguments:{args,kwargs:{}}}),'');
  assert.equal(P.configuration({...node,kind:'opaque'}),'');assert.equal(P.configuration({...node,mutable:true}),'');
});

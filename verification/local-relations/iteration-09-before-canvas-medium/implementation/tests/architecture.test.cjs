const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../semantic_studio/semantic-engine.js'),A=require('../semantic_studio/architecture.js'),L=require('../semantic_studio/architecture-layout.js');
const root=path.resolve(__dirname,'..');
const load=name=>JSON.parse(fs.readFileSync(path.join(root,'data/semantic/architecture',name+'.json')));
function all(ir,extra={}){const state={view:'architecture',mode:'source',details:true,...extra};state.open=[...E.viewIndex(ir,state).children.keys()].filter(Boolean);return E.project(ir,state);}
function graph(ids,connections){return {schema:'archcanvas-source-semantic/2',ir_digest:'fixture',nodes:[{id:'root',kind:'composite',parent:null,label:'Unnamed',source:[],runtime_evidence:[{}]},...ids.map(id=>({id,parent:'root',kind:'compute',operator:'foreign',label:id,source:[],runtime_evidence:[{}]}))],edges:connections.map(([source,target,more={}],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'in',kind:'data',evidence:'runtime-tensor',...more})),motifs:[]};}
function noOverlap(g){
  const rows=new Map();for(const n of g.nodes){if(!rows.has(n.parent))rows.set(n.parent,[]);rows.get(n.parent).push(g.positions.get(n.id));}
  for(const ps of rows.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const a=ps[i],b=ps[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`overlap ${a.id} / ${b.id}`);
  }
}
function accounted(ir,g){const ids=Object.values(g.edge_accounting).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),ir.edges.map(e=>e.id).sort());}

function gatedFixture(){
  const ir=graph(['x','y','g0','g1','v0','p0','p1','sum','sink'],[
    ['x','g0'],['y','g1'],['x','v0'],['g0','p0',{target_port:'0'}],['y','p0',{target_port:'1'}],
    ['v0','p1',{target_port:'0'}],['g1','p1',{target_port:'1'}],['p0','sum',{target_port:'0'}],
    ['p1','sum',{target_port:'1'}],['p0','sink'],['sum','sink']]);
  for(const [id,op]of Object.entries({g0:'sigmoid',g1:'sigmoid',v0:'tanh',p0:'mult',p1:'mult',sum:'add'}))ir.nodes.find(n=>n.id===id).operator=op;
  ir.nodes.find(n=>n.id==='sink').kind='opaque';return ir;
}

test('two local gates compose into an exact gated sum with shared external uses',()=>{
  const ir=gatedFixture(),before=JSON.stringify(ir),p=A.build(ir),f=p.findings.find(f=>f.rule==='gated-sum');
  assert.ok(f);assert.equal(f.presentation,'group');
  assert.deepEqual(f.roles.terms.map(t=>[t.gate,t.value,t.product,t.gate_edge,t.value_edge,t.sum_edge,t.sum_port]),
    [['g0','y','p0','e3','e4','e7','0'],['g1','v0','p1','e6','e5','e8','1']]);
  assert.equal(f.roles.state_update,'not-asserted');assert.equal(f.roles.weight_normalization,'not-asserted');assert.equal(f.roles.model_family,'not-asserted');
  const group=p.nodes.find(n=>n.id===f.id);assert.ok(group.boundary_ports.some(e=>e.id==='e9'&&e.source==='p0'));
  assert.ok(!group.canonical_members.includes('sink'));assert.equal(p.nodes.find(n=>n.id==='sink').kind,'opaque');
  assert.equal(p.findings.filter(f=>f.rule==='gate'&&f.presentation==='group').length,2);
  assert.equal(JSON.stringify(ir),before);accounted(ir,all(ir));
});

test('gated sums reject mutation, conditional operands, output slots and mixed evidence',()=>{
  const changes=[
    ir=>{ir.nodes.find(n=>n.id==='sum').mutable=true;},
    ir=>{ir.nodes.find(n=>n.id==='p0').mutable=true;},
    ir=>{ir.nodes.find(n=>n.id==='g1').mutable=true;},
    ir=>{ir.nodes.find(n=>n.id==='g0').condition={branch:'if',outcome:'true'};},
    ir=>{ir.edges.find(e=>e.id==='e7').condition={branch:'if',outcome:'true'};},
    ir=>{ir.edges.find(e=>e.id==='e3').condition={branch:'if',outcome:'true'};},
    ir=>{ir.edges.find(e=>e.id==='e3').source_port='1';},
    ir=>{ir.edges.find(e=>e.id==='e8').source_port='1';},
    ir=>{ir.edges.find(e=>e.id==='e8').source='p0';},
    ir=>{ir.edges.find(e=>e.id==='e7').evidence='source-dependency';},
    ir=>{ir.nodes.find(n=>n.id==='sum').arguments={kwargs:{alpha:2}};},
    ir=>{ir.nodes.find(n=>n.id==='sum').arguments={args:['p0','p1',{unresolved:'alpha'}]};},
  ];
  for(const change of changes){const ir=gatedFixture();change(ir);assert.ok(!A.build(ir).findings.some(f=>f.rule==='gated-sum'),change.toString());accounted(ir,all(ir));}
});

test('in-place, conditional and slotted sigmoid products cannot certify a pure gate',()=>{
  for(const change of [ir=>{ir.nodes.find(n=>n.id==='p0').mutable=true;},ir=>{ir.nodes.find(n=>n.id==='g0').mutable=true;},
    ir=>{ir.edges.find(e=>e.id==='e3').condition={outcome:'true'};},ir=>{ir.edges.find(e=>e.id==='e3').source_port='1';}]){
    const ir=gatedFixture();change(ir);assert.ok(!A.build(ir).findings.some(f=>f.rule==='gate'&&f.roles.output==='p0'));
  }
});

test('observed single-output ATen products can compose without guessing tuple slots',()=>{
  const ir=gatedFixture();
  for(const n of ir.nodes.filter(n=>['g0','g1','v0','p0','p1','sum'].includes(n.id))){n.outputs=[{shape:[2,8]}];n.operator=({sigmoid:'aten.sigmoid.default',tanh:'aten.tanh.default',mult:'aten.mul.Tensor',add:'aten.add.Tensor'})[n.operator];}
  for(const e of ir.edges)e.source_port='0';
  assert.ok(A.build(ir).findings.some(f=>f.rule==='gated-sum'));
  ir.nodes.find(n=>n.id==='p0').outputs.push({shape:[2,8]});
  assert.ok(!A.build(ir).findings.some(f=>f.rule==='gated-sum'));
});

test('shorter terminal lead-ins separate independent routes in a tight row gap',()=>{
  const R=require('../semantic_studio/publication-renderer.js'),ir=graph(['a','b','t','d'],[['a','t'],['b','t'],['b','d']]);
  for(const edge of ir.edges)edge.resolved_source=edge.source;
  const positions=new Map([['a',{x:0,y:0,w:212,h:64}],['b',{x:0,y:96,w:212,h:64}],['t',{x:0,y:192,w:212,h:64}],['d',{x:300,y:192,w:212,h:64}]]);
  positions.context={idx:E.index(ir),edges:ir.edges,feedback:new Set()};
  const first=L.route(ir.edges[0],positions),second=L.route(ir.edges[1],positions);
  const geometry=a=>R.lineGeometry([{...ir.edges[0],route:a},{...ir.edges[1],route:second}]);
  assert.equal(geometry(first).crossings,0);assert.equal(geometry(first).unrelated_contacts.length,1);
  positions.context.stubLength=12;const fixed=L.route(ir.edges[0],positions);
  assert.ok(first.ok&&second.ok&&fixed.ok);assert.deepEqual(fixed.points[0],first.points[0]);assert.deepEqual(fixed.points.at(-1),first.points.at(-1));
  assert.equal(geometry(fixed).crossings,0);assert.deepEqual(geometry(fixed).unrelated_contacts,[]);
});

test('an in-place branch stops a residual proof across the old value',()=>{
  const ir=graph(['input','branch','sum'],[['input','branch'],['branch','sum'],['input','sum']]);
  ir.nodes.find(n=>n.id==='branch').operator='activation';
  ir.nodes.find(n=>n.id==='sum').operator='add';
  assert.ok(A.build(ir).findings.some(f=>f.rule==='residual'));
  ir.nodes.find(n=>n.id==='branch').mutable=true;
  assert.ok(!A.build(ir).findings.some(f=>f.rule.startsWith('residual')));
  accounted(ir,all(ir));
});

test('unfamiliar composition gets independent local rules without editing canonical facts',()=>{
  const ir=load('ForeignComposition'),before=JSON.stringify(ir),p=E.architecture(ir);
  assert.ok(p.findings.some(f=>f.rule==='gate'&&f.presentation==='group'));
  assert.ok(p.findings.some(f=>f.rule==='scaled-attention-like'&&f.presentation==='group'));
  assert.ok(p.findings.some(f=>f.rule==='residual-postnorm'&&f.presentation==='group'));
  assert.equal(JSON.stringify(ir),before);
  for(const n of ir.nodes){const derived=p.nodes.find(v=>v.id===n.id);assert.ok(derived);assert.deepEqual(derived.source,n.source);assert.equal(derived.source_parent,n.source_parent??n.parent);}
  assert.deepEqual(p.edges,ir.edges);
});
test('every summary boundary is the exact canonical cut, including tensor slots',()=>{
  const ir=load('ForeignComposition'),p=E.architecture(ir);
  for(const n of p.nodes.filter(n=>n.presentation_only)){
    const inside=new Set(n.canonical_members),cut=ir.edges.filter(e=>inside.has(e.source)!==inside.has(e.target));
    assert.deepEqual(n.boundary_ports.map(e=>e.id).sort(),cut.map(e=>e.id).sort());
    for(const port of n.boundary_ports){const raw=ir.edges.find(e=>e.id===port.id);for(const k of ['source','target','source_port','target_port','evidence'])assert.deepEqual(port[k],raw[k]);}
  }
});
test('renaming classes, modules and labels does not select a model-family template',()=>{
  const ir=load('ForeignComposition'),p=A.build(ir);const renamed=E.clone(ir);
  renamed.title='BertLSTMCompleteMoE';for(const n of renamed.nodes){n.label='Transformer';n.module_path='lstm.complete';}
  assert.deepEqual(A.build(renamed).findings.map(f=>[f.rule,f.members]),p.findings.map(f=>[f.rule,f.members]));
});
test('partial LSTM is only a sigmoid gate; full LSTM and MoE identities are not invented',()=>{
  const p=A.build(load('BrokenCell'));assert.deepEqual(p.findings.map(f=>f.rule),['gate']);
  assert.ok(p.findings.every(f=>!['LSTM','MoE','Encoder'].includes(f.label)));
});
test('Pre-Norm and Post-Norm follow actual producers; disconnected normalization is rejected',()=>{
  assert.ok(A.build(load('BeforeNorm')).findings.some(f=>f.rule==='residual-prenorm'));
  assert.ok(A.build(load('ForeignComposition')).findings.some(f=>f.rule==='residual-postnorm'));
  assert.equal(A.build(load('DisconnectedNorm')).findings.length,0);
});
test('opaque operations stop residual proofs and remain visible after full expansion',()=>{
  const ir=load('UnknownFusion'),p=A.build(ir),g=all(ir,{details:false});
  assert.ok(p.findings.some(f=>f.rule==='gate'));assert.ok(!p.findings.some(f=>f.rule.startsWith('residual')));
  for(const n of ir.nodes.filter(n=>n.kind==='opaque'))assert.ok(g.nodes.some(v=>v.id===n.id));
  accounted(ir,g);
});
test('repetition summary retains all instances and does not assert parameter sharing',()=>{
  const ir=load('RepeatedFragments'),p=A.build(ir),f=p.findings.find(f=>f.rule==='repeated-source');
  assert.equal(f.roles.instances.length,3);assert.equal(f.roles.parameter_sharing,'unresolved');
  const group=p.nodes.find(n=>n.id===f.id);assert.ok(group.canonical_members.length>3);
  for(const id of f.roles.instances)assert.equal(p.nodes.find(n=>n.id===id).parent,f.id);
});
test('unknown or different constructor configurations cannot certify a repeated structure',()=>{
  for(const constructor of [{width:16},{width:{unresolved:'dynamic'}}]){
    const ir=load('RepeatedFragments'),calls=ir.nodes.filter(n=>n.kind==='composite'&&n.module_path==='two');
    assert.equal(calls.length,1);calls[0].constructor=constructor;
    assert.ok(!A.build(ir).findings.some(f=>f.rule==='repeated-source'));
  }
  const legacy=load('RepeatedFragments');for(const n of legacy.nodes)delete n.constructor;
  assert.ok(!A.build(legacy).findings.some(f=>f.rule==='repeated-source'));
});
test('partially overlapping motifs stay annotations instead of consuming unrelated members',()=>{
  const ir=graph(['l1','a1','l2','a2','l3'],[['l1','a1'],['a1','l2'],['l2','a2'],['a2','l3']]);
  for(const n of ir.nodes.slice(1))n.operator=n.id.startsWith('l')?'linear':'activation';
  const p=A.build(ir),found=p.findings.filter(f=>f.rule==='feed-forward');assert.equal(found.length,2);
  assert.equal(found.filter(f=>f.presentation==='group').length,1);assert.equal(found.filter(f=>f.presentation==='annotation').length,1);
  assert.ok(found.find(f=>f.presentation==='annotation').presentation_reason.includes('overlapping'));
});
test('shared parameter declarations keep separate calls and remain unresolved statically',()=>{
  const ir=load('SharedBranches'),g=all(ir,{details:false});
  assert.equal(ir.nodes.filter(n=>n.operator==='linear').length,2);
  assert.equal(g.edge_accounting.attached.length,2);
  assert.ok([...g.annotations.values()].flat().every(a=>a.resource.identity_status.includes('unresolved')));
  assert.ok(!A.build(ir).findings.some(f=>f.rule.startsWith('residual')));
});
test('loops remain source templates and unresolved carried values survive',()=>{
  const ir=load('LoopWithBoundary'),g=all(ir,{details:false});
  assert.ok(g.nodes.some(n=>n.semantic_type==='loop-template'));
  assert.ok(g.nodes.some(n=>n.kind==='opaque'&&n.reason==='iteration-binding-unresolved'));
  assert.ok(!g.architecture.findings.some(f=>f.rule==='repeated-source'));
});
test('compact bindings and attached parameters have complete explicit edge accounting',()=>{
  const ir=load('ForeignComposition'),compact=all(ir,{details:false}),detail=all(ir);
  assert.ok(compact.nodes.length<detail.nodes.length);assert.ok(compact.edge_accounting.contracted.length>0);
  assert.ok(compact.edge_accounting.attached.length>0);accounted(ir,compact);accounted(ir,detail);
  for(const e of compact.edges)for(const id of e.originals)assert.ok(ir.edges.some(raw=>raw.id===id));
  const tuple=ir.nodes.filter(n=>n.kind==='value-alias'&&n.slot!=null);
  assert.ok(tuple.length);for(const n of tuple)assert.ok(compact.nodes.some(v=>v.id===n.id));
});
test('different operands and conditional alternatives between the same pair never merge',()=>{
  const ir=graph(['a','b'],[['a','b',{source_port:'q',target_port:'left'}],['a','b',{source_port:'k',target_port:'right',condition:{outcome:'true'}}]]),g=all(ir);
  assert.equal(g.edges.length,2);assert.deepEqual(g.edges.map(e=>e.source_port),['q','k']);
  assert.equal(g.edges[1].condition.outcome,'true');
  assert.notDeepEqual(E.route(g.edges[0],g.positions).points.at(-1),E.route(g.edges[1],g.positions).points.at(-1));
});
test('mere presence of matmul, softmax and scale does not create attention',()=>{
  const ir=graph(['a','b','c','d'],[]);['matmul','div','softmax','matmul'].forEach((op,i)=>ir.nodes[i+1].operator=op);
  assert.equal(A.build(ir).findings.length,0);
});
test('different output slots of one producer cannot prove a shared residual origin',()=>{
  const ir=graph(['split','branch','add'],[['split','branch',{source_port:'0'}],['split','add',{source_port:'1'}],['branch','add']]);
  ir.nodes.find(n=>n.id==='branch').operator='linear';ir.nodes.find(n=>n.id==='add').operator='add';
  assert.ok(!A.build(ir).findings.some(f=>f.rule.startsWith('residual')));
});
test('a self feedback edge stays visible and routes outside its own operator',()=>{
  const ir=graph(['state'],[['state','state']]),g=all(ir);assert.equal(g.edges.length,1);
  const r=E.route(g.edges[0],g.positions),p=g.positions.get('state');assert.ok(r.ok);assert.ok(r.feedback);
  for(let i=1;i<r.points.length;i++)assert.ok(!L.blocked(r.points[i-1],r.points[i],[p]));
});
test('SCC feedback is explicit, deterministic and never collapses all ranks to zero',()=>{
  const ir=graph(['a','b','c','out'],[['a','b'],['b','c'],['c','a'],['c','out']]),g=all(ir);
  assert.ok(g.positions.get('a').cyclic);assert.ok(g.positions.context.feedback.size>=3);
  assert.ok(g.positions.get('out').y>g.positions.get('a').y);noOverlap(g);
  const second=all(ir);assert.deepEqual([...g.positions],[...second.positions]);
  for(const e of g.edges){const r=E.route(e,g.positions);assert.ok(r.ok,`${e.id}: ${r.reason}`);}
});
test('branch routing avoids unrelated node interiors and uses orthogonal segments',()=>{
  const ir=graph(['a','b','c','d','join'],[['a','b'],['a','c'],['a','d'],['b','join'],['c','join'],['d','join']]),g=all(ir);
  noOverlap(g);for(const e of g.edges){const r=E.route(e,g.positions);assert.ok(r.ok);
    for(let i=1;i<r.points.length;i++)assert.ok(r.points[i-1].x===r.points[i].x||r.points[i-1].y===r.points[i].y);
  }
});
test('mathematical glyph ports land on the circle and preserve separate operands',()=>{
  const ir=graph(['left','right','sum'],[['left','sum'],['right','sum']]);ir.nodes.find(n=>n.id==='sum').operator='add';
  const g=all(ir),p=g.positions.get('sum');assert.equal(p.symbol,'+');
  const terminals=g.edges.map(e=>{const r=E.route(e,g.positions);assert.ok(r.ok);const t=r.points.at(-1);assert.ok(Math.abs(Math.hypot(t.x-p.x-p.w/2,t.y-p.y-p.h/2)-p.w/2)<1e-7);return t;});
  assert.notDeepEqual(terminals[0],terminals[1]);
});
test('random unfamiliar topologies retain every edge, finite geometry and disjoint siblings',()=>{
  let seed=1987;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let trial=0;trial<40;trial++){
    const ids=Array.from({length:5+Math.floor(rand()*9)},(_,i)=>'n'+i),es=[];
    for(let i=0;i<ids.length;i++)for(let j=0;j<ids.length;j++)if(i!==j&&rand()<.12)es.push([ids[i],ids[j]]);
    const ir=graph(ids,es),before=JSON.stringify(ir),g=all(ir);accounted(ir,g);noOverlap(g);
    for(const p of g.positions.values())for(const key of ['x','y','w','h'])assert.ok(Number.isFinite(p[key]));
    for(const e of g.edges)assert.ok(E.route(e,g.positions).points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    assert.equal(JSON.stringify(ir),before);
  }
});
test('moving a synthetic summary translates all visible descendants without altering facts',()=>{
  const ir=load('BrokenCell'),state={view:'architecture',details:true,mode:'source'},idx=E.viewIndex(ir,state);state.open=[...idx.children.keys()].filter(Boolean);
  const before=JSON.stringify(ir),a=E.project(ir,state),group=a.nodes.find(n=>n.presentation_only);
  state.offsets={[group.id]:{x:41,y:23}};const b=E.project(ir,state);
  for(const id of [group.id,...group.canonical_members])if(a.positions.has(id)){assert.equal(b.positions.get(id).x-a.positions.get(id).x,41);assert.equal(b.positions.get(id).y-a.positions.get(id).y,23);}
  assert.equal(JSON.stringify(ir),before);
});
test('saved presentation state reproduces grouping, positions and boundary identities',()=>{
  const ir=load('BeforeNorm'),state={view:'architecture',mode:'source',details:false,open:[ir.nodes[0].id],offsets:{}},g=E.project(ir,state);
  const restored=JSON.parse(JSON.stringify({ir,state})),again=E.project(restored.ir,restored.state);
  assert.deepEqual([...again.positions],[...g.positions]);assert.deepEqual(again.edges,g.edges);
});
test('duplicate edge identifiers are rejected instead of overwriting physical terminals',()=>{
  const ir=graph(['a','b'],[['a','b'],['a','b']]);ir.edges[1].id=ir.edges[0].id;
  assert.throws(()=>E.validate(ir),/重复连接/);
});

test('long unfamiliar chains fold without changing operands and can retain vertical layout',()=>{
  const ids=Array.from({length:16},(_,i)=>'foreign'+i),ir=graph(ids,ids.slice(1).map((id,i)=>[ids[i],id]));
  const folded=all(ir,{details:false}),vertical=all(ir,{details:false,foldSerial:false});
  accounted(ir,folded);noOverlap(folded);
  assert.ok(folded.bounds.h<vertical.bounds.h*.6);
  assert.deepEqual(folded.edges,vertical.edges);
  for(const [i,id]of ids.entries()){const p=folded.positions.get(id);assert.equal(p.topological_rank,i);assert.equal(p.arrangement,'folded-ranks');}
  for(const e of folded.edges)assert.ok(E.route(e,folded.positions).ok);
  assert.ok(!all(ir,{view:'source'}).positions.get(ids[0]).arrangement);
});
test('folded narrow DAGs retain skip dependencies and parallel nodes in the same rank',()=>{
  const ids=Array.from({length:10},(_,i)=>'n'+i),ir=graph([...ids,'side'],[...ids.slice(1).map((id,i)=>[ids[i],id]),['n1','side'],['side','n4'],['n0','n9']]);
  const g=all(ir,{details:false});accounted(ir,g);noOverlap(g);
  assert.equal(g.positions.get('side').topological_rank,g.positions.get('n2').topological_rank);
  assert.equal(g.edges.length,12);
  for(const e of g.edges)assert.ok(E.route(e,g.positions).ok,e.id);
  const cyclic=E.clone(ir);cyclic.edges.push({id:'feedback',source:'n4',target:'n1',source_port:'out',target_port:'state',kind:'data',evidence:'runtime-tensor'});
  assert.ok(!all(cyclic).positions.get('n0').arrangement);
});
test('convolution normalization activation rule requires the actual dependency path',()=>{
  const ir=graph(['conv','norm','activation','pool'],[['conv','norm'],['norm','activation'],['activation','pool']]);
  ['convolution','normalization','activation','pooling'].forEach((op,i)=>ir.nodes[i+1].operator=op);
  const p=A.build(ir),f=p.findings.find(f=>f.rule==='convolution-block');assert.ok(f);assert.equal(f.roles.normalization,'norm');assert.deepEqual(f.members,['conv','norm','activation','pool']);
  const disconnected=E.clone(ir);disconnected.edges=disconnected.edges.filter(e=>e.source!=='conv');
  assert.ok(!A.build(disconnected).findings.some(f=>f.rule==='convolution-block'));
});

test('open-scope control edges can attach inside the header without cutting title text',()=>{
  const ir=graph(['inside'],[]),idx=E.index(ir),e={id:'control',source:'inside',target:'root',source_port:'condition',target_port:'scope',kind:'control',evidence:'source-dependency'};
  for(const reverse of [false,true]){
    const edge=reverse?{...e,source:'root',target:'inside'}:e;
    const positions=new Map([['root',{x:0,y:0,w:500,h:400,header:80,expanded:true}],['inside',{x:100,y:90,w:100,h:40}]]);
    positions.context={idx,edges:[edge],feedback:new Set(),ancestorPorts:'header',portOrder:'neighbors'};
    const route=L.route(edge,positions);assert.ok(route.ok);assert.equal(route.source_side,'top');assert.equal(route.target_side,'top');
    assert.equal((reverse?route.points[0]:route.points.at(-1)).y,70);
    for(let i=1;i<route.points.length;i++)assert.ok(!L.blocked(route.points[i-1],route.points[i],[{x:0,y:0,w:500,h:70}]));
    assert.equal(edge.target_port,'scope');assert.equal(edge.source_port,'condition');
  }
});
test('header control policy does not move data scope boundaries or merge physical terminals',()=>{
  const ir=graph(['inside'],[]),idx=E.index(ir),base={source:'inside',target:'root',source_port:'out',target_port:'scope',evidence:'source-dependency'};
  const edges=[{...base,id:'c1',kind:'control'},{...base,id:'c2',kind:'control'}, {...base,id:'data',kind:'data'}];
  const positions=new Map([['root',{x:0,y:0,w:500,h:400,header:80,expanded:true}],['inside',{x:100,y:90,w:100,h:40}]]);
  positions.context={idx,edges,feedback:new Set(),ancestorPorts:'header',portOrder:'neighbors'};
  const controls=edges.slice(0,2).map(e=>L.route(e,positions));assert.ok(controls.every(r=>r.ok));
  assert.notDeepEqual(controls[0].points.at(-1),controls[1].points.at(-1));
  assert.equal(L.route(edges[2],positions).points.at(-1).y,400);
});

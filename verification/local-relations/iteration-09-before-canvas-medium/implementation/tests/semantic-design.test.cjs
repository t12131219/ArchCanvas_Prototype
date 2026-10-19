const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const root=path.resolve(__dirname,'..');
// Source-derived fixtures are reproduced by tools/audit_semantic_design.py.
// Their actual CPU receipts are retained, rather than synthesizing executions.
const irs=Object.fromEntries(['ImageResidual','VectorResidual','SameSource','ConditionalResidual','IndependentStack','SharedStack','HeterogeneousStack','SharedStack-runtime'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'verification/semantic-design/current/after',name+'.json')))]));
// Historical constructor matches no longer certify representatives. Re-extract
// source sequences so this test exercises the current structural proof.
for(const name of ['IndependentStack','SharedStack','HeterogeneousStack'])irs[name]=JSON.parse(fs.readFileSync(path.join(root,'verification/local-relations/current/structural-repeats',name+'.json')));
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());}}
function cutsHeader(a,b,p){return a.x===b.x?a.x>p.x&&a.x<p.x+p.w&&Math.max(a.y,b.y)>p.y&&Math.min(a.y,b.y)<p.y+p.protected_header_height:a.y>p.y&&a.y<p.y+p.protected_header_height&&Math.max(a.x,b.x)>p.x&&Math.min(a.x,b.x)<p.x+p.w;}

test('publication SVG paints ancestor frames before their children regardless of canonical array order',()=>{
  const ir={schema:'archcanvas-source-semantic/2',title:'Foreign',nodes:[
    {id:'child',parent:'outer',kind:'composite',label:'Nested body',source:[]},
    {id:'op',parent:'child',kind:'compute',label:'Work',source:[],operator:'foreign'},
    {id:'outer',parent:null,kind:'composite',label:'Container',source:[]}],edges:[],motifs:[]};
  const out=R.render(ir,{paperAuto:false,open:['outer','child']});
  assert.ok(out.svg.indexOf('data-node-id="outer"')<out.svg.indexOf('data-node-id="child"'));
  assert.ok(out.svg.indexOf('data-node-id="child"')<out.svg.indexOf('data-node-id="op"'));
  assert.ok(out.svg.includes('Nested body'));
});

test('vector and convolution residuals route certified exact skip operands in a reserved lane',()=>{
  for(const name of ['ImageResidual','VectorResidual']){
    const ir=irs[name],before=JSON.stringify(ir),out=R.render(ir,{paperGranularity:'modules'}),g=out.graph;
    const skips=g.edges.filter(e=>e.design_route?.kind==='bypass');assert.equal(skips.length,1);
    for(const e of skips){
      const c=ir.semantic_contracts.find(c=>c.id===e.design_route.certificate);assert.ok(c);
      assert.equal(e.canonical_target,c.roles.add);assert.equal(e.resolved_source,c.roles.skip);assert.equal(e.source_port,c.roles.skip_slot);
      const owner=g.positions.get(e.design_route.owner);assert.ok(owner.design_gutter>0);
      const route=out.prepared.routes.find(r=>r.id===e.id).route;assert.ok(route.ok);
      assert.ok(route.points.some(p=>p.x>owner.x&&p.x<owner.x+owner.design_gutter));
      assert.match(out.svg,/data-design-route="bypass"/);
    }
    for(const e of out.prepared.routes)for(let i=1;i<e.route.points.length;i++)for(const p of g.positions.values())if(p.expanded)
      assert.ok(!cutsHeader(e.route.points[i-1],e.route.points[i],p),'wire cuts a visible title');
    assert.deepEqual(out.prepared.quality.issues,[]);accounted(ir,g);assert.equal(JSON.stringify(ir),before);
  }
  const image=R.render(irs.ImageResidual,{}).svg;assert.match(image,/BatchNorm2d/);assert.doesNotMatch(image,/Post-LN/);
  assert.equal(R.render(irs.ConditionalResidual,{}).graph.edges.filter(e=>e.design_route).length,0);
});

test('granularity defers detail to focused panels when actual print readability would fail',()=>{
  const ir=irs.SameSource,before=JSON.stringify(ir),overview=R.render(ir,{}),modules=R.render(ir,{paperGranularity:'modules'}),detail=R.render(ir,{paperGranularity:'detailed'});
  assert.ok(modules.graph.nodes.length>overview.graph.nodes.length);
  assert.ok(detail.prepared.routing.granularity_refinement);
  assert.equal(detail.prepared.routing.granularity_refinement.requested,'detailed');
  assert.ok(detail.prepared.routing.granularity_refinement.deferred_panels.length>0);
  assert.ok(detail.prepared.quality.min_print_font_pt>=8);assert.deepEqual(detail.prepared.quality.issues,[]);
  for(const o of [overview,modules,detail])accounted(ir,o.graph);
  assert.equal(JSON.stringify(ir),before);
});

test('representative panels retain exact instance, sequence count, sharing and boundary evidence',()=>{
  for(const name of ['IndependentStack','SharedStack']){
    const ir=irs[name],before=JSON.stringify(ir),sequence=ir.nodes.find(n=>n.repeat_contract),out=R.render(ir,{paperFocus:sequence.id,paperRepresentative:true,paperGranularity:'modules'});
    const r=out.graph.publication.representative;assert.equal(r.sequence,sequence.id);assert.equal(r.index,0);assert.equal(r.count,3);
    assert.equal(r.parameter_sharing,name==='SharedStack'?'shared':'independent');
    assert.match(out.svg,/Instance 1 of 3/);assert.ok(out.graph.publication.boundary.some(e=>e.direction==='input'));
    assert.ok(out.graph.publication.boundary.some(e=>e.direction==='output'));
    accounted(ir,out.graph);assert.equal(JSON.stringify(ir),before);
    assert.equal(R.render(out.document.ir,out.document.state).svg,out.svg);
  }
  const ir=irs.HeterogeneousStack,sequence=ir.nodes.find(n=>n.repeat_contract),out=R.render(ir,{paperFocus:sequence.id,paperRepresentative:true});
  assert.equal(out.graph.publication.focus,sequence.id);assert.equal(out.graph.publication.representative,null);
});

test('observed variants compress the main runtime frontier while retaining each execution and call',()=>{
  const ir=irs['SharedStack-runtime'],canonical=JSON.stringify(ir),out=R.render(ir,{mode:'runtime'}),group=out.graph.nodes.find(n=>n.observation_group);
  assert.ok(group);assert.equal(group.observation_group.runs.length,2);
  assert.ok(out.graph.nodes.length<6);
  assert.ok(ir.nodes.some(n=>n.id==='runtime:0:call0')&&ir.nodes.some(n=>n.id==='runtime:1:call0'));
  for(const mode of ['source','runtime','merged'])accounted(ir,R.render(ir,{mode}).graph);
  const detail=R.render(ir,{mode:'runtime',paperFocus:group.observation_group.representative});
  assert.ok(detail.graph.nodes.some(n=>n.id.startsWith('runtime:0:')));
  assert.ok(!detail.graph.nodes.some(n=>n.id.startsWith('runtime:1:')));
  accounted(ir,detail.graph);assert.equal(JSON.stringify(ir),canonical);
});

test('folded generic sequences bundle context uses without merging their operands',()=>{
  // An original topology fixture: one context value used at three different
  // invocation boundaries. No algorithm or model-family claim is made.
  const ir={schema:'archcanvas-source-semantic/2',title:'Context circuit',nodes:[
    {id:'root',kind:'composite',label:'Foreign circuit',parent:null,source:[]},
    {id:'ctx',kind:'interface',role:'input',label:'context',parent:'root',source:[]},
    {id:'sequence',kind:'composite',semantic_type:'serial-repeat',label:'Repeated work',parent:'root',source:[]},
    ...[0,1,2].map(i=>({id:'call'+i,kind:'compute',operator:'foreign',label:'operation '+i,parent:'sequence',source:[]}))],
    edges:[0,1,2].map(i=>({id:'use'+i,source:'ctx',target:'call'+i,source_port:'out',target_port:'context',kind:'data',evidence:'source-dependency'})),motifs:[]};
  const before=JSON.stringify(ir),out=R.render(ir,{paperAuto:false,open:['root']}),bundle=out.graph.edges.find(e=>e.bundle_members);
  assert.equal(bundle.bundle_members.length,3);assert.equal(bundle.bundle_values,1);
  assert.deepEqual(bundle.bundle_members.map(m=>m.canonical_target),['call0','call1','call2']);
  assert.equal(bundle.tensor_equality,'not-asserted');assert.match(out.svg,/data-bundle-endpoints=/);
  assert.ok(!out.svg.includes('data-canonical-source="undefined"'));
  accounted(ir,out.graph);assert.equal(JSON.stringify(ir),before);
  ir.edges[0].condition={outcome:true};
  assert.ok(R.render(ir,{paperAuto:false,open:['root']}).graph.edges.some(e=>e.id==='use0'&&!e.bundle_members));
});

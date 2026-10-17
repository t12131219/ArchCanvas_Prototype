const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');
const E=require('../yworks_edge_router_lab/graph-engine.js');
const F=require('../yworks_edge_router_lab/recursive-graph.js');
const C=globalThis.SummaryConstraints;
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json')));
const current=catalog.cases[0];
function load(){
  const sources=Object.fromEntries(current.views.map(v=>[v.key,C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))))]));
  return F.build(F.create(sources));
}
function legal(graph){
  const routed=F.route(graph),checked=E.validateView(graph);
  assert.equal(routed.failed,0);
  assert.equal(checked.source.ok,true,checked.source.violations.join('; '));
  assert.equal(checked.layout.ok,true,checked.layout.violations.join('; '));
  for(const [id,result] of checked.edges)assert.equal(result.ok,true,id+': '+result.violations.join('; '));
  return graph;
}

test('Transformer opens one branch while retaining the source authority',()=>{
  let graph=legal(load());
  const initial=new Set(graph.nodes.map(n=>n.id));
  graph=legal(F.toggle(graph,'enc.self',true));
  assert.ok(graph.nodes.some(n=>n.id==='enc.self.q'));
  assert.ok(!graph.nodes.some(n=>n.id==='dec.self.q'));
  assert.deepEqual(graph.recursive.authority.detail.nodes.filter(n=>initial.has(n.id)).length,initial.size);
});

test('Transformer can fully expand and fold while preserving canonical edges',()=>{
  let graph=legal(load());
  const sourceEdges=graph.recursive.authority.detail.edges.length;
  graph=legal(F.all(graph,true));
  assert.equal(graph.nodes.length,graph.recursive.authority.detail.nodes.length);
  assert.equal(graph.edges.length,sourceEdges);
  graph=legal(F.all(graph,false));
  assert.ok(graph.nodes.length<sourceEdges+1);
  assert.equal(graph.recursive.authority.detail.edges.length,sourceEdges);
});

test('source-atomic copy uses one authority view and records source units',()=>{
  const atomic=catalog.cases.find(v=>v.id==='01093cc06a87b35b');
  assert.ok(atomic);
  assert.deepEqual(atomic.views.map(v=>v.key),['source-atomic']);
  const payload=JSON.parse(fs.readFileSync(path.join(root,atomic.views[0].json)));
  assert.equal(payload.sourceAtomic,true);
  assert.equal(payload.sourceAtomicStandard.name,'source-atomic-v1');
  const graph=F.all(F.build(F.create({'source-atomic':C.initialize(payload)})),true);
  assert.equal(graph.nodes.length,graph.recursive.authority.detail.nodes.length);
  assert.ok(graph.nodes.filter(n=>n.atomicity!=='presentation').every(n=>n.source_evidence?.length||n.semantic?.param_identity));
  assert.ok(graph.nodes.filter(n=>n.atomicity!=='presentation').every(n=>Number.isInteger(n.source_line)));
});

test('source-atomic frontier reuses audited route templates',()=>{
  const atomic=catalog.cases.find(v=>v.id==='01093cc06a87b35b');
  const load=file=>C.initialize(JSON.parse(fs.readFileSync(path.join(root,'data/cases',file))));
  let graph=F.build(F.create({
    'source-atomic':load('01093cc06a87b35b-source-atomic.json'),
    overview:load('01093cc06a87b35a-overview.json'),
    modules:load('01093cc06a87b35a-modules.json'),
    detailed:load('01093cc06a87b35a-detailed.json'),
  }));
  graph=F.toggle(graph,'enc.self',true);
  const routed=F.route(graph),checked=E.validateView(graph);
  assert.equal(routed.failed,0);
  assert.equal(checked.layout.ok,true,checked.layout.violations.join('; '));
  assert.equal(graph.recursive.authority.variants.length,4);
  assert.deepEqual(atomic.views.map(v=>v.key),['source-atomic']);
});

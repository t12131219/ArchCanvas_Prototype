'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const read=n=>JSON.parse(fs.readFileSync('verification/stage-overview/current/'+n+'.json'));
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperAdaptive:false};
const project=(ir,s={})=>E.project(ir,{...state,...s});
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());
}}
test('coarse stage expression combines exact helper summaries and add/norm while retaining core stages',()=>{
 const ir=read('StageWeave'),raw=JSON.stringify(ir),g=R.render(ir,state).graph;
 assert.equal(g.publication.granularity,'stages');
 assert.equal(g.publication.contract_stages.rows.filter(r=>r.status==='summary').length,2);
 assert.equal(g.publication.local_pipelines.rows.filter(r=>r.status==='summary').length,2);
 for(const stage of g.publication.contract_stages.rows){
  assert.ok(g.positions.has(stage.node));assert.ok(g.edges.some(e=>e.design_route?.certificate===stage.certificate));
  assert.ok(!g.expression_coverage.some(c=>stage.canonical_members.some(id=>c.goal==='goal:node:'+id)&&c.status==='fulfilled'));
 }
 assert.ok(g.nodes.some(n=>n.kind==='compute'&&n.operator==='mult'));
 accounted(ir,g);assert.equal(JSON.stringify(ir),raw);
});
test('coarse summaries are independently expandable and saved documents restore the exact figure',()=>{
 const ir=read('StageWeave'),r=R.render(ir,state),open=[...r.graph.publication.open,
  ...r.graph.publication.contract_stages.rows.filter(r=>r.status==='summary').map(r=>r.node),
  ...r.graph.publication.local_pipelines.rows.filter(r=>r.status==='summary').map(r=>r.node)];
 const detail=R.render(ir,{...state,paperAuto:false,open});
 assert.ok(detail.graph.nodes.length>r.graph.nodes.length);
 assert.ok(detail.graph.publication.contract_stages.rows.every(r=>r.detailed_operations_exposed));
 assert.equal(R.render(detail.document.ir,detail.document.state).svg,detail.svg);
 assert.equal(R.render(ir,state).svg,r.svg);accounted(ir,detail.graph);
 assert.deepEqual(r.prepared.quality.issues,[]);assert.deepEqual(detail.prepared.quality.issues,[]);
});
test('escaping intermediate and conditional scopes prevent only their own stage folding',()=>{
 for(const name of ['EscapingWeave','ConditionalWeave']){
  const ir=read(name),g=project(ir);assert.equal(g.publication.contract_stages.rows.filter(r=>r.status==='summary').length,1,name);
  assert.ok(g.publication.contract_stages.rejected.length);accounted(ir,g);
  if(name==='EscapingWeave')assert.ok(g.nodes.some(n=>n.kind==='compute'&&n.operator==='add'));
  else assert.ok(g.nodes.some(n=>n.kind==='control'));
 }
});
test('unknown and single-step state boundaries survive next to independently summarized known work',()=>{
 for(const name of ['UnknownWeave','StateWeave']){
  const ir=read(name),g=project(ir);assert.ok(g.publication.local_pipelines.rows.some(r=>r.status==='summary'));
  if(name==='UnknownWeave')assert.ok(g.nodes.some(n=>n.kind==='opaque'));
  else {const cell=ir.nodes.find(n=>n.operator==='gru-cell');assert.ok(g.positions.has(cell.id));
   assert.ok(!g.publication.local_pipelines.rows.some(r=>r.canonical_members.includes(cell.id)));}
  accounted(ir,g);
 }
});
test('proved repeated calls keep concrete sample, ordered suffix and all individual identities',()=>{
 const ir=read('RepeatedWeave'),g=project(ir),remainder=g.nodes.find(n=>n.sequence_remainder);
 assert.ok(remainder);assert.equal(remainder.sequence_remainder.instances.length,2);
 assert.ok(g.publication.contract_stages.rows.some(r=>r.status==='summary'));
 const opened=project(ir,{paperAuto:false,open:[...g.publication.open,remainder.id]});
 for(const id of remainder.sequence_remainder.instances)assert.ok(opened.positions.has(id));accounted(ir,opened);
});
test('renaming cannot choose summaries and full source projection still exposes every original binding',()=>{
 const ir=read('StageWeave'),g=project(ir),renamed=structuredClone(ir);renamed.title='Unseen';
 for(const n of renamed.nodes){n.label='Foreign';n.source_class='Foreign';}
 const b=project(renamed);assert.deepEqual(b.publication.open,g.publication.open);
 assert.deepEqual(b.publication.contract_stages,g.publication.contract_stages);
 const source=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(source.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(source.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
});
test('semantic modules stay closed in the new preset while role views remain more detailed',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/helper-contracts/current/Transformer-current.json')),raw=JSON.stringify(ir);
 const coarse=project(ir),finer=project(ir,{paperGranularity:'roles'});
 const certified=coarse.nodes.filter(n=>n.kind==='composite'&&n.semantic_contracts?.length);
 assert.equal(certified.length,5);assert.ok(certified.every(n=>!coarse.positions.get(n.id).expanded));
 assert.ok(certified.every(n=>finer.positions.get(n.id)?.expanded));
 assert.equal(coarse.publication.contract_stages.rows.filter(r=>r.status==='summary').length,5);
 assert.ok(coarse.nodes.length<finer.nodes.length);assert.equal(JSON.stringify(ir),raw);accounted(ir,coarse);
});

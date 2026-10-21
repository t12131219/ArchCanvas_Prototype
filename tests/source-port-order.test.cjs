'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const {fixture,state}=require('./source-port-fixtures.cjs');
test('nested outward leads improve on all four source sides without moving nodes or consumer terminals',()=>{
 for(const side of ['bottom','top','left','right']){
  const {ir,baseline:a}=fixture(side),raw=JSON.stringify([...a.graph.positions]),b=R.prepareSourcePortOrder(ir,state,a);
  assert.equal(a.prepared.quality.line_geometry.crossings,1,side);assert.equal(b.prepared.quality.line_geometry.crossings,0,side);
  assert.equal(b.prepared.quality.wire_length,a.prepared.quality.wire_length);assert.equal(JSON.stringify([...b.graph.positions]),raw);
  assert.equal(b.prepared.routing.source_port_order.selected.length,1);
  for(const [i,e]of b.prepared.routes.entries()){
   assert.deepEqual(e.route.points.slice(2),a.prepared.routes[i].route.points.slice(2));
   assert.deepEqual({...e,route:null},{...a.prepared.routes[i],route:null});
   assert.deepEqual(e.route.points[0],a.prepared.routes[1-i].route.points[0]);
  }
  assert.deepEqual(b.graph.node_accounting,a.graph.node_accounting);assert.deepEqual(b.graph.edge_accounting,a.graph.edge_accounting);
 }
});
test('different values keep their output and operand identities; only geometric terminals are permuted',()=>{
 const {ir,baseline:a}=fixture();a.prepared.routes[0].resolved_source='value-A';a.prepared.routes[1].resolved_source='value-B';
 const b=R.prepareSourcePortOrder(ir,state,a);
 assert.equal(b.prepared.routing.source_port_order.selected.length,1);
 assert.deepEqual(b.prepared.routes.map(e=>[e.resolved_source,e.source_port,e.target_port]),a.prepared.routes.map(e=>[e.resolved_source,e.source_port,e.target_port]));
 assert.ok(!R.renderPrepared(ir,state,b).svg.includes('paper-fanout-junction'));
});
test('conditional, state, feedback, bypass and context leads retain their existing policies',()=>{
 for(const patch of [{condition:{branch:'x'}},{iteration:{loop:'x'}},{kind:'state-read'},{design_route:{kind:'bypass'}},{context_lane:{owner:'root'}},{layout_after:'a'}]){
  const {baseline:a}=fixture();Object.assign(a.prepared.routes[0],patch);assert.equal(L.sourcePortSwaps(a.graph.positions,a.prepared.routes).length,0);
 }
 const {baseline:a}=fixture();a.graph.positions.context.feedback.add('e0');assert.equal(L.sourcePortSwaps(a.graph.positions,a.prepared.routes).length,0);
});
test('bundled ordinary uses retain all leaves and guarded bundle members block the swap',()=>{
 const {baseline:a}=fixture(),e=a.prepared.routes[0],member={...e};delete member.route;
 Object.assign(e,{kind:'data-bundle',bundle_members:[member,{...member,id:'extra',target_port:'other'}]});
 assert.equal(L.sourcePortSwaps(a.graph.positions,a.prepared.routes).length,1);
 e.bundle_members[1].condition={branch:'guard'};assert.equal(L.sourcePortSwaps(a.graph.positions,a.prepared.routes).length,0);
});
test('actual nodes and labels obstruct changed leads; expanded titles remain pass-through',()=>{
 for(const kind of ['node','label','title','body']){
  const {ir,baseline:a}=fixture();
  // New shallow lead at x660 runs through (660,172); old shallow lead was x740.
  if(kind==='label')a.prepared.labeling.placed.push({x:655,y:166,w:10,h:10,text:'fixed',edge:'other'});
  else{const p={id:'obstacle',x:655,y:166,w:10,h:100,expanded:kind!=='node',header:kind==='title'?80:0};
   a.graph.positions.set('obstacle',p);a.graph.idx.nodes.set('obstacle',{id:'obstacle',kind:kind==='node'?'opaque':'composite',parent:'root'});}
  const b=R.prepareSourcePortOrder(ir,state,a);
  if(kind==='title')assert.ok(b.prepared.routing.source_port_order.selected.length);
  else assert.equal(b,a,kind);
 }
});
test('unknown boundaries and names do not select port ordering; manual and print states opt out',()=>{
 const {ir,baseline:a}=fixture(),p=L.sourcePortSwaps(a.graph.positions,a.prepared.routes);
 for(const n of a.graph.nodes){n.label='Renamed';n.source_class='Arbitrary';}assert.deepEqual(L.sourcePortSwaps(a.graph.positions,a.prepared.routes),p);
 for(const extra of [{paperSourcePortOrder:false},{offsets:{s:{x:1,y:0}}}])assert.equal(R.prepareSourcePortOrder(ir,{...state,...extra},a),a);
 a.prepared.quality.medium='print';assert.equal(R.prepareSourcePortOrder(ir,state,a),a);
});
test('real extracted shared calls improve while folding and saved-state rendering retain exact evidence',()=>{
 const fs=require('node:fs'),ir=JSON.parse(fs.readFileSync('verification/operand-order/current/SharedColumns.json'));
 const s=JSON.parse(fs.readFileSync('verification/transform-configurations/current/small-report.json')).rows.find(r=>r.name==='SharedColumns').state;
 const a=R.render(ir,{...s,paperSourcePortOrder:false}),b=R.render(ir,s);
 assert.equal(a.prepared.quality.line_geometry.crossings,1);assert.equal(b.prepared.quality.line_geometry.crossings,0);
 assert.equal(b.prepared.quality.wire_length,a.prepared.quality.wire_length);
 for(const k of ['ir','architecture','publication','expression_goals','expression_coverage','summary_coverage'])assert.deepEqual(b.document[k],a.document[k]);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 const folded=R.render(ir,{...s,paperAuto:false,open:[]});assert.ok(folded.graph.nodes.length<b.graph.nodes.length);
 assert.deepEqual(folded.document.ir,ir);
});

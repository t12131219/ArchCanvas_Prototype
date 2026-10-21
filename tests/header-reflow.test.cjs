'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js');
const {fixture,state}=require('./header-reflow-fixtures.cjs');
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,
 edges:r.graph.edges,coverage:r.document.expression_coverage,summary:r.document.summary_coverage,
 nodes:r.graph.node_accounting,uses:r.graph.edge_accounting,representatives:r.graph.representatives});
const norm=s=>s.replace(/\s/g,'');
test('wide unfamiliar frames reflow complete facts and compact only empty bands',()=>{
 const ir=fixture(),original=JSON.stringify(ir),a=R.render(ir,{...state,paperHeaderReflow:false}),b=R.render(ir,state);
 const rec=b.prepared.routing.header_reflow;assert.ok(rec.accepted);assert.ok(rec.records.length);
 assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);
 assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px);
 assert.ok(b.prepared.quality.wire_length<=a.prepared.quality.wire_length);
 assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
 for(const row of rec.records){
  assert.equal(norm(row.lines_before.join('')),norm(row.lines_after.join('')));
  assert.equal(norm(row.captions_before.join('')),norm(row.captions_after.join('')));
 }
 for(const [id,p]of a.graph.positions){const q=b.graph.positions.get(id);assert.equal(q.x,p.x);assert.equal(q.w,p.w);if(!p.expanded)assert.equal(q.h,p.h);}
 assert.ok(rec.compaction.accepted);assert.equal(rec.direct_goals_before,rec.direct_goals_candidate);
});
test('an unrelated wire through a title retains its existing passage height',()=>{
 const ir=fixture(),a=R.render(ir,{...state,paperHeaderReflow:false}),p=a.graph.positions.get('left');
 const edge=a.prepared.routes.find(e=>e.source==='r0'),y=p.y+p.header-12;
 const routes=a.prepared.routes.map(e=>e===edge?{...e,route:{...e.route,points:[{x:p.x-20,y},{x:p.x+p.w+20,y}]}}:e);
 a.prepared=R.evaluateRoutes(a.graph,routes,a.prepared.quality.route_strategy);
 const b=R.prepareHeaderReflow(ir,state,a),row=b.prepared.routing.header_reflow.records.find(r=>r.node==='left');
 assert.ok(b.prepared.routing.header_reflow.accepted);assert.ok(row.shrink_blocked_by.includes(edge.id));
 assert.equal(row.header_before,row.header_after);assert.equal(b.graph.positions.get('left').header,p.header);
 assert.ok(row.lines_after.length<row.lines_before.length,'text still uses the full frame width');
});
test('extra operand evidence, inventory reservations, fixed arguments and frame terminals keep their contracts',()=>{
 for(const guard of ['extra','inventory','fixed','terminal']){
  const ir=fixture(),a=R.render(ir,{...state,paperHeaderReflow:false}),n=a.graph.idx.nodes.get('left'),p=a.graph.positions.get('left');
  if(guard==='extra')n.paper.captions.push('Exact operand: incoming[2]');
  if(guard==='inventory')n.paper.layout_caption_rows=4;
  if(guard==='fixed')a.graph.positions.context.fixedInputs=[{parent:'left',nodes:['i'],title_width:212}];
  if(guard==='terminal')a.prepared.routes[0]={...a.prepared.routes[0],target:'left'};
  const paper=JSON.stringify(n.paper),b=R.prepareHeaderReflow(ir,state,a);
  assert.ok(!b.prepared.routing.header_reflow.records.some(r=>r.node==='left'),guard);
  assert.equal(JSON.stringify(b.graph.idx.nodes.get('left').paper),paper);assert.equal(b.graph.positions.get('left').header,p.header);
 }
});
for(const option of ['unknown','guarded'])test(option+' computation boundaries keep exact facts and reversible source detail',()=>{
 const ir=fixture({[option]:true}),a=R.render(ir,{...state,paperHeaderReflow:false}),b=R.render(ir,state);
 assert.deepEqual(facts(a),facts(b));assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 const folded=R.render(ir,{...state,open:['root']});assert.ok(folded.graph.nodes.length<b.graph.nodes.length);
 assert.equal(R.render(ir,state).svg,b.svg);
});
test('state, mutation and sharing evidence remain unchanged by complete-text reflow',()=>{
 const ir=fixture();Object.assign(ir.nodes.find(n=>n.id==='l0'),{kind:'state',mutable:true,
  identity_display:{kind:'same-object-calls',label:'shared',invocation:1,count:2}});
 const a=R.render(ir,{...state,paperHeaderReflow:false}),b=R.render(ir,state);assert.deepEqual(facts(a),facts(b));
 assert.deepEqual(a.graph.idx.nodes.get('l0').paper,b.graph.idx.nodes.get('l0').paper);
});
test('manual positions, explicit spacing, protected titles, print and resource limits bypass reflow',()=>{
 const ir=fixture(),a=R.render(ir,{...state,paperHeaderReflow:false});
 for(const extra of [{paperHeaderReflow:false},{offsets:{l0:{x:1,y:0}}},{paperLabelSpacing:'global'},{paperLabelGapY:100},{paperProtectFrameTitles:true}])
  assert.equal(R.prepareHeaderReflow(ir,{...state,...extra},a),a);
 a.prepared.quality.medium='print';assert.equal(R.prepareHeaderReflow(ir,state,a),a);a.prepared.quality.medium='canvas';
 const edges=a.graph.edges;a.graph.edges=Array(2049).fill(edges[0]);assert.equal(R.prepareHeaderReflow(ir,state,a),a);a.graph.edges=edges;
 const nodes=a.graph.nodes;a.graph.nodes=Array(513).fill(nodes[0]);assert.equal(R.prepareHeaderReflow(ir,state,a),a);a.graph.nodes=nodes;
});
test('reflow does not mutate its baseline caches, text or selected paths',()=>{
 const ir=fixture(),a=R.render(ir,{...state,paperHeaderReflow:false});
 const before=JSON.stringify([...a.graph.positions]),text=JSON.stringify(a.graph.nodes.map(n=>n.paper)),routes=JSON.stringify(a.prepared.routes);
 const b=R.prepareHeaderReflow(ir,state,a);assert.ok(b!==a);assert.equal(JSON.stringify([...a.graph.positions]),before);
 assert.equal(JSON.stringify(a.graph.nodes.map(n=>n.paper)),text);assert.equal(JSON.stringify(a.prepared.routes),routes);
 assert.equal(R.prepareHeaderReflow(ir,state,b),b,'reflow has reached its fixed point');
});
test('a title without a caption stays caption-free when rewrapped',()=>{
 const ir=fixture(),a=R.render(ir,{...state,paperHeaderReflow:false});
 const n=a.graph.idx.nodes.get('root');n.paper={...n.paper,caption:'',captions:[]};
 const b=R.prepareHeaderReflow(ir,state,a),row=b.prepared.routing.header_reflow.records.find(r=>r.node==='root');
 assert.ok(row);assert.deepEqual(row.captions_after,[]);assert.equal(b.graph.idx.nodes.get('root').paper.caption,'');
});

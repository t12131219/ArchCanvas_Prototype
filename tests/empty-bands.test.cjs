'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js');
const {fixture,state}=require('./empty-band-fixtures.cjs');
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,
 edges:r.graph.edges,node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,
 representatives:r.graph.representatives,expression:r.document.expression_coverage,summary:r.document.summary_coverage});
const transform=bands=>y=>y-bands.reduce((s,b)=>s+Math.max(0,Math.min(y,b.bottom)-b.top),0);
test('default compaction shortens only globally empty bands and preserves every concrete size and physical binding',()=>{
 const ir=fixture(),original=JSON.stringify(ir),a=R.render(ir,{...state,paperEmptyBandCompaction:false}),b=R.render(ir,state);
 const rec=b.prepared.routing.empty_band_compaction;assert.equal(rec.accepted,true);assert.deepEqual(facts(b),facts(a));assert.equal(JSON.stringify(ir),original);
 assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px);assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);
 assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
 const T=transform(rec.bands);
 for(const [id,p]of a.graph.positions){const q=b.graph.positions.get(id);assert.equal(q.x,p.x);assert.equal(q.w,p.w);assert.equal(q.y,T(p.y));assert.equal(q.h,T(p.y+p.h)-T(p.y));if(!p.expanded)assert.equal(q.h,p.h);}
 for(let i=0;i<a.prepared.routes.length;i++)assert.deepEqual(b.prepared.routes[i],{...a.prepared.routes[i],route:{...a.prepared.routes[i].route,points:a.prepared.routes[i].route.points.map(p=>({...p,y:T(p.y)}))}});
 assert.deepEqual(b.prepared.labeling.placed,a.prepared.labeling.placed.map(p=>({...p,y:T(p.y)})));
});
test('titles, frame bottoms, horizontal paths, labels and both physical terminals retain obstacle padding',()=>{
 const a=R.render(fixture(),{...state,paperEmptyBandCompaction:false}),b=R.prepareEmptyBandCompaction(a.document.ir,state,a),rec=b.prepared.routing.empty_band_compaction;
 const protectedIntervals=[];
 for(const p of a.graph.positions.values()){
  protectedIntervals.push([p.y-8,p.y+(p.expanded?p.header:p.h)+8]);
  if(p.expanded)protectedIntervals.push([p.y+p.h-8,p.y+p.h+8]);
 }
 for(const p of a.prepared.labeling.placed)protectedIntervals.push([p.y-8,p.y+p.h+8]);
 for(const e of a.prepared.routes){const ps=e.route.points;for(const p of [ps[0],ps.at(-1)])protectedIntervals.push([p.y-8,p.y+8]);
  for(let i=1;i<ps.length;i++)if(ps[i-1].y===ps[i].y)protectedIntervals.push([ps[i].y-8,ps[i].y+8]);}
 for(const band of rec.bands){assert.ok(band.bottom-band.top>=16);assert.ok(protectedIntervals.every(([a,b])=>band.bottom<=a||band.top>=b));}
 assert.equal(b.graph.positions.context.protectFrameTitles,false,'routing through titles remains enabled');
});
test('explicit rank label clearances prevent compression of a required interval',()=>{
 const ir=fixture(),a=R.render(ir,{...state,paperEmptyBandCompaction:false}),p=a.graph.positions.get('a'),q=a.graph.positions.get('b');
 a.graph.positions.context.rankClearances=[{applied:true,parent:'root',pairs:[],ranks:[{nodes:['a'],gap_after:q.y-p.y-p.h}]}];
 assert.equal(R.prepareEmptyBandCompaction(ir,state,a),a);assert.equal(a.prepared.routing.empty_band_compaction,undefined);
});
test('manual positions, explicit spacing, legacy title avoidance, print and resource limits keep their requested geometry',()=>{
 const ir=fixture(),a=R.render(ir,{...state,paperEmptyBandCompaction:false});
 for(const extra of [{paperEmptyBandCompaction:false},{offsets:{a:{x:1,y:0}}},{paperLabelSpacing:'global'},{paperLabelGapY:112},{paperProtectFrameTitles:true}]){
  assert.equal(R.prepareEmptyBandCompaction(ir,{...state,...extra},a),a);
 }
 const q=a.prepared.quality;q.medium='print';assert.equal(R.prepareEmptyBandCompaction(ir,state,a),a);q.medium='canvas';
 const edges=a.graph.edges;a.graph.edges=Array(2049).fill(edges[0]);assert.equal(R.prepareEmptyBandCompaction(ir,state,a),a);a.graph.edges=edges;
 const nodes=a.graph.nodes;a.graph.nodes=Array(513).fill(nodes[0]);assert.equal(R.prepareEmptyBandCompaction(ir,state,a),a);a.graph.nodes=nodes;
 q.route_failures=[{id:'e1'}];assert.equal(R.prepareEmptyBandCompaction(ir,state,a),a);q.route_failures=[];
 q.unplaced_port_labels=[{edge:'e1'}];assert.equal(R.prepareEmptyBandCompaction(ir,state,a),a);
});
test('unknown, control, state, mutable and shared identities keep their facts during the same geometric map',()=>{
 for(const guard of [{kind:'opaque'},{kind:'control'},{kind:'state'},{mutable:true},{identity_display:{kind:'same-object-calls',label:'shared',invocation:1,count:2}}]){
  const ir=fixture();Object.assign(ir.nodes[2],guard);const a=R.render(ir,{...state,paperEmptyBandCompaction:false}),b=R.render(ir,state);
  assert.deepEqual(facts(a),facts(b));assert.ok(b.graph.positions.has('b'));assert.deepEqual(b.document.ir.nodes[2],ir.nodes[2]);
  assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
 }
});
test('renaming classes and ports does not become compaction evidence',()=>{
 const ir=fixture(),a=R.render(ir,state);ir.title='Other foreign program';for(const n of ir.nodes){n.label='z';n.source_class='Unseen';}
 for(const e of ir.edges){e.source_port='result';e.target_port='slot:'+e.id;}
 const b=R.render(ir,state);assert.deepEqual(b.prepared.routing.empty_band_compaction.bands,a.prepared.routing.empty_band_compaction.bands);
 assert.ok(b.graph.edges.every(e=>e.source_port==='result'&&e.target_port==='slot:'+e.id));
});
test('fold, restore, save and repeated compaction preserve reversible detailed geometry',()=>{
 const ir=fixture(),a=R.render(ir,state),folded=R.render(ir,{...state,open:[]}),saved=JSON.parse(JSON.stringify(a.document));
 assert.ok(folded.graph.nodes.length<a.graph.nodes.length);assert.equal(R.render(saved.ir,saved.state).svg,a.svg);assert.equal(R.render(ir,state).svg,a.svg);
 assert.equal(R.prepareEmptyBandCompaction(ir,state,a),a,'all eligible bands were removed in one bounded map');
 assert.deepEqual(ir,saved.ir);
});

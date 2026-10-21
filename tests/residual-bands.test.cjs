'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),L=require('../semantic_studio/architecture-layout.js');
const {fixture,state}=require('./cross-scope-fixtures.cjs');
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,
 edges:r.graph.edges,expression:r.document.expression_coverage,summary:r.document.summary_coverage,
 nodes:r.graph.node_accounting,uses:r.graph.edge_accounting,representatives:r.graph.representatives});
const map=bands=>y=>y-bands.reduce((s,b)=>s+Math.max(0,Math.min(y,b.bottom)-b.top),0);
const baseline=(ir,s=state)=>R.render(ir,{...s,paperResidualBands:false});
test('final narrow-band compaction reduces whitespace without rerouting or changing a frontier',()=>{
 const ir=fixture(),original=JSON.stringify(ir),a=baseline(ir),b=R.render(ir,state),rec=b.prepared.routing.residual_band_compaction;
 assert.ok(rec.accepted);assert.ok(rec.bands.some(r=>r.bottom-r.top<16));
 assert.deepEqual(facts(b),facts(a));assert.equal(JSON.stringify(ir),original);
 assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);
 assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
 const T=map(rec.bands);
 for(const [id,p]of a.graph.positions){const q=b.graph.positions.get(id);assert.equal(q.x,p.x);assert.equal(q.w,p.w);assert.equal(q.y,T(p.y));assert.equal(q.h,T(p.y+p.h)-T(p.y));if(!p.expanded)assert.equal(q.h,p.h);}
 assert.deepEqual(b.prepared.routes,a.prepared.routes.map(e=>({...e,route:{...e.route,points:e.route.points.map(p=>({...p,y:T(p.y)}))}})));
 assert.deepEqual(b.prepared.labeling.placed,a.prepared.labeling.placed.map(p=>({...p,y:T(p.y)})));
});
test('a 28px operation gap retains 16px clearance rather than becoming a 1px gap',()=>{
 const positions=new Map([['a',{x:0,y:0,w:100,h:64}],['b',{x:0,y:92,w:100,h:64}]]);
 assert.deepEqual(L.emptyBands(positions,[],[{top:0,bottom:156}]),[]);
 const bands=L.emptyBands(positions,[],[{top:0,bottom:156}],[],1);
 assert.deepEqual(bands,[{top:72,bottom:84}]);assert.equal(map(bands)(92)-64,16);
 // A real horizontal segment needs its own padding, even in a narrow gap.
 const routes=[{route:{points:[{x:-10,y:78},{x:110,y:78}]}}];
 assert.deepEqual(L.emptyBands(positions,routes,[{top:0,bottom:156}],[],1),[]);
});
test('all existing titles, borders, labels and physical terminals retain their 8px guards',()=>{
 const a=baseline(fixture()),b=R.prepareResidualBands(a.document.ir,state,a),bands=b.prepared.routing.residual_band_compaction.bands,protectedIntervals=[];
 for(const p of a.graph.positions.values()){
  protectedIntervals.push([p.y-8,p.y+(p.expanded?p.header:p.h)+8]);
  if(p.expanded)protectedIntervals.push([p.y+p.h-8,p.y+p.h+8]);
 }
 for(const p of a.prepared.labeling.placed)protectedIntervals.push([p.y-8,p.y+p.h+8]);
 for(const e of a.prepared.routes){const ps=e.route.points;for(const p of [ps[0],ps.at(-1)])protectedIntervals.push([p.y-8,p.y+8]);
  for(let i=1;i<ps.length;i++)if(ps[i-1].y===ps[i].y)protectedIntervals.push([ps[i].y-8,ps[i].y+8]);}
 for(const band of bands)assert.ok(protectedIntervals.every(([a,b])=>band.bottom<=a||band.top>=b));
 assert.equal(b.graph.positions.context.protectFrameTitles,false);
});
test('explicit rank and entry clearance intervals stay protected in the final pass',()=>{
 const ir=fixture(),a=baseline(ir),p=a.graph.positions.get('l0'),q=a.graph.positions.get('l1');
 a.graph.positions.context.rankClearances=[{applied:true,ranks:[{nodes:['l0'],gap_after:q.y-p.y-p.h}]}];
 const b=R.prepareResidualBands(ir,state,a),T=map(b.prepared.routing.residual_band_compaction.bands);
 assert.equal(T(q.y)-T(p.y+p.h),q.y-p.y-p.h);
 assert.ok(b.prepared.routing.residual_band_compaction.bands_preserved);
});
test('unknown, conditional, state, mutable and shared facts survive the same final geometric map',()=>{
 for(const guard of [{kind:'opaque'},{condition:{branch:'test',outcome:true}},{kind:'state'},{mutable:true},
  {identity_display:{kind:'same-object-calls',label:'shared',invocation:1,count:2}}]){
  const ir=fixture();Object.assign(ir.nodes.find(n=>n.id==='l0'),guard);const a=baseline(ir),b=R.render(ir,state);
  assert.deepEqual(facts(a),facts(b));assert.deepEqual(b.document.ir.nodes.find(n=>n.id==='l0'),ir.nodes.find(n=>n.id==='l0'));
  assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
 }
});
test('fresh source helper chains compose beside unknown calls and conditional returns',()=>{
 for(const name of ['UnseenWorkshop','InterruptedWorkshop','ConditionalWorkshop']){
  const ir=JSON.parse(fs.readFileSync('verification/residual-bands/current/'+name+'.json'));
  const s={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};
  const a=baseline(ir,s),b=R.render(ir,s);assert.deepEqual(facts(a),facts(b));assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px);
  assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 }
});
test('manual geometry, explicit spacing, title protection, print and resource limits skip the final pass',()=>{
 const ir=fixture(),a=baseline(ir);
 for(const extra of [{paperResidualBands:false},{paperEmptyBandCompaction:false},{offsets:{l0:{x:1,y:0}}},{paperLabelSpacing:'global'},{paperLabelGapY:112},{paperProtectFrameTitles:true}])
  assert.equal(R.prepareResidualBands(ir,{...state,...extra},a),a);
 const q=a.prepared.quality;q.medium='print';assert.equal(R.prepareResidualBands(ir,state,a),a);q.medium='canvas';
 const nodes=a.graph.nodes;a.graph.nodes=Array(513).fill(nodes[0]);assert.equal(R.prepareResidualBands(ir,state,a),a);a.graph.nodes=nodes;
 q.route_failures=[{id:'bad'}];assert.equal(R.prepareResidualBands(ir,state,a),a);q.route_failures=[];
 q.unplaced_port_labels=[{edge:'bad'}];assert.equal(R.prepareResidualBands(ir,state,a),a);
});
test('baseline remains immutable; compacted saved documents and folding restore deterministically',()=>{
 const ir=fixture(),a=baseline(ir),positions=JSON.stringify([...a.graph.positions]),routes=JSON.stringify(a.prepared.routes);
 const b=R.prepareResidualBands(ir,state,a);assert.equal(JSON.stringify([...a.graph.positions]),positions);assert.equal(JSON.stringify(a.prepared.routes),routes);
 assert.equal(R.prepareResidualBands(ir,state,b),b);const saved=R.render(ir,state).document;
 const folded=R.render(ir,{...state,open:['root']});assert.ok(folded.graph.nodes.length<a.graph.nodes.length);
 assert.equal(R.render(saved.ir,saved.state).svg,R.render(ir,state).svg);
});

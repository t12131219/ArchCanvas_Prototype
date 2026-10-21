'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const read=n=>JSON.parse(fs.readFileSync('verification/final-sample-frames/current/'+n+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles'};
const scene=()=>new Map([{id:'root',x:0,y:0,w:500,h:500,header:40,expanded:true},{id:'leaf',x:100,y:200,w:80,h:60}].map(p=>[p.id,p]));
const route=points=>({route:{points:points.map(([x,y])=>({x,y}))}});
test('global empty bands protect closed bodies and expanded title text without reserving whole containers',()=>{
 const p=scene(),before=JSON.stringify([...p]);
 assert.deepEqual(L.emptyBands(p,[],[{top:0,bottom:300}]),[{top:48,bottom:192},{top:268,bottom:300}]);
 assert.equal(JSON.stringify([...p]),before);
});
test('horizontal wires, terminals and port labels reserve clearance even outside candidate frames',()=>{
 const p=scene(),routes=[route([[0,80],[400,80],[400,180]]),route([[300,160],[300,280]])];
 assert.deepEqual(L.emptyBands(p,routes,[{top:50,bottom:192}],[{x:900,y:110,w:80,h:20}]),[{top:50,bottom:72},{top:138,bottom:152}].filter(b=>b.bottom-b.top>=16));
});
test('overlapping windows are merged and narrow fragments are retained as space',()=>{
 assert.deepEqual(L.emptyBands(new Map(),[],[{top:20,bottom:80},{top:40,bottom:100},{top:200,bottom:215}]),[{top:20,bottom:100}]);
});
test('late ownership applies to unfamiliar conditional composition and preserves all canonical facts',()=>{
 const ir=read('ConditionalNeighborRuns'),before=JSON.stringify(ir),a=R.render(ir,{...state,paperFinalSampleFrames:false}),b=R.render(ir,state),rec=b.prepared.routing.final_sample_frame_refinement;
 assert.ok(rec?.accepted);assert.equal(rec.frames.length,2);assert.equal(a.graph.nodes.length-b.graph.nodes.length,2);
 assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
 assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length);
 assert.equal(rec.direct_goals_before,rec.direct_goals_candidate);assert.deepEqual(rec.lost_goals,[]);
 assert.deepEqual(a.document.architecture,b.document.architecture);assert.equal(JSON.stringify(ir),before);
 const shape=g=>g.edges.map(({design_route,...e})=>e);assert.deepEqual(shape(a.graph),shape(b.graph));
 const T=y=>y-rec.bands.reduce((sum,r)=>sum+Math.max(0,Math.min(y,r.bottom)-r.top),0);
 for(const [id,p]of b.graph.positions){const old=a.graph.positions.get(id);assert.equal(p.x,old.x);assert.equal(p.w,old.w);assert.equal(p.y,T(old.y));assert.equal(p.h,T(old.y+old.h)-T(old.y));}
 for(let i=0;i<a.prepared.routes.length;i++)assert.deepEqual(b.prepared.routes[i].route.points,a.prepared.routes[i].route.points.map(p=>({...p,y:T(p.y)})));
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(b.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
});
test('saved semantic state reproduces compact SVG and an opened suffix restores the representative boundary',()=>{
 const ir=read('ConditionalNeighborRuns'),b=R.render(ir,state),saved=JSON.parse(JSON.stringify(b.document));
 assert.equal(R.render(saved.ir,saved.state).svg,b.svg);
 const frame=b.prepared.routing.final_sample_frame_refinement.frames[0],seq=b.document.publication.inline_sequences.sequences.find(s=>s.sequence===frame.target);
 assert.ok(seq);const suffix=seq.remainders[0].node;
 const r=R.render(ir,{...state,paperAuto:false,open:[...b.graph.publication.open,suffix]});
 assert.ok(r.graph.positions.has(frame.node));assert.ok(r.graph.positions.has(suffix));
});
test('unknown, shared and mutable source boundaries remain visible or separately accounted',()=>{
 for(const name of ['UnknownNeighborRuns','SharedRuns','MutableRuns']){
  const ir=read(name),a=R.render(ir,{...state,paperFinalSampleFrames:false}),b=R.render(ir,state);
  assert.equal(b.prepared.routing.final_sample_frame_refinement,undefined);assert.equal(a.svg,b.svg);
  for(const n of ir.nodes.filter(n=>n.kind==='opaque'||n.mutable||n.identity_display))assert.ok(Object.values(b.graph.node_accounting).flat().includes(n.id));
 }
});
test('source-frame policy, explicit sample choices and manual offsets opt out of late attachment',()=>{
 const ir=read('ConditionalNeighborRuns');
 for(const option of [{paperFinalSampleFrames:false},{paperSampleFrame:false},{paperSampleFrame:true},{paperFrameView:'source'},{paperProtectFrameTitles:true},{offsets:{[ir.nodes[0].id]:{x:1,y:0}}}]){
  assert.equal(R.render(ir,{...state,...option}).prepared.routing.final_sample_frame_refinement,undefined);
 }
});

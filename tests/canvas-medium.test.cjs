'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../semantic_studio/publication-renderer.js');
const frozen=require('../tools/load_publication_renderer.cjs')(path.resolve(__dirname,'../verification/local-relations/iteration-09-before-canvas-medium/implementation/semantic_studio'));
const read=name=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../verification/local-relations/current',name+'.json')));
const cache=new Map();
function render(name,state={}){const key=JSON.stringify([name,state]);if(!cache.has(key))cache.set(key,R.render(read(name),state));return cache.get(key);}
function accounted(ir,g){for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(g[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(v=>v.id).sort());}}
function geometry(r){return JSON.stringify({open:r.graph.publication.open,nodes:r.document.layout.nodes,edges:r.document.layout.edges,labels:r.prepared.labeling,bounds:r.prepared.bounds});}
test('canvas retains a requested mixed semantic frontier that single-page print folds',()=>{
 const state={paperGranularity:'detailed'},a=render('MixedCircuit',state),b=render('MixedCircuit',{...state,paperMedium:'canvas'});
 assert.equal(a.graph.publication.granularity,'overview');assert.equal(b.graph.publication.granularity,'detailed');
 assert.ok(b.graph.nodes.length>a.graph.nodes.length);assert.ok(b.graph.publication.open.length>a.graph.publication.open.length);
 assert.deepEqual(b.prepared.quality.issues,[]);assert.equal(b.prepared.routing.granularity_refinement,undefined);
 const ir=read('MixedCircuit');accounted(ir,b.graph);assert.ok(b.graph.nodes.some(n=>n.kind==='opaque'));assert.ok(b.graph.nodes.some(n=>n.framework_type==='torch.nn.RNN'));
});
test('explicit title avoidance keeps the frozen default and explicit print vector output',()=>{
 for(const name of ['BrokenCell','MixedCircuit']){
  const ir=read(name),state={paperGranularity:'detailed',paperProtectFrameTitles:true},before=frozen.render(ir,state);
  assert.equal(render(name,state).svg,before.svg);assert.equal(render(name,{...state,paperMedium:'print'}).svg,before.svg);
 }
});
test('canvas native dimensions match viewBox units and print width/fit cannot change routes or frontier',()=>{
 const a=render('MixedCircuit',{paperGranularity:'detailed',paperMedium:'canvas'});
 const b=render('MixedCircuit',{paperGranularity:'detailed',paperMedium:'canvas',paperWidthMm:80,paperFitPage:false});
 assert.equal(geometry(a),geometry(b));assert.equal(a.prepared.quality.min_canvas_font_px,13);
 assert.match(a.svg,new RegExp('width="'+a.prepared.bounds.w+'px" height="'+a.prepared.totalH+'px"'));
 assert.equal(a.prepared.quality.native_width_px,a.prepared.bounds.w);assert.equal(a.prepared.quality.native_height_px,a.prepared.totalH);
 assert.ok(!a.prepared.quality.issues.includes('font-below-8pt'));
});
test('canvas budget diagnostics preserve requested structure rather than silently folding it',()=>{
 const state={paperGranularity:'detailed',paperMedium:'canvas'},a=render('MixedCircuit',state);
 const b=render('MixedCircuit',{...state,paperCanvasLimits:{width_px:512,height_px:512,area_px2:262144,nodes:16,edges:16}});
 assert.equal(b.graph.publication.granularity,'detailed');assert.equal(b.graph.nodes.length,a.graph.nodes.length);
 for(const issue of ['canvas-width-budget','canvas-height-budget','canvas-area-budget','canvas-node-budget','canvas-edge-budget'])assert.ok(b.prepared.quality.issues.includes(issue));
 accounted(read('MixedCircuit'),b.graph);
});
test('canvas saved frontier can be reopened, expanded further and folded without altering canonical facts',()=>{
 const a=render('BrokenCell',{paperMedium:'canvas',paperGranularity:'overview'}),doc=JSON.parse(JSON.stringify(a.document)),before=JSON.stringify(doc.ir);
 assert.equal(R.render(doc.ir,doc.state).svg,a.svg);
 const closed=a.graph.nodes.find(n=>(a.graph.idx.children.get(n.id)||[]).length&&!a.graph.positions.get(n.id).expanded);assert.ok(closed);
 const state={...doc.state,paperAuto:false,open:[...a.graph.publication.open,closed.id]},b=R.render(doc.ir,state);
 assert.ok(b.graph.nodes.length>a.graph.nodes.length);accounted(doc.ir,b.graph);assert.equal(JSON.stringify(doc.ir),before);
 const c=R.render(doc.ir,{...state,open:a.graph.publication.open});assert.equal(geometry(c),geometry(a));
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});

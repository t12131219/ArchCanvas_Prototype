'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../semantic_studio/publication.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync('verification/composed-paths/current/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles'},draw=(ir,s={})=>R.render(ir,{...state,...s});
const rows=g=>g.publication.local_pipelines?.rows||[],composed=g=>rows(g).find(r=>r.source_boundaries.length>1);
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('extracting serial operations into helpers preserves the same automatic path explanation',()=>{
 const ir=read('ComposedWeave'),before=JSON.stringify(ir),r=draw(ir),flat=draw(read('FlatWeave')),path=composed(r.graph);
 assert.ok(path);assert.deepEqual(path.operations.map(o=>o.label),['relu','sin','tanh','sigmoid']);
 assert.deepEqual(path.operations.map(o=>o.label),rows(flat.graph)[0].operations.map(o=>o.label));
 assert.equal(path.status,'summary');assert.equal(r.graph.nodes.length,flat.graph.nodes.length);assert.equal(path.source_boundaries.length,3);
 assert.equal(JSON.stringify(ir),before);assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,r.graph);
 for(const source of path.source_boundaries){const by=new Map(ir.nodes.map(n=>[n.id,n]));const inside=id=>{while(id){if(id===source.node)return true;id=by.get(id)?.parent;}return false;};
  assert.deepEqual(source.source,by.get(source.node).source);assert.equal(source.parent,by.get(source.node).parent);
  assert.deepEqual(source.cuts,ir.edges.filter(e=>inside(e.source)!==inside(e.target)));
 }
});
test('nested source boundaries unfold in two steps and save/reopen/refold deterministically',()=>{
 const ir=read('ComposedWeave'),r=draw(ir),path=composed(r.graph),opened=draw(ir,{paperAuto:false,open:[...r.graph.publication.open,path.node]});
 const detailed=draw(ir,{paperAuto:false,open:[...opened.graph.publication.open,...path.source_boundaries.map(b=>b.node)]});
 assert.ok(opened.graph.nodes.length>r.graph.nodes.length);assert.ok(detailed.graph.nodes.length>opened.graph.nodes.length);
 assert.equal(composed(opened.graph).status,'expanded');assert.equal(composed(opened.graph).detailed_operations_exposed,false);
 assert.equal(composed(detailed.graph).detailed_operations_exposed,true);
 for(const x of [r,opened,detailed]){assert.equal(draw(x.document.ir,x.document.state).svg,x.svg);assert.deepEqual(x.prepared.quality.issues,[]);accounted(ir,x.graph);}
 assert.equal(draw(ir,{paperAuto:false,open:r.graph.publication.open}).svg,r.svg);
 assert.deepEqual(composed(detailed.graph).bindings,path.bindings);
});
test('late external context remains attached to its exact visible receiving operation',()=>{
 const ir=read('LateComposition'),g=draw(ir).graph,path=composed(g);assert.ok(path);assert.equal(path.status,'expanded');
 const late=path.bindings.find(b=>b.kind==='value'&&!path.operations.some(o=>o.node===b.producer)&&b.target!==path.operations[0].node);
 assert.ok(late);assert.ok(g.positions.has(late.target));accounted(ir,g);
});
for(const name of ['EscapingComposition','UnknownComposition','ConditionalComposition','SharedComposition'])test(name+' retains broken, unknown, conditional and shared boundaries while local facts survive',()=>{
 const ir=read(name),r=draw(ir),g=r.graph;assert.ok(!composed(g));assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,g);
 if(name==='UnknownComposition'){assert.ok(g.nodes.some(n=>n.kind==='opaque'));assert.equal(rows(g).length,2);}
 if(name==='ConditionalComposition'){assert.ok(g.nodes.some(n=>n.kind==='control'));assert.ok(rows(g).length);}
 if(name==='EscapingComposition'){assert.equal(rows(g).length,2);const pack=g.nodes.find(n=>n.operator==='structure');assert.ok(pack);assert.deepEqual(g.edges.filter(e=>e.target===pack.id).map(e=>e.target_port),['0','1']);}
 if(name==='SharedComposition')assert.ok(g.nodes.filter(n=>n.identity_display).length>=2);
});
test('nested control, runtime, effects, opaque and certificate boundaries invalidate only enclosing candidates',()=>{
 for(const attrs of [{kind:'opaque'},{kind:'control'},{semantic_type:'structural-region'},{mutable:true},{condition:{branch:'test'}},
  {identity_display:{reference:'shared'}},{observed_calls:[{}]},{runtime_evidence:[{}]},{evidence_status:'runtime-only'},{semantic_contracts:['test']}]){
  const ir=read('ComposedWeave'),plan=structuredClone(P.plan(ir)),nested=plan.nodes.find(n=>n.label==='self.first');assert.ok(nested);Object.assign(nested,attrs);
  const D=require('../semantic_studio/local-pipelines.js'),incoming=new Map();for(const e of ir.edges){if(!incoming.has(e.target))incoming.set(e.target,[]);incoming.get(e.target).push(e);}
  const bindings=new Map(ir.nodes.filter(n=>n.kind==='interface'&&incoming.get(n.id)?.length===1).map(n=>[n.id,incoming.get(n.id)[0]]));
  const result=D.compile({ir,plan,bindings,metadata:new Set(),configurationUses:new Set()});
  assert.ok(![...result.values()].some(r=>r.source_boundaries.length>1),JSON.stringify(attrs));
  assert.ok([...result.values()].some(r=>r.operations.map(o=>o.label).join(',')==='tanh,sigmoid'));
 }
});
test('source spelling and stored path labels cannot authorize composition',()=>{
 const ir=read('ComposedWeave'),r=composed(draw(ir).graph);for(const n of ir.nodes){n.label='Transformer';n.source_class='Unseen';}
 const renamed=composed(draw(ir).graph);assert.deepEqual(renamed.operations,r.operations);assert.deepEqual(renamed.source_boundaries,r.source_boundaries);
 const invalid=read('UnknownComposition');for(const n of invalid.nodes)n.local_pipeline=r;assert.ok(!composed(draw(invalid).graph));
});
test('print and other granularities retain their original source-detail policy',()=>{
 const ir=read('ComposedWeave');for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperPipelineSummaries:false}]){
  const g=draw(ir,extra).graph;assert.equal(g.publication.local_pipelines,undefined);accounted(ir,g);
 }
});

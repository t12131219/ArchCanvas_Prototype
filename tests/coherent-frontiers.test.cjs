'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles',paperBudget:6},read=n=>JSON.parse(fs.readFileSync('verification/coherent-frontiers/current/'+n+'.json'));
const project=(ir,extra={})=>P.project(ir,{...state,...extra},E),choices=g=>g.publication.coherent_frontier?.choices||[];
function account(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const actual=Object.values(g[key]).flat();assert.equal(new Set(actual).size,actual.length);assert.deepEqual(actual.sort(),items.map(n=>n.id).sort());
}}
test('a tight shared budget defers comparable local regions together instead of favoring the first source call',()=>{
 const ir=read('CoherentMosaic'),before=JSON.stringify(ir),g=project(ir),old=project(ir,{paperCoherentFrontier:false});
 const [c]=choices(g);assert.equal(c.nodes.length,2);assert.equal(c.status,'deferred');assert.ok(c.used+c.delta>c.budget);
 assert.ok(c.nodes.every(id=>g.positions.has(id)&&!g.positions.get(id).expanded));
 assert.equal(c.nodes.filter(id=>old.positions.get(id).expanded).length,1);assert.equal(JSON.stringify(ir),before);account(ir,g);
});
test('sufficient budget opens both distinct instances with every operand, rather than merging their values',()=>{
 const ir=read('CoherentMosaic'),g=project(ir,{paperBudget:8}),c=choices(g)[0];assert.equal(c.status,'expanded');
 const adds=g.nodes.filter(n=>n.operator==='add');assert.equal(adds.length,2);assert.notEqual(adds[0].id,adds[1].id);
 for(const add of adds)assert.equal(g.edges.filter(e=>e.canonical_target===add.id).length,2);
 assert.ok(c.nodes.every(id=>g.positions.get(id).expanded));account(ir,g);
});
test('renaming models and reversing source declaration order cannot spend the tight budget on only one peer',()=>{
 const ir=read('CoherentMosaic'),a=project(ir),peers=choices(a)[0].nodes.slice().sort();
 ir.title='Transformer';for(const n of ir.nodes){n.label='Unseen';n.source_class='Transformer';}ir.nodes.reverse();ir.edges.reverse();
 const b=project(ir);assert.deepEqual(choices(b)[0].nodes.slice().sort(),peers);assert.equal(choices(b)[0].status,'deferred');account(ir,b);
});
test('different local operation profiles remain independent',()=>{
 const ir=read('UnequalMosaic'),g=project(ir);assert.equal(choices(g).length,0);
 assert.deepEqual(g.publication.open,project(ir,{paperCoherentFrontier:false}).publication.open);account(ir,g);
});
test('an unknown neighboring branch does not join the comparable regions or disappear',()=>{
 const ir=read('BrokenMosaic'),g=project(ir,{paperBudget:10}),c=choices(g)[0];assert.equal(c.nodes.length,2);
 const unknown=ir.nodes.find(n=>n.kind==='opaque');assert.ok(g.positions.has(unknown.id));
 assert.ok(c.nodes.every(id=>g.architecture.nodes.find(n=>n.id===id).canonical_members.every(id=>id!==unknown.id)));account(ir,g);
});
test('condition scopes and both outcomes retain independent visibility',()=>{
 const ir=read('ConditionalMosaic'),g=project(ir,{paperBudget:12}),old=project(ir,{paperBudget:12,paperCoherentFrontier:false});
 const guarded=g.architecture.nodes.filter(n=>n.kind==='control'||n.condition||n.kind==='opaque');
 for(const n of guarded)assert.equal(g.positions.has(n.id),old.positions.has(n.id));
 assert.ok(choices(g).every(c=>c.nodes.every(id=>!guarded.some(n=>g.architecture.nodes.find(m=>m.id===id).canonical_members?.includes(n.id)))));account(ir,g);
});
test('mutable, observed, shared-identity and conditioned computations cannot authorize coordinated folding',()=>{
 for(const mutate of [n=>n.mutable=true,n=>n.evidence_status='runtime-only',n=>n.runtime_evidence=[{run:'one'}],n=>n.identity_display={kind:'same-object-calls',label:'shared',invocation:1,count:2},n=>n.condition={branch:'guard',outcome:'true'}]){
  const ir=read('CoherentMosaic'),node=ir.nodes.find(n=>n.operator==='sin');mutate(node);const g=project(ir);
  assert.equal(choices(g).length,0);account(ir,g);
 }
 for(const kind of ['state-write','iteration-binding']){
  const ir=read('CoherentMosaic'),edge=ir.edges.find(e=>ir.nodes.find(n=>n.id===e.target)?.operator==='sin');edge.kind=kind;
  assert.equal(choices(project(ir)).length,0);
 }
});
test('an explicit local relationship request can expand one peer independently',()=>{
 const ir=read('CoherentMosaic'),base=project(ir),relation=base.architecture.relation_graph.relations.find(r=>r.type==='join');
 const g=project(ir,{paperExpressionDetails:[relation.id]});assert.ok(g.positions.has(relation.node));
 assert.ok(!choices(g).some(c=>c.nodes.length>1));account(ir,g);
});
test('manual expansion, save/reopen and return restore exact detail and the original summary SVG',()=>{
 const ir=read('CoherentMosaic'),r=R.render(ir,state),peers=choices(r.graph)[0].nodes;
 const expanded=R.render(ir,{...state,paperAuto:false,open:[...r.graph.publication.open,peers[0]]});
 assert.ok(expanded.graph.positions.get(peers[0]).expanded);assert.ok(!expanded.graph.positions.get(peers[1]).expanded);
 assert.ok(expanded.graph.nodes.length>r.graph.nodes.length);assert.equal(R.render(expanded.document.ir,expanded.document.state).svg,expanded.svg);
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);account(ir,expanded.graph);assert.deepEqual(expanded.document.ir,ir);
});
test('print, other presets and disabled automatic selection preserve their previous frontier policy',()=>{
 const ir=read('CoherentMosaic');for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperGranularity:'detailed'},{paperAuto:false,open:[ir.nodes[0].id]}]){
  const a=project(ir,extra),b=project(ir,{...extra,paperCoherentFrontier:false});assert.deepEqual(a.publication.open,b.publication.open);assert.equal(choices(a).length,0);account(ir,a);
 }
});

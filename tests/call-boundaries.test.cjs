'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer'),G=require('../semantic_studio/summary-goals'),E=require('../semantic_studio/semantic-engine');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperAdaptive:false};
const read=n=>JSON.parse(fs.readFileSync('verification/source-read-paths/current/'+n+'.json'));
const compact={...state,paperReadSummary:'boundary'};
const boundaries=r=>r.graph.nodes.filter(n=>n.paper.call_boundary);
function accounting(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]])assert.deepEqual(Object.values(g[key]).flat().sort(),items.map(n=>n.id).sort());}
test('an explicit source-call view folds evidence text while retaining every original member and boundary',()=>{
 const ir=read('ReadWorkshop'),raw=JSON.stringify(ir),a=R.render(ir,state),b=R.render(ir,compact);
 assert.equal(boundaries(a).length,0);assert.equal(boundaries(b).length,2);
 assert.deepEqual(a.graph.nodes.map(n=>n.id),b.graph.nodes.map(n=>n.id));assert.deepEqual(a.graph.edges,b.graph.edges);
 assert.deepEqual(a.graph.publication.open,b.graph.publication.open);
 for(const n of boundaries(b)){const old=a.graph.nodes.find(o=>o.id===n.id);assert.deepEqual(n.local_pipeline,old.local_pipeline);assert.ok(n.paper.h<old.paper.h);assert.match(b.svg,/data-call-boundary=/);}
 accounting(ir,b.graph);assert.equal(JSON.stringify(ir),raw);
});
test('call-boundary coverage never claims the hidden dependency structure or detailed operands are directly fulfilled',()=>{
 const ir=read('ReadWorkshop'),r=R.render(ir,compact);
 for(const n of boundaries(r)){const c=r.graph.summary_coverage.find(c=>c.node===n.id);assert.equal(c.status,'unfulfilled');assert.equal(c.form,'call-boundary');assert.equal(c.boundary_status,'fulfilled');assert.equal(c.detailed_relationships_fulfilled,false);assert.ok(c.missing_operation_nodes.length);assert.ok(c.missing_internal_paths.length);}
});
test('an altered read proof, printed label, count, result or routed cut cannot satisfy boundary coverage',()=>{
 const ir=read('ReadWorkshop'),r=R.render(ir,compact),node=boundaries(r)[0],goal=r.graph.summary_goals.goals.find(g=>g.node===node.id);
 for(const mutate of [n=>n.paper.call_boundary.source_reads[0].expression='self.forged',n=>n.paper.call_boundary.operations.pop(),n=>n.paper.lines=['Certified Transformer'],n=>n.paper.captions[0]='1 operation',n=>n.paper.captions[1]='Result: unknown']){
  const changed=structuredClone(node);mutate(changed);const graph={...r.graph,nodes:r.graph.nodes.map(n=>n.id===node.id?changed:n)};
  assert.equal(G.evaluate(r.graph.summary_goals,ir,graph,r.prepared).find(c=>c.node===node.id).boundary_status,'unfulfilled');
 }
 const bad=structuredClone(goal);bad.proof_errors.push('invalid-read');assert.equal(G.callBoundary(bad,ir),null);
 const prepared={...r.prepared,routes:r.prepared.routes.filter(e=>!(e.originals||[e.id]).some(id=>goal.cuts.some(c=>c.id===id)))};
 assert.equal(G.evaluate(r.graph.summary_goals,ir,r.graph,prepared).find(c=>c.node===node.id).boundary_status,'unfulfilled');
});
test('expanding the same calls and expression partitions restores complete operation paths',()=>{
 const ir=read('ReadWorkshop'),a=R.render(ir,compact),open=[...a.graph.publication.open,...boundaries(a).flatMap(n=>[n.id,...(n.local_pipeline.display_partitions||[]).map(p=>p.node)])];
 const b=R.render(ir,{...compact,paperAuto:false,open});assert.equal(boundaries(b).length,0);
 assert.ok(b.graph.summary_coverage.every(c=>c.status==='fulfilled'&&c.form==='operation-paths'));
 for(const n of boundaries(a))for(const o of n.local_pipeline.operations)assert.ok(b.graph.positions.has(o.node));
 accounting(ir,b.graph);assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 const raw=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});assert.deepEqual(raw.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());
});
test('unknown, conditional, mutable and escaping fragments keep their boundary beside an independently compact call',()=>{
 for(const name of ['EscapingRead','InterruptedRead','ConditionalRead','MutableRead']){
  const ir=read(name),a=R.render(ir,state),b=R.render(ir,compact);assert.equal(boundaries(b).length,1,name);
  assert.deepEqual(a.graph.nodes.map(n=>n.id),b.graph.nodes.map(n=>n.id));assert.deepEqual(a.graph.edges,b.graph.edges);
  for(const n of ir.nodes.filter(n=>n.kind==='opaque'||n.kind==='control'||n.mutable))assert.ok(b.graph.positions.has(n.id));accounting(ir,b.graph);
 }
});
test('shared calls remain distinct with explicit invocation identity and different source read occurrences',()=>{
 const r=R.render(read('SharedReadWorkshop'),compact),ns=boundaries(r);assert.equal(ns.length,2);
 assert.notEqual(ns[0].id,ns[1].id);assert.notEqual(ns[0].paper.call_boundary.source_reads[0].node,ns[1].paper.call_boundary.source_reads[0].node);
 for(const [i,n]of ns.entries())assert.ok(n.paper.captions.join(' ').includes('source call '+(i+1)+'/2'));
 assert.ok(r.graph.expression_coverage.some(c=>c.kind==='same-object-calls'&&c.status==='fulfilled'));
});
test('multiple reads are counted from checked occurrences and retain their exact source expressions in exported evidence',()=>{
 const r=R.render(read('PairReads'),compact),n=boundaries(r)[0];assert.ok(n.paper.captions.includes('2 source reads'));
 assert.deepEqual(n.paper.call_boundary.source_reads.map(r=>r.expression),['self.first','self.second']);assert.ok(r.svg.includes('self.first')&&r.svg.includes('self.second'));
});
test('default evidence text, role, print and non-stage contracts are preserved; selected mode saves and reopens',()=>{
 const ir=read('ReadWorkshop');for(const extra of [{paperGranularity:'roles'},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  const a=R.render(ir,{...state,...extra}),b=R.render(ir,{...compact,...extra});assert.equal(a.svg,b.svg);assert.equal(boundaries(b).length,0);
 }
 const a=R.render(ir,compact);assert.equal(R.render(a.document.ir,a.document.state).svg,a.svg);
 assert.equal(R.render(ir,{...compact,paperReadSummary:'bindings'}).svg,R.render(ir,state).svg);
});
test('model-family names cannot authorize or change a call-boundary recipe',()=>{
 const ir=read('ReadWorkshop'),a=R.render(ir,compact);ir.title='Transformer';for(const n of ir.nodes){n.source_class='LSTM';n.class_name='MoE';}
 const b=R.render(ir,compact);assert.deepEqual(boundaries(a).map(n=>n.paper.call_boundary),boundaries(b).map(n=>n.paper.call_boundary));
 assert.deepEqual(a.graph.architecture.findings,b.graph.architecture.findings);
});

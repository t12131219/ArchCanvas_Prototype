'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine'),R=require('../semantic_studio/publication-renderer'),F=require('../semantic_studio/local-pipelines'),G=require('../semantic_studio/summary-goals');
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperAdaptive:false};
const read=n=>JSON.parse(fs.readFileSync('verification/source-read-paths/current/'+n+'.json'));
const rows=g=>(g.publication.local_pipelines?.rows||[]).filter(r=>r.source_reads?.length);
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('source read summaries retain exact numbered consumers and later input operands',()=>{
 const ir=read('ReadWorkshop'),before=JSON.stringify(ir),r=R.render(ir,state);assert.equal(rows(r.graph).length,2);
 for(const p of rows(r.graph)){
  assert.equal(p.status,'summary');assert.equal(p.source_reads.length,1);assert.equal(p.dependency_dag.nodes.length,4);
  assert.ok(p.external_inputs.some(b=>b.reference==='#3'&&b.target_port==='0'));
  const display=r.graph.nodes.find(n=>n.id===p.node).paper,paper=display.captions.join(' ');
  if(display.read_binding_rows){
    assert.ok(paper.includes('#1 getitem ← value=read1("self.table")'));
    assert.ok(paper.includes('#3 add ← 0=input1("x"); 2=#2'));
  }else {assert.ok(paper.includes('Reads self.table → #1[value]'));assert.ok(paper.includes('Input x → #3[0]'));}
  assert.ok(r.graph.summary_coverage.find(c=>c.node===p.node).status==='fulfilled');
  assert.ok(!r.graph.expression_coverage.some(c=>p.operations.some(o=>c.goal==='goal:node:'+o.node)&&c.status==='fulfilled'));
 }
 assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(JSON.stringify(ir),before);accounted(ir,r.graph);
});
test('two different source reads are distinct and a converging expression keeps references',()=>{
 const r=R.render(read('PairReads'),state),p=rows(r.graph)[0];assert.equal(p.source_reads.length,2);
 assert.deepEqual(p.source_reads.map(r=>r.expression),['self.first','self.second']);
 assert.equal(p.operations.length,5);assert.equal(p.external_inputs.length,1);
 assert.equal(r.graph.summary_coverage.find(c=>c.node===p.node).status,'fulfilled');assert.deepEqual(r.prepared.quality.issues,[]);
});
test('the same object keeps both invocation cards and printed identity rather than merging reads',()=>{
 const r=R.render(read('SharedReadWorkshop'),state),ps=rows(r.graph);assert.equal(ps.length,2);
 assert.ok(ps.every(p=>p.owner_identity?.kind==='same-object-calls'));assert.deepEqual(ps.map(p=>p.owner_identity.invocation),[1,2]);
 assert.equal(ps[0].owner_identity.reference,ps[1].owner_identity.reference);
 for(const p of ps){const paper=r.graph.nodes.find(n=>n.id===p.node).paper;assert.ok(paper.captions.join(' ').includes('source call '+p.owner_identity.invocation+'/2'));}
 assert.ok(r.graph.expression_coverage.some(c=>c.kind==='same-object-calls'&&c.status==='fulfilled'));
});
test('escape, unknown, conditional and mutable regions remain beside independent known summaries',()=>{
 for(const name of ['EscapingRead','InterruptedRead','ConditionalRead','MutableRead']){
  const ir=read(name),g=E.project(ir,state);assert.equal(rows(g).length,1,name);accounted(ir,g);
  const boundary=ir.nodes.filter(n=>n.kind==='opaque'||n.kind==='control'||n.mutable);
  assert.ok(boundary.every(n=>g.positions.has(n.id)),name);
  const fragment=ir.nodes.find(n=>n.source?.some(s=>s.symbol==='fragment')&&n.kind==='composite');assert.ok(fragment);
  assert.ok(!rows(g).some(p=>p.node===fragment.id),name);
 }
});
test('manual expansion and saved reopening preserve source reads and exact operation goals',()=>{
 const ir=read('ReadWorkshop'),r=R.render(ir,state),open=[...r.graph.publication.open,...rows(r.graph).flatMap(p=>[p.node,...(p.display_partitions||[]).map(f=>f.node)])];
 const detail=R.render(ir,{...state,paperAuto:false,open});assert.ok(detail.graph.nodes.length>r.graph.nodes.length);
 assert.ok(rows(detail.graph).every(p=>p.detailed_operations_exposed));assert.equal(R.render(detail.document.ir,detail.document.state).svg,detail.svg);
 assert.equal(R.render(ir,state).svg,r.svg);accounted(ir,detail.graph);
});
function candidateArgs(){
 const ir=read('ReadWorkshop'),g=E.project(ir,state),doc=R.render(ir,state).document;
 const plan=structuredClone(doc.architecture);for(const n of plan.nodes)delete n.local_pipeline;
 return {ir,plan,metadata:new Set(ir.nodes.filter(n=>n.operator==='shape').map(n=>n.id)),bindings:new Map(),configurationUses:new Set(ir.edges.filter(e=>e.target_port==='kw:dtype').map(e=>e.id)),sourceReads:true};
}
test('incoming state bindings, escaping reads and write edges cannot authorize a source read summary',()=>{
 for(const mutate of [o=>{const p=o.ir.nodes.find(n=>n.kind==='state');o.ir.edges.push({id:'write',source:p.id,target:p.id,kind:'state-write'});},
  o=>{const p=o.ir.nodes.find(n=>n.kind==='state');o.ir.edges.push({id:'escape',source:p.id,target:o.ir.nodes[0].id,kind:'data',source_port:'out',target_port:'in'});},
  o=>{const p=o.ir.nodes.find(n=>n.kind==='state');p.evidence_status='runtime-only';Object.assign(o.plan.nodes.find(n=>n.id===p.id),p);}]){
  const o=candidateArgs(),id=o.ir.nodes.find(n=>n.kind==='state').id;mutate(o);
  assert.ok(![...F.compile(o).values()].some(p=>p.source_reads?.some(r=>r.node===id)));
 }
});
test('operand partitions require exact original membership and cut ports',()=>{
 const o=candidateArgs(),frame=o.plan.nodes.find(n=>n.semantic_type==='operand-expression');assert.ok(frame);
 const baseline=F.compile(o);assert.ok(baseline.size);
 frame.boundary_ports[0].target_port='wrong';assert.ok(![...F.compile(o).values()].some(p=>p.canonical_members.includes(frame.canonical_members[0])));
});
test('summary proof rejects altered read names, consumers, omitted declarations and external input slots',()=>{
 const r=R.render(read('ReadWorkshop'),state);
 for(const mutate of [p=>p.source_reads[0].expression='self.other',p=>p.source_reads[0].edges[0].target_port='wrong',
  p=>p.source_reads=[],p=>p.external_inputs[0].target_port='wrong']){
  const plan=structuredClone(r.document.architecture),n=plan.nodes.find(n=>n.local_pipeline?.source_reads?.length);mutate(n.local_pipeline);
  const goal=G.build(r.document.ir,plan).goals.find(g=>g.node===n.id);assert.ok(goal.proof_errors.length);
 }
});
test('renaming and coarse folding retain canonical identities and raw source expansion',()=>{
 const ir=read('ReadWorkshop'),g=E.project(ir,state),renamed=structuredClone(ir);renamed.title='Unknown';for(const n of renamed.nodes){n.label='Renamed';n.source_class='Unfamiliar';}
 const b=E.project(renamed,state);assert.deepEqual(b.publication.open,g.publication.open);assert.deepEqual(rows(b).map(r=>r.canonical_members),rows(g).map(r=>r.canonical_members));
 const raw=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.deepEqual(raw.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(raw.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
});
test('role and print presets retain their previous source-read boundary contract',()=>{
 const ir=read('ReadWorkshop');for(const s of [{paperGranularity:'roles'},{paperMedium:'print'}])assert.equal(rows(E.project(ir,{...state,...s})).length,0);
});

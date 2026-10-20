'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const R=require('../semantic_studio/publication-renderer.js'),S=require('../semantic_studio/summary-goals.js'),A=require('../semantic_studio/adaptive-frontier.js');
const state={paperMedium:'canvas',paperGranularity:'roles'},read=(dir,name)=>JSON.parse(fs.readFileSync('verification/'+dir+'/current/'+name+'.json'));
const draw=(ir,s={})=>R.render(ir,{...state,...s});
function pair(name,dir='dependency-dags'){
 const ir=read(dir,name),folded=draw(ir),p=folded.graph.publication.local_pipelines.rows.find(p=>p.status==='summary');assert.ok(p);
 const opened=draw(ir,{paperAuto:false,open:[...folded.graph.publication.open,...p.source_boundaries.map(b=>b.node)]});
 return {ir,folded,opened,p};
}
const coverage=(r,node)=>r.graph.summary_coverage.find(c=>c.node===node);
const evaluate=(r,graph=r.graph,prepared=r.prepared,goals=r.graph.summary_goals)=>S.evaluate(goals,r.document.ir,graph,prepared);

test('coarse dependency structure survives summary to exact operation paths without earning detailed goals',()=>{
 for(const [name,dir]of [['ReusedCircuit','dependency-dags'],['SquaredCircuit','dependency-dags'],['TupleCircuit','dependency-dags'],['SourceMosaic','summary-coverage'],['MergeWeave','dependency-trees'],['ScaledProjection','dependency-trees']]){
  const {ir,folded,opened,p}=pair(name,dir),a=coverage(folded,p.node),b=coverage(opened,p.node);
  assert.equal(a.status,'fulfilled',name);assert.equal(a.form,'summary',name);assert.equal(b.status,'fulfilled',name);assert.equal(b.form,'operation-paths',name);
  assert.equal(a.detailed_relationships_fulfilled,false);assert.equal(b.detailed_relationships_fulfilled,false);
  assert.deepEqual(a.proof_errors,[]);assert.deepEqual(b.proof_errors,[]);
  assert.ok(p.operations.every(o=>folded.graph.expression_coverage.find(c=>c.goal==='goal:node:'+o.node)?.status!=='fulfilled'));
  assert.deepEqual(folded.document.ir,ir);assert.equal(draw(folded.document.ir,folded.document.state).svg,folded.svg);
 }
});

test('mere summary names, invisible captions and attached cut receipts cannot fulfill a structure',()=>{
 const {folded,p}=pair('ReusedCircuit');
 for(const mutate of [g=>g.positions.delete(p.node),g=>g.positions.get(p.node).expanded=true,
  g=>g.nodes.find(n=>n.id===p.node).paper.lines=['Arbitrary box'],g=>g.nodes.find(n=>n.id===p.node).paper.captions=['Dependency DAG']]){
  const graph=structuredClone(folded.graph);mutate(graph);assert.equal(evaluate(folded,graph).find(c=>c.node===p.node).status,'unfulfilled');
 }
 for(const cut of p.cuts){
  const prepared={...folded.prepared,routes:folded.prepared.routes.filter(e=>!(e.originals||[e.id]).includes(cut.id))};
  assert.equal(evaluate(folded,folded.graph,prepared).find(c=>c.node===p.node).status,'unfulfilled');
 }
});

test('canonical operands and result slots are checked independently of supplied summary references',()=>{
 for(const name of ['ReusedCircuit','SquaredCircuit','TupleCircuit']){
  const {ir,folded,p}=pair(name),original=folded.graph.architecture;
  for(const mutate of [r=>r.bindings[0].target_port='wrong',r=>r.cuts.pop(),r=>r.canonical_members.pop(),
   r=>r.operations[0].label='fake',r=>r.dependency_dag.nodes.at(-1).inputs[0].source_port='invented',
   r=>r.dependency_dag.nodes.at(-1).inputs[0].reference='#99']){
   const plan=structuredClone(original),row=plan.nodes.find(n=>n.id===p.node).local_pipeline;mutate(row);
   const goals=S.build(ir,plan),result=evaluate(folded,folded.graph,folded.prepared,goals).find(c=>c.node===p.node);
   assert.equal(result.status,'unfulfilled',name);assert.ok(result.proof_errors.length,name);
  }
 }
});

test('final cut routes must reach the original operand with the original result identity',()=>{
 const {folded,p}=pair('ReusedCircuit');
 for(const mutate of [e=>e.route.ok=false,e=>e.source_port='wrong',e=>e.canonical_target=p.operations[1].node,
  e=>e.target_port='wrong',e=>e.resolved_source=p.operations[2].node]){
  const prepared=structuredClone(folded.prepared),cut=p.cuts[0],path=prepared.routes.find(e=>(e.originals||[e.id]).includes(cut.id));mutate(path);
  assert.equal(evaluate(folded,folded.graph,prepared).find(c=>c.node===p.node).status,'unfulfilled');
 }
});

test('opened structure requires every operation and real internal path; hidden nested summaries remain deferred',()=>{
 const {opened,p}=pair('ReusedCircuit');
 for(const o of p.operations){const graph={...opened.graph,positions:new Map(opened.graph.positions)};graph.positions.delete(o.node);
  assert.equal(evaluate(opened,graph).find(c=>c.node===p.node).status,'unfulfilled');}
 for(const binding of p.bindings.filter(b=>p.operations.some(o=>o.node===b.producer))){
  const prepared={...opened.prepared,routes:opened.prepared.routes.filter(e=>!(e.originals||[e.id]).includes(binding.edge))};
  assert.equal(evaluate(opened,opened.graph,prepared).find(c=>c.node===p.node).status,'unfulfilled');
 }
 const nested=pair('TupleCircuit');assert.ok(nested.folded.graph.summary_coverage.some(c=>c.status==='unfulfilled'));
 assert.ok(nested.opened.graph.summary_coverage.every(c=>c.status==='fulfilled'));
});

test('unknown and late context stay explicit while proved neighboring structure receives scoped coverage',()=>{
 const unknown=draw(read('summary-coverage','InterruptedMosaic'));assert.ok(unknown.graph.nodes.some(n=>n.kind==='opaque'));
 assert.ok(unknown.graph.summary_coverage.some(c=>c.form==='summary'&&c.status==='fulfilled'));
 const late=draw(read('summary-coverage','LateMosaic'));assert.ok(late.graph.summary_coverage.some(c=>c.form==='operation-paths'&&c.status==='fulfilled'));
 assert.ok(!late.graph.summary_coverage.some(c=>c.form==='summary'));
 const p=pair('ReusedCircuit');for(const guard of [{kind:'opaque'},{mutable:true},{condition:{test:'x'}},{evidence_status:'runtime-only'},
  {observed_calls:{}},{identity_display:{reference:'obj'}},{runtime_evidence:[{}]}]){
  const plan=structuredClone(p.folded.graph.architecture);Object.assign(plan.nodes.find(n=>n.id===p.p.operations[0].node),guard);
  assert.ok(S.build(p.ir,plan).goals[0].proof_errors.length);
 }
});

test('adaptive detail cannot lose a previously expressed coarse structure or count it as atomic gain',()=>{
 const {ir,folded,opened,p}=pair('ReusedCircuit'),baseline=A.evidence(ir,folded),detail=A.evidence(ir,opened);
 assert.ok(baseline.summaries.has('goal:summary:'+p.node));assert.ok(detail.summaries.has('goal:summary:'+p.node));
 assert.ok(!baseline.goals.has('goal:summary:'+p.node));
 const trial={...opened,graph:{...opened.graph,summary_coverage:[]}},bad=A.assess(ir,folded,trial);
 assert.equal(bad.accepted,false);assert.ok(bad.reasons.includes('previous-dependency-structure-lost'));
 assert.deepEqual(bad.lost_summary_goals,['goal:summary:'+p.node]);
});

test('renaming, save/reopen, disabled summaries and print preserve independent contracts',()=>{
 const {ir,folded}=pair('ReusedCircuit'),renamed=structuredClone(ir);renamed.title='Transformer';
 for(const n of renamed.nodes){n.label='Transformer';n.source_class='Unseen';}
 const b=draw(renamed);assert.deepEqual(b.graph.summary_coverage.map(c=>[c.goal,c.status]),folded.graph.summary_coverage.map(c=>[c.goal,c.status]));
 assert.deepEqual(draw(folded.document.ir,folded.document.state).document.summary_coverage,folded.document.summary_coverage);
 for(const extra of [{paperPipelineSummaries:false},{paperMedium:'print'},{paperGranularity:'semantic'}])assert.equal(draw(ir,extra).graph.summary_goals.goals.length,0);
});

test('tree receipts cannot substitute another operand tree and blank operation names earn no detailed coverage',()=>{
 const {ir,folded,opened,p}=pair('MergeWeave','dependency-trees'),plan=structuredClone(folded.graph.architecture);
 const owner=plan.nodes.find(n=>n.id===p.node);owner.local_pipeline.dependency_tree.inputs[0].target_port='wrong';
 assert.equal(evaluate(folded,folded.graph,folded.prepared,S.build(ir,plan)).find(c=>c.node===p.node).status,'unfulfilled');
 for(const lines of [[],['Unrelated operation']]){
  const graph=structuredClone(opened.graph);graph.nodes.find(n=>n.id===p.operations[0].node).paper.lines=lines;
  const checked=evaluate(opened,graph).find(c=>c.node===p.node);assert.equal(checked.status,'unfulfilled');assert.ok(checked.missing_operation_labels.length);
 }
 const symbolic=pair('SquaredCircuit'),graph=structuredClone(symbolic.opened.graph);
 const symbol=[...graph.positions.values()].find(p=>p.symbol);assert.ok(symbol);symbol.symbol='+';
 assert.equal(evaluate(symbolic.opened,graph).find(c=>c.node===symbolic.p.node).status,'unfulfilled');
});

test('coarse structure does not promise the complete parameter or configuration interface',()=>{
 const {folded,p}=pair('ScaledProjection','dependency-trees'),c=coverage(folded,p.node);
 assert.ok(p.parameter_reads.length);assert.equal(c.status,'fulfilled');assert.match(c.scope,/Full operands, parameter\/configuration values.*not covered/);
 assert.equal(c.detailed_relationships_fulfilled,false);
 for(const row of folded.graph.expression_coverage.filter(r=>p.operations.some(o=>r.goal==='goal:node:'+o.node)))assert.notEqual(row.status,'fulfilled');
});

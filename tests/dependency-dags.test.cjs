'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer.js'),F=require('../semantic_studio/local-pipelines.js'),P=require('../semantic_studio/publication.js');
const read=name=>JSON.parse(fs.readFileSync('verification/dependency-dags/current/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles'},draw=(ir,s={})=>R.render(ir,{...state,...s});
const dags=g=>(g.publication.local_pipelines?.rows||[]).filter(r=>r.dependency_dag);
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
function compile(ir,mutate=()=>{}){const plan=P.plan(ir);mutate(plan);return F.compile({ir,plan,bindings:new Map(),metadata:new Set(),configurationUses:new Set()});}

test('an unfamiliar internal fanout lists every operation once and refers to the actual shared producer',()=>{
 const ir=read('ReusedCircuit'),bytes=JSON.stringify(ir),r=draw(ir),p=dags(r.graph)[0];assert.ok(p);assert.equal(p.status,'summary');
 assert.equal(p.operations.length,4);assert.equal(p.dependency_dag.nodes.length,4);
 const by=new Map(p.dependency_dag.nodes.map(n=>[n.reference,n])),used=[];
 for(const step of by.values())for(const input of step.inputs){const binding=p.bindings.find(b=>b.edge===input.edge);
  assert.equal(binding.producer,by.get(input.reference).node);assert.equal(binding.target,step.node);
  assert.deepEqual([binding.source_port,binding.target_port],[input.source_port,input.target_port]);used.push(input.reference);}
 assert.ok([...new Set(used)].some(ref=>used.filter(x=>x===ref).length===2));
 assert.equal(new Set(p.dependency_dag.nodes.map(n=>n.node)).size,4);assert.equal(p.dependency_tree,undefined);
 assert.match(r.svg,/Dependency DAG/);assert.match(r.svg,/arg:0=#1/);assert.match(r.svg,/Reference numbering does not assert execution order/);
 assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(JSON.stringify(ir),bytes);accounted(ir,r.graph);
 assert.ok(p.operations.every(o=>r.graph.expression_coverage.find(c=>c.goal==='goal:node:'+o.node)?.status!=='fulfilled'));
});

test('using one result twice keeps two operand bindings without duplicating the computation',()=>{
 const r=draw(read('SquaredCircuit')),p=dags(r.graph)[0],step=p.dependency_dag.nodes.at(-1);
 assert.equal(p.operations.length,2);assert.equal(step.inputs.length,2);
 assert.equal(step.inputs[0].reference,step.inputs[1].reference);
 assert.notEqual(step.inputs[0].target_port,step.inputs[1].target_port);assert.notEqual(step.inputs[0].edge,step.inputs[1].edge);
 for(const input of step.inputs)assert.ok(r.graph.idx.nodes.get(p.node).paper.captions.join(' ').includes(input.target_port+'='+input.reference));
});

test('different result slots keep different references through a nested source boundary',()=>{
 const ir=read('TupleCircuit'),r=draw(ir),p=dags(r.graph)[0];assert.ok(p);assert.equal(p.source_boundaries.length,2);
 const uses=p.dependency_dag.nodes.flatMap(n=>n.inputs),slots=new Set(uses.filter(i=>i.source_port!=='out').map(i=>i.reference+'['+i.source_port+']'));
 assert.ok(slots.size>=2);assert.ok(uses.some((a,i)=>uses.some((b,j)=>i!==j&&a.reference===b.reference&&a.source_port!==b.source_port)));
 for(const text of slots)assert.ok(r.svg.includes(text));accounted(ir,r.graph);
});

test('manual opening and local relationship requests recover exact original operations and routes',()=>{
 for(const name of ['ReusedCircuit','SquaredCircuit','TupleCircuit']){
  const ir=read(name),folded=draw(ir),p=dags(folded.graph)[0];
  const opened=draw(ir,{paperAuto:false,open:[...folded.graph.publication.open,...p.source_boundaries.map(b=>b.node)]});
  const detail=dags(opened.graph).find(r=>r.node===p.node);assert.equal(detail.status,'expanded');assert.equal(detail.detailed_operations_exposed,true);
  assert.deepEqual(detail.bindings,p.bindings);assert.deepEqual(detail.source_boundaries,p.source_boundaries);
  for(const binding of p.bindings.filter(b=>p.operations.some(o=>o.node===b.producer))){
   assert.ok(opened.prepared.routes.some(e=>(e.originals||[e.id]).includes(binding.edge)&&e.route.ok));}
  assert.ok(opened.graph.nodes.length>folded.graph.nodes.length);accounted(ir,opened.graph);
  assert.equal(draw(opened.document.ir,opened.document.state).svg,opened.svg);assert.equal(draw(folded.document.ir,folded.document.state).svg,folded.svg);
  const relation=folded.graph.architecture.relation_graph.relations.find(r=>['source-uses','arithmetic'].includes(r.type)&&p.operations.some(o=>o.node===r.node));
  assert.ok(relation);const requested=draw(ir,{paperExpressionDetails:[relation.id]});
  assert.ok(requested.graph.expression_coverage.some(c=>c.goal==='goal:'+relation.id&&c.status==='fulfilled'));
 }
});

test('unknown and conditional regions stay explicit while a neighboring proved DAG still summarizes',()=>{
 const ir=read('UnknownCircuit'),r=draw(ir);assert.equal(dags(r.graph).length,1);assert.ok(r.graph.nodes.some(n=>n.kind==='opaque'));
 const conditional=draw(read('ConditionalCircuit'));assert.equal(dags(conditional.graph).length,0);assert.ok(conditional.graph.nodes.some(n=>n.kind==='control'||n.condition||n.semantic_type==='conditional-collection'));
 for(const attrs of [{kind:'opaque'},{kind:'control'},{mutable:true},{condition:{test:'unknown'}},{identity_display:{reference:'same'}},
  {runtime_evidence:[{}]},{evidence_status:'runtime-only'},{observed_calls:{}},{semantic_contracts:['untrusted']},{iteration:{}}]){
  assert.equal(compile(read('ReusedCircuit'),p=>Object.assign(p.nodes.find(n=>n.function_target==='torch.sin'),attrs)).size,0,JSON.stringify(attrs));
 }
});

test('cycles, competing operands, intermediate escapes and resource writes cannot be hidden in a DAG',()=>{
 const original=read('ReusedCircuit'),p=dags(draw(original).graph)[0],source=p.dependency_dag.nodes[0].node;
 for(const mutate of [
  ir=>ir.edges.push({id:'cycle',source:p.result_operation,target:source,source_port:'out',target_port:'feedback',kind:'data'}),
  ir=>{const es=ir.edges.filter(e=>e.target===p.result_operation);es[1].target_port=es[0].target_port;},
  ir=>ir.edges.push({id:'escape',source,target:ir.nodes.find(n=>n.function_target==='torch.relu').id,source_port:'out',target_port:'context',kind:'data'}),
  ir=>ir.edges.push({id:'write',source,target:p.result_operation,kind:'state-write',source_port:'out',target_port:'state'}),
  ir=>ir.nodes.push({id:'unrelated',parent:p.node,kind:'compute',operator:'cos'}),
  ir=>{ir.edges.find(e=>e.target===p.result_operation).iteration={kind:'loop-carried'};}
 ]){const ir=structuredClone(original);mutate(ir);assert.equal(dags(draw(ir).graph).length,0);}
 // A final tuple pack must keep its independently selectable results explicit.
 for(const file of ['verification/dependency-trees/current/EscapingTree.json','verification/composed-paths/current/EscapingComposition.json']){
  const r=draw(JSON.parse(fs.readFileSync(file)));assert.equal(dags(r.graph).length,0);assert.ok(r.graph.nodes.some(n=>n.operator==='structure'));
 }
});

test('reference numbering is topology based and ignores model names or stale supplied summaries',()=>{
 const ir=read('ReusedCircuit'),original=dags(draw(ir).graph)[0];
 for(const n of ir.nodes){n.label='Transformer';n.source_class='NeverSeen';}
 ir.nodes.reverse();ir.edges.reverse();const renamed=dags(draw(ir).graph)[0];
 assert.deepEqual(renamed.dependency_dag.nodes.map(n=>[n.node,n.reference]),original.dependency_dag.nodes.map(n=>[n.node,n.reference]));
 assert.equal(renamed.result_operation,original.result_operation);
 const bad=read('UnknownCircuit');for(const n of bad.nodes)n.dependency_dag=original.dependency_dag;
 assert.equal(dags(draw(bad).graph).length,1);
});

test('disabled summaries, print and semantic evidence views retain their independent detail contracts',()=>{
 for(const extra of [{paperPipelineSummaries:false},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  const r=draw(read('ReusedCircuit'),extra);assert.equal(r.graph.publication.local_pipelines,undefined);}
});

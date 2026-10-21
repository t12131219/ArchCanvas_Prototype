'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Goals=require('../semantic_studio/expression-goals.js'),D=require('../semantic_studio/diagram-set.js'),R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/adaptive-frontier.js');
function sample(){
 const ir={nodes:[{id:'values',kind:'compute'},{id:'slot',kind:'value-alias',slot:'1'},
  {id:'factor',kind:'interface',role:'input'},{id:'use',kind:'compute'}],edges:[
  {id:'upstream',source:'values',source_port:'1',target:'slot',target_port:'in',kind:'data',evidence:'source-dependency'},
  {id:'operand',source:'slot',source_port:'out',target:'use',target_port:'arg:0',kind:'data',evidence:'source-dependency'},
  {id:'factor-use',source:'factor',source_port:'out',target:'use',target_port:'arg:1',kind:'data',evidence:'source-dependency'}]};
 const routes=[{...ir.edges[1],source:'values',canonical_source:'slot',resolved_source:'values',source_port:'1',canonical_target:'use',originals:['upstream','operand'],route:{ok:true}},
  {...ir.edges[2],canonical_source:'factor',canonical_target:'use',route:{ok:true}}];
 const goal={id:'operation',kind:'computation',focus_node:'use',core:['use'],edges:[],priority:1};
 const graph={positions:new Map(ir.nodes.map(n=>[n.id,{}])),nodes:ir.nodes,expression_goals:{goals:[goal]},constraint_receipts:[],publication:{},summary_coverage:[]};
 return {ir,routes,goal,graph};
}
const evaluate=x=>Goals.evaluate({goals:[x.goal]},x.graph,{routes:x.routes},x.ir)[0];
test('an operation requires all actual incoming operands, even when the goal has no explicit edge list',()=>{
 const x=sample();assert.equal(evaluate(x).status,'fulfilled');x.routes.pop();
 const r=evaluate(x);assert.equal(r.status,'unfulfilled');assert.deepEqual(r.missing_exact_bindings,['factor-use']);
});
test('matching path IDs cannot conceal changed operand, producer, tuple slot, condition, kind or evidence',()=>{
 for(const change of [{target_port:'arg:7'},{source_port:'0'},{canonical_source:'factor'},{canonical_target:'slot'},
  {resolved_source:'factor'},{condition:{branch:'invented',outcome:true}},{kind:'control'},{evidence:'observed-run'}]){
  const x=sample();Object.assign(x.routes[0],change);assert.equal(evaluate(x).status,'unfulfilled',JSON.stringify(change));
 }
});
test('a conditional alias chain cannot be credited through a later unconditional consumer path',()=>{
 const x=sample();x.ir.edges[0].condition={branch:'choose',outcome:true};x.goal={...x.goal,kind:'source-uses',edges:['upstream']};
 assert.equal(evaluate(x).status,'unfulfilled');assert.deepEqual(evaluate(x).missing_exact_bindings,['upstream']);
});
test('correct conditioned operands remain expressed and their exact outcome must match',()=>{
 const x=sample();x.ir.edges[2].condition={branch:'choice',outcome:false};x.routes[1].condition={...x.ir.edges[2].condition};
 assert.equal(evaluate(x).status,'fulfilled');x.routes[1].condition.outcome=true;
 assert.equal(evaluate(x).status,'unfulfilled');
});
test('every bundle member is checked independently against its canonical operand',()=>{
 const x=sample();x.routes=[{id:'bundle',route:{ok:true},bundle_members:x.routes.map(r=>({...r}))}];
 assert.equal(evaluate(x).status,'fulfilled');x.routes[0].bundle_members[1].target_port='arg:0';
 assert.deepEqual(evaluate(x).missing_exact_bindings,['factor-use']);
});
test('alias cycles terminate, failures remain unfulfilled and proof construction never changes facts',()=>{
 const x=sample();x.ir.edges.push({id:'cycle',source:'slot',target:'slot',source_port:'out',target_port:'in',kind:'alias'});
 const before=JSON.stringify({ir:x.ir,routes:x.routes});assert.equal(evaluate(x).status,'unfulfilled');
 assert.equal(JSON.stringify({ir:x.ir,routes:x.routes}),before);
 const y=sample();y.routes[0].route.ok=false;assert.equal(evaluate(y).status,'unfulfilled');
});
test('adaptive gain cannot retain a stale expression claim after a routed operand changes',()=>{
 const x=sample(),result={graph:x.graph,prepared:{routes:x.routes}};
 x.graph.expression_coverage=[{goal:x.goal.id,status:'fulfilled'}];assert.ok(A.evidence(x.ir,result).goals.has(x.goal.id));
 x.routes.pop();assert.ok(!A.evidence(x.ir,result).goals.has(x.goal.id));
});
test('raw and diagram-set expression agree on routed unfamiliar, interrupted, unknown and shared examples',()=>{
 for(const [name,folder] of [['MixedCircuit','local-relations/current'],['InterruptedMixer','local-relations/current'],
  ['UnknownFusion','local-relations/current'],['SameSource','semantic-design/current/after']]){
  const ir=JSON.parse(fs.readFileSync('verification/'+folder+'/'+name+'.json')),before=JSON.stringify(ir),r=R.render(ir,{paperMedium:'canvas',paperGranularity:'roles'});
  assert.ok(D.acceptable(r));const local=Goals.evaluate(r.graph.expression_goals,r.graph,r.prepared,ir);
  const planned=D.coverage(ir,{goals:r.graph.expression_goals.goals},[{id:'main',result:r}]);
  assert.deepEqual(planned.filter(g=>g.status==='fulfilled').map(g=>g.goal),local.filter(g=>g.status==='fulfilled').map(g=>g.goal));
  assert.equal(JSON.stringify(ir),before);
 }
});
test('an explicit atomic detail restores a shape/configuration operand previously attached as metadata',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/semantic-design/current/after/SameSource.json')),before=JSON.stringify(ir),
  state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true},main=R.render(ir,state),plan=D.plan(ir,main,state);
 const hidden=main.graph.expression_coverage.find(r=>r.kind==='computation'&&r.status==='unfulfilled'&&
  !r.missing_nodes.length&&r.missing_exact_bindings.length);
 assert.ok(hidden);const goal=main.graph.expression_goals.goals.find(g=>g.id===hidden.goal);
 const request=plan.candidates.find(r=>r.kind==='local-operation'&&r.goals.includes(goal.id));assert.ok(request);
 const detail=R.render(ir,request.state);assert.ok(D.acceptable(detail));
 assert.equal(D.coverage(ir,{goals:[goal]},[{id:'detail',result:detail}])[0].status,'fulfilled');
 assert.equal(detail.graph.expression_coverage.find(r=>r.goal===goal.id).status,'fulfilled');
 for(const id of hidden.missing_exact_bindings){
  const edge=ir.edges.find(e=>e.id===id),cut=detail.graph.publication.boundary.find(c=>c.id===id);
  assert.ok(cut&&!cut.presentation);assert.equal(cut.source,edge.source);assert.equal(cut.target_port,edge.target_port);
  assert.ok(detail.prepared.routes.some(p=>p.id===id&&p.route.ok));
 }
 assert.equal(R.render(ir,request.state).svg,detail.svg);assert.equal(JSON.stringify(ir),before);
});

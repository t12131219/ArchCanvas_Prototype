'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const A=require('../semantic_studio/architecture.js'),R=require('../semantic_studio/publication-renderer.js'),G=require('../semantic_studio/expression-goals.js');
const base=path.resolve(__dirname,'../verification/local-relations/current/identity-bindings');
const load=name=>JSON.parse(fs.readFileSync(path.join(base,name+'.json')));
const relations=ir=>A.build(ir).relation_graph.relations;
function accounting(ir,g){for(const [field,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
  const ids=Object.values(g[field]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());
}}

test('source aliases prove a common object while all call sites and operand bindings remain distinct',()=>{
  for(const name of ['AliasCalls','NestedAliasCalls','HelperCalls']){
    const ir=load(name),before=JSON.stringify(ir),rs=relations(ir).filter(r=>r.type==='same-object-calls');assert.ok(rs.length,name);
    for(const r of rs){assert.equal(new Set(r.members).size,r.members.length);assert.ok(r.not_asserted.includes('parameter stability'));
      assert.ok(r.not_asserted.includes('output equality'));assert.ok(r.bindings.length);assert.deepEqual(r.properties.required_nodes,r.members);}
    const group=rs.find(r=>ir.nodes.find(n=>n.id===r.node).kind==='compute');
    const out=R.render(ir,{paperRelation:group.id,paperGranularity:'detailed'});accounting(ir,out.graph);
    assert.equal(out.graph.expression_coverage.find(c=>c.goal==='goal:'+group.id).status,'fulfilled');
    assert.ok(group.members.every(id=>out.graph.positions.has(id)));assert.match(out.svg,/data-identity=/);assert.match(out.svg,/source call/);
    assert.equal(JSON.stringify(ir),before);assert.equal(R.render(out.document.ir,out.document.state).svg,out.svg);
  }
});

test('equal labels or paths alone never prove identity, nor do unknown effects preserve earlier bindings',()=>{
  const ir=load('AliasCalls');for(const n of ir.nodes){delete n.module_binding;n.module_path='same';n.label='same';}
  assert.ok(!relations(ir).some(r=>r.type==='same-object-calls'));
  for(const name of ['ReboundAlias','EscapedOwner','TiedParameters','ReallocatedBinding','DynamicAccess','ConstructorMethodEffect'])assert.ok(!relations(load(name)).some(r=>r.type==='same-object-calls'),name);
  const interrupted=load('InterruptedCalls'),r=relations(interrupted).find(r=>r.type==='same-object-calls');assert.equal(r.members.length,2);
  const invalid=interrupted.nodes.find(n=>n.module_binding?.status==='unresolved');invalid.module_binding.status='proved';invalid.module_identity=invalid.module_binding.reference;
  assert.ok(!relations(interrupted).find(r=>r.type==='same-object-calls').members.includes(invalid.id));
});

test('cross-branch identity details retain mutually exclusive conditions and do not assert call count',()=>{
  const ir=load('ConditionalCalls'),r=relations(ir).find(r=>r.type==='same-object-calls');
  assert.deepEqual(r.properties.invocations.map(i=>i.condition_scope[0].outcome).sort(),['false','true']);
  const out=R.render(ir,{paperRelation:r.id,paperGranularity:'detailed'});accounting(ir,out.graph);
  for(const id of r.members){const node=out.graph.nodes.find(n=>n.id===id),parent=out.graph.nodes.find(n=>n.id===node.parent);assert.ok(parent.condition?.branch);}
  assert.ok(r.not_asserted.includes('fixed runtime call count'));
  const expression=out.graph.expression_coverage.find(c=>c.goal==='goal:'+r.id);
  // Identity captions are present, but the two result aliases are projected
  // through conditional joins. They do not directly expose those alias cuts.
  assert.deepEqual(expression.missing_identity,[]);
  assert.equal(expression.status,'unfulfilled');
  assert.equal(expression.missing_exact_bindings.length,2);
  for(const id of expression.missing_exact_bindings){
    assert.equal(ir.edges.find(e=>e.id===id).kind,'alias');
    assert.ok(out.prepared.routes.some(e=>(e.originals||[]).includes(id)&&e.condition));
  }
});

test('hidden calls or missing printed identity cannot satisfy the identity expression goal',()=>{
  const ir=load('AliasCalls'),r=relations(ir).find(r=>r.type==='same-object-calls'),folded=R.render(ir,{paperAuto:false,open:[]});
  assert.equal(folded.graph.expression_coverage.find(c=>c.goal==='goal:'+r.id).status,'unfulfilled');
  const out=R.render(ir,{paperRelation:r.id}),node=out.graph.nodes.find(n=>n.id===r.node);node.paper.captions=[];
  assert.equal(G.evaluate(out.graph.expression_goals,out.graph,out.prepared,ir).find(c=>c.goal==='goal:'+r.id).status,'unfulfilled');
});

test('real CPU parameter aliases have a run-local receipt and a visible enumeration detail',()=>{
  const ir=load('TiedParameters-runtime');assert.equal(ir.runtime.status,'passed');assert.equal(ir.runtime.runs.length,2);
  const rs=relations(ir).filter(r=>r.type==='observed-parameter-aliases');assert.equal(rs.length,2);
  for(const r of rs){assert.deepEqual(r.properties.aliases,['first.weight','second.weight']);assert.ok(r.not_asserted.includes('identity after mutation'));
    const out=R.render(ir,{mode:'runtime',paperRelation:r.id,paperGranularity:'detailed'});accounting(ir,out.graph);
    assert.equal(out.graph.expression_coverage.find(c=>c.goal==='goal:'+r.id).status,'fulfilled');
    const printed=out.svg.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    assert.match(printed,/start aliases/);assert.match(printed,/first.weight/);assert.match(printed,/second.weight/);
    assert.ok(out.graph.nodes.every(n=>!n.id.startsWith('runtime:')||n.id.startsWith('runtime:'+r.properties.run+':')||n.id.startsWith('runtime:paper:')));
  }
  const tampered=structuredClone(ir);tampered.nodes.find(n=>n.aliases?.length>1).aliases.push('invented.weight');
  assert.equal(relations(tampered).filter(r=>r.type==='observed-parameter-aliases').length,1);
});

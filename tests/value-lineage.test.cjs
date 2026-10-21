'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const A=require('../semantic_studio/architecture.js'),E=require('../semantic_studio/semantic-engine.js');
const dir=path.resolve(__dirname,'../verification/value-lineage/current');
const load=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));
const residuals=ir=>A.build(ir).findings.filter(f=>f.rule.startsWith('residual')&&!f.certificate);

test('configuration, exemplar and allocation dependencies never prove a residual',()=>{
  for(const name of ['ConfigurationOnly','ExemplarOnly','AllocationOnly','ShapeOnly','ConditionalValues'])
    assert.deepEqual(residuals(load(name)),[],name);
});

test('configuration-dependent algebra keeps an honest reversible expression instead of a residual',()=>{
  for(const name of ['ConfigurationOnly','ExemplarOnly','AllocationOnly','ShapeOnly']){
    const ir=load(name),p=A.build(ir),expressions=p.findings.filter(f=>f.rule==='operand-expression');
    assert.ok(expressions.length,name);assert.ok(expressions.every(f=>f.label==='Add expression'));
    assert.ok(!p.design_constraints.some(c=>c.kind==='bypass'));
    for(const f of expressions){
      assert.equal(f.presentation,'group');assert.equal(f.roles.operator,'add');
      assert.deepEqual(f.roles.operands.map(p=>p.edge),ir.edges.filter(e=>e.target===f.roles.output&&['data','alias','interface-binding'].includes(e.kind)).map(e=>e.id));
      const group=p.nodes.find(n=>n.id===f.id),members=new Set(group.canonical_members);
      assert.deepEqual(group.boundary_ports.map(e=>e.id),ir.edges.filter(e=>members.has(e.source)!==members.has(e.target)).map(e=>e.id));
    }
  }
});

test('the structural form applies to binary operators without asserting residuals',()=>{
  for(const operator of ['sub','mult','div','matmul']){
    const ir=load('ExemplarOnly');ir.nodes.find(n=>n.operator==='add').operator=operator;
    const p=A.build(ir);assert.equal(residuals(ir).length,0);
    const f=p.findings.find(f=>f.rule==='operand-expression');assert.ok(f);assert.equal(f.roles.operator,operator);
  }
  for(const change of [n=>{n.mutable=true;},n=>{n.kind='opaque';},n=>{n.condition={branch:'unresolved',outcome:'true'};}]){
    const ir=load('ExemplarOnly');change(ir.nodes.find(n=>n.operator==='device-cast'));
    assert.ok(!A.build(ir).findings.some(f=>f.rule==='operand-expression'));
  }
});

test('true transformed values, helpers and index values retain their residuals',()=>{
  for(const name of ['TrueValue','FunctionalValue','MixedValues','IndexValues'])assert.equal(residuals(load(name)).length,1,name);
});

test('declining a claim preserves exact source facts, cuts, ownership and full expansion',()=>{
  for(const name of ['ConfigurationOnly','ExemplarOnly','AllocationOnly','ShapeOnly','MixedValues']){
    const ir=load(name),original=JSON.stringify(ir),p=A.build(ir);
    assert.deepEqual(p.edges,ir.edges);
    for(const n of ir.nodes){const v=p.nodes.find(v=>v.id===n.id);assert.ok(v);assert.deepEqual(v.source,n.source);assert.equal(v.source_parent,n.source_parent??n.parent);}
    const state={view:'architecture',mode:'source',details:true};state.open=[...E.viewIndex(ir,state).children.keys()].filter(Boolean);
    const g=E.project(ir,state);
    for(const [kind,key]of [['nodes','node_accounting'],['edges','edge_accounting']]){
      const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),ir[kind].map(n=>n.id).sort());
    }
    assert.equal(JSON.stringify(ir),original);
  }
});

test('renaming labels and module paths does not change value lineage',()=>{
  for(const name of ['ConfigurationOnly','TrueValue','MixedValues']){
    const ir=load(name),expected=residuals(ir).map(f=>[f.rule,f.members]);
    for(const n of ir.nodes){n.label='Unfamiliar';n.module_path='other.names';n.source_class='Other';}
    assert.deepEqual(residuals(ir).map(f=>[f.rule,f.members]),expected);
  }
});

test('cast receiver and exemplar stay distinct with observed numeric operand ports',()=>{
  const ir=load('ExemplarOnly'),cast=ir.nodes.find(n=>n.operator==='device-cast');
  // A known unary runtime transform: first tensor carries values, second is configuration.
  cast.operator='aten._to_copy.default';
  for(const e of ir.edges.filter(e=>e.target===cast.id))e.target_port=e.target_port==='receiver'?'0':'1';
  assert.equal(residuals(ir).length,0);
  const es=ir.edges.filter(e=>e.target===cast.id);for(const e of es)e.target_port=e.target_port==='0'?'1':'0';
  assert.equal(residuals(ir).length,1);
});

test('unknown and mutable value branches still stop residual discovery',()=>{
  for(const mutate of [n=>{n.kind='opaque';},n=>{n.mutable=true;}]){
    const ir=load('TrueValue');mutate(ir.nodes.find(n=>n.operator==='activation'));assert.equal(residuals(ir).length,0);
  }
});

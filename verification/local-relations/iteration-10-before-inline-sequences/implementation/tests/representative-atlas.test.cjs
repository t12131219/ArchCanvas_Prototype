'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('../tools/representative_atlas.cjs'),P=require('../semantic_studio/publication.js'),G=require('../semantic_studio/expression-goals.js'),R=require('../semantic_studio/publication-renderer.js');
const {exportAtlas}=require('../tools/export_publication.cjs');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/local-relations/current/structural-repeats',name+'.json')));
const goals=ir=>G.build(ir,P.plan(ir)).goals;
function atlas(ir,options={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'representative-atlas-'));return{dir,manifest:exportAtlas(ir,dir,options)};}
test('one common structure panel covers different source wrappers while every concrete boundary is direct',()=>{
  const ir=read('EquivalentSteps'),before=JSON.stringify(ir),{manifest:m,dir}=atlas(ir);
  assert.equal(m.complete,true);assert.equal(m.quality_pass,true);assert.equal(m.panels.length,3);
  const shared=m.expression_goals.filter(g=>g.coverage_methods.includes('structural-representative'));
  assert.equal(shared.length,6);
  for(const goal of shared)for(const file of goal.panels){
    const p=m.panels.find(p=>p.svg===file),doc=JSON.parse(fs.readFileSync(path.join(dir,p.document)));
    const c=doc.atlas_expression_coverage.find(c=>c.goal===goal.id&&c.status==='fulfilled');
    if(c.method==='structural-representative'){
      assert.ok(Object.values(c.node_map).every(id=>doc.layout.nodes.some(n=>n.id===id)));
      assert.ok(doc.expression_coverage.some(d=>d.goal===c.representative_goal&&d.status==='fulfilled'));
      assert.match(fs.readFileSync(path.join(dir,file),'utf8'),/source positions/);
    }
  }
  const boundaries=m.expression_goals.filter(g=>g.kind==='instance-boundary');assert.equal(boundaries.length,6);
  assert.ok(boundaries.every(g=>g.coverage_methods.join()==='direct'));
  assert.equal(JSON.stringify(ir),before);
});
test('heterogeneous sequence automatically plans each structural group and preserves the literal exception',()=>{
  const ir=read('MixedSteps'),{manifest:m,dir}=atlas(ir);
  assert.equal(m.complete,true);assert.equal(m.structural_representatives.groups.length,2);
  const groups=m.panels.filter(p=>p.representative?.structural_group);
  assert.deepEqual(groups.map(p=>p.representative.structural_group.indices),[[0,1,3],[2]]);
  const exception=groups[1];assert.match(fs.readFileSync(path.join(dir,exception.svg),'utf8'),/right operand: 2/);
  assert.ok(m.expression_goals.filter(g=>g.coverage_methods.includes('structural-representative')).every(g=>!exception.expression_coverage.some(c=>c.goal===g.id&&c.method==='structural-representative')));
});
test('unknown elements and object partitions never share a structural representative',()=>{
  for(const name of ['UnknownSteps','MutableSteps','AliasPartitionSteps']){
    const ir=read(name),p=M.plan(ir,goals(ir));assert.equal(p.mappings.size,0);assert.ok(p.boundaries.length>0);
  }
});
test('a stale operation, operand or certificate mapping forces original-instance planning',()=>{
  for(const mutate of [
    ir=>{ir.nodes.find(n=>n.operator==='add').syntax.fields.right={literal_type:'int',literal:'2'};},
    ir=>{const e=ir.edges.find(e=>e.target_port==='arg:0'&&ir.nodes.find(n=>n.id===e.target)?.operator==='linear');e.source_port='other';},
    ir=>{const s=ir.nodes.find(n=>n.repeat_contract);s.repeat_contract.structure.instances[0].node_mapping={};},
    ir=>{const s=ir.nodes.find(n=>n.repeat_contract);s.repeat_contract.structure.groups[0].indices=[0];}
  ]){
    const ir=read('EquivalentSteps');mutate(ir);const p=M.plan(ir,goals(ir));
    assert.equal(p.mappings.size,0);assert.equal(p.pages.length,0);assert.ok(p.diagnostics.length);
  }
});
test('an escaping result cannot be silently covered using an old certificate',()=>{
  const ir=read('EquivalentSteps'),op=ir.nodes.find(n=>n.operator==='activation'),output=ir.nodes.find(n=>n.kind==='interface'&&n.role==='output'&&n.parent===ir.entry.id);
  const outside=ir.nodes.find(n=>n.kind==='interface'&&n.role==='output'&&!ir.edges.some(e=>e.source===n.id));
  ir.edges.push({id:'escaped-result',kind:'data',source:op.id,source_port:'out',target:(output||outside).id,target_port:'escape',evidence:'source-dependency'});
  const p=M.plan(ir,goals(ir));assert.equal(p.mappings.size,0);assert.ok(p.diagnostics.length);
});
test('representative coverage requires the actual group caption and fulfilled internal relationship paths',()=>{
  const ir=read('EquivalentSteps'),p=M.plan(ir,goals(ir)),s=ir.nodes.find(n=>n.repeat_contract);
  const out=R.render(ir,{paperFocus:s.id,paperRepresentative:true,paperRepresentativeGroup:0,paperGranularity:'detailed'});
  assert.equal(M.coverage(p,out).length,6);
  out.graph.expression_coverage=[];assert.equal(M.coverage(p,out).length,0);
  const again=R.render(ir,{paperFocus:s.id,paperRepresentative:true,paperRepresentativeGroup:0,paperGranularity:'detailed'});
  again.graph.nodes.find(n=>n.id===again.graph.publication.focus).paper.captions=[];
  assert.equal(M.coverage(p,again).length,0);
});
test('panel limits leave explicit unfulfilled goals rather than claiming representative intent as coverage',()=>{
  const {manifest:m}=atlas(read('EquivalentSteps'),{maxPanels:1});
  assert.equal(m.complete,false);assert.ok(m.omitted_panels.length);assert.ok(m.unfulfilled_goals.length);
  assert.ok(!m.expression_goals.some(g=>g.coverage_methods.includes('structural-representative')));
});
test('source identity claims cannot be transferred through a structural correspondence',()=>{
  const ir=read('EquivalentSteps'),gs=goals(ir),p=M.plan(ir,gs.map(g=>({...g,identity:{reference:'example'}})));
  assert.equal(p.mappings.size,0);
});

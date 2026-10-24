'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const A=require('../semantic_studio/authoring-model'),E=require('../semantic_studio/semantic-engine'),P=require('../semantic_studio/publication'),C=require('../semantic_studio/composition-layout');
const read=p=>JSON.parse(fs.readFileSync(p)),presets=read('data/semantic/authoring-presets.json').modules,find=name=>presets.find(p=>p.title===name);
test('presets are source-backed raw IR, not visual stand-ins; atomic descendants and exact operands survive',()=>{
 for(const module of presets){assert.ok(module.source.includes('def forward'));assert.equal(module.analysis.executed,false);E.validate(module.ir);const d=A.empty();const before=JSON.stringify(module);A.add(d,module);A.validate(d);assert.equal(d.nodes.length,module.ir.nodes.length);assert.equal(d.edges.length,module.ir.edges.length);for(const n of d.nodes)assert.ok(n.source.length);assert.equal(JSON.stringify(module),before);}
 const d=A.empty();const {roots}=A.add(d,find('Add')),p=A.ports(d,roots[0]);assert.deepEqual(p.inputs.map(p=>p.label),['x','skip']);const add=d.nodes.find(n=>n.operator==='add');assert.deepEqual(d.edges.filter(e=>e.target===add.id).map(e=>e.target_port),['0','2']);
});
test('all 43 catalog models can be assembled from an empty document one original component and binding at a time',()=>{
 const catalog=read('data/semantic/catalog.json');assert.equal(catalog.models.length,43);
 for(const model of catalog.models){const ir=read('data/semantic/'+model.ir),before=JSON.stringify(ir),recipe=A.recipe(ir),d=A.empty(ir.title);d.recipe={parents:recipe.parents,baseline:ir};assert.equal(d.nodes.length,0);
  // Reverse order also exercises deferred source parent restoration.
  for(const module of [...recipe.parts].reverse()){A.add(d,module,{keepIdentity:true});A.validate(d);}
  for(const edge of recipe.connections)A.restoreConnection(d,edge);A.validate(d);const result=A.sourceIR(d);assert.deepEqual(result,ir,model.title);assert.equal(JSON.stringify(ir),before);
  const full=P.fullyExpanded(result,{view:'publication',mode:'merged'},E),g=E.project(result,full);assert.equal(g.nodes.length,ir.nodes.length,model.title);assert.equal(g.edges.length,ir.edges.length,model.title);
 }
});
test('manual exact port wiring, duplicate drivers, replacing drivers, deletion and containment constraints',()=>{
 const d=A.empty(),linear=A.add(d,find('Linear')).roots[0],add=A.add(d,find('Add')).roots[0];const lp=A.ports(d,linear),ap=A.ports(d,add);
 const e=A.connect(d,lp.outputs[0],ap.inputs[1]);assert.equal(e.target,ap.inputs[1].node);assert.equal(e.target_port,'in');assert.throws(()=>A.connect(d,lp.outputs[0],ap.inputs[1]),/已有连接/);
 A.connect(d,lp.outputs[0],ap.inputs[1],{replace:true});assert.equal(d.edges.filter(e=>e.target===ap.inputs[1].node).length,1);
 const group=A.group(d,[linear,add],'Residual from atoms');A.validate(d);assert.equal(d.nodes.find(n=>n.id===linear).parent,group);assert.ok(A.ports(d,group).inputs.length);
 const snapshot=A.copy(d);A.erase(d,[group]);assert.equal(d.nodes.length,0);assert.equal(d.edges.length,0);A.validate(snapshot);assert.throws(()=>A.group(snapshot,[group,linear],'bad'),/同一级/);
});
test('source module replacement preserves external named ports and refuses incompatible source transactionally',()=>{
 const d=A.empty(),one=A.add(d,find('Linear')).roots[0],two=A.add(d,find('Add')).roots[0];A.connect(d,A.ports(d,one).outputs[0],A.ports(d,two).inputs[1]);
 const root=A.replaceModule(d,one,find('FeedForward'));A.validate(d);const e=d.edges.find(e=>e.evidence==='authored-dependency');assert.equal(e.source,A.ports(d,root).outputs[0].node);
 const before=JSON.stringify(d);assert.throws(()=>A.replaceModule(d,two,find('MatMul')),/移除了已连接输入/);assert.equal(JSON.stringify(d),before);
});
test('source edits invalidate old graph certificates, retain provenance, and the draft enters ordinary F0/F1 projection',()=>{
 const original=read('data/semantic/0216717d966327f4.json'),d=A.fromIR(original);assert.deepEqual(A.sourceIR(d),original);d.nodes[0].label='Edited';d.serial++;
 const changed=A.sourceIR(d);assert.equal(changed.semantic_contracts.length,0);assert.ok(changed.nodes.some(n=>n.source_provenance));assert.equal(changed.coverage.complete,false);E.validate(changed);
 const small=A.empty();const first=A.add(small,find('Linear')).roots[0],second=A.add(small,find('Add')).roots[0];A.connect(small,A.ports(small,first).outputs[0],A.ports(small,second).inputs[0]);
  const ir=A.sourceIR(small);for(const mode of ['overview','detail']){const s=C.frontier({mode:'source'},mode),g=E.project(ir,s);assert.ok(g.nodes.length>1);assert.ok(g.nodes.some(n=>n.label==='Linear'));assert.ok(g.nodes.some(n=>n.label==='Add'));}
 const another=A.copy(small);another.nodes.find(n=>n.operator==='linear').constructor.args[1]=96;assert.notEqual(A.sourceIR(another).ir_digest,ir.ir_digest);assert.equal(A.sourceIR(small).ir_digest,ir.ir_digest);
});
test('user atom compositions are reusable, independently remapped and persist all source text through JSON',()=>{
 const d=A.empty(),a=A.add(d,find('MatMul')).roots[0],b=A.add(d,find('Softmax')).roots[0];A.connect(d,A.ports(d,a).outputs[0],A.ports(d,b).inputs[0]);const id=A.group(d,[a,b],'ScoreBlock');
 const m=A.template(d,[id],'ScoreBlock');d.library.push(m);const saved=A.copy(d);A.validate(saved);const copy=A.add(saved,m).roots[0];assert.notEqual(copy,id);const ids=new Set(saved.nodes.map(n=>n.id));assert.equal(ids.size,saved.nodes.length);assert.ok(Object.values(saved.modules).some(m=>m.source?.includes('torch.matmul')));A.validate(saved);
});
test('atomic reconstruction preserves branch, state, unknown and runtime bindings with no missing raw unit',()=>{
 for(const model of read('data/semantic/catalog.json').models){const path='data/semantic/'+model.ir;
  const ir=read(path),r=A.recipe(ir,{atomic:true}),d=A.empty(ir.title);d.recipe={parents:r.parents,baseline:ir};assert.equal(r.parts.length,ir.nodes.length);
  for(const part of r.parts){assert.equal(part.ir.nodes.length,1);A.add(d,part,{keepIdentity:true});}
  for(const edge of r.connections)A.restoreConnection(d,edge);assert.deepEqual(A.sourceIR(d),ir);A.validate(d);
 }
});
test('editing an atom preserves historical source and interfaces can participate in a bottom-up assembly',()=>{
 assert.deepEqual(A.parameterValue('[8,32]',[8,16]),[8,32]);assert.deepEqual(A.parameterValue('{"eps":0.001}',{}),{eps:.001});assert.throws(()=>A.parameterValue('',8),/有限数字/);assert.throws(()=>A.parameterValue('[broken]',[]));
 const d=A.empty(),input=A.addInterface(d,'input','tokens'),linear=A.add(d,find('Linear')).roots[0],output=A.addInterface(d,'output','result');
 A.connect(d,{node:input,port:'out'},A.ports(d,linear).inputs[0]);A.connect(d,A.ports(d,linear).outputs[0],{node:output,port:'in'});
 const leaf=d.nodes.find(n=>n.operator==='linear'),old=A.copy(leaf.source);A.editNode(d,leaf.id,{constructor:{args:[16,32],kwargs:{bias:false}}});
 assert.deepEqual(leaf.source_provenance.original_source,old);assert.equal(leaf.source[0].file,'authoring://draft');assert.deepEqual(leaf.constructor.args,[16,32]);A.validate(d);
});

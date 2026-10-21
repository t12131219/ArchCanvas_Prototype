'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=require('../tools/load_publication_renderer.cjs'),E=load('./semantic_studio',{engine:true}),R=load('./semantic_studio'),F=require('../semantic_studio/role-path-stages.js');
const read=name=>JSON.parse(fs.readFileSync('verification/role-path-stages/current/'+name+'.json'));
const state={view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperRolePathStages:true};
const rows=g=>g.publication?.role_path_stages?.rows||[],project=ir=>E.project(ir,state);
test('a certified role and its exclusive source helper keep all members, bindings and operation configurations',()=>{
 const ir=read('PrismPath'),before=JSON.stringify(ir),g=project(ir),r=rows(g)[0];assert.equal(rows(g).length,1);
 assert.deepEqual(Array.from(r.operations,o=>o.label),['GELU','Dropout','Identity']);assert.equal(r.operations[1].configuration.args[0],0.2);
 const members=new Set(r.canonical_members);assert.deepEqual(JSON.parse(JSON.stringify(r.cuts)),ir.edges.filter(e=>members.has(e.source)!==members.has(e.target)));
 assert.ok(r.helper_path.canonical_members.every(id=>members.has(id)));assert.equal(g.idx.nodes.get(r.helper).parent,r.node);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]])assert.deepEqual(Object.values(g[key]).flat().sort(),items.map(n=>n.id).sort());
 assert.equal(JSON.stringify(ir),before);
});
test('renaming a model, helper and attributes retains the same composition',()=>{
 const a=rows(project(read('PrismPath')))[0],b=rows(project(read('OtherNames')))[0];
 assert.deepEqual(Array.from(a.operations,o=>o.label),Array.from(b.operations,o=>o.label));assert.equal(a.canonical_members.length,b.canonical_members.length);
});
test('opening the stage then the helper restores both levels and save/refold restores identical SVG',()=>{
 const ir=read('PrismPath'),base=R.render(ir,state),r=rows(base.graph)[0],s={...state,paperAuto:false,open:[...base.graph.publication.open,r.node]};
 const open=R.render(ir,s);assert.equal(rows(open.graph)[0].status,'expanded');assert.ok(rows(open.graph)[0].stage_children_exposed);assert.ok(!rows(open.graph)[0].detailed_operations_exposed);
 const deep=R.render(ir,{...s,open:[...s.open,r.helper]});assert.ok(rows(deep.graph)[0].detailed_operations_exposed);
 assert.ok(r.operations.every(o=>deep.graph.positions.has(o.node)));assert.equal(R.render(ir,JSON.parse(JSON.stringify(deep.document)).state).svg,deep.svg);
 assert.equal(R.render(ir,{...s,open:base.graph.publication.open}).svg,base.svg);
 for(const o of r.operations){const goal=base.graph.expression_coverage.find(g=>g.goal==='goal:node:'+o.node);assert.equal(goal.status,'unfulfilled');}
});
test('direct helper and role-detail requests override the folded composition',()=>{
 const ir=read('PrismPath'),base=project(ir),r=rows(base)[0],role=r.roles[0];
 for(const extra of [{paperRoleDetails:[role.owner]},{paperRolePaths:[{node:role.owner,certificate:role.certificate,role:role.role_keys}]},{paperAuto:false,open:[...base.publication.open,r.helper]}])assert.equal(rows(E.project(ir,{...state,...extra})).length,0);
});
test('shared intermediate uses and unknown helper behavior are not absorbed',()=>{
 assert.equal(rows(project(read('SharedPath'))).length,0);const g=project(read('UnknownPath'));assert.equal(rows(g).length,0);assert.ok(g.nodes.some(n=>n.kind==='opaque'));
});
test('conditional and recurrent mixed neighbors preserve their independent boundaries',()=>{
 for(const name of ['ConditionalPaths','MixedPaths']){const ir=read(name),g=project(ir),b=E.project(ir,{...state,paperRolePathStages:false});assert.equal(rows(g).length,1);
 const protectedIds=b.nodes.filter(n=>n.kind==='opaque'||n.kind==='control'||n.operator==='gru').map(n=>n.id);assert.ok(protectedIds.length);assert.ok(protectedIds.every(id=>g.positions.has(id)));}
});
test('tampered path evidence, role references, protected members and external helper inputs veto composition',()=>{
 const ir=read('PrismPath'),g=E.project(ir,{...state,paperRolePathStages:false}),anchor=g.architecture.nodes.find(n=>n.role_annotations?.some(r=>r.role==='activation'));
 const base={ir,plan:g.architecture,open:new Set(g.publication.open)};
 for(const kind of ['members','binding','role','effect','observed','identity','condition','selected']){
  const plan=JSON.parse(JSON.stringify(g.architecture)),changed=JSON.parse(JSON.stringify(ir)),a=plan.nodes.find(n=>n.id===anchor.id),helper=plan.nodes.find(n=>n.local_pipeline),p=helper.local_pipeline;
  if(kind==='members')p.canonical_members.pop();
  if(kind==='binding')p.bindings[0].source_port='wrong';
  if(kind==='role')a.role_annotations[0].role_keys=['invented'];
  const tail=plan.nodes.find(n=>n.id===p.operations[0].node);
  if(kind==='effect')tail.mutable=true;
  if(kind==='observed')tail.evidence_status='runtime-only';
  if(kind==='identity')tail.identity_display={kind:'same-object-calls'};
  if(kind==='condition')tail.condition={outcome:'true'};
  if(kind==='selected')changed.edges.find(e=>e.source===p.operations.at(-1).node).source_port='1';
  assert.equal(F.compile({...base,ir:changed,plan}).rows.length,0,kind);
 }
 const changed=JSON.parse(JSON.stringify(ir)),edge=changed.edges.find(e=>e.source===anchor.id);changed.edges.push({...edge,id:'extra-helper-input',source:ir.nodes.find(n=>n.kind==='interface'&&n.role==='input').id,target_port:'other'});
 assert.equal(F.compile({...base,ir:changed}).rows.length,0);
});
test('annotation without its attached certificate cannot authorize a stage',()=>{
 const ir=read('PrismPath'),g=E.project(ir,{...state,paperRolePathStages:false}),plan=JSON.parse(JSON.stringify(g.architecture));plan.semantic_contracts=[];
 assert.equal(F.compile({ir,plan,open:new Set(g.publication.open)}).rows.length,0);
});
test('canonical role effects and forged certificate membership cannot bypass presentation guards',()=>{
 const ir=read('PrismPath'),g=E.project(ir,{...state,paperRolePathStages:false}),r=rows(project(ir))[0];
 const changed=JSON.parse(JSON.stringify(ir));changed.nodes.find(n=>n.id===r.anchor).mutable=true;
 assert.equal(F.compile({ir:changed,plan:g.architecture,open:new Set(g.publication.open)}).rows.length,0);
 const plan=JSON.parse(JSON.stringify(g.architecture));plan.semantic_contracts[0].proof=['forged'];
 assert.equal(F.compile({ir,plan,open:new Set(g.publication.open)}).rows.length,0);
});
test('source, print and other granularities keep their existing contracts',()=>{
 for(const extra of [{view:'source'},{paperMedium:'print'},{paperGranularity:'semantic'}]){const ir=read('PrismPath'),a=E.project(ir,{...state,...extra}),b=E.project(ir,{...state,...extra,paperRolePathStages:false});assert.deepEqual(Array.from(a.positions.keys()),Array.from(b.positions.keys()));assert.equal(rows(a).length,0);}
});

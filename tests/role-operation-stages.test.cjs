'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=require('../tools/load_publication_renderer.cjs'),E=load('./semantic_studio',{engine:true}),R=load('./semantic_studio'),F=require('../semantic_studio/role-operation-stages.js');
const read=name=>JSON.parse(fs.readFileSync('verification/role-operation-stages/current/'+name+'.json'));
const state={view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperRoleOperationStages:true};
const rows=g=>g.publication?.role_operation_stages?.rows||[];
const project=ir=>E.project(ir,state);

test('an unfamiliar certified role retains its full ordered operations and exact cuts in an expandable stage',()=>{
 const ir=read('QuartzPath'),before=JSON.stringify(ir),g=project(ir),r=rows(g)[0];assert.ok(r);assert.equal(rows(g).length,1);
 assert.deepEqual(Array.from(r.operations,o=>o.label),['GELU','Dropout','Identity']);assert.equal(r.operations[1].configuration.args[0],0.2);
 assert.equal(g.idx.nodes.get(r.node).paper.title,'activation');assert.equal(g.idx.nodes.get(r.node).paper.caption,'GELU → Dropout → Identity');
 const inside=new Set(r.canonical_members);assert.deepEqual(JSON.parse(JSON.stringify(r.cuts)),ir.edges.filter(e=>inside.has(e.source)!==inside.has(e.target)));
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]])assert.deepEqual(Object.values(g[key]).flat().sort(),items.map(n=>n.id).sort());
 assert.equal(JSON.stringify(ir),before);
});

test('local stage grouping does not depend on source class or operation attribute names',()=>{
 const a=rows(project(read('QuartzPath')))[0],b=rows(project(read('RenamedPath')))[0];
 assert.deepEqual(Array.from(a.operations,o=>o.label),Array.from(b.operations,o=>o.label));assert.equal(a.internal_edges.length,b.internal_edges.length);
});

test('escaping and unknown paths do not fabricate a stage or a complete role contract',()=>{
 for(const name of ['EscapingPath','InterruptedPath']){const g=project(read(name));assert.equal(rows(g).length,0);}
 assert.ok(project(read('InterruptedPath')).nodes.some(n=>n.kind==='opaque'));
});

test('a damaged neighbor and recurrent state boundary keep their actual structure while a separate role still groups',()=>{
 const ir=read('MixedStageWeave'),g=project(ir);assert.equal(rows(g).length,1);assert.ok(g.nodes.some(n=>n.kind==='opaque'));
 const before=E.project(ir,{...state,paperRoleOperationStages:false});
 const stateNodes=before.nodes.filter(n=>n.operator==='gru'||n.role?.includes('state')).map(n=>n.id);assert.ok(stateNodes.length);
 assert.ok(stateNodes.every(id=>g.positions.has(id)));
});

test('a conditional role stays in its branch and does not prevent an independent unconditional stage',()=>{
 const g=project(read('ConditionalStageWeave'));assert.equal(rows(g).length,1);const r=rows(g)[0];
 let at=g.idx.nodes.get(r.node);while(at){assert.ok(!at.condition);at=g.idx.nodes.get(at.parent);}assert.ok(g.nodes.some(n=>n.kind==='control'));
});

test('explicit local role requests retain the requested primitive operations',()=>{
 const ir=read('QuartzPath'),g=project(ir),r=rows(g)[0],role=r.roles[0];
 const detailed=E.project(ir,{...state,paperRolePaths:[{node:role.owner,certificate:role.certificate,role:role.role_keys}]});
 assert.equal(rows(detailed).length,0);assert.ok(detailed.positions.has(r.anchor));
 const all=E.project(ir,{...state,paperRoleDetails:[role.owner]});assert.equal(rows(all).length,0);
});

test('manual stage expansion restores the primitives and refolding restores byte-identical SVG',()=>{
 const ir=read('QuartzPath'),base=R.render(ir,state),r=rows(base.graph)[0],s={...state,paperAuto:false,open:[...base.graph.publication.open,r.node]};
 const open=R.render(ir,s);assert.equal(rows(open.graph)[0].status,'expanded');assert.ok(r.canonical_members.every(id=>open.graph.positions.has(id)));
 assert.equal(R.render(ir,JSON.parse(JSON.stringify(base.document)).state).svg,base.svg);
 const closed=R.render(ir,{...s,open:s.open.filter(id=>id!==r.node)});assert.equal(closed.svg,base.svg);
 const hiddenGoals=base.graph.expression_coverage.filter(g=>r.canonical_members.some(id=>g.goal==='goal:node:'+id));assert.equal(hiddenGoals.length,r.canonical_members.length);assert.ok(hiddenGoals.every(g=>g.status!=='fulfilled'));
});

test('annotation alone cannot invent a role path or absorb observation, effect, identity and shared uses',()=>{
 const ir=read('QuartzPath'),g=E.project(ir,{...state,paperRoleOperationStages:false}),anchor=g.architecture.nodes.find(n=>n.role_annotations?.some(r=>r.role==='activation'));
 const base={ir,plan:g.architecture,open:new Set(g.publication.open)};
 for(const patch of [{mutable:true},{evidence_status:'runtime-only'},{identity_display:{kind:'same-object-calls'}},{runtime_evidence:[{}]}]){
  const plan=JSON.parse(JSON.stringify(g.architecture));Object.assign(plan.nodes.find(n=>n.id===anchor.id),patch);assert.equal(F.compile({...base,plan}).rows.length,0);
 }
 const plan=JSON.parse(JSON.stringify(g.architecture));plan.nodes.find(n=>n.id===anchor.id).role_annotations[0].role_keys=['invented'];assert.equal(F.compile({...base,plan}).rows.length,0);
 const changed=JSON.parse(JSON.stringify(ir));changed.edges.push({...changed.edges.find(e=>e.source===anchor.id),id:'extra-use',target:ir.nodes.find(n=>n.kind==='interface'&&n.role==='output').id});assert.equal(F.compile({...base,ir:changed}).rows.length,0);
});

test('opt-in stages do not alter print, source, or other granularity contracts',()=>{
 const ir=read('QuartzPath');for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{view:'source'}]){
 const a=E.project(ir,{...state,...extra}),b=E.project(ir,{...state,...extra,paperRoleOperationStages:false});assert.deepEqual(Array.from(a.positions.keys()),Array.from(b.positions.keys()));assert.equal(rows(a).length,0);
 }
});

test('conditions, state writes, extra operands and selected result slots stop exclusive unary grouping',()=>{
 const ir=read('QuartzPath'),g=E.project(ir,{...state,paperRoleOperationStages:false}),anchor=g.architecture.nodes.find(n=>n.role_annotations?.some(r=>r.role==='activation'));
 const edge=ir.edges.find(e=>e.source===anchor.id),base={plan:g.architecture,open:new Set(g.publication.open)};
 for(const change of ['condition','slot','effect','operand']){
  const changed=JSON.parse(JSON.stringify(ir)),e=changed.edges.find(e=>e.id===edge.id);
  if(change==='condition')e.condition={outcome:'true'};
  if(change==='slot')e.source_port='1';
  if(change==='effect')changed.edges.push({...e,id:'write',kind:'state-write'});
  if(change==='operand')changed.edges.push({...e,id:'second-operand',source:ir.nodes.find(n=>n.kind==='interface'&&n.role==='input').id,target_port:'other'});
  assert.equal(F.compile({...base,ir:changed}).rows.length,0,change);
 }
});

test('a functional role without constructor metadata groups without reading Object.prototype.constructor',()=>{
 const ir=read('QuartzPath'),g=E.project(ir,{...state,paperRoleOperationStages:false});
 const anchor=g.architecture.nodes.find(n=>n.role_annotations?.some(r=>r.role==='activation'));
 for(const n of [ir.nodes.find(n=>n.id===anchor.id),anchor]){
  delete n.constructor;delete n.framework_type;
  n.function_target='torch.nn.functional.gelu';n.source_framework_function=n.function_target;
 }
 const result=F.compile({ir,plan:g.architecture,open:new Set(g.publication.open)});
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].operations[0].label,'gelu');
 assert.equal(result.rows[0].operations[0].configuration,null);
});

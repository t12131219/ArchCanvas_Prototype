'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=require('../tools/load_publication_renderer.cjs'),E=load('./semantic_studio',{engine:true}),R=load('./semantic_studio'),F=require('../semantic_studio/role-path-stages.js');
const read=name=>JSON.parse(fs.readFileSync('verification/prefix-role-paths/current/'+name+'.json'));
const state={view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperRolePathStages:true};
const rows=g=>g.publication?.role_path_stages?.rows||[],copy=x=>JSON.parse(JSON.stringify(x));
test('an unfamiliar certified feed-forward path composes helper before role with exact aliases, cuts and configurations',()=>{
 const ir=read('PreparedCurve'),before=JSON.stringify(ir),g=E.project(ir,state),r=rows(g)[0];assert.equal(rows(g).length,1);
 assert.equal(r.direction,'helper-before-role');assert.deepEqual(Array.from(r.operations,o=>o.label),['Identity','Dropout','Linear']);
 assert.equal(r.operations[1].configuration.args[0],0.2);assert.deepEqual(Array.from(r.operations[2].configuration.args),[12,8]);
 assert.equal(r.bridge_aliases.length,1);assert.equal(ir.semantic_contracts[0].rule,'feed-forward');
 const members=new Set(r.canonical_members);assert.deepEqual(copy(r.cuts),ir.edges.filter(e=>members.has(e.source)!==members.has(e.target)));
 assert.deepEqual(Array.from(r.internal_edges),ir.edges.filter(e=>members.has(e.source)&&members.has(e.target)).map(e=>e.id));
 for(const id of [r.helper,r.anchor,...r.bridge_aliases])assert.equal(g.idx.nodes.get(id).parent,r.node);
 assert.ok(r.bridge_aliases.every(id=>g.node_accounting.contracted.includes(id)));assert.deepEqual(Array.from(r.display_members),[r.helper,r.anchor]);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]])assert.deepEqual(Object.values(g[key]).flat().sort(),items.map(n=>n.id).sort());
 assert.equal(JSON.stringify(ir),before);
});
test('renamed attributes and two assignment aliases use the same facts and preserve source ordering',()=>{
 const a=rows(E.project(read('PreparedCurve'),state))[0],b=rows(E.project(read('RenamedCurve'),state))[0];
 assert.deepEqual(Array.from(a.operations,o=>o.label),Array.from(b.operations,o=>o.label));assert.equal(b.bridge_aliases.length,2);
 const ir=read('RenamedCurve');assert.equal(ir.edges.find(e=>e.target===b.bridge_aliases[1]).source,b.bridge_aliases[0]);
});
test('stage opening then helper opening restores operations; round-trip/refold retains exact SVG and unfulfilled detail goals',()=>{
 const ir=read('PreparedCurve'),base=R.render(ir,state),r=rows(base.graph)[0],s={...state,paperAuto:false,open:[...base.graph.publication.open,r.node]};
 const opened=R.render(ir,s),deep=R.render(ir,{...s,open:[...s.open,r.helper]});
 assert.equal(rows(opened.graph)[0].status,'expanded');assert.ok(rows(opened.graph)[0].stage_children_exposed);assert.ok(!rows(opened.graph)[0].detailed_operations_exposed);
 assert.ok(rows(deep.graph)[0].detailed_operations_exposed);assert.ok(r.operations.every(o=>deep.graph.positions.has(o.node)));
 assert.equal(R.render(ir,JSON.parse(JSON.stringify(deep.document)).state).svg,deep.svg);
 assert.equal(R.render(ir,{...s,open:base.graph.publication.open}).svg,base.svg);
 const goals=base.document.expression_goals.goals.filter(g=>r.operations.some(o=>g.core.includes(o.node)));assert.ok(goals.length>=2);
 for(const goal of goals)assert.equal(base.graph.expression_coverage.find(g=>g.goal===goal.id).status,'unfulfilled');
});
test('source extraction refuses escaping/unknown regions; a mixed conditional and recurrent neighbor keeps its boundaries',()=>{
 for(const name of ['EscapingCurve','InterruptedCurve']){const ir=read(name);assert.equal(rows(E.project(ir,state)).length,0);assert.equal(R.render(ir,state).svg,R.render(ir,{...state,paperRolePathStages:false}).svg);}
 const ir=read('MixedPreparation'),g=E.project(ir,state),b=E.project(ir,{...state,paperRolePathStages:false});assert.equal(rows(g).length,1);
 const protectedIds=b.nodes.filter(n=>n.kind==='opaque'||n.kind==='control'||n.operator==='gru').map(n=>n.id);assert.ok(protectedIds.length>=2);assert.ok(protectedIds.every(id=>g.positions.has(id)));
});
test('exclusive alias bridges reject extra uses, selected slots, effects, controls, observations, identity and forged proof',()=>{
 const ir=read('RenamedCurve'),b=E.project(ir,{...state,paperRolePathStages:false}),base={ir,plan:b.architecture,open:new Set(b.publication.open)},r=rows(E.project(ir,state))[0];
 for(const kind of ['alias-use','helper-use','anchor-input','alias-slot','edge-slot','helper-slot','anchor-slot','canonical-effect','plan-effect','condition','observed','identity','role','certificate','path-binding','helper-role','protected-edge','scope','requested']){
  const changed=copy(ir),plan=copy(b.architecture),alias=plan.nodes.find(n=>n.id===r.bridge_aliases[0]),canonicalAlias=changed.nodes.find(n=>n.id===alias.id),helper=plan.nodes.find(n=>n.id===r.helper),anchor=plan.nodes.find(n=>n.id===r.anchor),es=changed.edges;
  const edge=es.find(e=>e.source===alias.id),output=es.find(e=>e.target===alias.id),request=[];
  if(kind==='alias-use')es.push({...edge,id:'extra-use',target:'outside'});
  if(kind==='helper-use')es.push({...output,id:'extra-output',target:'outside'});
  if(kind==='anchor-input')es.push({...edge,id:'extra-input',target:anchor.id,target_port:'arg:1'});
  if(kind==='alias-slot')canonicalAlias.slot='0';
  if(kind==='edge-slot')edge.source_port='0';
  if(kind==='helper-slot')output.source_port='0';
  if(kind==='anchor-slot')es.find(e=>e.source===anchor.id).source_port='0';
  if(kind==='canonical-effect')canonicalAlias.mutable=true;
  if(kind==='plan-effect')alias.mutable=true;
  if(kind==='condition')alias.condition={outcome:'true'};
  if(kind==='observed')canonicalAlias.runtime_evidence=[{invocation:'observed'}];
  if(kind==='identity')alias.identity_display={kind:'same-object-calls'};
  if(kind==='role')anchor.role_annotations[0].role_keys=['invented'];
  if(kind==='certificate')plan.semantic_contracts[0].proof=['forged'];
  if(kind==='path-binding')helper.local_pipeline.bindings[0].source_port='wrong';
  if(kind==='helper-role')helper.role_annotations=copy(anchor.role_annotations);
  if(kind==='protected-edge')output.iteration={index:0};
  if(kind==='scope')alias.parent='outside';
  if(kind==='requested')request.push(alias.id);
  assert.equal(F.compile({...base,ir:changed,plan,requested:request}).rows.length,0,kind);
 }
});
test('explicit helper/role details, protected ancestors, source, print and other granularities take precedence',()=>{
 const ir=read('PreparedCurve'),g=E.project(ir,state),r=rows(g)[0],role=r.roles[0];
 for(const extra of [{paperRoleDetails:[role.owner]},{paperRolePaths:[{node:role.owner,certificate:role.certificate,role:role.role_keys}]},{paperAuto:false,open:[...g.publication.open,r.helper]},{view:'source'},{paperMedium:'print'},{paperGranularity:'semantic'},{paperRolePathStageOwners:[]}])assert.equal(rows(E.project(ir,{...state,...extra})).length,0);
 const b=E.project(ir,{...state,paperRolePathStages:false});
 for(const guard of ['condition','mutable','identity_display','observed_calls','runtime_evidence']){const plan=copy(b.architecture);plan.nodes.find(n=>n.id===plan.nodes.find(n=>n.id===r.anchor).parent)[guard]=guard==='runtime_evidence'?[{invocation:'observed'}]:true;assert.equal(F.compile({ir,plan,open:new Set(b.publication.open)}).rows.length,0,guard);}
});

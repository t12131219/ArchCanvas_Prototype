'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const A=require('../semantic_studio/adaptive-frontier.js'),R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
const load=name=>JSON.parse(fs.readFileSync('verification/adaptive-role-paths/current/'+name+'.json'));
const cache=new Map(),draw=name=>{if(!cache.has(name))cache.set(name,R.render(load(name),state));return cache.get(name);};
function accounts(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('actual measured partial role paths survive a rejected whole-scope expansion',()=>{
 const r=draw('BoundedWeave'),a=r.graph.publication.adaptive_frontier;
 assert.ok(a.attempts.some(t=>t.opportunity.kind==='roles'&&!t.eligible&&t.reasons.includes('disproportionate-area-cost')));
 assert.ok(a.attempts.some(t=>t.opportunity.kind==='role-path'&&t.accepted&&t.gain>0));
 assert.ok(a.selected_role_paths.length);assert.equal(a.selected_role_details.length,0);
 assert.ok(a.attempts.length<=3&&a.preflights.length<=36);assert.deepEqual(r.prepared.quality.issues,[]);
 for(const p of a.selected_role_paths){const check=r.graph.publication.role_frontier.path_requests.find(x=>x.node===p.node&&x.certificate===p.certificate&&JSON.stringify(x.role)===JSON.stringify(p.role));
  assert.equal(check.status,'exposed');assert.equal(check.operand_check.status,'fulfilled');}
 accounts(r.document.ir,r.graph);
 // A visible endpoint and gains elsewhere cannot substitute for this path's
 // own actual input routes, even if an obsolete receipt claims fulfillment.
 const ir=load('BoundedWeave'),baseline=R.render(ir,{...state,paperAdaptive:false}),request=r.graph.publication.role_frontier.path_requests[0];
 const incoming=new Set(ir.edges.filter(e=>e.target===request.target&&['data','alias','interface-binding'].includes(e.kind)).map(e=>e.id));
 const routes=r.prepared.routes.filter(e=>!(e.bundle_members||[e]).some(m=>[m.id,...m.originals||[]].some(id=>incoming.has(id))));
 assert.ok(routes.length<r.prepared.routes.length);assert.equal(request.operand_check.status,'fulfilled');
 const missing={...r,prepared:{...r.prepared,routes}},assessment=A.assess(ir,baseline,missing);
 assert.equal(assessment.accepted,false);assert.ok(assessment.reasons.includes('unverified-role-path-binding'));
});
test('automatic paths use exact certificate references and ignore model names or invented metadata',()=>{
 const ir=load('BoundedWeave'),g=E.project(ir,{...state,paperAdaptive:false,view:'publication'}),before=A.candidates(g,state);
 assert.ok(before.some(c=>c.kind==='role-path'));
 const renamed={...g,architecture:structuredClone(g.architecture)};for(const n of renamed.architecture.nodes){n.label='Transformer';n.source_class='Unknown';}
 assert.deepEqual(A.candidates(renamed,state),before);
 for(const c of renamed.architecture.semantic_contracts)c.roles={unfamiliar:{'a.b':c.roles},metadata:'not-an-id'};
 const changed=A.candidates(renamed,state).filter(c=>c.kind==='role-path');
 assert.deepEqual(changed.map(c=>c.targets).sort(),before.filter(c=>c.kind==='role-path').map(c=>c.targets).sort());
 assert.ok(changed.every(c=>c.role[0]==='unfamiliar'&&c.role[1]==='a.b'));
 assert.ok(!A.candidates(g,{...state,paperAdaptivePolicy:'detail'}).some(c=>c.kind==='role-path'));
});
test('selected partial owners retain their other local paths without duplicating requests',()=>{
 const ir=load('BoundedWeave'),g=E.project(ir,{...state,paperAdaptive:false,view:'publication'}),c=A.candidates(g,state).find(c=>c.kind==='role-path'),s=A.apply(state,c);
 assert.deepEqual(s.paperRolePaths,[{node:c.node,certificate:c.certificate,role:c.role}]);assert.equal(state.paperRolePaths,undefined);
 const next=E.project(ir,{...s,paperAdaptive:false,view:'publication'}),remaining=A.candidates(next,s);
 assert.ok(remaining.some(x=>x.kind==='role-path'&&x.node===c.node));assert.ok(remaining.some(x=>x.kind==='roles'&&x.node===c.node));
 assert.ok(!remaining.some(x=>x.id===c.id));
});
test('an adjacent unknown computation preserves its boundary while known local paths improve',()=>{
 const ir=load('MixedBoundary'),b=R.render(ir,{...state,paperAdaptive:false}),r=draw('MixedBoundary'),before=A.evidence(ir,b),after=A.evidence(ir,r);
 assert.ok(ir.nodes.some(n=>n.kind==='opaque'));
 // Final compaction may make the stronger whole-scope expression affordable.
 // Require actual local evidence gain, rather than a particular request form.
 assert.ok(after.goals.size>before.goals.size);
 assert.ok(r.graph.publication.adaptive_frontier.attempts.some(t=>t.accepted&&t.gain>0));
 assert.deepEqual(r.graph.publication.adaptive_frontier.selected,A.metrics(r));
 for(const id of before.boundaries)assert.ok(after.boundaries.has(id));for(const id of before.goals.keys())assert.ok(after.goals.has(id));
 assert.ok(r.graph.nodes.some(n=>n.kind==='opaque'));accounts(ir,r.graph);
});
test('independent local detail inside a condition preserves its enclosing boundary and exact conditions',()=>{
 const ir=load('ConditionalWeave'),b=R.render(ir,{...state,paperAdaptive:false}),r=draw('ConditionalWeave'),before=A.evidence(ir,b),after=A.evidence(ir,r);
 assert.ok(before.boundaries.size);for(const id of before.boundaries)assert.ok(after.boundaries.has(id));
 for(const e of r.graph.edges.filter(e=>e.condition)){
  const original=ir.edges.find(x=>x.id===e.id);if(original)assert.deepEqual(e.condition,original.condition);
 }
 assert.deepEqual(r.document.ir,ir);accounts(ir,r.graph);
});
test('save, reopen, return and further source detail preserve the canonical IR and exact semantic SVG',()=>{
 const ir=load('BoundedWeave'),original=JSON.stringify(ir),r=draw('BoundedWeave'),saved=JSON.parse(JSON.stringify(r.document));
 assert.equal(R.render(saved.ir,saved.state).svg,r.svg);assert.equal(saved.state.paperRolePaths,undefined);
 assert.equal(R.render(ir,{...state,paperAdaptive:false}).svg,R.render(ir,{...state,paperAdaptive:false,paperRolePaths:[]}).svg);
 const raw=E.project(ir,{view:'source',details:true,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
 assert.equal(raw.nodes.length,ir.nodes.length);assert.equal(raw.edges.length,ir.edges.length);assert.equal(JSON.stringify(ir),original);
});

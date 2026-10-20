'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/role-frontier.js'),P=require('../semantic_studio/publication.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
function plan(){return {nodes:[{id:'root',kind:'composite',parent:null},{id:'outer',kind:'composite',parent:'root',semantic_contracts:['a']},
 {id:'inner',kind:'composite',parent:'outer',semantic_contracts:['b']},
 {id:'left',kind:'composite',parent:'inner'},{id:'x',kind:'compute',parent:'left'},
 {id:'right',kind:'composite',parent:'inner'},{id:'y',kind:'compute',parent:'right'},
 {id:'deep',kind:'composite',parent:'inner',semantic_contracts:['c']},{id:'z',kind:'compute',parent:'deep'}],
 semantic_contracts:[{id:'a',node:'outer',roles:{call:'inner'}},{id:'b',node:'inner',roles:{branches:{first:'x',second:'y'},last:'z'}},
 {id:'c',node:'deep',roles:{result:'z'}}]};}
const path=(role,node='inner',certificate='b')=>({node,certificate,role});
test('one exact role path opens only its source ancestry and keeps independent roles folded',()=>{
 const p=plan(),before=JSON.stringify(p),f=F.compile({plan:p,focus:'root',paths:[path(['branches','first'])]});
 assert.deepEqual([...f.open].sort(),['inner','left','outer']);assert.ok(!f.open.has('right')&&!f.open.has('deep'));
 assert.deepEqual(f.records.filter(r=>r.owner==='inner').map(r=>r.node),['x']);assert.equal(JSON.stringify(p),before);
 const all=F.compile({plan:p,focus:'root',details:['inner']});assert.ok(all.open.has('right'));assert.equal(all.records.filter(r=>r.owner==='inner').length,3);
});
test('exact array paths distinguish punctuation, nested keys and metadata strings',()=>{
 const p=plan(),c=p.semantic_contracts[1];c.roles={'a.b':'x',a:{b:'y'},count:4,metadata:'no-node'};
 const f=F.compile({plan:p,focus:'root',paths:[path(['a.b'])]});assert.ok(f.open.has('left'));assert.ok(!f.open.has('right'));
 const g=F.compile({plan:p,focus:'root',paths:[path(['a','b'])]});assert.ok(g.open.has('right'));assert.ok(!g.open.has('left'));
 assert.deepEqual(F.references(c.roles,new Map(p.nodes.map(n=>[n.id,n]))).map(r=>r.keys),[['a.b'],['a','b']]);
});
test('malformed, mismatched, missing, self-invented and outside-focus paths do not release an owner',()=>{
 for(const paths of [null,{},'inner',[null,5,{},path('branches.first'),path([1])],[path(['missing'])],[path(['branches','first'],'inner','a')],[path(['branches','first'],'absent')]]){
  const f=F.compile({plan:plan(),focus:'root',paths});assert.deepEqual([...f.owners],['outer']);assert.ok(f.pathRequests.every(r=>r.selection==='deferred'));
 }
 const external=plan();external.semantic_contracts[1].roles.outside='outer';assert.equal(F.compile({plan:external,focus:'root',paths:[path(['outside'])]}).pathRequests[0].selection,'deferred');
 const f=F.compile({plan:plan(),focus:'right',paths:[path(['branches','first'])]});assert.ok(!f.owners.has('inner'));
});
test('role paths stop at effect, condition, shared identity and unselected nested certificate boundaries',()=>{
 for(const guard of [{mutable:true},{condition:{test:'flag'}},{kind:'opaque'},{identity_display:{object:'x'}},{observed_calls:{}},{evidence_status:'runtime-only'},{runtime_evidence:[{}]},
  {semantic_type:'loop-template'},{semantic_type:'serial-repeat'}]){
  const p=plan();Object.assign(p.nodes.find(n=>n.id==='inner'),guard);const f=F.compile({plan:p,focus:'root',paths:[path(['branches','first'])]});
  assert.equal(f.pathRequests[0].selection,'deferred');assert.ok(!f.open.has('inner'));
 }
 const p=plan(),f=F.compile({plan:p,focus:'root',paths:[path(['last'])]});assert.ok(!f.open.has('deep'));assert.equal(f.records.find(r=>r.owner==='inner').frontier_node,'deep');
 const blocked=F.compile({plan:p,focus:'root',paths:[path(['result'],'deep','c')]});assert.equal(blocked.pathRequests[0].boundary,'inner');
 const both=F.compile({plan:p,focus:'root',paths:[path(['result'],'deep','c'),path(['last'])]});assert.ok(both.open.has('deep'));
});
test('duplicate and reordered paths are deterministic, full detail takes precedence, names select nothing',()=>{
 const p=plan(),a=path(['branches','first']),b=path(['branches','second']);
 const f=F.compile({plan:p,focus:'root',paths:[a,b,a]}),g=F.compile({plan:p,focus:'root',paths:[b,a]});
 assert.deepEqual(f.records,g.records);assert.deepEqual([...f.open],[...g.open]);assert.equal(f.pathRequests.length,2);
 const h=F.compile({plan:p,focus:'root',details:['inner'],paths:[a]});assert.equal(h.records.filter(r=>r.owner==='inner').length,3);
 for(const n of p.nodes){n.label='Transformer';n.source_class='Other';}
 assert.deepEqual(F.compile({plan:p,focus:'root',paths:[a,b]}).records,f.records);
});
function same(){return JSON.parse(fs.readFileSync('verification/semantic-design/current/after/SameSource.json'));}
const state={paperMedium:'canvas',paperGranularity:'roles'};
function request(ir){const g=P.project(ir,state,E),id=g.nodes.find(n=>n.contract_roles?.projections).contract_roles.attention,c=ir.semantic_contracts.find(c=>c.node===id);return path(['scores'],id,c.id);}
test('real source path preserves IR, exact accounting and request on save/reopen and can refold',()=>{
 const ir=same(),before=JSON.stringify(ir),s={...state,paperRolePaths:[request(ir)]},a=R.render(ir,s),r=a.document.publication.role_frontier.path_requests[0];
 assert.equal(r.status,'exposed');assert.equal(r.operand_check.status,'fulfilled');assert.ok(r.operand_check.edges.length);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
  const ids=Object.values(a.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());
 }
 assert.equal(R.render(a.document.ir,a.document.state).svg,a.svg);assert.equal(R.render(ir,{...s,paperRolePaths:[]}).svg,R.render(ir,state).svg);assert.equal(JSON.stringify(ir),before);
});
test('manual folding and insufficient budget never report a selected endpoint as physically expressed',()=>{
 const ir=same(),p=request(ir);
 for(const extra of [{paperAuto:false,open:['model']},{paperBudget:4}]){const r=R.render(ir,{...state,paperRolePaths:[p],...extra}),c=r.document.publication.role_frontier.path_requests[0];assert.notEqual(c.status,'exposed');assert.equal(c.operand_check.status,'deferred');}
});
test('separate unfamiliar source helpers admit a partial frontier between the main view and all roles',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/role-paths/current/SeparateStages.json')),before=JSON.stringify(ir),base=P.project(ir,state,E),c=ir.semantic_contracts.find(c=>base.positions.has(c.node)&&!base.positions.get(c.node).expanded);
 const partial=P.project(ir,{...state,paperRolePaths:[path(['scores'],c.node,c.id)]},E),full=P.project(ir,{...state,paperRoleDetails:[c.node]},E);
 assert.ok(base.nodes.length<partial.nodes.length&&partial.nodes.length<full.nodes.length);
 assert.ok(partial.positions.has(c.roles.scores));assert.ok(!partial.positions.has(c.roles.softmax));assert.ok(full.positions.has(c.roles.softmax));
 assert.ok(!partial.positions.has(c.roles.output));assert.ok(full.positions.has(c.roles.output));assert.equal(JSON.stringify(ir),before);
});
test('an explicit focused path can narrow the default role layer without removing its other source subtrees',()=>{
 const p=plan(),f=F.compile({plan:p,focus:'inner',paths:[path(['branches','first'])]});
 assert.ok(f.open.has('left')&&!f.open.has('right'));assert.deepEqual(f.records.filter(r=>r.owner==='inner').map(r=>r.node),['x']);
 assert.ok(f.plan.nodes.some(n=>n.id==='right')&&f.plan.nodes.some(n=>n.id==='y'));
 const deferred=F.compile({plan:p,focus:'inner',paths:[path(['missing'])]});assert.ok(deferred.open.has('right'));
});

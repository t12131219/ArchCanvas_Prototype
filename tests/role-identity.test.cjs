'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/role-frontier.js'),P=require('../semantic_studio/publication.js'),A=require('../semantic_studio/adaptive-frontier.js'),R=require('../semantic_studio/publication-renderer.js');
function plan(){return {nodes:[{id:'root',kind:'composite'},{id:'owner',parent:'root',kind:'composite',semantic_contracts:['proof']},
 {id:'helper',parent:'owner',kind:'composite'},{id:'work',parent:'helper',kind:'compute',operator:'transpose'}],
 semantic_contracts:[{id:'proof',node:'owner',roles:{'a.b':'work',a:{b:'work'},steps:['work']},scope:'local evidence only'}]};}
const request=role=>({node:'owner',certificate:'proof',role});
function graphFor(frontier){return {positions:new Map(frontier.plan.nodes.map(n=>[n.id,{expanded:true}])),representatives:{},node_accounting:{attached:[],contracted:[]}};}
test('colliding dotted spellings preserve exact distinct keys through annotations and receipts',()=>{
 const p=plan(),before=JSON.stringify(p),f=F.compile({plan:p,focus:'root'}),g=graphFor(f),r=F.receipt(f,g);
 assert.deepEqual(r.roles.map(r=>r.role_keys),[['a.b'],['a','b'],['steps','0']]);
 assert.deepEqual(f.plan.nodes.find(n=>n.id==='work').role_annotations.map(r=>r.role_keys),[['a.b'],['a','b'],['steps','0']]);
 assert.equal(JSON.stringify(p),before);assert.notEqual(r.roles[0].role_keys,r.roles[1].role_keys);
});
test('one exact path cannot satisfy a missing colliding path even for the same target',()=>{
 const f=F.compile({plan:plan(),focus:'root',paths:[request(['a.b']),request(['a','b'])]});
 f.records=f.records.filter(r=>JSON.stringify(r.role_keys)!==JSON.stringify(['a','b']));
 const receipt=F.receipt(f,graphFor(f));
 assert.equal(receipt.path_requests[0].status,'exposed');assert.equal(receipt.path_requests[1].status,'deferred');
});
test('adaptive evidence detects removal of one role identity while its other spelling and target remain',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/semantic-design/current/after/SameSource.json'));
 const b=R.render(ir,{paperMedium:'canvas',paperGranularity:'roles'}),f=F.compile({plan:plan(),focus:'root'}),roles=F.receipt(f,graphFor(f)).roles.slice(0,2);
 const baseline={...b,graph:{...b.graph,publication:{...b.graph.publication,role_frontier:{roles}}}};
 const trial={...b,graph:{...b.graph,publication:{...b.graph.publication,role_frontier:{roles:roles.slice(0,1)}}}};
 assert.equal(A.evidence(ir,baseline).roles.size,2);assert.equal(A.evidence(ir,trial).roles.size,1);
 assert.ok(A.assess(ir,baseline,trial).reasons.includes('previous-role-lost'));
});
function decorated(keys,extra={}){
 const n={id:'n',kind:'compute',label:'original',operator:'transpose',role_annotations:[{role:keys.join('.'),role_keys:keys}],...extra};
 P.decorate(n,{nodes:new Map([['n',n]]),children:new Map()});return n.paper;
}
test('numeric members keep their field context and punctuation remains part of the exact key',()=>{
 assert.equal(decorated(['stages','12']).title,'stages · 12');
 assert.equal(decorated(['phases','3','path','0','result']).title,'path · 0 · result');
 assert.equal(decorated(['0']).title,'Role · 0');
 assert.equal(decorated(['a.b']).title,'a.b');assert.equal(decorated(['a','b']).title,'b');
 assert.equal(decorated(['output']).title,'output');assert.equal(decorated(['output_projection']).title,'output projection');
});
test('role titles cannot overwrite unknown, conditional, effect or shared-identity boundaries',()=>{
 for(const guard of [{kind:'opaque'},{kind:'control'},{mutable:true},{condition:{predicate:'flag'}},{identity_display:{kind:'same-object-calls',label:'shared',invocation:1,count:2}}]){
  assert.equal(decorated(['stages','0'],guard).title,'original');
 }
});
test('real source role paths retain exact keys and contextual SVG text across save, reopen and refold',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/adaptive-role-paths/current/BoundedWeave.json')),original=JSON.stringify(ir);
 const c=ir.semantic_contracts.find(c=>Array.isArray(c.roles.numerical_guards));
 const state={paperMedium:'canvas',paperGranularity:'roles',paperRolePaths:[{node:c.node,certificate:c.id,role:['numerical_guards','0']}]};
 const r=R.render(ir,state),row=r.document.publication.role_frontier.roles.find(r=>r.certificate===c.id&&r.node===c.roles.numerical_guards[0]);
 assert.deepEqual(row.role_keys,['numerical_guards','0']);assert.equal(row.status,'exposed');
 assert.equal(r.graph.idx.nodes.get(row.node).paper.title,'numerical guards · 0');
 assert.ok(r.svg.includes('exact keys: [&quot;numerical_guards&quot;,&quot;0&quot;]'));
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 assert.equal(R.render(ir,{...state,paperRolePaths:[]}).svg,R.render(ir,{paperMedium:'canvas',paperGranularity:'roles'}).svg);
 assert.equal(JSON.stringify(ir),original);
});

'use strict';
const structure=require('./diagram-structure.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/role-frontier.js'),P=require('../semantic_studio/publication.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles'},read=file=>JSON.parse(fs.readFileSync(file));
function plan(){return {nodes:[{id:'root',kind:'composite',parent:null},{id:'outer',kind:'composite',parent:'root',semantic_contracts:['a']},
 {id:'helper',kind:'composite',parent:'outer'},{id:'inner',kind:'composite',parent:'helper',semantic_contracts:['b']},
 {id:'work',kind:'compute',parent:'inner'},{id:'deep',kind:'composite',parent:'inner',semantic_contracts:['c']},{id:'leaf',kind:'compute',parent:'deep'},
 {id:'other',kind:'composite',parent:'outer',semantic_contracts:['d']},{id:'untouched',kind:'compute',parent:'other'}],
 semantic_contracts:[{id:'a',node:'outer',roles:{result:'leaf',other:'untouched'},scope:'outer proof'},
 {id:'b',node:'inner',roles:{step:'work',result:'leaf'},scope:'inner proof'},
 {id:'c',node:'deep',roles:{result:'leaf'},scope:'deep proof'},{id:'d',node:'other',roles:{result:'untouched'},scope:'other proof'}]};}
function account(ir,g){for(const [key,objects]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),objects.map(o=>o.id).sort());}}
test('explicit local role refinement composes unfamiliar certificate schemas and preserves proof owners',()=>{
 const p=plan(),before=JSON.stringify(p),f=F.compile({plan:p,focus:'root',details:['inner']});
 assert.deepEqual([...f.owners],['outer','inner']);assert.deepEqual([...f.open].sort(),['helper','inner','outer']);
 assert.equal(f.ownerOf('work'),'inner');assert.equal(f.records.find(r=>r.owner==='inner'&&r.role==='result').frontier_node,'deep');
 assert.equal(f.records.find(r=>r.owner==='outer'&&r.role==='result').frontier_node,'inner');
 assert.ok(!f.open.has('other'));assert.ok(!f.open.has('deep'));assert.equal(JSON.stringify(p),before);
});
test('multiple local refinements are deterministic and cannot skip an unselected certificate',()=>{
 const p=plan(),a=F.compile({plan:p,focus:'root',details:['deep']});assert.equal(a.detailRequests[0].selection,'deferred');assert.equal(a.detailRequests[0].boundary,'inner');
 const b=F.compile({plan:p,focus:'root',details:['deep','inner','deep']}),c=F.compile({plan:p,focus:'root',details:['inner','deep']});
 assert.deepEqual(b.detailRequests,c.detailRequests);assert.deepEqual(b.records,c.records);assert.ok(b.open.has('deep'));
});
test('protected source boundaries reject refinement without suppressing independent outer roles',()=>{
 for(const guard of [{kind:'opaque'},{kind:'control'},{condition:{test:true}},{mutable:true},{identity_display:{object:'x'}},
  {observed_calls:[{}]},{runtime_evidence:[{}]},{evidence_status:'runtime-only'},...['serial-repeat','repeat-instance','loop-template','iteration-region','observed-variant','conditional-collection'].map(semantic_type=>({semantic_type}))]){
  const p=plan();Object.assign(p.nodes.find(n=>n.id==='helper'),guard);const f=F.compile({plan:p,focus:'root',details:['inner']});
  assert.equal(f.detailRequests[0].selection,'deferred',JSON.stringify(guard));assert.ok(!f.owners.has('inner'));assert.ok(!f.open.has('helper'));assert.ok(f.records.some(r=>r.owner==='outer'));
 }
});
test('malformed, missing, outside-focus and unproved requests never invent a role scope',()=>{
 for(const details of [null,{},'inner',['missing','work',null,12]]){const f=F.compile({plan:plan(),focus:'root',details});assert.deepEqual([...f.owners],['outer']);}
 const f=F.compile({plan:plan(),focus:'other',details:['inner']});assert.equal(f.detailRequests[0].selection,'deferred');assert.deepEqual([...f.owners],['other']);
});
test('an explicit child request cannot open a guarded enclosing certificate owner',()=>{
 for(const guard of [{mutable:true},{condition:{test:true}},{identity_display:{object:'x'}},{evidence_status:'runtime-only'}]){
  const p=plan();Object.assign(p.nodes.find(n=>n.id==='outer'),guard);const f=F.compile({plan:p,focus:'root',details:['inner']});
  assert.equal(f.detailRequests[0].selection,'deferred');assert.equal(f.detailRequests[0].boundary,'outer');assert.ok(!f.open.has('outer'));
 }
});
test('labels and model names cannot select role detail',()=>{
 const p=plan(),a=F.compile({plan:p,focus:'root',details:['inner']});for(const n of p.nodes){n.label='Transformer';n.source_class='Unseen';}
 const b=F.compile({plan:p,focus:'root',details:['inner']});assert.deepEqual(a.records,b.records);assert.deepEqual(a.detailRequests,b.detailRequests);assert.deepEqual([...a.open],[...b.open]);
});
const same=()=>read('verification/semantic-design/current/after/SameSource.json');
function nested(ir){const g=P.project(ir,state,E);return g.nodes.find(n=>n.contract_roles?.projections).contract_roles.attention;}
test('a real nested certificate exposes its proved roles and retains all canonical bindings',()=>{
 const ir=same(),before=JSON.stringify(ir),id=nested(ir),g=P.project(ir,{...state,paperRoleDetails:[id]},E);
 assert.ok(g.positions.get(id).expanded);const contract=ir.semantic_contracts.find(c=>c.node===id);
 for(const role of ['scores','softmax','output']){const node=contract.roles[role];assert.ok(g.positions.has(node));assert.ok(g.idx.nodes.get(node).role_annotations.some(r=>r.certificate===contract.id&&r.role===role));}
 assert.equal(g.publication.role_frontier.detail_requests[0].status,'expanded');account(ir,g);assert.equal(JSON.stringify(ir),before);
});
test('selected detail reports budget or explicit folding honestly',()=>{
 const ir=same(),id=nested(ir);for(const extra of [{paperBudget:4},{paperAuto:false,open:['model']}]){
  const g=P.project(ir,{...state,paperRoleDetails:[id],...extra},E),request=g.publication.role_frontier.detail_requests[0];
  assert.equal(request.selection,'selected');assert.equal(request.status,'deferred');assert.ok(request.reason);account(ir,g);
 }
});
test('selected semantic state saves, reopens, refolds and allows finer source expansion',()=>{
 const ir=same(),id=nested(ir),base=R.render(ir,state),detail=R.render(ir,{...state,paperRoleDetails:[id]});
 assert.ok(detail.graph.nodes.length>base.graph.nodes.length);assert.equal(R.render(detail.document.ir,detail.document.state).svg,detail.svg);
 assert.equal(R.render(ir,{...state,paperRoleDetails:[]}).svg,base.svg);assert.deepEqual(detail.prepared.quality.issues,[]);
 const all=R.render(ir,{...detail.document.state,paperAuto:false,open:[...detail.graph.idx.children.keys()].filter(Boolean)});
 assert.ok(all.graph.nodes.length>detail.graph.nodes.length);account(ir,all.graph);
});
test('explicit title avoidance recovers frozen role frontiers on mixed, broken and unknown graphs',()=>{
 const old=require('../tools/load_publication_renderer.cjs')(require('node:path').resolve('verification/local-relations/iteration-22-before-role-details/implementation/semantic_studio'));
 for(const name of ['MixedCircuit','UnknownFusion','BrokenCell','ConditionalCarry']){
  // Freeze the historical content policy too; title avoidance alone must not
  // disable new, independently source-backed configuration annotations.
  const ir=read('verification/local-relations/current/'+name+'.json');assert.equal(structure(R.render(ir,{...state,paperProtectFrameTitles:true,paperTransformConfigurations:false,paperSourcePortOrder:false}).svg),structure(old.render(ir,state).svg));
 }
});

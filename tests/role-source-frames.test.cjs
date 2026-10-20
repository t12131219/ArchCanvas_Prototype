'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/frame-ownership.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
function fixture(){return {nodes:[{id:'root',kind:'composite',parent:null},{id:'owner',kind:'composite',parent:'root',semantic_contracts:['certificate'],label:'Known local relation'},
 {id:'helper',parent:'owner',kind:'composite',semantic_type:'source-function',module_identity:'source-object',source:[{file:'foreign.py',line:7}],label:'arbitrary_helper'},
 {id:'a',parent:'helper',kind:'compute',operator:'sigmoid'},{id:'b',parent:'helper',kind:'compute',operator:'multiply'},
 {id:'input',parent:'owner',kind:'interface'},{id:'out',parent:'owner',kind:'interface'}],edges:[
 {id:'in',source:'input',target:'a',kind:'data',source_port:'out',target_port:'arg:0'},
 {id:'use',source:'a',target:'b',kind:'data',source_port:'out',target_port:'arg:1'},
 {id:'out',source:'b',target:'out',kind:'data',source_port:'out',target_port:'result:0'}]};}
const roles=[{owner:'owner',certificate:'certificate',role:'gate',node:'a',frontier_node:'a',location:'internal'}];
function select(ir,extra={}){return F.select({ir,idx:E.index(ir),visible:new Set(ir.nodes.map(n=>n.id)),open:new Set(['root','owner','helper']),roots:['root'],roleSources:roles,...extra});}
test('ordinary multi-operation helpers become ownership annotations only for displayed local role endpoints',()=>{
 const ir=fixture(),before=JSON.stringify(ir),r=select(ir).get('helper');assert.equal(r.kind,'role-source');assert.equal(r.target,'owner');
 assert.equal(r.module_identity,'source-object');assert.deepEqual(r.source,ir.nodes[2].source);assert.deepEqual(r.canonical_members,['helper','a','b']);
 assert.deepEqual(r.cuts,[ir.edges[0],ir.edges[2]]);assert.equal(JSON.stringify(ir),before);
 assert.ok(!select(ir,{roleSources:[]}).has('helper'));assert.ok(!select(ir,{visible:new Set(['root','owner','helper','b','input','out'])}).has('helper'));
});
test('closed or focused source frames, external roles and intervening independent certificates stay framed',()=>{
 const ir=fixture();for(const extra of [{open:new Set(['root','owner'])},{roots:['helper']},{roleSources:[{...roles[0],node:'out',frontier_node:'out'}]},{roleSources:[{...roles[0],owner:'root'}]},{roleSources:[{...roles[0],frontier_node:'helper'}]}])assert.ok(!select(ir,extra).has('helper'));
 ir.nodes[2].semantic_contracts=['independent'];assert.ok(!select(ir).has('helper'));
});
test('unknown, effect, condition, state, observation, repetition and object boundaries prevent helper attachment',()=>{
 for(const guard of [{kind:'opaque'},{kind:'control'},{kind:'state'},{mutable:true},{condition:{branch:'flag'}},{identity_display:{}},{observed_calls:{}},{evidence_status:'runtime-only'},
  {runtime_evidence:[{}]},{repeat_contract:{}},{iteration:{}},{semantic_contracts:['other']},{semantic_type:'loop-template'}]){
  const ir=fixture();Object.assign(ir.nodes[3],guard);assert.ok(!select(ir).has('helper'),JSON.stringify(guard));
 }
 for(const guard of [{condition:'flag'},{kind:'state-write'},{kind:'control'}]){const ir=fixture();Object.assign(ir.edges[0],guard);assert.ok(!select(ir).has('helper'));}
 const ir=fixture();ir.nodes[1].condition='flag';assert.ok(!select(ir).has('helper'));
});
test('source ownership follows canonical ancestry even when presentation grouping reparents operations',()=>{
 const ir=fixture(),plan=JSON.parse(JSON.stringify(ir));plan.nodes.push({id:'band',kind:'composite',parent:'helper',presentation_only:true,semantic_type:'dependency-band'});
 plan.nodes.find(n=>n.id==='a').parent='band';plan.nodes.find(n=>n.id==='b').parent='band';
 const r=select(ir,{idx:E.index(plan),visible:new Set(plan.nodes.map(n=>n.id)),open:new Set(['root','owner','helper','band'])}).get('helper');
 assert.deepEqual(r.canonical_members,['helper','a','b']);assert.deepEqual(r.cuts,[ir.edges[0],ir.edges[2]]);
});
test('drawing-parent reduction retains operations, exact edge slots, canonical accounting and immutable IR',()=>{
 const ir=fixture(),before=JSON.stringify(ir),g=E.project(ir,{view:'architecture',open:['root','owner','helper'],details:true},ir,{frameOwnership:args=>F.select({...args,roleSources:roles})});
 assert.ok(!g.positions.has('helper'));assert.equal(g.idx.nodes.get('a').parent,'owner');assert.equal(g.edges.find(e=>e.id==='use').target_port,'arg:1');
 assert.equal(g.representatives.helper,'owner');assert.equal(g.frame_ownership[0].kind,'role-source');
 for(const [key,objects]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]])assert.deepEqual(Object.values(g[key]).flat().sort(),objects.map(n=>n.id).sort());
 assert.equal(JSON.stringify(ir),before);
});
test('renaming modules and source labels cannot change selection',()=>{
 const ir=fixture(),a=select(ir).get('helper');for(const n of ir.nodes){n.label='Transformer';n.source_class='Anything';}
 const b=select(ir).get('helper');assert.equal(a.target,b.target);assert.deepEqual(a.role_sources,b.role_sources);
});
function source(){return JSON.parse(fs.readFileSync('verification/role-paths/current/ui-saved.layout.json'));}
test('real unfamiliar source selects a measured smaller frame layout and preserves saved/refolded detail',()=>{
 const d=source(),before=JSON.stringify(d.ir),a=R.render(d.ir,d.state),base=R.render(d.ir,{...d.state,paperRoleSourceFrames:false}),receipt=a.prepared.routing.role_source_frame_refinement;
 assert.ok(receipt.accepted&&receipt.facts_preserved);assert.ok(a.graph.nodes.length<base.graph.nodes.length);assert.ok(a.prepared.quality.native_height_px<base.prepared.quality.native_height_px);
 assert.equal(a.svg,R.render(a.document.ir,a.document.state).svg);assert.equal(JSON.stringify(d.ir),before);
 assert.equal(R.render(d.ir,{...d.state,paperRolePaths:[]}).svg,R.render(d.ir,{...d.state,paperRolePaths:[],paperRoleSourceFrames:false}).svg);
 assert.equal(a.document.publication.role_frontier.path_requests[0].operand_check.status,'fulfilled');
});
test('manual geometry and source-frame view bypass automatic attachment',()=>{
 const d=source();for(const extra of [{paperFrameView:'source'},{offsets:{[d.ir.nodes[0].id]:{x:4,y:7}}},{paperRoleSourceFrames:false}]){
  const r=R.render(d.ir,{...d.state,...extra});assert.ok(!r.prepared.routing.role_source_frame_refinement);assert.ok(!r.graph.frame_ownership?.some(r=>r.kind==='role-source'));
 }
});

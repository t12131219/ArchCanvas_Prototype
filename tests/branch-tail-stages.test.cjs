'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/contract-stages.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles'};
const read=name=>JSON.parse(fs.readFileSync('verification/branch-tail-stages/current/'+name+'.json'));
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null}, {id:'x',kind:'interface',parent:'root'},
  {id:'pre',kind:'compute',operator:'sin',parent:'root'}, {id:'tail',kind:'compute',operator:'cos',parent:'root'},
  {id:'add',kind:'compute',operator:'add',parent:'root'},
  {id:'norm',kind:'compute',operator:'normalization',framework_type:'torch.nn.LayerNorm',parent:'root'},
  {id:'out',kind:'interface',parent:'root'}];
 const edges=[['x','pre','a'],['pre','tail','a'],['x','add','0'],['tail','add','2'],['add','norm','a'],['norm','out','a']]
  .map(([source,target,target_port],i)=>({id:'e'+i,source,target,source_port:'out',target_port,kind:'data'}));
 const semantic_contracts=[{id:'cert',rule:'residual-postnorm',rule_version:'source-contracts/1',node:'norm',members:['pre','tail','add','norm'],
  roles:{skip:'x',skip_slot:'out',branch:'tail',branch_slot:'out',branch_path:['pre','tail'],add:'add',normalization:'norm',output:'norm',order:'postnorm',normalization_type:'torch.nn.LayerNorm'},scope:'test source only'}];
 return {nodes,edges,semantic_contracts};
}
const compile=(ir,extra={})=>F.compile({ir,plan:ir,...extra});
function accounting(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('exclusive unary tail composition preserves exact input, skip, internal edges, resources and proof ownership',()=>{
 const ir=fixture();ir.nodes.push({id:'weight',kind:'parameter',parent:'root'});ir.edges.push({id:'resource',source:'weight',target:'tail',kind:'parameter-read',source_port:'out',target_port:'weight'});
 const before=JSON.stringify(ir),r=compile(ir),s=r.rows[0];assert.equal(s.branch_tail.label,'cos');
 assert.deepEqual(s.canonical_members,['tail','add','norm']);assert.equal(r.plan.nodes.find(n=>n.id==='pre').parent,'root');
 assert.deepEqual(s.internal_edges,['e3','e4']);assert.ok(s.cuts.some(e=>e.id==='resource'));
 assert.deepEqual(s.branch_tail.input,{edge:'e1',node:'pre',slot:'out',target:'tail',target_port:'a'});
 assert.deepEqual(s.operands.map(o=>[o.role,o.node,o.target_port]),[['skip','x','0'],['branch','tail','2']]);
 assert.deepEqual(r.plan.semantic_contracts,ir.semantic_contracts);assert.equal(JSON.stringify(ir),before);
 assert.equal(compile(ir,{branchTails:false}).rows[0].branch_tail,undefined);
 const source=structuredClone(ir);source.nodes.find(n=>n.id==='tail').parent='different-source-scope';
 assert.ok(F.compile({ir:source,plan:ir}).rows.every(s=>!s.branch_tail));
});
test('escape, extra inputs, effects, state, identity, runtime-only and uncertified whole branches keep the tail exposed',()=>{
 for(const change of [
  ir=>ir.edges.push({id:'escape',source:'tail',target:'out',kind:'data'}),
  ir=>ir.edges.push({id:'operand',source:'x',target:'tail',kind:'data',target_port:'b'}),
  ir=>ir.edges[1].condition={branch:'flag'}, ir=>ir.edges[1].kind='state-write',
  ir=>ir.nodes.find(n=>n.id==='tail').mutable=true,
  ir=>ir.nodes.find(n=>n.id==='tail').identity_display={},
  ir=>ir.nodes.find(n=>n.id==='tail').observed_calls={},
  ir=>ir.nodes.find(n=>n.id==='tail').evidence_status='runtime-only',
  ir=>ir.nodes.find(n=>n.id==='tail').runtime_evidence=[{}],
  ir=>ir.nodes.find(n=>n.id==='tail').kind='opaque',
  ir=>ir.semantic_contracts[0].roles.branch_path=['tail'],
  ir=>ir.edges[1].source='x',ir=>ir.edges[3].source_port='1',
  ir=>ir.semantic_contracts[0].roles.branch_slot='1'
 ]){const ir=fixture();change(ir);assert.ok(compile(ir).rows.every(s=>!s.branch_tail));}
});
test('only exclusive whole-value output aliases may accompany a tail',()=>{
 const ir=fixture();ir.nodes.push({id:'alias',kind:'value-alias',parent:'root'});
 ir.edges[3].source='alias';ir.edges.push({id:'alias-edge',source:'tail',target:'alias',kind:'alias',source_port:'out',target_port:'value'});
 const s=compile(ir).rows[0];assert.deepEqual(s.branch_tail.aliases,['alias']);assert.ok(s.canonical_members.includes('alias'));
 for(const attrs of [{slot:'1'},{condition:{branch:'if'}},{mutable:true},{observed_calls:{}}]){
  const changed=structuredClone(ir);Object.assign(changed.nodes.at(-1),attrs);assert.ok(compile(changed).rows.every(s=>!s.branch_tail));}
 ir.edges.push({id:'alias-escape',source:'alias',target:'out',kind:'data'});assert.ok(compile(ir).rows.every(s=>!s.branch_tail));
});
test('opened count partitions can be reorganized within one source scope, with exact repaired membership and cuts',()=>{
 const ir=fixture();ir.nodes.push(...['a','b'].map(id=>({id,parent:'root',kind:'composite',presentation_only:true,semantic_type:'structural-region',canonical_members:id==='a'?['tail']:['add','norm'],finding:id})));
 ir.nodes.find(n=>n.id==='tail').parent='a';for(const n of ir.nodes.filter(n=>['add','norm'].includes(n.id)))n.parent='b';
 // The immutable source parent is separate from the presentation partitions.
 const source=structuredClone(ir);source.nodes=source.nodes.filter(n=>!['a','b'].includes(n.id));for(const n of source.nodes)n.parent=n.id==='root'?null:'root';
 ir.findings=[{id:'a',members:['tail'],roles:{}},{id:'b',members:['add','norm'],roles:{}}];
 const run=open=>F.compile({ir:source,plan:ir,open:new Set(open)});
 for(const open of [[],['root','a'],['root','b']])assert.ok(run(open).rows.every(s=>!s.branch_tail));
 const before=JSON.stringify(ir),r=run(['root','a','b']),s=r.rows[0];assert.equal(s.branch_tail.placement.source_parent,'root');
 assert.equal(r.plan.nodes.find(n=>n.id===s.node).parent,'root');assert.equal(r.partitions.length,2);
 for(const p of r.partitions){assert.deepEqual(p.canonical_members,[]);assert.deepEqual(p.cuts,[]);assert.deepEqual(r.plan.findings.find(f=>f.id===p.node).members,[]);}
 assert.equal(JSON.stringify(ir),before);
 for(const attrs of [{semantic_type:'conditional-collection'},{semantic_type:'source-function',presentation_only:false},{semantic_contracts:['other']}]){
  const plan=structuredClone(ir);Object.assign(plan.nodes.find(n=>n.id==='a'),attrs);
  assert.ok(F.compile({ir:source,plan,open:new Set(['root','a','b'])}).rows.every(s=>!s.branch_tail));
 }
});
test('unfamiliar source composition, independent damaged paths and protected branch cases retain local facts',()=>{
 const expected={UnaryWeave:1,ReusedWeave:0,InterruptedWeave:1,ConditionalWeave:1,ImageWeave:0,StatefulWeave:0,MultipleInputWeave:0,WholeBranchWeave:0};
 for(const [name,count]of Object.entries(expected)){
  const ir=read(name),before=JSON.stringify(ir),g=E.project(ir,{...state,view:'publication'});
  assert.equal(g.publication.contract_stages.rows.filter(s=>s.branch_tail).length,count,name);accounting(ir,g);assert.equal(JSON.stringify(ir),before);
  if(name==='InterruptedWeave')assert.ok(g.nodes.some(n=>n.kind==='opaque'));
  if(name==='ConditionalWeave')assert.ok(g.nodes.some(n=>n.condition||n.kind==='control'));
 }
});
test('a selected semantic summary opens to the actual operation, aliases, add and norm, and saves and refolds deterministically',()=>{
 const ir=read('UnaryWeave'),before=JSON.stringify(ir),folded=R.render(ir,state),s=folded.graph.publication.contract_stages.rows.find(s=>s.branch_tail);
 assert.ok(folded.svg.includes('tanh'));assert.ok(!folded.graph.positions.has(s.branch_tail.node));
 const manual={...state,paperAuto:false,open:[...folded.graph.publication.open,s.node]},opened=R.render(ir,manual);
 assert.ok(s.canonical_members.filter(id=>ir.nodes.find(n=>n.id===id).kind==='compute').every(id=>opened.graph.positions.has(id)));
 const saved=JSON.parse(JSON.stringify(opened.document));assert.equal(R.render(saved.ir,saved.state).svg,opened.svg);
 assert.equal(R.render(ir,{...manual,open:folded.graph.publication.open}).svg,folded.svg);accounting(ir,opened.graph);assert.equal(JSON.stringify(ir),before);
});
test('renaming and print or other presets do not introduce family-specific tail rules',()=>{
 const ir=fixture(),r=compile(ir);for(const n of ir.nodes){n.label='Foreign';n.source_class='Other';}
 assert.deepEqual(compile(ir).rows,r.rows);
 const source=read('UnaryWeave');for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperContractStages:false}])
  assert.equal(E.project(source,{...state,...extra,view:'publication'}).publication.contract_stages,undefined);
});

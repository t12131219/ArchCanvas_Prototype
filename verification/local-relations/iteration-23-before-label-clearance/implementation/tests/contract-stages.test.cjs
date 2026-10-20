'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/contract-stages.js'),R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles'};
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null},{id:'x',kind:'interface',parent:'root'},
 {id:'branch',kind:'compute',operator:'relu',parent:'root'},{id:'add',kind:'compute',operator:'add',parent:'root'},
 {id:'norm',kind:'compute',operator:'normalization',framework_type:'torch.nn.LayerNorm',parent:'root'},
 {id:'out',kind:'interface',parent:'root'}];
 const edges=[['x','branch','arg:0'],['x','add','0'],['branch','add','2'],['add','norm','arg:0'],['norm','out','in']].map(([source,target,target_port],i)=>({id:'e'+i,source,target,source_port:'out',target_port,kind:'data'}));
 const semantic_contracts=[{id:'certificate',rule:'residual-postnorm',rule_version:'source-contracts/1',node:'norm',members:['branch','add','norm'],
  roles:{skip:'x',skip_slot:'out',branch:'branch',branch_slot:'out',add:'add',normalization:'norm',output:'norm',order:'postnorm',normalization_type:'torch.nn.LayerNorm'},scope:'fixture only'}];
 return {nodes,edges,semantic_contracts};
}
const compile=ir=>F.compile({ir,plan:ir});
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
const read=n=>JSON.parse(fs.readFileSync('verification/contract-stages/current/'+n+'.json'));
test('a certified role subregion groups only add and normalization, retaining proof ownership, exact cuts and operands',()=>{
 const ir=fixture(),before=JSON.stringify(ir),r=compile(ir),row=r.rows[0];assert.equal(r.rows.length,1);
 assert.deepEqual(row.canonical_members,['add','norm']);assert.deepEqual(row.cuts,ir.edges.filter(e=>['e1','e2','e4'].includes(e.id)));
 assert.deepEqual(row.operands.map(e=>[e.edge,e.role,e.target_port]),[['e1','skip','0'],['e2','branch','2']]);
 assert.equal(r.plan.nodes.find(n=>n.id==='branch').parent,'root');assert.equal(r.plan.nodes.at(-1).semantic_contracts,undefined);
 assert.deepEqual(r.plan.semantic_contracts,ir.semantic_contracts);assert.equal(JSON.stringify(ir),before);
 for(const n of ir.nodes){n.label='Transformer';n.source_class='Arbitrary';}assert.deepEqual(compile(ir).rows,r.rows);
});
test('escaping sums, non-out result slots, duplicated operands and stale role bindings cannot form a stage',()=>{
 for(const change of [ir=>ir.edges.push({id:'escape',source:'add',target:'out',kind:'data'}),ir=>ir.edges[3].source_port='1',
  ir=>ir.edges[2].target_port='0',ir=>ir.edges[2].source='x',ir=>ir.semantic_contracts[0].roles.skip_slot='1',
  ir=>ir.semantic_contracts[0].roles.output='add',ir=>ir.semantic_contracts[0].rule_version='future-contracts/2']){
  const ir=fixture();change(ir);assert.equal(compile(ir).rows.length,0);
 }
 const ir=fixture();ir.semantic_contracts.push({...ir.semantic_contracts[0],id:'duplicate'});assert.equal(compile(ir).rows.length,1);assert.equal(compile(ir).rejected[0].reason,'overlapping-stage-roles');
});
test('unknown, effects, identity, observations, source scope and condition boundaries prevent folding',()=>{
 for(const attrs of [{kind:'opaque'},{mutable:true},{condition:{outcome:true}},{identity_display:{}},{observed_calls:{}},{runtime_evidence:[{}]},{evidence_status:'runtime-only'}]){
  const ir=fixture();Object.assign(ir.nodes.find(n=>n.id==='norm'),attrs);assert.equal(compile(ir).rows.length,0);
 }
 for(const change of [ir=>ir.nodes[4].parent=null,ir=>ir.nodes[0].condition={branch:'if'},ir=>ir.edges[3].condition={branch:'if'},ir=>ir.edges[3].kind='state-write',ir=>ir.semantic_contracts=[]]){
  const ir=fixture();change(ir);assert.equal(compile(ir).rows.length,0);
 }
});
for(const name of ['TailMosaic','EscapingTail','InterruptedTail','ConditionalTail'])test(name+' keeps independent certified tails composable and reversibly expandable',()=>{
 const ir=read(name),before=JSON.stringify(ir),r=R.render(ir,state),rows=r.graph.publication.contract_stages.rows;
 assert.equal(rows.length,name==='TailMosaic'?2:1);assert.ok(rows.every(r=>r.status==='summary'));assert.equal(JSON.stringify(ir),before);accounted(ir,r.graph);assert.deepEqual(r.prepared.quality.issues,[]);
 for(const row of rows){
  assert.ok(r.graph.nodes.find(n=>n.id===row.node).paper.title==='Add & Norm');
  const opened=R.render(ir,{...state,paperAuto:false,open:[...r.graph.publication.open,row.node]});
  assert.ok(opened.graph.nodes.length>r.graph.nodes.length);const receipt=opened.graph.publication.contract_stages.rows.find(r=>r.node===row.node);
  assert.equal(receipt.status,'expanded');assert.ok(receipt.detailed_operations_exposed);assert.deepEqual(receipt.operands,row.operands);accounted(ir,opened.graph);
  assert.deepEqual(opened.prepared.quality.issues,[]);
  assert.ok(!r.graph.expression_coverage.some(g=>row.canonical_members.some(id=>'goal:node:'+id===g.goal)&&g.status==='fulfilled'));
  const saved=JSON.parse(JSON.stringify(opened.document));assert.equal(R.render(saved.ir,saved.state).svg,opened.svg);
 }
 if(name==='ConditionalTail')assert.ok(r.graph.publication.contract_stages.rejected.some(r=>r.reason==='protected-enclosing-boundary'));
 if(name==='InterruptedTail')assert.ok(r.graph.nodes.some(n=>n.kind==='opaque'));
 const saved=JSON.parse(JSON.stringify(r.document));assert.equal(R.render(saved.ir,saved.state).svg,r.svg);
});
test('convolutional post-normalization uses the same recipe while prenorm and print retain their existing expression',()=>{
 const image=JSON.parse(fs.readFileSync('verification/semantic-design/current/after/ImageResidual.json')),
 vector=JSON.parse(fs.readFileSync('verification/semantic-design/current/after/VectorResidual.json'));
 const r=R.render(image,state);assert.equal(r.graph.publication.contract_stages.rows.length,1);assert.ok(r.svg.includes('BatchNorm2d'));
 assert.equal(R.render(vector,state).graph.publication.contract_stages.rows.length,0);
 for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperContractStages:false}])assert.equal(R.render(image,{...state,...extra}).graph.publication.contract_stages,undefined);
 const renamed=structuredClone(image);for(const n of renamed.nodes){n.label='ForeignStage';n.source_class='DifferentModel';}
 assert.deepEqual(R.render(renamed,state).graph.publication.contract_stages,r.graph.publication.contract_stages);
});

test('a folded stage output remains the exact skip source for the next certified stage',()=>{
 const ir=read('TailChain'),r=R.render(ir,state),stages=r.graph.publication.contract_stages.rows;
 assert.equal(stages.length,2);assert.ok(stages.every(s=>s.status==='summary'));
 const chained=stages.find(s=>stages.some(other=>other.roles.normalization===s.roles.skip));assert.ok(chained);
 const edge=r.graph.edges.find(e=>e.design_route?.certificate===chained.certificate&&e.design_route.kind==='bypass');assert.ok(edge);
 const source=stages.find(s=>s.roles.normalization===chained.roles.skip);
 assert.equal(edge.source,source.node);assert.equal(edge.target,chained.node);
 assert.equal(edge.resolved_source,source.roles.normalization);assert.equal(edge.canonical_target,chained.roles.add);
 for(const stage of stages){const c=r.graph.constraint_receipts.find(c=>c.id===stage.bypass_constraint);assert.ok(c);assert.equal(stage.bypass,undefined);}
 accounted(ir,r.graph);assert.deepEqual(r.prepared.quality.issues,[]);
});


test('presentation stages do not consume another region’s automatic evidence-detail budget',()=>{
 const E=require('../semantic_studio/semantic-engine.js');
 for(const name of ['ConditionalTail','TailMosaic','TailChain','InterruptedTail'])for(const paperBudget of [4,12,20,28]){
  const ir=read(name),before=JSON.stringify(ir),options={...state,view:'publication',paperBudget};
  const staged=E.project(ir,options),plain=E.project(ir,{...options,paperContractStages:false});
  assert.deepEqual(staged.publication.open,plain.publication.open,name+' budget '+paperBudget);
  const hidden=new Set(staged.publication.contract_stages.rows.filter(s=>s.status==='summary').flatMap(s=>s.canonical_members));
  for(const n of plain.nodes)if(!hidden.has(n.id))assert.ok(staged.nodes.some(m=>m.id===n.id),'independent node '+n.id);
  accounted(ir,staged);assert.equal(JSON.stringify(ir),before);
 }
});

test('conditional interiors keep their original detail and final certified bypass after an independent stage forms',()=>{
 const ir=read('ConditionalTail'),staged=R.render(ir,state),plain=R.render(ir,{...state,paperContractStages:false});
 const conditional=ir.nodes.filter(n=>n.condition);assert.ok(conditional.length);
 for(const n of plain.graph.nodes.filter(n=>conditional.some(c=>c.id===n.id)))assert.ok(staged.graph.nodes.some(m=>m.id===n.id));
 const bypasses=r=>r.graph.constraint_receipts.filter(c=>c.status==='applied'&&c.id.includes('bypass')).map(c=>c.id).sort();
 assert.ok(bypasses(plain).length);assert.deepEqual(bypasses(staged),bypasses(plain));
 assert.deepEqual(staged.prepared.quality.issues,[]);
});

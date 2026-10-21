'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),C=require('../semantic_studio/relation-constraints.js'),R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js');
function fixture(){
 const nodes=[{id:'root',parent:null,kind:'composite',label:'root'},...['input','context'].map(id=>({id,parent:'root',kind:'interface',role:'input',label:id})),{id:'attribute',parent:'root',kind:'state',label:'attribute'},
 ...['a0','b0','c0','a1','b1','c1','join'].map(id=>({id,parent:'root',kind:'compute',label:id,operator:'foreign'}))];
 const pairs=[['input','a0'],['input','b0'],['context','c0'],['a0','a1'],['b0','b1'],['c0','c1'],['a1','join'],['b1','join'],['c1','join'],['attribute','join']];
 const edges=pairs.map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'operand:'+i,kind:'data',evidence:'source-dependency'}));
 return {nodes,edges,design_constraints:[{kind:'parallel-projections',parent:'root',certificate:'fixture',members:['a0','b0','c0']}]};
}
function draw(ir=fixture(),extra={}){return E.project(ir,{view:'source',mode:'source',open:['root'],...extra},ir,{layout:{branchColumns:true,rankColumns:3,gapX:28,gapY:28,nodeSize:n=>({w:n.id.endsWith('0')?140:180,h:56})}});}
const routes=g=>g.edges.map(e=>({...e,route:L.route(e,g.positions)}));
function accounted(ir,g){assert.deepEqual(Object.values(g.edge_accounting).flat().sort(),ir.edges.map(e=>e.id).sort());assert.equal(g.edges.length,ir.edges.length);}
function expandedFixture(){
 const ir=fixture();
 for(const id of ['a1','b1','c1','join']){
  Object.assign(ir.nodes.find(n=>n.id===id),{kind:'composite',semantic_type:'source-function'});
  ir.nodes.push({id:id+'-in',parent:id,kind:'compute',operator:'foreign'},
   {id:id+'-out',parent:id,kind:'compute',operator:'foreign'});
  for(const e of ir.edges){if(e.source===id)e.source=id+'-out';if(e.target===id)e.target=id+'-in';}
  ir.edges.push({id:'inside-'+id,source:id+'-in',target:id+'-out',source_port:'out',target_port:'0',kind:'data',evidence:'source-dependency'});
 }
 return ir;
}
test('expanded source containers retain path columns and their exact internal dependencies',()=>{
 const ir=expandedFixture(),before=JSON.stringify(ir),open=['root','a1','b1','c1','join'],g=draw(ir,{open});
 const group=g.positions.context.branchColumns.find(r=>r.sink==='join');assert.ok(group);assert.equal(group.chains.length,3);
 assert.ok(L.branchGeometry(group,g.positions));assert.ok(g.positions.get('join').expanded);
 for(const id of ['a1','b1','c1']){
  assert.ok(g.positions.get(id).expanded);assert.ok(g.positions.has(id+'-in')&&g.positions.has(id+'-out'));
  assert.equal(ir.nodes.find(n=>n.id===id+'-in').parent,id);
 }
 for(const e of g.edges){const original=ir.edges.find(x=>x.id===e.id);assert.deepEqual([e.source,e.target,e.source_port,e.target_port],
  [original.source,original.target,original.source_port,original.target_port]);}
 accounted(ir,g);assert.equal(JSON.stringify(ir),before);assert.ok(routes(g).every(e=>e.route.ok));
});
test('an expanded guarded path stays separate while the other expanded paths align',()=>{
 for(const guard of [{condition:{test:'flag'}},{mutable:true},{identity_display:{object:'shared'}}]){
  const ir=expandedFixture();Object.assign(ir.nodes.find(n=>n.id==='b1'),guard);
  const g=draw(ir,{open:['root','a1','b1','c1','join']}),group=g.positions.context.branchColumns.find(r=>r.sink==='join');
  assert.ok(group);assert.deepEqual(group.chains.map(c=>c.nodes),[['a0','a1'],['c0','c1']]);accounted(ir,g);
 }
});
test('independent paths use stable columns, corresponding rows and exact operand bindings',()=>{
 const ir=fixture(),before=JSON.stringify(ir),g=draw(ir),group=g.positions.context.branchColumns[0];assert.ok(group);assert.equal(group.chains.length,3);assert.ok(L.branchGeometry(group,g.positions));
 assert.deepEqual(group.chains.map(c=>c.nodes),[['a0','a1'],['b0','b1'],['c0','c1']]);assert.equal(JSON.stringify(ir),before);accounted(ir,g);
 for(const e of g.edges)assert.deepEqual([e.id,e.source_port,e.target_port],[e.id,ir.edges.find(m=>m.id===e.id).source_port,ir.edges.find(m=>m.id===e.id).target_port]);
 const rr=routes(g);assert.ok(rr.every(e=>e.route.ok));const receipt=g.constraint_receipts.find(c=>c.type==='parallel-projections');assert.equal(receipt.status,'applied');E.auditConstraintRoutes(g,rr);assert.equal(receipt.route_verified,true);
});
test('branch columns depend on paths, not labels, operators or spelling of operand roles',()=>{
 const ir=fixture(),a=draw(ir).positions.context.branchColumns;for(const n of ir.nodes){n.label='renamed';n.operator='other';}for(const e of ir.edges)e.target_port='unfamiliar:'+e.id;
 const b=draw(ir).positions.context.branchColumns;assert.deepEqual(a.map(g=>g.chains.map(c=>c.nodes)),b.map(g=>g.chains.map(c=>c.nodes)));
});
test('conditional, unknown, mutable and identity boundaries stop only affected paths',()=>{
 for(const mutate of [ir=>ir.nodes.find(n=>n.id==='b0').kind='opaque',ir=>ir.nodes.find(n=>n.id==='b0').mutable=true,ir=>ir.nodes.find(n=>n.id==='b0').identity_display={object:'shared'},ir=>ir.edges.find(e=>e.id==='e4').condition={branch:'if',outcome:true}]){
  const ir=fixture();mutate(ir);const g=draw(ir),group=g.positions.context.branchColumns[0];assert.ok(group);assert.deepEqual(group.chains.map(c=>c.nodes),[['a0','a1'],['c0','c1']]);accounted(ir,g);
  assert.equal(g.constraint_receipts.find(c=>c.type==='parallel-projections').status,'deferred');
 }
});
test('escaping uses, feedback and unequal chain levels cannot claim complete correspondence',()=>{
 const ir=fixture();ir.nodes.push({id:'escape',parent:'root',kind:'interface'});ir.edges.push({id:'escape-edge',source:'b0',target:'escape',kind:'data'});assert.ok(draw(ir).positions.context.branchColumns.every(g=>g.chains.every(c=>!c.nodes.includes('b0'))));
 const cyclic=fixture();cyclic.edges.push({id:'feedback',source:'join',target:'a0',kind:'data'});assert.deepEqual(draw(cyclic).positions.context.branchColumns,[]);
 const shorter=fixture();shorter.edges.find(e=>e.id==='e7').source='b0';shorter.edges=shorter.edges.filter(e=>e.id!=='e4');assert.ok(draw(shorter).positions.context.branchColumns.every(g=>g.chains.every(c=>!c.nodes.includes('b0'))));
});
test('manual movement invalidates geometry receipts rather than claiming realized columns',()=>{
 const ir=fixture(),g=draw(ir,{offsets:{a1:{x:80,y:0}}});const group=g.positions.context.branchColumns[0];assert.ok(group);assert.equal(L.branchGeometry(group,g.positions),false);assert.equal(g.constraint_receipts.find(c=>c.type==='parallel-projections').status,'deferred');
 const h=draw();const receipt=h.constraint_receipts.find(c=>c.type==='parallel-projections');assert.equal(receipt.status,'applied');const rr=routes(h);rr.find(e=>e.id==='e3').route.ok=false;E.auditConstraintRoutes(h,rr);assert.equal(receipt.status,'conflict');
});
test('a separate feedback component keeps its cycle flags beside aligned paths',()=>{
 const ir=fixture();ir.nodes.push(...['feedback-a','feedback-b'].map(id=>({id,parent:'root',kind:'compute'})));
 ir.edges.push({id:'feedback-ab',source:'feedback-a',target:'feedback-b',kind:'data'},{id:'feedback-ba',source:'feedback-b',target:'feedback-a',kind:'data'});
 const g=draw(ir);assert.equal(g.positions.context.branchColumns.length,1);
 for(const id of ['feedback-a','feedback-b'])assert.equal(g.positions.get(id).cyclic,true);
 accounted(ir,g);
});
test('a wider fan-in beyond the column budget keeps ordinary topology',()=>{
 const ir=fixture();for(let i=0;i<4;i++){const a='extra'+i+'a',b='extra'+i+'b';ir.nodes.push({id:a,parent:'root',kind:'compute'},{id:b,parent:'root',kind:'compute'});ir.edges.push({id:a,source:a,target:b,kind:'data'},{id:b,source:b,target:'join',kind:'data'});}assert.deepEqual(draw(ir).positions.context.branchColumns,[]);
});
for(const name of ['WovenInputs','InterruptedPaths'])test(name+' composes without any family certificate and saves deterministically',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/branch-columns/current/'+name+'.json')),before=JSON.stringify(ir);assert.equal((ir.semantic_contracts||[]).length,0);
 const state={paperMedium:'canvas',paperGranularity:'roles'},auto=R.render(ir,state);
 assert.equal(auto.prepared.routing.branch_refinement.accepted,name==='WovenInputs');
 const r=name==='WovenInputs'?auto:R.render(ir,{...state,paperBranchColumns:true});assert.ok(r.document.layout.branch_columns.every(g=>g.status==='realized'));assert.deepEqual(r.prepared.quality.issues,[]);
 assert.equal(JSON.stringify(ir),before);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 if(name==='WovenInputs'){assert.equal(r.document.layout.branch_columns[0].chains.length,3);assert.ok(r.graph.frame_ownership.some(f=>f.semantic_type==='dependency-band'));}
 else{
  const group=r.document.layout.branch_columns[0],opaque=ir.nodes.find(n=>n.kind==='opaque');
  // Its expanded source wrapper may occupy a column; the unresolved call
  // remains a visible boundary with its own exact incoming and outgoing uses.
  assert.equal(group.chains.length,3);assert.ok(group.chains.some(c=>c.nodes.includes(opaque.parent)));
  assert.ok(r.graph.positions.has(opaque.id));assert.ok(r.document.layout.branch_columns.every(g=>g.chains.every(c=>!c.nodes.includes(opaque.id))));
  for(const e of ir.edges.filter(e=>e.source===opaque.id||e.target===opaque.id)){
   const routed=r.prepared.routes.find(p=>p.id===e.id||p.originals?.includes(e.id));assert.ok(routed?.route.ok);
  }
  const goal=r.graph.expression_goals.goals.find(g=>g.kind==='unknown-boundary'&&g.focus_node===opaque.id);assert.ok(goal);
  assert.equal(D.coverage(ir,{goals:[goal]},[{id:'main',result:r}])[0].status,'fulfilled');
 }
 const output=Object.values(r.graph.edge_accounting).flat();assert.equal(output.length,new Set(output).size);assert.deepEqual(output.sort(),ir.edges.map(e=>e.id).sort());
});

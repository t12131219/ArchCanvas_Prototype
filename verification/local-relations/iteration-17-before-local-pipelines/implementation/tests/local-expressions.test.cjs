'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../semantic_studio/local-expressions.js'),R=require('../semantic_studio/publication-renderer.js');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/local-relations/current',name+'.json')));
const state={paperMedium:'canvas',paperGranularity:'roles'},requests=r=>r.graph.publication.local_expressions.requests;
const render=name=>R.render(load(name),state);
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(g[key]).flat();assert.equal(all.length,new Set(all).size);assert.deepEqual(all.sort(),items.map(n=>n.id).sort());}}

test('the mixed frontier exposes the gate fragment instead of spending all detail on surrounding known computations',()=>{
 const ir=load('MixedCircuit'),before=JSON.stringify(ir),r=R.render(ir,state),gate=requests(r).find(r=>r.type==='gated-product');
 assert.equal(gate.status,'fulfilled',gate.reason);assert.ok(gate.targets.every(t=>r.graph.positions.has(t.node)));
 for(const b of gate.bindings){assert.ok(r.prepared.routes.some(e=>b.visible_edges.includes(e.id)&&e.route.ok));assert.match(r.svg,new RegExp('>'+b.role+'<'));}
 for(const type of ['state-interface','unknown-boundary'])assert.equal(requests(r).find(r=>r.type===type).status,'fulfilled');
 assert.equal(r.graph.positions.get(r.graph.nodes.find(n=>n.semantic_type==='scaled-attention-like').id).expanded,false);
 assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,r.graph);assert.equal(JSON.stringify(ir),before);
});
test('an unfamiliar composition preserves state slots, selection outputs and conditional scope',()=>{
 const r=render('ForeignComposition'),rs=requests(r);
 for(const type of ['gated-product','state-interface','selection','conditional-join'])assert.equal(rs.find(r=>r.type===type).status,'fulfilled',type);
 const statePorts=rs.find(r=>r.type==='state-interface').bindings;assert.equal(statePorts.find(b=>b.role==='sequence-output').source_port,'0');assert.equal(statePorts.find(b=>b.role==='final-state').source_port,'1');
 const select=rs.find(r=>r.type==='selection').bindings;assert.ok(select.some(b=>b.role==='selected-values'&&b.source_port==='0'));assert.ok(select.some(b=>b.role==='selection-indices'&&b.source_port==='1'));
 assert.ok(r.graph.nodes.filter(n=>n.condition).every(n=>!r.graph.positions.get(n.id).expanded));
 assert.ok(!rs.some(r=>['expert-routing','complete-cell','state-update'].includes(r.type)));accounted(r.document.ir,r.graph);
});
test('destroying one gate changes only supported requests; the unknown boundary survives',()=>{
 const ir=load('UnknownFusion'),sigmoid=ir.nodes.find(n=>n.function_target==='torch.sigmoid');assert.ok(sigmoid);sigmoid.function_target='torch.relu';
 const r=R.render(ir,state);assert.equal(requests(r).filter(r=>r.type==='gated-product').length,0);assert.equal(requests(r).find(r=>r.type==='unknown-boundary').status,'fulfilled');
 assert.ok(r.graph.nodes.some(n=>n.kind==='opaque'));assert.ok(!r.graph.architecture.semantic_contracts.some(c=>c.rule==='lstm'));accounted(ir,r.graph);
});
test('renaming labels does not change expression paths, evidence or budget scopes',()=>{
 const ir=load('MixedCircuit'),a=F.compile({plan:require('../semantic_studio/publication.js').plan(ir),focus:ir.nodes.find(n=>!n.parent).id});
 const renamed=JSON.parse(JSON.stringify(ir));for(const n of renamed.nodes){n.label='unknown architecture';n.source_class='Transformer';}
 const b=F.compile({plan:require('../semantic_studio/publication.js').plan(renamed),focus:renamed.nodes.find(n=>!n.parent).id});
 assert.deepEqual([...a.open],[...b.open]);assert.deepEqual([...a.scopes],[...b.scopes]);assert.deepEqual(a.requests,b.requests);
});
test('local requests never unwrap certified, conditional, mutable or unresolved iteration boundaries',()=>{
 for(const [extra,stop]of [[{semantic_contracts:['cert']},'certificate'],[{condition:{outcome:true}},'condition'],[{mutable:true},'effects'],[{semantic_type:'loop-template'},'iteration-or-repeat']]){
  const plan={nodes:[{id:'root',kind:'composite'}, {id:'guard',kind:'composite',parent:'root',...extra},{id:'signal',kind:'compute',parent:'guard'}],semantic_contracts:extra.semantic_contracts?[{id:'cert',node:'guard'}]:[],relation_graph:{relations:[{id:'r',node:'signal',type:'unknown-boundary',members:['signal'],source_scope:'guard',bindings:[],properties:{},not_asserted:['purity']}]}};
  const f=F.compile({plan,focus:'root'});assert.equal(f.requests[0].targets[0].stop,stop);assert.equal(f.requests[0].targets[0].frontier_node,'guard');assert.ok(!f.open.has('guard'));assert.equal(f.scopes.size,0);
 }
});
test('budget deferral is explicit and a manual open state remains deterministic after save and reopen',()=>{
 const ir=load('MixedCircuit'),a=R.render(ir,{...state,paperBudget:4}),gate=requests(a).find(r=>r.type==='gated-product');assert.equal(gate.status,'deferred');assert.ok(gate.targets.some(t=>t.status!=='exposed'));
 const b=R.render(ir,state),saved=JSON.parse(JSON.stringify(b.document));assert.equal(R.render(saved.ir,saved.state).svg,b.svg);
 const c=R.render(saved.ir,{...saved.state,paperAuto:false,open:b.graph.publication.open}),manual=JSON.parse(JSON.stringify(c.document));assert.equal(R.render(manual.ir,manual.state).svg,c.svg);assert.equal(requests(c).find(r=>r.type==='gated-product').status,'fulfilled');
 accounted(ir,c.graph);
});
test('a stopped unknown subcomputation keeps neighboring local evidence without claiming a full module',()=>{
 const ir=load('InterruptedMixer'),r=R.render(ir,state);assert.equal(requests(r).find(r=>r.type==='unknown-boundary').status,'fulfilled');
 assert.ok(!(ir.semantic_contracts||[]).some(c=>c.rule==='multihead-attention'));assert.ok(r.graph.architecture.relation_graph.relations.some(r=>r.type==='axis-transform'));accounted(ir,r.graph);
});
test('unrealized final routes and hidden identity cannot count as fulfilled expressions',()=>{
 const receipt={requests:[{status:'ready',relation:'test',bindings:[{visible_edges:['edge']}]}]},g={expression_coverage:[{goal:'goal:test',status:'unfulfilled'}]},prepared={labeling:{suppressed:[]}};
 F.verify(receipt,g,prepared);assert.equal(receipt.requests[0].status,'deferred');assert.equal(receipt.requests[0].expression_check,'unfulfilled');
});
test('local budgets supplement requested paths without expanding unrelated helpers',()=>{
 const plan={nodes:[{id:'root',kind:'composite'},{id:'scope',kind:'composite',parent:'root'},
  {id:'gate',kind:'composite',parent:'scope'},{id:'a',kind:'compute',parent:'gate'},{id:'b',kind:'compute',parent:'gate'},
  {id:'unrelated',kind:'composite',parent:'root'},{id:'hidden',kind:'compute',parent:'unrelated'}]};
 const f={open:new Set(['scope','gate']),scopes:new Set(['scope'])},selected=F.select(f,{plan,focus:'root',open:['root'],budget:4,eligible:()=>true,budgetScopes:new Set()});
 assert.ok(selected.includes('scope')&&selected.includes('gate'));assert.ok(!selected.includes('unrelated'));
 const small=F.select(f,{plan,focus:'root',open:['root'],budget:1,eligible:()=>true,budgetScopes:new Set()});assert.ok(!small.includes('gate'));
});
test('overlapping gated products and their join compose, while a changed sum invalidates only the stronger relation',()=>{
 const ir=JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/semantic-design/current/after/GatedMixture.json'))),r=R.render(ir,state);
 assert.equal(requests(r).filter(r=>r.type==='gated-product'&&r.status==='fulfilled').length,2);
 const join=requests(r).find(r=>r.type==='gated-join');assert.equal(join.status,'fulfilled');
 const changed=JSON.parse(JSON.stringify(ir)),op=changed.nodes.find(n=>n.id===r.graph.architecture.relation_graph.relations.find(v=>v.id===join.relation).node);op.arguments={kwargs:{alpha:2}};
 const broken=R.render(changed,state);assert.equal(requests(broken).filter(r=>r.type==='gated-join').length,0);assert.equal(requests(broken).filter(r=>r.type==='gated-product').length,2);
 assert.equal(requests(broken).find(r=>r.type==='unknown-boundary').status,'fulfilled');accounted(changed,broken.graph);
});

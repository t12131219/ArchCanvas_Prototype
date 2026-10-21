'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
function scene(){
 const nodes=[{id:'root',parent:null,kind:'composite'},...['a','b','c','sink'].map(id=>({id,parent:'root',kind:'compute',evidence_status:'static-only'}))];
 const positions=new Map([{id:'root',x:0,y:0,w:860,h:700,header:70,expanded:true},...['a','b','c'].map((id,i)=>({id,x:60+i*240,y:id==='b'?260:160,w:120,h:60})),{id:'sink',x:300,y:420,w:120,h:60}].map(n=>[n.id,n]));
 const edges=['a','b','c'].map((source,i)=>({id:'e'+i,source,target:'sink',source_port:'out',target_port:'slot:'+i,kind:'data'}));
 positions.context={idx:{nodes:new Map(nodes.map(n=>[n.id,n])),children:new Map([['root',['a','b','c','sink']]])},edges,feedback:new Set(),contextLanes:[]};return {positions,edges};
}
test('unequal producer heights share one row while exact operands and other nodes stay fixed',()=>{
 const {positions,edges}=scene(),old=JSON.stringify([...positions]),before=JSON.stringify(edges),p=L.operandRows(positions);
 assert.equal(p.records.length,1);assert.deepEqual(p.records[0].nodes.map(n=>n.target_port),['slot:0','slot:1','slot:2']);
 for(const id of ['a','b','c'])assert.equal(p.positions.get(id).y,260);
 assert.equal(JSON.stringify([...positions]),old);assert.equal(JSON.stringify(edges),before);
 for(const id of ['root','sink'])assert.deepEqual(p.positions.get(id),positions.get(id));
});
test('operand order can correct a displaced column without identifying any operator family',()=>{
 const s=scene();s.positions.get('a').x=540;s.positions.get('c').x=60;
 const p=L.operandRows(s.positions,'operands');assert.deepEqual(p.records[0].nodes.map(n=>n.node),['a','b','c']);
 assert.equal(p.positions.get('a').x,60);assert.equal(p.positions.get('c').x,540);
 for(const n of s.positions.context.idx.nodes.values()){n.label='renamed';n.operator='foreign';}
 assert.deepEqual(L.operandRows(s.positions,'operands').records,p.records);
});
test('unknown, conditional, mutable, observed and shared identities stop only their own operand',()=>{
 for(const guard of [{kind:'opaque'},{condition:{branch:'if'}},{mutable:true},{identity_display:{object:'shared'}},{observed_calls:[{}]},{runtime_evidence:[{}]},{evidence_status:'runtime-only'},{iteration:{}}]){
  const s=scene();Object.assign(s.positions.context.idx.nodes.get('a'),guard);
  const p=L.operandRows(s.positions);assert.ok(p.records.length);assert.ok(p.records.every(r=>r.nodes.every(n=>n.node!=='a')));
 }
});
test('guarded ancestors, expanded sinks and cyclic dependencies retain their previous geometry',()=>{
 for(const alter of [s=>s.positions.context.idx.nodes.get('root').condition={test:'choose'},s=>s.positions.get('sink').expanded=true,s=>s.positions.get('sink').cyclic=true,s=>s.positions.context.idx.nodes.get('sink').kind='opaque']){
  const s=scene();alter(s);assert.deepEqual(L.operandRows(s.positions).records,[]);
 }
});
test('escaping uses, feedback, guarded bundles and repeated operand slots cannot assert row correspondence',()=>{
 for(const alter of [s=>s.edges.push({...s.edges[0],id:'escape',target:'root'}),s=>s.positions.context.feedback.add('e0'),s=>s.edges[0].condition={branch:'x'},s=>s.edges[0].bundle_members=[{kind:'control'}]]){
  const s=scene();alter(s);assert.ok(L.operandRows(s.positions).records.every(r=>r.nodes.every(n=>n.node!=='a')));
 }
 const s=scene();s.edges.forEach(e=>e.target_port='same');assert.deepEqual(L.operandRows(s.positions).records,[]);
});
test('hidden effects and unknown descendants remain protected while known resource reads can move',()=>{
 for(const kind of ['opaque','control','state']){
  const s=scene(),idx=s.positions.context.idx;idx.nodes.set('hidden',{id:'hidden',parent:'a',kind});idx.children.set('a',['hidden']);
  const edges=[{id:'hidden-edge',source:'hidden',target:'a',kind:kind==='state'?'state-read':'data'}];
  const p=L.operandRows(s.positions,'existing',edges);
  if(kind==='state')assert.ok(p.records[0].nodes.some(n=>n.node==='a'));
  else assert.ok(p.records.every(r=>r.nodes.every(n=>n.node!=='a')));
  edges[0].kind='state-write';assert.ok(L.operandRows(s.positions,'existing',edges).records.every(r=>r.nodes.every(n=>n.node!=='a')));
 }
});
test('existing bodies, gutters and consumer separation bound the alignment proposal',()=>{
 for(const alter of [s=>s.positions.set('wall',{id:'wall',x:50,y:250,w:700,h:70}),s=>s.positions.get('root').design_gutter=600,s=>s.positions.get('sink').y=320]){
  const s=scene();alter(s);assert.deepEqual(L.operandRows(s.positions).records,[]);
 }
});
const read=name=>JSON.parse(fs.readFileSync('verification/operand-rows/current/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles',paperPipelineSummaries:false};
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,edges:r.graph.edges,node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,coverage:r.document.expression_coverage});
test('real unfamiliar source gains an aligned operand row without losing any exact fact',()=>{
 const ir=read('StaggeredOperands'),original=JSON.stringify(ir),a=R.render(ir,{...state,paperOperandRows:false}),b=R.render(ir,state),rec=b.prepared.routing.operand_row_refinement;
 assert.ok(rec.selected.length);assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);
 assert.equal(b.prepared.quality.wire_length,a.prepared.quality.wire_length);assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
 const selected=new Set(rec.selected.flatMap(r=>r.nodes.map(n=>n.node)));
 for(const [id,p]of a.graph.positions)if(!selected.has(id))assert.deepEqual(p,b.graph.positions.get(id));
 assert.ok(rec.attempts.length<=rec.max_trials&&rec.max_arrangements===2);assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('renaming a source fixture keeps the same bounded geometric behavior',()=>{
 const a=R.render(read('StaggeredOperands'),state),b=R.render(read('RenamedOperands'),state);
 assert.equal(a.document.layout.operand_rows.length,b.document.layout.operand_rows.length);
 assert.deepEqual(a.document.layout.operand_rows.map(r=>r.nodes.map(n=>[n.before,n.after,n.target_port])),b.document.layout.operand_rows.map(r=>r.nodes.map(n=>[n.before,n.after,n.target_port])));
});
for(const name of ['InterruptedOperands','ConditionalOperands','EscapingOperands','StatefulOperands'])test(name+' retains protected boundaries and exact evidence',()=>{
 const ir=read(name),a=R.render(ir,{...state,paperOperandRows:false}),b=R.render(ir,state);assert.deepEqual(facts(a),facts(b));
 const selected=new Set((b.document.layout.operand_rows||[]).flatMap(r=>r.nodes.map(n=>n.node)));
 for(const n of ir.nodes)if(n.kind==='opaque'||n.condition||n.mutable)assert.equal(selected.has(n.id),false);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 if(name==='ConditionalOperands')assert.equal(b.document.layout.operand_rows,undefined);
});
test('print, explicit offsets and route-refinement opt-out retain their policy',()=>{
 const ir=read('StaggeredOperands');for(const extra of [{paperOperandRows:false},{paperMedium:'print'},{offsets:{[ir.nodes[0].id]:{x:4,y:0}}}])assert.equal(R.render(ir,{...state,...extra}).prepared.routing.operand_row_refinement,undefined);
 const r=R.render(ir,{...state,paperSelectedRoutes:false});assert.ok(r.document.layout.operand_rows.length);assert.equal(r.prepared.routing.selected_route_refinement,undefined);
});

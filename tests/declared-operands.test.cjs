'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
function scene(){
 const nodes=[{id:'root',kind:'composite',parent:null},{id:'sink',kind:'composite',parent:'root'},...['a','b','c'].map(id=>({id,kind:'compute',parent:'root'})),
 ...['zeta','alpha','middle'].map((slot,i)=>({id:'input'+i,kind:'interface',role:'input',parent:'sink',slot,evidence_status:'static-only',source:[{file:'foreign.py',symbol:'unnamed',line:12,column:8+i*10}]}))];
 const canonical=['a','b','c'].map((source,i)=>({id:'e'+i,source,target:'input'+i,kind:'interface-binding',source_port:'out',target_port:nodes[5+i].slot,evidence:'source-dependency'}));
 const edges=canonical.map(e=>({...e,source:e.source,target:'sink',canonical_source:e.source,canonical_target:e.target}));
 const positions=new Map([{id:'root',x:0,y:0,w:860,h:700,header:70,expanded:true},...['c','a','b'].map((id,i)=>({id,x:60+i*240,y:160,w:120,h:60})),{id:'sink',x:300,y:420,w:120,h:60}].map(n=>[n.id,n]));
 positions.context={idx:{nodes:new Map(nodes.map(n=>[n.id,n])),children:new Map([['root',['a','b','c','sink']],['sink',['input0','input1','input2']]])},edges,feedback:new Set(),contextLanes:[]};
 return {positions,canonical,edges,idx:positions.context.idx};
}
test('source parameter positions order arbitrary names independently of projected array insertion',()=>{
 const s=scene(),before=JSON.stringify(s.edges),p=L.operandRows(s.positions,'declared',s.canonical);
 assert.equal(p.records.length,1);assert.deepEqual(p.records[0].nodes.map(n=>n.node),['a','b','c']);
 assert.deepEqual(p.records[0].declaration.inputs.map(n=>n.slot),['zeta','alpha','middle']);
 s.edges.reverse();s.canonical.reverse();s.idx.nodes=new Map([...s.idx.nodes].reverse());
 assert.deepEqual(L.operandRows(s.positions,'declared',s.canonical).records,p.records);
 assert.equal(JSON.stringify(s.edges.slice().reverse()),before);
 assert.equal(s.positions.get('a').x,300);assert.equal(p.positions.get('a').x,60);
});
test('declaration location changes reading preference while canonical slots and edges remain exact',()=>{
 const s=scene();s.idx.nodes.get('input2').source[0].column=0;
 const p=L.operandRows(s.positions,'declared',s.canonical);assert.equal(p.records.length,0,'existing c,a,b order already matches changed declaration');
 const proof=L.declaredOperandOrder(s.edges,s.idx,s.canonical);assert.deepEqual(proof.inputs.map(n=>n.node),['c','a','b']);
});
test('missing, ambiguous, runtime and mismatched interface provenance defers declared ordering',()=>{
 for(const alter of [
  s=>delete s.idx.nodes.get('input0').source,
  s=>s.idx.nodes.get('input0').source.push({...s.idx.nodes.get('input0').source[0]}),
  s=>s.idx.nodes.get('input0').source[0].column=18,
  s=>s.idx.nodes.get('input0').source[0].symbol='other',
  s=>s.idx.nodes.get('input0').source[0].file='other.py',
  s=>s.idx.nodes.get('input0').evidence_status='runtime-only',
  s=>s.idx.nodes.get('input0').parent='other',
  s=>s.idx.nodes.get('input0').slot='wrong',
  s=>s.canonical[0].target_port='wrong',
  s=>s.canonical[0].source='different',
  s=>s.canonical[0].condition={branch:'guarded'},
  s=>s.canonical.shift(),
  s=>s.edges[0].bundle_members=[{...s.edges[0]}],
 ]){const s=scene();alter(s);assert.equal(L.declaredOperandOrder(s.edges,s.idx,s.canonical),null);}
});
test('unknown, conditional, mutable, shared, loop and runtime producers retain protection',()=>{
 for(const guard of [{kind:'opaque'},{condition:{branch:'if'}},{mutable:true},{identity_display:{object:'shared'}},{iteration:{}},{evidence_status:'runtime-only'}]){
  const s=scene();Object.assign(s.idx.nodes.get('a'),guard);const p=L.operandRows(s.positions,'declared',s.canonical);
  assert.ok(p.records.every(r=>r.nodes.every(n=>n.node!=='a')));
 }
 for(const alter of [s=>s.idx.nodes.get('root').condition={branch:'guarded'},s=>s.positions.get('sink').expanded=true,s=>s.positions.get('sink').cyclic=true]){
  const s=scene();alter(s);assert.deepEqual(L.operandRows(s.positions,'declared',s.canonical).records,[]);
 }
 const s=scene();s.edges.push({...s.edges[0],id:'escape',target:'root'});assert.ok(L.operandRows(s.positions,'declared',s.canonical).records.every(r=>r.nodes.every(n=>n.node!=='a')));
});
test('hidden effects are not moved across an aligned source declaration',()=>{
 const s=scene();s.idx.nodes.set('hidden',{id:'hidden',kind:'opaque',parent:'a'});s.idx.children.set('a',['hidden']);
 assert.ok(L.operandRows(s.positions,'declared',s.canonical).records.every(r=>r.nodes.every(n=>n.node!=='a')));
});
function input(name){const ir=JSON.parse(fs.readFileSync('verification/operand-order/current/'+name+'.json')),helpers=new Set(ir.nodes.filter(n=>n.semantic_type==='source-function').map(n=>n.id));
 return {ir,state:{mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite'&&!helpers.has(n.id)).map(n=>n.id)}};}
const facts=r=>({ir:r.document.ir,architecture:r.document.architecture,publication:r.document.publication,edges:r.graph.edges,node_accounting:r.graph.node_accounting,edge_accounting:r.graph.edge_accounting,coverage:r.document.expression_coverage});
for(const name of ['ForeignColumns','ForeignDeclaration','FragmentColumns','GuardedColumns','SharedColumns','MutableColumns','MixedColumns'])test(name+' keeps exact facts and reversible saved state',()=>{
 const {ir,state}=input(name),original=JSON.stringify(ir),a=R.render(ir,{...state,paperDeclaredOperandOrder:false}),b=R.render(ir,state);
 assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 assert.ok(b.prepared.quality.wire_length<=a.prepared.quality.wire_length);assert.ok(b.prepared.quality.line_geometry.crossings<=a.prepared.quality.line_geometry.crossings);
 if(name==='ForeignDeclaration'){
  const rec=b.prepared.routing.declared_operand_refinement;assert.equal(rec.attempts.length,2);assert.ok(rec.attempts.every(t=>!t.accepted&&t.ordered_candidate===1&&t.candidate.wire_length>t.before.wire_length));
 }
 const consumers=ir.nodes.filter(n=>n.semantic_type==='source-function').map(n=>n.id),open=R.render(ir,{...state,open:[...state.open,...consumers]});
 for(const id of consumers)assert.equal(open.graph.positions.get(id)?.expanded,true);
 assert.equal(R.render(ir,state).svg,b.svg);
});
test('new local policy respects explicit offsets, print and row opt-outs',()=>{
 const {ir,state}=input('ForeignDeclaration');for(const extra of [{paperDeclaredOperandOrder:false},{paperOperandRows:false},{paperMedium:'print'},{offsets:{[ir.nodes[0].id]:{x:1,y:0}}}])assert.equal(R.render(ir,{...state,...extra}).prepared.routing.declared_operand_refinement,undefined);
});

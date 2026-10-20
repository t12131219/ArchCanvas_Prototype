'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null},...['a','b'].map(id=>({id,parent:'root',kind:'composite'})),
  ...['left','right'].map(id=>({id,parent:'root',kind:'interface',role:'input'})),
  ...['a1','a2','a3','b1','b2','b3'].map(id=>({id,parent:id[0],kind:'compute',label:id}))];
 const pairs=[['left','a1'],['right','b1'],['a1','a2'],['a2','a3'],['b1','b2'],['b2','b3'],['a3','b3']];
 return {nodes,edges:pairs.map(([source,target],i)=>({id:'e'+i,source,target,source_port:'value',target_port:'slot:'+i,kind:'data'}))};
}
function draw(ir=fixture(),extra={}){return L.layout(E.index(ir),['root'],new Set(ir.nodes.map(n=>n.id)),ir.edges.map(e=>({...e})),{},
 {compoundPorts:true,compoundStarts:true,foldSerial:false,nodeSize:n=>({w:150,h:n.kind==='interface'?40:200}),...extra});}
test('independent entries allow neighboring compound flows and exact upward context arrows',()=>{
 const ir=fixture(),canonical=JSON.stringify(ir),p=draw(ir),record=p.context.compoundAlignments.find(r=>L.entryGeometry(r,p));
 assert.ok(record);assert.deepEqual(record.entry_bindings.map(b=>[b.edge,b.independent_entry]),[['e6','e1']]);
 assert.equal(p.get('a').y,p.get('b').y);assert.ok(p.get('a3').y>=p.get('b3').y);
 for(const e of p.context.edges)assert.ok(L.route(e,p).ok);
 assert.equal(JSON.stringify(ir),canonical);
});
test('spelling and operation names do not decide compound entry geometry',()=>{
 const ir=fixture(),a=draw(ir);for(const n of ir.nodes){n.label='different';n.operator='unfamiliar';n.class_name='foreign';}for(const e of ir.edges)e.target_port='renamed:'+e.id;
 const b=draw(ir);assert.deepEqual([...a.values()],[...b.values()]);
});
test('a serial helper, conditional use, control edge or state channel cannot authorize an entry relaxation',()=>{
 for(const mutate of [ir=>ir.edges.find(e=>e.id==='e1').source='a1',ir=>ir.edges.find(e=>e.id==='e6').condition={branch:'if',outcome:true},
  ir=>ir.edges.find(e=>e.id==='e6').kind='control',ir=>ir.edges.find(e=>e.id==='e6').design_route={kind:'bypass'}]){
  const ir=fixture();mutate(ir);assert.ok(draw(ir).context.compoundAlignments.every(r=>!r.entry_bindings?.length));
 }
});
test('unknown, mutable, conditional or identity endpoints preserve their boundary',()=>{
 for(const mutate of [n=>n.kind='opaque',n=>n.mutable=true,n=>n.condition={branch:'if'},n=>n.identity_display={object:'shared'},n=>n.observed_calls=[{run:'one'}]]){
  const ir=fixture();mutate(ir.nodes.find(n=>n.id==='a3'));const p=draw(ir);assert.ok(p.has('a3'));assert.ok(p.context.compoundAlignments.every(r=>!r.entry_bindings?.length));
 }
 const ir=fixture();ir.nodes.find(n=>n.id==='b1').kind='opaque';const p=draw(ir);assert.ok(p.has('b1'));assert.ok(p.context.compoundAlignments.some(r=>L.entryGeometry(r,p)));
});
test('feedback across regions is retained as a cycle and never becomes a start alignment',()=>{
 const ir=fixture();ir.edges.push({id:'back',source:'b3',target:'a1',kind:'data'});const p=draw(ir);assert.equal(p.context.compoundAlignments.length,0);assert.equal(p.get('a').cyclic,true);assert.equal(p.get('b').cyclic,true);
});
for(const name of ['ContextWeave','BoundaryWeave'])test(name+' composes, preserves exact bindings and saves the selected layout deterministically',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/flow-entries/current/'+name+'.json')),original=JSON.stringify(ir),state={paperMedium:'canvas',paperGranularity:'roles'},a=R.render(ir,state);
 assert.equal(a.prepared.routing.flow_refinement.accepted,true);assert.ok(a.document.layout.compound_alignments.some(r=>r.status==='realized'));
 assert.equal(R.render(a.document.ir,a.document.state).svg,a.svg);assert.equal(JSON.stringify(ir),original);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(a.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 for(const edge of a.graph.edges.filter(e=>ir.edges.some(x=>x.id===e.id))){const original=ir.edges.find(e=>e.id===edge.id);assert.equal(edge.target_port,original.target_port);}
 if(name==='BoundaryWeave'){const opaque=ir.nodes.find(n=>n.kind==='opaque');assert.ok(a.graph.positions.has(opaque.id));}
 const fixed=R.render(ir,{...state,paperAuto:false,open:a.graph.publication.open});assert.deepEqual(fixed.graph.publication.open,a.graph.publication.open);assert.deepEqual(fixed.prepared.routing.flow_refinement,a.prepared.routing.flow_refinement);assert.equal(fixed.svg,a.svg);
 const disabled=R.render(ir,{...state,paperAuto:false,open:a.graph.publication.open,paperFlowAlignment:false});assert.equal(disabled.prepared.routing.flow_refinement,undefined);
 const offset=R.render(ir,{...state,offsets:{[ir.nodes[0].id]:{x:20,y:0}}});assert.equal(offset.prepared.routing.flow_refinement,undefined);
 const print=R.render(ir,{paperGranularity:'roles'});assert.equal(print.prepared.routing.flow_refinement,undefined);
});

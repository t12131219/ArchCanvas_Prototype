'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const load=n=>JSON.parse(fs.readFileSync('verification/input-docks/current/'+n+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles',paperPipelineSummaries:false};
const facts=r=>JSON.stringify({nodes:r.graph.nodes.map(n=>n.id),edges:r.graph.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,kind:e.kind,condition:e.condition,originals:e.originals,bundle_members:e.bundle_members})),open:r.graph.publication.open,nodes_accounted:r.graph.node_accounting,edges_accounted:r.graph.edge_accounting,boundary:r.graph.publication.boundary,roles:r.graph.publication.role_frontier,expression:r.document.expression_coverage,summary:r.document.summary_coverage});
test('unfamiliar source composition with protected titles reduces wires with one exact external terminal',()=>{
 const ir=load('BraidedInputs'),original=JSON.stringify(ir),s={...state,paperProtectFrameTitles:true},a=R.render(ir,{...s,paperInputDocks:false}),b=R.render(ir,s),receipt=b.prepared.routing.input_dock_refinement;
 assert.equal(receipt.accepted,true);assert.equal(facts(a),facts(b));assert.equal(JSON.stringify(ir),original);
 assert.equal(b.document.layout.input_docks.length,1);assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length*.9);
 assert.ok(b.prepared.quality.native_width_px>a.prepared.quality.native_width_px);assert.deepEqual(b.prepared.quality.issues,[]);
 for(const dock of b.document.layout.input_docks){assert.ok(dock.geometry_verified&&dock.routes_verified);assert.equal(b.graph.nodes.filter(n=>n.id===dock.node).length,1);
  assert.deepEqual(dock.edges.map(e=>e.edge),b.graph.edges.filter(e=>e.source===dock.node).map(e=>e.id));}
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(b.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('a short-wire candidate with excess width or height is rejected and exact baseline SVG remains',()=>{
 const ir=load('LateInputs'),a=R.render(ir,{...state,paperInputDocks:false}),b=R.render(ir,state),receipt=b.prepared.routing.input_dock_refinement;
 assert.equal(receipt.accepted,false);assert.equal(receipt.facts_preserved,true);assert.ok(receipt.candidate.wire_length<receipt.before.wire_length);
 assert.ok(receipt.candidate.height>receipt.before.height||receipt.candidate.width>receipt.before.width*1.12);
 assert.equal(a.svg,b.svg);assert.equal(facts(a),facts(b));assert.equal(b.document.layout.input_docks,undefined);
});
test('unknown, source conditions and mutation fixtures retain exact facts and visible boundaries',()=>{
 for(const name of ['GuardedInputs','UnknownInputs','StatefulInputs']){const ir=load(name),a=R.render(ir,{...state,paperInputDocks:false}),b=R.render(ir,state);
  assert.equal(facts(a),facts(b),name);
  if(b.prepared.routing.input_dock_refinement?.accepted){
   assert.ok(b.prepared.quality.wire_length<=a.prepared.quality.wire_length*.9);
   assert.ok(b.prepared.quality.line_geometry.crossings<=a.prepared.quality.line_geometry.crossings);
   assert.ok(b.graph.positions.context.inputDocks.every(d=>L.inputDockGeometry(d,b.graph.positions)));
  }else assert.equal(a.svg,b.svg,name);}
});
function fixture(){
 const nodes=[{id:'root',parent:null,kind:'composite'},...['x','y','c'].map(id=>({id,parent:'root',kind:'interface',role:'input'})),{id:'region',parent:'root',kind:'composite'},
  ...Array.from({length:8},(_,i)=>({id:'n'+i,parent:'region',kind:'compute'}))];
 const pairs=[['x','n0'],['y','n0'],...Array.from({length:7},(_,i)=>['n'+i,'n'+(i+1)]),['c','n6'],['c','n7']];
 return {nodes,edges:pairs.map(([source,target],i)=>({id:'e'+i,source,target,kind:'data',source_port:'out',target_port:'arg:'+i}))};
}
const layout=ir=>L.layout(E.index(ir),['root'],new Set(ir.nodes.map(n=>n.id)),structuredClone(ir.edges),{},{inputDocks:true,foldSerial:false});
test('the geometry primitive preserves all endpoints, slots, source ownership and a single terminal',()=>{
 const ir=fixture(),before=JSON.stringify(ir),p=layout(ir),dock=p.context.inputDocks[0];assert.equal(p.context.inputDocks.length,1);assert.equal(dock.node,'c');assert.ok(L.inputDockGeometry(dock,p));assert.equal(JSON.stringify(ir),before);
 assert.deepEqual(dock.edges,ir.edges.filter(e=>e.source==='c').map(e=>({edge:e.id,target:e.target,source_port:e.source_port,target_port:e.target_port})));
 assert.equal(p.size,ir.nodes.length);const q=new Map(p);q.context=p.context;q.set('c',{...p.get('c'),x:p.get('n7').x});assert.equal(L.inputDockGeometry(dock,q),false);
});
test('guarded sources and ancestors, effectful endpoints, SCCs and incoming bindings cannot authorize docking',()=>{
 const guards=[{kind:'opaque'},{kind:'state'},{mutable:true},{condition:{branch:'guard'}},{identity_display:{}},{observed_calls:{}},{evidence_status:'runtime-only'},{semantic_type:'iteration-region'},{semantic_type:'conditional-collection'}];
 for(const id of ['c','region','n7'])for(const guard of guards){
  if(id==='n7'&&(guard.kind==='opaque'||guard.condition||guard.semantic_type==='conditional-collection'))continue;
  const ir=fixture();Object.assign(ir.nodes.find(n=>n.id===id),guard);assert.equal(layout(ir).context.inputDocks.length,0,id+JSON.stringify(guard));}
 for(const alter of [ir=>ir.edges.at(-1).kind='state',ir=>ir.edges.at(-1).iteration={},ir=>ir.edges.at(-1).design_route={kind:'bypass'},ir=>ir.edges.at(-1).layout_after='n0',
  ir=>ir.edges.push({id:'incoming',source:'x',target:'c',kind:'alias'}),ir=>ir.edges.push({id:'cycle',source:'n7',target:'c',kind:'data'}),ir=>ir.edges.pop()]){const ir=fixture();alter(ir);assert.equal(layout(ir).context.inputDocks.length,0);}
});
test('conditional uses and visible unknown endpoints can face a region without traversing protected interiors',()=>{
 for(const guard of [{kind:'opaque'},{condition:{branch:'g',outcome:true}},{kind:'composite',semantic_type:'conditional-collection'}]){
  const ir=fixture(),before=JSON.stringify(ir);Object.assign(ir.nodes.find(n=>n.id==='n7'),guard);
  ir.edges.at(-1).condition={branch:'g',outcome:false};const frozen=JSON.stringify(ir),p=layout(ir),d=p.context.inputDocks[0];
  assert.ok(d&&L.inputDockGeometry(d,p));assert.equal(p.size,ir.nodes.length);assert.equal(JSON.stringify(ir),frozen);
  assert.deepEqual(d.conditional_uses,[{edge:ir.edges.at(-1).id,condition:ir.edges.at(-1).condition}]);
  assert.ok(p.get('c').x+p.get('c').w<=p.get('region').x||p.get('c').x>=p.get('region').x+p.get('region').w);
  assert.ok(p.has('n7'));assert.notEqual(frozen,before);
  ir.nodes.push({id:'inside',parent:'n7',kind:'compute'});ir.edges.at(-1).target='inside';assert.equal(layout(ir).context.inputDocks.length,0);
 }
});
test('explicit opt-out, user offsets and print views do not select a new input layout',()=>{
 const ir=load('BraidedInputs');for(const s of [{...state,paperInputDocks:false},{...state,offsets:{[ir.nodes[0].id]:{x:8,y:0}}},{paperGranularity:'roles'}]){const r=R.render(ir,s);assert.equal(r.prepared.routing.input_dock_refinement,undefined);assert.equal(r.document.layout.input_docks,undefined);}
 const r=R.render(ir,{...state,paperInputDocks:true,offsets:{[ir.nodes[0].id]:{x:8,y:0}}});assert.equal(r.document.layout.input_docks,undefined);
});
test('class renaming does not choose the rule; manual expansion retains its requested frontier',()=>{
 const ir=load('BraidedInputs'),original=R.render(ir,state);for(const n of ir.nodes)n.class_name='Unseen';const a=R.render(ir,state);assert.deepEqual(a.prepared.routing.input_dock_refinement,original.prepared.routing.input_dock_refinement);
 const s={...state,paperAuto:false,open:a.graph.publication.open},b=R.render(ir,s);assert.deepEqual(b.graph.publication.open,s.open);assert.equal(facts(b),facts(a));
});

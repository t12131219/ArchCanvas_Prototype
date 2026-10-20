'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync('verification/entry-bands/current/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles',paperPipelineSummaries:false};
const facts=r=>({open:r.graph.publication.open,nodes:r.graph.nodes.map(n=>n.id),edges:r.graph.edges.map(e=>[e.id,e.source,e.target,e.source_port,e.target_port,e.kind,e.condition,e.originals,e.bundle_members]),nodes_accounted:r.graph.node_accounting,edges_accounted:r.graph.edge_accounting});
for(const name of ['ManyInputs','InterruptedInputs'])test(name+' shortens actual routed wires with identical open frontier and original facts',()=>{
 const ir=read(name),before=JSON.stringify(ir),a=R.render(ir,{...state,paperEntryBand:false}),b=R.render(ir,state),receipt=b.prepared.routing.entry_band_refinement;
 assert.equal(receipt.accepted,true);assert.deepEqual(facts(a),facts(b));assert.equal(JSON.stringify(ir),before);
 assert.ok(b.prepared.quality.wire_length<a.prepared.quality.wire_length*.9);assert.deepEqual(b.prepared.quality.issues,[]);
 assert.ok(b.document.layout.compound_alignments.some(c=>c.input_band_verified));
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(b.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 if(name==='InterruptedInputs')for(const n of ir.nodes.filter(n=>n.kind==='opaque'))assert.ok(b.graph.positions.has(n.id));
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
});
test('folded dependency summaries remain available and geometry does not open extra computations',()=>{
 const ir=read('ManyInputs'),a=R.render(ir,{paperMedium:'canvas',paperGranularity:'roles',paperEntryBand:false}),b=R.render(ir,{paperMedium:'canvas',paperGranularity:'roles'});
 assert.equal(b.svg,a.svg);assert.deepEqual(facts(b),facts(a));assert.equal(b.prepared.routing.entry_band_refinement,undefined);
});
test('manual frontier survives layout selection and explicit policy or offsets prevent replacement',()=>{
 const ir=read('ManyInputs'),a=R.render(ir,state),s={...state,paperAuto:false,open:a.graph.publication.open};
 const b=R.render(ir,s);assert.deepEqual(b.graph.publication.open,s.open);assert.equal(b.svg,a.svg);
 assert.equal(R.render(ir,{...s,paperEntryBand:false}).prepared.routing.entry_band_refinement,undefined);
 assert.equal(R.render(ir,{...s,offsets:{[ir.nodes[0].id]:{x:12,y:0}}}).prepared.routing.entry_band_refinement,undefined);
 assert.equal(R.render(ir,{paperGranularity:'roles'}).prepared.routing.entry_band_refinement,undefined);
});
test('consumer packing and routed acceptance do not depend on model class or role spelling',()=>{
 const ir=read('ManyInputs'),a=R.render(ir,state),renamed=structuredClone(ir);
 for(const n of renamed.nodes){n.class_name='Foreign';if(n.kind==='composite')n.label='Foreign';}
 const b=R.render(renamed,state);assert.equal(b.prepared.routing.entry_band_refinement.accepted,true);assert.deepEqual(facts(b),facts(a));
 assert.deepEqual(b.document.layout.compound_alignments.map(c=>c.input_band),a.document.layout.compound_alignments.map(c=>c.input_band));
});
test('selected context routes retain dense gutter indices; unselected proposals stay recorded',()=>{
 const nodes=[{id:'root',parent:null,kind:'composite'},{id:'region',parent:'root',kind:'composite'},...['a','b','c'].map(id=>({id,parent:'root',kind:'interface',role:'input'})),{id:'inside',parent:'region',kind:'compute'},{id:'sink',parent:'region',kind:'compute'}];
 const edges=[['inside','sink'],['a','sink'],['b','sink'],['c','sink']].map(([source,target],i)=>({id:'e'+i,source,target,kind:'data'})),ir={nodes,edges};
 const p=L.layout(E.index(ir),['root'],new Set(nodes.map(n=>n.id)),edges,{}, {contextLanes:'left',contextEdges:['e3']});
 assert.equal(p.context.contextLanes.length,3);assert.equal(edges[3].context_lane.index,0);assert.equal(p.get('region').context_gutter,48);
 assert.ok(p.context.contextLanes.filter(c=>c.edge!=='e3').every(c=>c.selected===false));
 assert.ok(!edges[1].context_lane&&!edges[2].context_lane);
});
test('cycles and guarded context endpoints cannot authorize input-band entry relaxation',()=>{
 const fixture=()=>({nodes:[{id:'root',parent:null,kind:'composite'},...['a','b'].map(id=>({id,parent:'root',kind:'composite'})),...['x','y'].map(id=>({id,parent:'root',kind:'interface',role:'input'})),...['a1','a2','a3','b1','b2','b3'].map(id=>({id,parent:id[0],kind:'compute'}))],edges:[['x','a1'],['y','b1'],['a1','a2'],['a2','a3'],['b1','b2'],['b2','b3'],['a3','b3']].map(([source,target],i)=>({id:'e'+i,source,target,kind:'data'}))});
 for(const mutate of [ir=>ir.edges.push({id:'back',source:'b3',target:'a1',kind:'data'}),ir=>ir.nodes.find(n=>n.id==='a3').kind='opaque',ir=>ir.edges.at(-1).condition={branch:'if'},ir=>ir.nodes.find(n=>n.id==='a').mutable=true,ir=>ir.nodes.find(n=>n.id==='a').semantic_type='conditional-collection',ir=>ir.nodes.find(n=>n.id==='b').semantic_type='iteration-region']){
  const ir=fixture();mutate(ir);const p=L.layout(E.index(ir),['root'],new Set(ir.nodes.map(n=>n.id)),ir.edges,{}, {compoundPorts:true,compoundStarts:true,compoundInputBand:true,nodeSize:()=>({w:150,h:200})});
  assert.ok(p.context.compoundAlignments.every(c=>!L.entryBandGeometry(c,p)));
 }
});

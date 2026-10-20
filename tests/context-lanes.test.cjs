'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
function fixture(){
 const nodes=[['root',null,'composite'],['external','root','interface'],['region','root','composite'],['entry','region','interface'],['first','region','compute'],['second','region','compute'],['join','region','compute'],['out','root','interface']].map(([id,parent,kind])=>({id,parent,kind,label:id,source:[],runtime_evidence:[]}));
 const edges=[['entry','first'],['first','second'],['second','join'],['external','join'],['external','join'],['join','out']].map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:String(i),kind:'data',evidence:'source-dependency'}));
 return {schema:'archcanvas-source-semantic/2',ir_digest:'fixture',title:'Unfamiliar local graph',nodes,edges,motifs:[]};
}
function draw(ir,side='left'){
 return E.project(ir,{view:'source',mode:'source',open:['root','region']},ir,{layout:{contextLanes:side,semanticLanes:true,gapY:52,nodeSize:()=>({w:140,h:56})}});
}
function routes(g){return g.edges.map(e=>({...e,route:L.route(e,g.positions)}));}
test('external side entries are selected from visible dependencies with distinct repeated operands',()=>{
 const ir=fixture(),before=JSON.stringify(ir),g=draw(ir),entries=g.positions.context.contextLanes;
 assert.deepEqual(entries.map(c=>[c.edge,c.owner,c.internal_inputs]),[['e3','region',['e2']],['e4','region',['e2']]]);
 assert.equal(JSON.stringify(ir),before);
 const rr=routes(g).filter(e=>e.context_lane);assert.ok(rr.every(e=>e.route.ok&&e.route.target_side==='left'));
 assert.notDeepEqual(rr[0].route.points.at(-1),rr[1].route.points.at(-1));
 assert.deepEqual(rr.map(e=>e.target_port),['3','4']);assert.equal(g.edges.length,ir.edges.length);
 const region=g.positions.get('region');assert.ok(region.context_gutter>0);
 for(const n of g.nodes.filter(n=>n.parent==='region')){const p=g.positions.get(n.id);assert.ok(p.x>region.x+region.context_gutter);}
});
test('renaming labels and operator names cannot select another channel topology',()=>{
 const ir=fixture(),g=draw(ir),renamed=structuredClone(ir);
 for(const n of renamed.nodes){n.label='an entirely different name';n.operator='foreign_operator';}
 assert.deepEqual(draw(renamed).positions.context.contextLanes,g.positions.context.contextLanes);
});
test('removing the internal input or moving the external source inside removes only affected proposals',()=>{
 for(const mutate of [ir=>{ir.edges=ir.edges.filter(e=>e.id!=='e2');},ir=>{ir.nodes.find(n=>n.id==='external').parent='region';}]){
  const ir=fixture();mutate(ir);assert.deepEqual(draw(ir).positions.context.contextLanes,[]);
 }
 const ir=fixture();ir.edges.find(e=>e.id==='e3').source='first';assert.deepEqual(draw(ir).positions.context.contextLanes.map(c=>c.edge),['e4']);
});
test('conditional members, control edges and established feedback or state routes do not become ordinary context',()=>{
 const ir=fixture();ir.edges[3].condition={branch:'if',outcome:'true'};ir.edges[4].kind='control';assert.deepEqual(draw(ir).positions.context.contextLanes,[]);
 const clean=fixture(),idx=E.index(clean),visible=new Set(clean.nodes.map(n=>n.id));clean.edges[3].design_route={kind:'state-interface'};clean.edges[4].design_route={kind:'iteration-feedback'};
 assert.deepEqual(L.contextEntries(idx,visible,clean.edges),[]);
 const bundle=structuredClone(clean.edges[3]);delete bundle.design_route;bundle.bundle_members=[{kind:'data'},{kind:'data',condition:{outcome:'true'}}];
 assert.deepEqual(L.contextEntries(idx,visible,[clean.edges[2],bundle]),[]);
});
test('folded containers and ancestor interfaces keep their existing boundary routing',()=>{
 const ir=fixture(),folded=E.project(ir,{view:'source',mode:'source',open:['root']},ir,{layout:{contextLanes:'left'}});
 assert.deepEqual(folded.positions.context.contextLanes,[]);
 ir.edges[3].source='root';ir.edges[4].source='region';assert.deepEqual(draw(ir).positions.context.contextLanes,[]);
});
test('left and right alternatives preserve exact slots and return obstacle-free physical side terminals',()=>{
 for(const side of ['left','right']){const ir=fixture(),g=draw(ir,side),rr=routes(g);assert.ok(rr.every(e=>e.route.ok));
  for(const e of rr.filter(e=>e.context_lane)){const p=g.positions.get(e.target),last=e.route.points.at(-1);assert.equal(last.x,side==='left'?p.x:p.x+p.w);assert.equal(e.route.target_side,side);}
  assert.deepEqual(Object.values(g.edge_accounting).flat().sort(),ir.edges.map(e=>e.id).sort());
 }
});
test('a measured regression is rejected equally with automatic or manually selected canvas detail',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/local-relations/current/InterruptedMixer.json'));
 const state={paperMedium:'canvas',paperGranularity:'roles'},baseline=R.render(ir,{...state,paperContextLanes:false}),automatic=R.render(ir,state);
 assert.equal(automatic.prepared.routing.context_refinement.accepted,false);assert.equal(automatic.svg,baseline.svg);
 assert.ok(automatic.prepared.routing.context_refinement.candidate.crossings>automatic.prepared.routing.context_refinement.before.crossings);
 const manual=R.render(ir,{...state,paperAuto:false,open:baseline.graph.publication.open});assert.deepEqual(manual.graph.publication.open,baseline.graph.publication.open);assert.deepEqual(manual.prepared.routing.context_refinement,automatic.prepared.routing.context_refinement);assert.equal(manual.svg,automatic.svg);
 const disabled=R.render(ir,{...state,paperAuto:false,open:baseline.graph.publication.open,paperContextLanes:false});assert.equal(disabled.prepared.routing.context_refinement,undefined);
 const offset=R.render(ir,{...state,paperAuto:false,open:baseline.graph.publication.open,offsets:{[ir.nodes[0].id]:{x:20,y:0}}});assert.equal(offset.prepared.routing.context_refinement,undefined);
 assert.equal(R.render(automatic.document.ir,automatic.document.state).svg,automatic.svg);
});

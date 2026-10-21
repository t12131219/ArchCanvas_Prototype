'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const {fixture,state}=require('./label-clearance-fixtures.cjs');
const snapshot=require('node:path').resolve('verification/local-relations/iteration-23-before-label-clearance/implementation/semantic_studio');
const old=require('../tools/load_publication_renderer.cjs')(snapshot);
const identity=g=>JSON.parse(JSON.stringify({nodes:g.nodes.map(n=>n.id),edges:g.edges.map(e=>({id:e.id,source:e.source,target:e.target,
 source_port:e.source_port,target_port:e.target_port,kind:e.kind,condition:e.condition,originals:e.originals,bundle_members:e.bundle_members})),
 open:g.publication.open,nodes_accounted:g.node_accounting,edges_accounted:g.edge_accounting,boundary:g.publication.boundary}));
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('local clearance follows actual drawing parents, including sibling, nested and root uses',()=>{
 const ir=fixture(),idx=E.index(ir),before=JSON.stringify(ir);let r=L.labelClearances(idx,ir.edges);
 assert.deepEqual(r.map(r=>[r.parent,r.gap_y,r.pairs[0].edges]),[['signals',88,['e1','e2']]]);
 idx.nodes.get('b').parent='other';assert.equal(L.labelClearances(idx,ir.edges)[0].parent,'root');
 idx.nodes.get('other').parent=null;assert.equal(L.labelClearances(idx,ir.edges)[0].parent,null);
 // E.index shares node records; restore the test's intentionally changed hierarchy.
 idx.nodes.get('b').parent='signals';idx.nodes.get('other').parent='root';assert.equal(JSON.stringify(ir),before);
});
test('ordinary parallel uses do not invent label clearance; conditional and bundled uses retain every edge',()=>{
 const ir=fixture();for(const e of ir.edges)delete e.condition;assert.deepEqual(L.labelClearances(E.index(ir),ir.edges),[]);
 ir.edges[1].bundle_members=[{id:'member',kind:'data'}];assert.deepEqual(L.labelClearances(E.index(ir),ir.edges)[0].pairs[0].edges,['e1','e2']);
 ir.edges=ir.edges.filter(e=>e.id!=='e2');assert.deepEqual(L.labelClearances(E.index(ir),ir.edges),[]);
});
test('a conditional region no longer inflates its unrelated unknown helper',()=>{
 const ir=fixture(),before=JSON.stringify(ir),global=R.render(ir,{...state,paperLabelSpacing:'global'}),local=R.render(ir,state);
 assert.equal(global.svg,old.render(ir,state).svg);assert.equal(local.prepared.routing.clearance_refinement.accepted,true);
 assert.deepEqual(identity(local.graph),identity(global.graph));accounted(ir,local.graph);assert.equal(JSON.stringify(ir),before);
 assert.equal(local.graph.positions.get('signals').h,global.graph.positions.get('signals').h);
 assert.ok(local.graph.positions.get('other').h<global.graph.positions.get('other').h);assert.ok(local.graph.positions.has('v'));
 assert.deepEqual(local.prepared.quality.issues,[]);assert.equal(local.prepared.quality.line_geometry.crossings,0);
 assert.ok(local.prepared.quality.native_height_px<global.prepared.quality.native_height_px*.8);
 assert.equal(local.graph.edges.filter(e=>e.condition).length,2);
});
test('drawing scope does not depend on labels, class names or family names',()=>{
 const ir=fixture(),before=R.render(ir,state);for(const n of ir.nodes){n.label='Renamed';n.source_class='EntirelyForeign';}
 const r=R.render(ir,state);assert.equal(r.prepared.routing.clearance_refinement.accepted,true);
 assert.deepEqual(r.graph.publication.label_clearance.regions,before.graph.publication.label_clearance.regions);assert.deepEqual(identity(r.graph),identity(before.graph));
});
test('saved local selection reopens exactly and remains compatible with deeper folding choices',()=>{
 const ir=fixture(),r=R.render(ir,state);assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
 const folded=R.render(ir,{...state,open:['root']});assert.ok(folded.graph.nodes.length<r.graph.nodes.length);accounted(ir,folded.graph);
 assert.equal(R.render(ir,state).svg,r.svg);
});
test('manual offsets, print mode and explicit global spacing preserve baseline geometry',()=>{
 const ir=fixture();for(const s of [{...state,paperLabelSpacing:'global'}, {...state,offsets:{root:{x:12,y:0}}},
  {...state,paperMedium:'print'}]){const r=R.render(ir,s);assert.equal(r.prepared.routing.clearance_refinement,undefined);assert.equal(r.svg,old.render(ir,s).svg);}
});
test('explicit minimum gaps are honored in every container, and zero-gain proposals are rejected',()=>{
 const ir=fixture(),r=R.render(ir,{...state,paperLabelGapY:112});assert.equal(r.prepared.routing.clearance_refinement,undefined);
 assert.equal(r.svg,old.render(ir,{...state,paperLabelGapY:112}).svg);
 // A single required channel has no smaller rank allocation. Use a fresh
 // immutable input; publication plans cache by IR object identity.
 ir.nodes=ir.nodes.filter(n=>['root','a','b'].includes(n.id));for(const n of ir.nodes)if(n.id!=='root')n.parent='root';ir.edges=ir.edges.filter(e=>['e1','e2'].includes(e.id));
 const fresh=JSON.parse(JSON.stringify(ir)),same=R.render(fresh,{...state,paperEmptyBandCompaction:false});assert.equal(same.prepared.routing.clearance_refinement.accepted,false);
 assert.equal(same.prepared.routing.rank_clearance_refinement.accepted,false);
 assert.equal(same.svg,R.render(fresh,{...state,paperLabelSpacing:'global'}).svg);
});
test('crossing reductions cannot trade away a new ambiguous wire contact',()=>{
 const ir=fixture();for(const [i,source,target]of [[0,'v','z'],[1,'a','w']])ir.edges.push({id:'cross-'+i,source,target,source_port:'out',target_port:'use:'+i,kind:'data',evidence:'source-dependency'});
 const r=R.render(ir,state),c=r.prepared.routing.clearance_refinement;assert.equal(c.accepted,false);
 assert.ok(c.candidate.crossings<c.before.crossings);assert.ok(c.candidate.contacts>c.before.contacts);
 const rank=r.prepared.routing.rank_clearance_refinement;assert.equal(rank.attempts[0].accepted,false);
 assert.equal(rank.accepted,true);assert.ok(rank.attempts.slice(1).some(a=>a.accepted));
 assert.equal(r.prepared.quality.line_geometry.unrelated_contacts.length,0);
 assert.equal(r.prepared.quality.line_geometry.crossings,c.before.crossings);accounted(ir,r.graph);
});
test('identity and mutable or state boundaries survive geometry selection without semantic promotion',()=>{
 for(const guard of [{mutable:true},{identity_display:{kind:'same-object-calls',label:'shared object',invocation:1,count:2}},{kind:'state'},{kind:'control'}]){
  const ir=fixture();Object.assign(ir.nodes.find(n=>n.id==='v'),guard);const before=JSON.stringify(ir),r=R.render(ir,state),g=R.render(ir,{...state,paperLabelSpacing:'global'});
  assert.deepEqual(identity(r.graph),identity(g.graph));assert.ok(r.graph.positions.has('v'));assert.equal(JSON.stringify(ir),before);accounted(ir,r.graph);
 }
});

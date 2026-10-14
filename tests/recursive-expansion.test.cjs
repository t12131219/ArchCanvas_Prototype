const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),F=require('../yworks_edge_router_lab/recursive-graph.js'),C=globalThis.SummaryConstraints;
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json')));
function load(id){const c=catalog.cases.find(c=>c.id===id),sources=Object.fromEntries(c.views.filter(v=>v.json).map(v=>[v.key,C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))))]));return F.build(F.create(sources));}
function legal(g){const out=F.route(g),checked=E.validateView(g);assert.equal(out.failed,0);assert.deepEqual(checked.source,{ok:true,violations:[]});assert.equal(checked.layout.ok,true,checked.layout.violations.join('; '));for(const [id,v] of checked.edges)assert.equal(v.ok,true,id+': '+v.violations.join('; '));return g;}
test('one module opens only its children and separate branches retain their depths',()=>{
 let g=legal(load('e40ad1504991acea'));const source=E.clone(g.recursive.authority.detail),start=g.nodes.map(n=>n.id);
 g=legal(F.toggle(g,'highway.layer0'));assert.ok(g.nodes.some(n=>n.id==='highway.layer0.gate'));assert.ok(!g.nodes.some(n=>n.id==='highway.layer0.gate_linear'));
 g=legal(F.toggle(g,'highway.layer0.gate'));assert.ok(g.nodes.some(n=>n.id==='highway.layer0.gate_linear'));assert.ok(!g.nodes.some(n=>n.id==='highway.layer0.relu'));
 const before=E.clone(g);g=legal(F.toggle(g,'highway.layer0'));assert.deepEqual(g.nodes.map(n=>n.id),start);
 g=legal(F.toggle(g,'highway.layer0'));assert.ok(g.nodes.some(n=>n.id==='highway.layer0.gate_linear'));assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.recursive.authority.detail,source);
});
test('Transformer mixed Attention and SDPA frontiers retain Memory alias and every source edge',()=>{
 let g=legal(load('01093cc06a87b35a'));g=legal(F.toggle(g,'enc.self'));assert.ok(!g.nodes.some(n=>n.id==='enc.self.sdpa.qkt'));assert.ok(!g.nodes.some(n=>n.id==='dec.self.q'));
 g=legal(F.toggle(g,'enc.self.sdpa'));assert.ok(g.nodes.some(n=>n.id==='enc.self.sdpa.qkt'));assert.ok(g.nodes.find(n=>n.id==='enc.memory.value').visualBinding);
 const ids=new Set(g.nodes.map(n=>n.id)),represented=new Set(g.edges.flatMap(e=>e.projection.originals||[e.projection.original]));for(const raw of g.recursive.authority.detail.edges){const s=F.representative(g.recursive,raw.source,ids),t=F.representative(g.recursive,raw.target,ids);if(s!==t)assert.ok(represented.has(raw.id),raw.id);}
 for(const e of g.edges)assert.deepEqual(e.binding,g.recursive.authority.detail.edges.find(v=>v.id===e.projection.original).binding);
});
test('child layout survives fold, re-open, JSON reload and undo snapshots',()=>{
 let g=legal(F.toggle(load('e40ad1504991acea'),'highway.layer0'));const before=E.clone(g),n=g.nodes.find(n=>n.id==='highway.layer0.complement');
 E.move(g,n.id,8,0);assert.equal(g.lastMove.blocked,false);F.captureMove(before,g,n.id);const x=g.nodes.find(v=>v.id===n.id).x;
 g=legal(F.toggle(g,'highway.layer0'));g=legal(F.toggle(g,'highway.layer0'));assert.equal(g.nodes.find(v=>v.id===n.id).x,x);
 const disk=E.clone(g);assert.equal(disk.nodes.find(v=>v.id===n.id).x,x);assert.equal(F.opened(disk.recursive,'highway.layer0'),true);assert.notEqual(before.nodes.find(v=>v.id===n.id).x,x);assert.equal(F.opened(before.recursive,'highway.layer0'),true);
});
test('frontier provenance, containment, ports and full authority reject corruption',()=>{
 const g=legal(F.toggle(load('e40ad1504991acea'),'highway.layer0'));
 for(const damage of [x=>x.edges[0].binding.endpoint_binding.canonical.dst='forged',x=>x.edges[0].source='highway.output',x=>x.edges.pop(),x=>x.edges[0].portPolicy.source.mode='perimeter',x=>x.nodes.find(n=>n.parent==='highway.layer0').parent='highway.layer1',x=>x.recursive.authority.detail.nodes[1].semantic.kind='forged']){const bad=E.clone(g);damage(bad);assert.equal(C.validateSource(bad).ok,false);}
});
test('all-open and all-folded preserve recorded endpoints without three discrete modes',()=>{
 let g=legal(load('01093cc06a87b35a')),a=g.recursive.authority;g=legal(F.all(g,true));assert.deepEqual(g.nodes.map(n=>n.id).sort(),a.detail.nodes.map(n=>n.id).sort());assert.equal(g.edges.length,a.detail.edges.length);
 g=legal(F.all(g,false));assert.equal(g.nodes.length,a.variants[0].nodes.length);assert.ok(g.recursive.state.open.length>g.nodes.length/2,'hidden descendant choices remain remembered');
 const app=fs.readFileSync(path.join(root,'yworks_edge_router_lab/index.html'),'utf8');assert.ok(!app.includes('id="viewTabs"'));
});

test('mixed frontiers retain the complete source title and variable captions of each chosen glyph',()=>{
 let g=legal(F.toggle(load('01093cc06a87b35a'),'enc.self'));g=legal(F.toggle(g,'enc.self.sdpa'));
 const a=g.recursive.authority,ids=new Set();
 for(const n of g.nodes){const index=n.projectionVariant?.index;if(index===undefined)continue;const v=a.variants[index],expected=v.attachments.filter(a=>a.owner===n.id),actual=g.attachments.filter(a=>a.owner===n.id);
  assert.equal(actual.length,expected.length,n.id+' must keep every source caption');
  for(let i=0;i<actual.length;i++){assert.equal(actual[i].html,expected[i].html);assert.deepEqual(actual[i].presentation.base,v.nodes.find(v=>v.id===n.id).base);assert.ok(!ids.has(actual[i].id),'caption identity must be unique across variants');ids.add(actual[i].id);}
 }
 for(const [id,title] of [['enc.ffn','Position-wise feed-forward network'],['enc.norm1','LayerNorm'],['enc.layer_i','Encoder × N_encoder'],['enc.self','self-attention']])assert.ok(g.attachments.some(a=>a.owner===id&&a.html.includes(title)),id);
 // A forged receipt used to hide omitted captions from the source validator.
 const bad=E.clone(g);bad.attachments=bad.attachments.filter(a=>a.owner!=='enc.ffn');bad.recursiveReceipt.annotations.attachments=E.clone(bad.attachments);assert.equal(C.validateSource(bad).ok,false);
 const before=E.clone(g),n=g.nodes.find(n=>n.id==='enc.layer_i');E.move(g,n.id,10,-10);assert.equal(g.lastMove.blocked,false);
 for(const caption of g.attachments.filter(a=>a.owner==='enc.layer_i')){const old=E.attachmentTransform(before,caption),now=E.attachmentTransform(g,caption);assert.equal(now.x-old.x,10);assert.equal(now.y-old.y,-10);}
});

test('folded slots and nested boundary crossings are legal and repeated routing is stable',()=>{
 for(const [id,moduleId] of [['1060177d741471ec','af_dec_decomp2'],['28c0565ef37d1aff','patch_layer2_sdpa_operands'],['8ed3fd7a969716dc','ccvae.sampling'],['9a9263f9a6014d8a','graphnet.forward'],['dab3eabe196047ba','textcnn.embedding'],['b80d768337313cf9','mixhop_layer.branch1'],['0342f4170c15ba8e','vae.encoder'],['d6dd6f156d262b3c','af_init_states'],['293af762eb1fa989','realnvp_coupling.masked'],['293af762eb1fa989','realnvp_coupling.scale']]){
  const g=load(id),doc=g.recursive;let n=doc.authority.detail.nodes.find(n=>n.id===moduleId);while(n){if(!doc.state.open.includes(n.id))doc.state.open.push(n.id);n=doc.authority.detail.nodes.find(v=>v.id===n.parent);}doc.state.frontiers={};
  const frontier=legal(F.build(doc)),edges=E.clone(frontier.edges),result=F.route(frontier);assert.equal(result.routed,0);assert.deepEqual(frontier.edges,edges,id+' legal paths must remain stable');
  {const R=globalThis.EdgeRouterLabRouting;for(const [i,a] of frontier.edges.entries())for(const b of frontier.edges.slice(i+1)){if(a.contract.wire===b.contract.wire)continue;for(let u=1;u<a.route.length;u++)for(let v=1;v<b.route.length;v++)assert.ok(R.overlap(a.route[u-1],a.route[u],b.route[v-1],b.route[v])<1e-5,a.id+' and '+b.id+' must not share an unrelated tensor lane');}}
 }
});

test('old recursive drafts rebuild defective presentations while retaining branch choices and manual offsets',()=>{
 let g=legal(F.toggle(load('01093cc06a87b35a'),'enc.self')),before=E.clone(g),n=g.nodes.find(n=>n.id==='enc.layer_i');E.move(g,n.id,10,-10);F.captureMove(before,g,n.id);
 const choices=E.clone(g.recursive.state.open),positions=E.clone(g.recursive.state.layouts);delete g.recursive.presentationVersion;g.attachments=[];
 const updated=legal(F.upgrade(g));assert.deepEqual(updated.recursive.state.open,choices);assert.deepEqual(updated.recursive.state.layouts,positions);assert.ok(updated.attachments.some(a=>a.owner==='enc.ffn'));assert.equal(updated.nodes.find(n=>n.id==='enc.layer_i').x,g.nodes.find(n=>n.id==='enc.layer_i').x);
});

test('a legal single edge cannot hide an unrelated overlapping tensor or an optional boundary U-turn',()=>{
 for(const [id,moduleId] of [['26c31b275a4ea612','compact_bilinear_pooling.inverse'],['013d7a339a2bb2b2','manual_fused_bn.stats'],['d1d813e85825e3bc','conditional_bn.norm']]){
  const g=load(id),d=g.recursive;let n=d.authority.detail.nodes.find(n=>n.id===moduleId);while(n){if(!d.state.open.includes(n.id))d.state.open.push(n.id);n=d.authority.detail.nodes.find(v=>v.id===n.parent);}d.state.frontiers={};
  const graph=legal(F.build(d));assert.ok(graph.edges.every(e=>!E.overlapsWire(graph,e,e.route)),id);
  const paths=E.clone(graph.edges);assert.equal(F.route(graph).routed,0);assert.deepEqual(graph.edges,paths);
 }
});

test('registered collection and alternative overview arrows keep their exact source projection',()=>{
 for(const id of ['9a9263f9a6014d8a','dab3eabe196047ba']){
  const g=legal(load(id)),pair=g.edges.flatMap((a,i)=>g.edges.slice(i+1).map(b=>[a,b])).find(([a,b])=>a.contract.wire!==b.contract.wire&&E.sharesPresentation(g,a,b));
  assert.ok(pair,'summary arrow is licensed by the recorded overview');
  const [a,b]=pair;const changed=E.clone(b);changed.route[1].x+=7;assert.equal(E.sharesPresentation(g,a,changed),false,'the license cannot permit a partial overlap or new corridor');
 }
});

test('mixed dispatch and collection junctions follow their module interfaces and keep separate tensor lanes',()=>{
 const A=require('../tools/recursive-audit.cjs'),P=globalThis.SummaryPhysicalPorts;
 for(const moduleId of ['tm.input_scale0','tm.input_scale1','tm.input_scale2','tm.input_scale3','tm.fmm','tm.predict0','tm.predict1','tm.predict2','tm.predict3']){
  const d=load('39ca17212a8004c5').recursive;let n=d.authority.detail.nodes.find(n=>n.id===moduleId);
  while(n){if(!d.state.open.includes(n.id))d.state.open.push(n.id);n=d.authority.detail.nodes.find(v=>v.id===n.parent);}
  const g=legal(F.build(d));assert.deepEqual(A.overlaps(g),{nodes:[],wires:[]},moduleId);
  for(const e of g.edges.filter(e=>e.binding?.representation==='fork_branch'||e.binding?.representation==='collection_branch')){
   const side=e.binding.representation==='fork_branch'?'target':'source',owner=g.nodes.find(n=>n.id===e[side]),junction=g.nodes.find(n=>n.id===e[side==='source'?'target':'source']);
   if(!junction.junction||!owner.expanded)continue;
   const f=P.active(e,side),p=P.point(owner,f),normal=globalThis.EdgeRouterLabRouting.SIDE[f.side];
   assert.ok((junction.x-p.x)*normal[0]+(junction.y-p.y)*normal[1]>0,e.id+' junction must stay outside its own input/output interface');
  }
  for(const j of g.nodes.filter(n=>n.junction)){
   const edge=g.edges.find(e=>e.source===j.id||e.target===j.id),side=edge.source===j.id?'source':'target';
   assert.equal(new Set(P.candidates(g,edge,side).map(f=>f.side)).size,4,j.id+' zero-size junction must support four approach directions');
  }
  const prior=E.clone(g.edges);assert.equal(F.route(g).routed,0);assert.deepEqual(g.edges,prior,moduleId+' rerouting must be stable');
 }
});

test('commit validation rejects graph-wide collisions even when both single edges are legal',()=>{
 const g={canvas:[320,180],nodes:[{id:'a',x:20,y:60,w:40,h:40},{id:'b',x:240,y:60,w:40,h:40}],edges:['first','second'].map(id=>({id,source:'a',target:'b',fixedSource:{side:'right',fraction:.5},fixedTarget:{side:'left',fraction:.5},style:'orthogonal',arrow:'target',route:[{x:60,y:80},{x:240,y:80}],binding:{src:id+':out'}}))};
 C.initialize(g);for(const e of g.edges)assert.equal(C.validate(g,e,e.route).ok,true);
 const checked=E.validateView(g);assert.equal(checked.source.ok,true);assert.equal(checked.layout.ok,false);assert.deepEqual(checked.layout.wires,[['first','second']]);assert.ok(checked.edges.every(([,v])=>!v.ok));
 g.edges=[];g.nodes[1].x=40;assert.equal(E.validateView(g).layout.ok,false,'sibling overlap is a separate graph constraint');
 for(const id of ['9a9263f9a6014d8a','dab3eabe196047ba'])assert.equal(E.validateView(legal(load(id))).layout.ok,true,'exact registered collection alternatives retain their licensed summary arrow');
});

test('recursive Memory forks retain the exact depicted segments rather than canonical alias peers',()=>{
 const g=legal(F.all(load('01093cc06a87b35a'),true)),source=g.recursive.authority.detail;
 for(const marker of g.junctionMarkers){const raw=source.junctionMarkers.find(m=>m.id===marker.id);assert.ok(raw,marker.id);assert.deepEqual(marker.edges,raw.edges,marker.id+' must bind the recorded edge instances');assert.ok(E.junctionPoint(g,marker),marker.id+' must lie on all of its branches');}
 for(const caption of g.routeLabels)assert.equal(caption.edge,source.routeLabels.find(a=>a.id===caption.id).edge,caption.id+' must follow its recorded edge instance');
 const marker=g.junctionMarkers.find(m=>m.owner==='enc.memory.value');
 assert.ok(marker.edges.every(id=>g.edges.find(e=>e.id===id).source==='enc.memory.value'));
 const bad=E.clone(g);bad.junctionMarkers.find(m=>m.id===marker.id).edges=bad.edges.filter(e=>e.target==='enc.memory.value').map(e=>e.id);
 const check=E.validateView(bad);assert.equal(check.layout.ok,false);assert.ok(check.layout.junctions.violations.some(v=>v.includes(marker.id)),'commit validation must catch the broken fork before any gesture');assert.ok(F.route(bad).failed,'an already routed but disconnected frontier must fail the initial load check');
});

test('fully expanded recursive graph supports child, tensor alias and container movement in both directions',()=>{
 const g=legal(F.all(load('01093cc06a87b35a'),true));
 const options={margin:6,stub:28,bendCost:40,crossingCost:450,overlapCost:2,edgeSpacing:12,sides:'any',preserve:false,grid:0,style:'orthogonal'};
 for(const id of ['enc.norm2.layernorm','src_pe.buffer','enc.norm2.add','enc.ffn.linear1','enc.memory.value','dec.cross.k','enc.layer_i'])for(const [dx,dy] of [[5,0],[-5,0],[0,5],[0,-5]]){
  const moved=E.clone(g),n=moved.nodes.find(n=>n.id===id),x=n.x,y=n.y;E.move(moved,id,dx,dy,options);
  assert.equal(moved.lastMove.blocked,false,id+' '+[dx,dy]+' '+moved.lastMove.reason);assert.equal(n.x-x,dx);assert.equal(n.y-y,dy);
  const check=E.validateView(moved);assert.equal(check.source.ok,true);assert.equal(check.layout.ok,true,check.layout.violations.join('; '));assert.ok(check.edges.every(([,v])=>v.ok));
  assert.deepEqual(moved.recursive.authority,g.recursive.authority);assert.deepEqual(moved.edges.map(e=>e.binding),g.edges.map(e=>e.binding));
 }
});

test('saved v5 full frontiers upgrade broken fork bindings and retain expansion, offsets and caption anchors',()=>{
 let g=legal(F.all(load('01093cc06a87b35a'),true));const before=E.clone(g);E.move(g,'src_pe.buffer',8,0);F.captureMove(before,g,'src_pe.buffer');
 const x=g.nodes.find(n=>n.id==='src_pe.buffer').x,choices=E.clone(g.recursive.state.open),layouts=E.clone(g.recursive.state.layouts);
 const caption=g.routeLabels[0];assert.ok(caption);caption.anchor={mode:'ratio',ratio:.4,gap:12,side:{x:1,y:0}};F.remember(g);const anchors=E.clone(g.recursive.state.captionAnchors);
 const marker=g.junctionMarkers.find(m=>m.owner==='enc.memory.value');marker.edges=g.edges.filter(e=>e.target==='enc.memory.value').map(e=>e.id);
 g.recursive.presentationVersion=5;F.remember(g);const restored=legal(F.upgrade(E.clone(g)));
 assert.equal(restored.recursive.presentationVersion,10);assert.deepEqual(restored.recursive.state.open,choices);assert.deepEqual(restored.recursive.state.layouts,layouts);assert.deepEqual(restored.recursive.state.captionAnchors,anchors);assert.deepEqual(restored.routeLabels.find(a=>a.id===caption.id).anchor,caption.anchor);assert.equal(restored.nodes.find(n=>n.id==='src_pe.buffer').x,x);
 assert.equal(C.validateJunctions(restored).ok,true);E.move(restored,'enc.norm2.layernorm',20,0);assert.equal(restored.lastMove.blocked,false);
});

test('folding an inner module releases its space, compacts its ancestors and restores the reopened frontier',()=>{
 let g=legal(F.toggle(load('01093cc06a87b35a'),'enc.self',true));const short=E.clone(g),self=g.nodes.find(n=>n.id==='enc.self'),sdpa=g.nodes.find(n=>n.id==='enc.self.sdpa'),split=g.nodes.find(n=>n.id==='enc.self.split');
 assert.ok(self.h<500,'a folded SDPA cannot reserve its 288px expanded box');assert.ok(split.y-sdpa.y-sdpa.h<=40,'split follows the visible SDPA instead of the hidden operators');
 const parent=g.nodes.find(n=>n.id===self.parent),last=Math.max(...g.nodes.filter(n=>n.parent===self.id).map(n=>n.y+n.h));assert.ok(self.y+self.h-last<=48,'container height follows visible content');
 g=legal(F.toggle(g,'enc.self.sdpa',true));assert.ok(g.nodes.find(n=>n.id==='enc.self').h>self.h+200);assert.ok(g.nodes.find(n=>n.id===parent.id).h>parent.h+200);
 g=legal(F.toggle(g,'enc.self.sdpa',false));assert.deepEqual(g.nodes,short.nodes,'folding restores the compact frontier');
 assert.deepEqual(g.recursive.authority,short.recursive.authority);
});

test('a shared tensor enters nested frames along one aligned trunk without gate stair steps',()=>{
 const g=legal(F.toggle(load('01093cc06a87b35a'),'enc.self',true)),branches=g.edges.filter(e=>e.source==='src_pe.add'&&['enc.self.q','enc.self.k','enc.self.v'].includes(e.target)),k=branches.find(e=>e.target==='enc.self.k'),source=E.endpoint(g,k,'source');
 assert.equal(branches.length,3);assert.equal(k.route.length,2,'the aligned center operand must have one straight arrow');
 for(const e of branches){const gates=C.activeGates(g,e);assert.equal(gates.length,2);for(const gate of gates){const frame=g.nodes.find(n=>n.id===gate.frame);assert.ok(Math.abs(C.gatePoint(frame,gate).x-source.x)<1e-5,'same tensor gates align with the producer');}assert.ok(e.route.length<=4,'outer branches need only their semantic fork, not gate detours');}
 const before=E.clone(g);E.move(g,'src_pe.add',12,0);assert.equal(g.lastMove.blocked,false);assert.equal(E.validateView(g).layout.ok,true);assert.deepEqual(g.edges.map(e=>e.binding),before.edges.map(e=>e.binding));
});


test('compact bands reserve external captions and separate growing parallel peers',()=>{
 for(const [id,moduleId] of [['ff136a438eea65f7','dcgan.d5'],['654be40c8d6a5cc2','unet_head'],['8ee5a30c659c3761','autoregressive_mask.inputdegree'],['293af762eb1fa989','realnvp_coupling.scale'],['ae50bb9fc9d6bb29','glow_affine_coupling.shift'],['ace7326ba6b3f4fc','gru.reset'],['84283f4f2c6ac277','lstmcell.step1.cell_update']]){
  const d=load(id).recursive;let n=d.authority.detail.nodes.find(n=>n.id===moduleId);
  while(n){if(!d.state.open.includes(n.id))d.state.open.push(n.id);n=d.authority.detail.nodes.find(v=>v.id===n.parent);}
  const g=legal(F.build(d));assert.deepEqual(E.layoutConflicts(g),{nodes:[],wires:[]},moduleId);
  const routes=E.clone(g.edges);assert.equal(F.route(g).routed,0);assert.deepEqual(g.edges,routes,'validated compact paths must remain stable');
 }
});

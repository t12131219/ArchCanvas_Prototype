const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=require('../yworks_edge_router_lab/router.js'),E=require('../yworks_edge_router_lab/graph-engine.js');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json')));
const load=(title,collection,view='overview')=>{
  const c=catalog.cases.find(c=>c.title===title&&c.collection===collection&&!c.historical);
  return globalThis.SummaryConstraints.initialize(JSON.parse(fs.readFileSync(path.join(root,c.views.find(v=>v.key===view).json))));
};
const options={margin:6,stub:28,bendCost:40,crossingCost:180,overlapCost:2,edgeSpacing:12,sides:'any',style:'orthogonal'};
function noSpurs(ps){for(let i=2;i<ps.length;i++){
  const a=ps[i-2],b=ps[i-1],c=ps[i],ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;
  assert.ok(Math.abs(ux*vy-uy*vx)>1e-6||ux*vx+uy*vy>=0,'route retraces a corner');
}}
function shared(a,b,c,d){
  const eps=1e-6;
  if(Math.abs(a.x-b.x)<eps&&Math.abs(c.x-d.x)<eps&&Math.abs(a.x-c.x)<eps)
    return Math.max(0,Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)));
  if(Math.abs(a.y-b.y)<eps&&Math.abs(c.y-d.y)<eps&&Math.abs(a.y-c.y)<eps)
    return Math.max(0,Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)));
  return 0;
}
test('captured 13-edge layout has no overlapping wires in the merged engine',()=>{
  const g=JSON.parse(fs.readFileSync(path.join(root,'../yworks_edge_router_lab/evidence/verification/overlap-fixture.json')));
  g.caseId='routing-lab';g.canvas=[1100,720];const before=E.clone(g.nodes);
  const out=E.routeBatch(g,g.edges.map(e=>e.id),{...options,margin:14,stub:28,crossingCost:220,overlapCost:3});
  assert.equal(out.failed,0);assert.equal(out.routed,13);assert.deepEqual(g.nodes,before);
  for(let k=0;k<g.edges.length;k++){
    const ps=g.edges[k].route;noSpurs(ps);
    for(const prior of g.edges.slice(0,k))for(let i=1;i<ps.length;i++)for(let j=1;j<prior.route.length;j++)
      assert.ok(shared(ps[i-1],ps[i],prior.route[j-1],prior.route[j])<1e-6,'collinear wires overlap');
  }
});
test('moving an expanded container carries its descendants and retains semantic evidence',()=>{
  const g=load('Transformer','transformer_programmatic_guide'),before=E.clone(g),container=g.nodes.find(n=>n.expanded);
  const ids=E.move(g,container.id,10,-15);
  assert.ok(ids.size>1);
  for(const n of g.nodes){const old=before.nodes.find(v=>v.id===n.id);assert.equal(n.x,old.x+(ids.has(n.id)?10:0));assert.equal(n.y,old.y+(ids.has(n.id)?-15:0));assert.deepEqual(n.semantic,old.semantic);}
  for(let i=0;i<g.edges.length;i++)assert.deepEqual(g.edges[i].binding,before.edges[i].binding);
});
test('reconnecting changes the visual endpoint and keeps the original route binding',()=>{
  const g=load('alexnet','model_zoo_programmatic_guide'),e=g.edges[0],binding=E.clone(e.binding),n=g.nodes.find(n=>n.id!==e.target&&!n.expanded);
  E.reconnect(g,e,'target',n.id,{side:'left',fraction:.4});
  assert.equal(e.target,n.id);assert.equal(e.draft,true);assert.deepEqual(e.binding,binding);
  assert.deepEqual(e.route.at(-1),E.endpoint(g,e,'target'));
});
test('selected-edge scope preserves all unselected routes and all node geometry',()=>{
  const g=load('Transformer','transformer_programmatic_guide'),before=E.clone(g),e=g.edges[0];
  const out=E.routeBatch(g,[e.id],options);assert.equal(out.failed,0);
  assert.deepEqual(g.nodes,before.nodes);
  for(let i=1;i<g.edges.length;i++)assert.deepEqual(g.edges[i],before.edges[i]);
});
test('all representative collections reroute without losing fixed ports or source bindings',()=>{
  for(const [title,coll]of [['appnp propagation','module_programmatic_guide'],['alexnet','model_zoo_programmatic_guide'],['autoformer','timeseries_programmatic_guide'],['Transformer','transformer_programmatic_guide'],['PyTorch Transformer · 原始图','pytorch_transformer_original']]){
    const g=load(title,coll),before=E.clone(g),out=E.routeBatch(g,g.edges.map(e=>e.id),options);
    assert.equal(out.failed,0,title);assert.deepEqual(g.nodes,before.nodes);
    for(let i=0;i<g.edges.length;i++){const e=g.edges[i];noSpurs(e.route);assert.deepEqual(e.binding,before.edges[i].binding);assert.ok(R.dist(e.route[0],E.endpoint(g,e,'source'))<1e-6);assert.ok(R.dist(e.route.at(-1),E.endpoint(g,e,'target'))<1e-6);}
  }
});
test('arrow and style rendering is finite and leaves canonical geometry unchanged',()=>{
  const g=load('Transformer','transformer_programmatic_guide'),before=E.clone(g.edges);
  for(const e of g.edges)for(const style of ['orthogonal','curved','octilinear']){
    const temp={...e,style},ps=E.displayed(g,temp),d=E.path(E.crop(ps,true,true),style);
    assert.ok(d&&!/NaN|Infinity/.test(d));assert.ok(!/NaN|Infinity/.test(E.arrow(ps.at(-1),ps.at(-2))));
  }
  assert.deepEqual(g.edges,before);
});
test('arrow tips match the original SVG refX=9/refY=4 in each direction',()=>{
  const tip={x:100,y:100};
  for(const from of [{x:80,y:100},{x:120,y:100},{x:100,y:80},{x:100,y:120}]){
    const values=E.arrow(tip,from).match(/[-+]?\d*\.?\d+/g).map(Number);
    assert.deepEqual(values.slice(2,4),[tip.x,tip.y]);
    const base={x:(values[0]+values[4])/2,y:(values[1]+values[5])/2};
    assert.equal(R.dist(base,tip),9);assert.equal(Math.hypot(values[4]-values[0],values[5]-values[1]),8);
    const ps=[from,tip],before=E.clone(ps),wire=E.crop(ps,false,true);
    assert.deepEqual(wire.at(-1),tip);assert.deepEqual(ps,before);
  }
});
test('Path As Needed detects intermediate overlapping routes',()=>{
  const nodes=[{id:'a',x:20,y:20,w:20,h:20},{id:'b',x:100,y:20,w:20,h:20},{id:'c',x:20,y:80,w:20,h:20},{id:'d',x:100,y:80,w:20,h:20}];
  const g={nodes,canvas:[200,200],edges:[{id:'1',source:'a',target:'b',style:'orthogonal',route:[{x:40,y:30},{x:70,y:30},{x:70,y:70},{x:100,y:70}]},{id:'2',source:'c',target:'d',route:[{x:40,y:90},{x:70,y:90},{x:70,y:50},{x:100,y:50}]}]};
  assert.equal(E.conflicts(g,g.edges[0],{...options,margin:1}),true);
});
test('tensor aliases stay in their canonical owner scope and move with it',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),alias=g.nodes.find(n=>n.id==='enc.ffn.input_value');
  assert.equal(alias.parent,'enc.ffn');assert.equal(alias.visualBinding.canonical,'enc.ffn:in');
  const before=E.clone(g),ids=E.move(g,'enc.layer_i',10,0);assert.ok(ids.has(alias.id));
  const old=before.nodes.find(n=>n.id===alias.id);assert.equal(alias.x,old.x+10);assert.equal(alias.y,old.y);
});
test('Memory is on the encoder-to-cross-attention route in every Transformer view',()=>{
  for(const title of ['Transformer','Transformer · compact'])for(const view of ['overview','modules','detailed']){
    const g=load(title,'transformer_programmatic_guide',view),memory=g.nodes.find(n=>n.id==='enc.memory.value');
    assert.equal(memory.visualBinding.canonical,'enc.output:out');
    const entering=g.edges.filter(e=>e.target===memory.id),leaving=g.edges.filter(e=>e.source===memory.id);
    assert.ok(entering.length&&leaving.length,'Memory requires an input and an output continuation');
    for(const e of entering){assert.equal(e.fixedTarget.side,'top');assert.ok(e.binding.canonical_src.startsWith('enc.norm2'));}
    assert.equal(new Set(entering.map(e=>JSON.stringify(e.fixedTarget))).size,1,'one Memory value uses one shared input slot');
    for(const e of leaving){assert.equal(e.fixedSource.side,'bottom');assert.ok(e.binding.canonical_dst.startsWith('dec.cross'));}
    if(view==='detailed')assert.deepEqual(new Set(leaving.map(e=>e.binding.canonical_dst)),new Set(['dec.cross.k:in','dec.cross.v:in']));
    const before=E.clone(g.semanticBaseline),out=E.routeBatch(g,[...entering,...leaving].map(e=>e.id),options);
    assert.equal(out.failed,0);assert.deepEqual(g.semanticBaseline,before);
    if(entering.length>1)assert.deepEqual(entering[0].route,entering[1].route,'shared Memory trunk remains one path after routing');
    assert.equal(globalThis.SummarySourceContracts.validateGraph(g).ok,true);
  }
});
test('source corruption and missing connections cannot become valid on reinitialization',()=>{
  const C=globalThis.SummaryConstraints,S=globalThis.SummarySourceContracts;
  const g=load('Transformer','transformer_programmatic_guide','detailed'),edge=g.edges.find(e=>e.source==='enc.memory.value');
  edge.target='dec.cross.q';delete edge.contract;C.initialize(g);
  assert.equal(S.validateGraph(g).ok,false);assert.equal(C.validate(g,edge,edge.route).ok,false);
  const missing=load('Transformer','transformer_programmatic_guide','detailed');missing.edges.shift();C.initialize(missing);
  assert.ok(S.validateGraph(missing).violations.some(v=>v.includes('source connection missing')));
  const undeclared=load('Transformer','transformer_programmatic_guide','detailed'),e=undeclared.edges[0];delete e.contract;
  assert.ok(C.validate(undeclared,e,e.route).violations.includes('missing routing/source contract'));
});
test('a child cannot be dragged outside its enclosing module',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),n=g.nodes.find(n=>n.id==='enc.self.sdpa.mask'),parent=g.nodes.find(p=>p.id===n.parent);
  E.move(g,n.id,-10000,0);assert.ok(n.x>=parent.x&&n.x+n.w<=parent.x+parent.w);assert.equal(n.parent,parent.id);
});
test('distinct collapsed fields get separate physical ports without changing their traces',()=>{
  const g=load('autoformer','timeseries_programmatic_guide');
  const a=g.edges.find(e=>e.binding.semantic_src==='af_x_mark_enc'),b=g.edges.find(e=>e.binding.semantic_src==='af_x_mark_dec'),m=g.edges.find(e=>e.binding.semantic_src==='af_memory');
  assert.ok(R.dist(E.endpoint(g,a,'target'),E.endpoint(g,b,'target'))>=11.9);
  assert.ok(R.dist(E.endpoint(g,a,'target'),E.endpoint(g,m,'source'))>=11.9);
  assert.equal(a.binding.semantic_dst,'af_enc_embedding_time');assert.equal(b.binding.semantic_dst,'af_dec_embedding_time');assert.equal(m.binding.semantic_dst_port,'memory_KV');
});
test('cross-module routes use recorded gates and avoid unrelated container interiors',()=>{
  const g={canvas:[900,650],nodes:[{id:'root',x:40,y:40,w:800,h:560,expanded:true,routingObstacle:false},{id:'left',parent:'root',x:100,y:100,w:160,h:200,expanded:true,routingObstacle:false},{id:'right',parent:'root',x:550,y:100,w:160,h:200,expanded:true,routingObstacle:false},{id:'other',parent:'root',x:350,y:50,w:140,h:300,expanded:true,routingObstacle:false},{id:'s',parent:'left',x:150,y:180,w:60,h:40},{id:'t',parent:'right',x:590,y:180,w:60,h:40}],edges:[{id:'cross',source:'s',target:'t',fixedSource:{side:'right',fraction:.5},fixedTarget:{side:'left',fraction:.5},style:'orthogonal',waypoints:[],binding:{canonical_src:'s:out',canonical_dst:'t:in'},route:[{x:210,y:200},{x:320,y:200},{x:320,y:380},{x:520,y:380},{x:520,y:200},{x:590,y:200}]}]};
  const C=globalThis.SummaryConstraints;C.initialize(g);const gates=E.clone(g.edges[0].contract.gates),r=E.routeBatch(g,['cross'],options);
  assert.equal(r.failed,0);assert.deepEqual(g.edges[0].contract.gates,gates);assert.equal(C.validate(g,g.edges[0],g.edges[0].route).ok,true);
  const other=g.nodes.find(n=>n.id==='other');for(let i=1;i<g.edges[0].route.length;i++)assert.equal(R.intersectsRect(g.edges[0].route[i-1],g.edges[0].route[i],other),false);
  const wrong=[{x:210,y:200},{x:590,y:200}];assert.equal(C.validate(g,g.edges[0],wrong).ok,false);
});
test('fork/collection skeletons retain explicit junctions and do not become sums',()=>{
  const g=load('autoformer','timeseries_programmatic_guide','modules'),buses=g.edges.filter(e=>e.contract.bus);assert.ok(buses.length>0);
  const before=E.clone(buses);E.routeBatch(g,buses.map(e=>e.id),options);
  for(let i=0;i<buses.length;i++){assert.deepEqual(buses[i].route,before[i].route);assert.deepEqual(buses[i].binding.semantic_trace,before[i].binding.semantic_trace);}
  assert.ok(g.edges.some(e=>e.id.includes('.part')),'bus trunks must be split at interior junctions');
  assert.ok(g.nodes.filter(n=>n.junction).every(n=>n.parent));
});
test('an undeclared producer swap is rejected even if its geometry looks legal',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),e=g.edges.find(e=>e.binding.canonical_dst==='dec.cross.k:in');
  e.target='dec.cross.q';const r=globalThis.SummaryConstraints.validate(g,e,e.route);assert.equal(r.ok,false);assert.ok(r.violations.some(v=>v.includes('producer/consumer')));
});
test('TimeMixer list members retain distinct terminal slots and source traces',()=>{
  for(const collection of ['timeseries_programmatic_guide','arrow_semantic_audit']){
    const g=load('timemixer',collection,'detailed'),es=g.edges.filter(e=>e.target==='tm.collect'&&e.binding.representation==='typed_auxiliary');
    assert.equal(es.length,3);assert.equal(new Set(es.map(e=>JSON.stringify(e.route.at(-1)))).size,3);
    assert.equal(new Set(es.map(e=>e.binding.semantic_trace[0])).size,3);
    for(const e of es)assert.equal(globalThis.SummaryConstraints.validate(g,e,e.route).ok,true);
    for(let i=0;i<es.length;i++)for(const other of es.slice(0,i))for(let j=1;j<es[i].route.length;j++)for(let k=1;k<other.route.length;k++)assert.equal(shared(es[i].route[j-1],es[i].route[j],other.route[k-1],other.route[k]),0);
  }
});
test('curved rendering cannot cut through a sibling container corner',()=>{
  const g={canvas:[300,300],nodes:[{id:'s',x:0,y:80,w:20,h:20},{id:'t',x:180,y:240,w:20,h:20},{id:'block',x:80,y:120,w:80,h:80,expanded:true}],edges:[]};
  const e={id:'curve',source:'s',target:'t',style:'curved',binding:{},route:[{x:20,y:90},{x:70,y:90},{x:70,y:210},{x:190,y:210},{x:190,y:240}]};g.edges=[e];globalThis.SummaryConstraints.initialize(g);
  const radius=E.curveRadius(g,e,e.route),sample=E.curvePoints(e.route,radius);
  assert.equal(globalThis.SummaryConstraints.validate(g,{...e,style:'octilinear'},sample).ok,true);
  assert.ok(!/NaN|Infinity/.test(E.path(e.route,'curved',g,e)));
});
test('dragging K repairs both short connections immediately and carries its variable and shape',()=>{
  const C=globalThis.SummaryConstraints,S=globalThis.SummarySourceContracts;
  for(const title of ['Transformer','Transformer · compact'])for(const [dx,dy]of title==='Transformer'?[[30,0],[0,8],[-28,-6],[22,5]]:[[12,0],[0,8],[-8,-6],[10,5]]){
    const g=load(title,'transformer_programmatic_guide','detailed'),before=E.clone(g),n=g.nodes.find(n=>n.id==='enc.self.k.value');
    const ids=E.move(g,n.id,dx,dy);assert.ok(ids.has(n.id),JSON.stringify(g.lastMove));
    const attachments=g.attachments.filter(a=>a.owner===n.id);assert.ok(attachments.length>=2,'role and shape have explicit owners');
    for(const a of attachments)assert.deepEqual(E.attachmentTransform(g,a),{x:dx,y:dy});
    for(const e of g.edges){assert.equal(C.validate(g,e,e.route).ok,true,e.id);noSpurs(e.route);}
    assert.equal(S.validateGraph(g).ok,true);
    for(let i=0;i<g.edges.length;i++){const e=g.edges[i];assert.deepEqual(e.binding,before.edges[i].binding);assert.deepEqual(e.fixedSource,before.edges[i].fixedSource);assert.deepEqual(e.fixedTarget,before.edges[i].fixedTarget);}
  }
});
test('an unsafe short-arrow drag is rolled back as one node-and-wire operation',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),before=E.clone(g),n=g.nodes.find(n=>n.id==='enc.self.k.value');
  const ids=E.move(g,n.id,0,22);assert.equal(ids.size,0);assert.equal(g.lastMove.blocked,true);
  assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges,before.edges);assert.deepEqual(g.attachments,before.attachments);
});
test('container headings and nested annotations follow once; history copies retain ownership',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),before=E.clone(g),ids=E.move(g,'enc.layer_i',10,0);
  assert.ok(ids.size>1,JSON.stringify(g.lastMove));
  const labels=g.attachments.filter(a=>ids.has(a.owner));assert.ok(labels.length>20);
  for(const a of labels)assert.deepEqual(E.attachmentTransform(g,a),{x:10,y:0});
  for(const restored of [E.clone(before),E.clone(g)])assert.equal(globalThis.SummarySourceContracts.validateGraph(restored).ok,true);
  assert.deepEqual(g.attachments,before.attachments);
});
test('presentation owner tampering cannot pass by reinitializing the visual graph',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),a=g.attachments.find(a=>a.owner==='enc.self.k.value');
  a.owner='enc.self.q.value';globalThis.SummaryConstraints.initialize(g);
  assert.equal(globalThis.SummarySourceContracts.validateGraph(g).ok,false);
});
test('drag validator rejects wrong port normals and an arrow squeezed between nearby glyphs',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),C=globalThis.SummaryConstraints;
  const e=g.edges.find(e=>e.source==='enc.self.k'&&e.target==='enc.self.k.value'),s=E.endpoint(g,e,'source'),t=E.endpoint(g,e,'target');
  const backwards=[s,{x:s.x,y:s.y+12},{x:s.x+8,y:s.y+12},{x:s.x+8,y:t.y+12},{x:t.x,y:t.y+12},t];
  assert.ok(C.validate(g,e,backwards).violations.includes('wrong source port approach'));
  const value=g.nodes.find(n=>n.id==='enc.self.k.value');value.y+=22;e.route=[s,E.endpoint(g,e,'target')];
  assert.ok(C.validate(g,e,e.route).violations.includes('insufficient arrow terminal'));
});
test('PE crossing to the right selects left-to-right physical ports and keeps its model field',()=>{
  for(const view of ['overview','modules','detailed']){
    const g=load('Transformer','transformer_programmatic_guide',view),before=E.clone(g),e=g.edges.find(e=>e.source==='src_pe.buffer');
    assert.ok(E.move(g,'src_pe.buffer',460,-38).has('src_pe.buffer'),JSON.stringify(g.lastMove));
    assert.equal(e.physicalSource.side,'left');assert.equal(e.physicalTarget.side,'right');
    assert.ok(R.stats([e]).length<250);assert.equal(e.route.length,4);noSpurs(e.route);
    assert.equal(globalThis.SummarySourceContracts.validateGraph(g).ok,true);
    const original=before.edges.find(v=>v.id===e.id);assert.deepEqual(e.fixedSource,original.fixedSource);assert.deepEqual(e.binding,original.binding);
    assert.equal(g.irSha256,before.irSha256);assert.deepEqual(g.semanticBaseline,before.semanticBaseline);
  }
});
test('short module-to-normalization gap aligns a free slot without a small dogleg',()=>{
  const g=load('Transformer','transformer_programmatic_guide'),e=g.edges.find(e=>e.source==='enc.self'&&e.target==='enc.norm1');
  E.move(g,'enc.self',10,0);assert.equal(g.lastMove.blocked,false);assert.equal(e.route.length,2);assert.equal(e.route[0].x,e.route[1].x);
  assert.equal(globalThis.SummaryConstraints.validate(g,e,e.route).ok,true);
});
test('automatic physical ports cannot replace source authority, circle perimeter, or alias slots',()=>{
  const S=globalThis.SummarySourceContracts;
  for(const corrupt of [
    (g,e)=>{e.portPolicy.target.mode='anything';},
    (g,e)=>{e.physicalTarget={side:'right',fraction:.3,inward:false};},
    (g,e)=>{e.physicalSource={side:'left',fraction:.5,inward:false,offset:{x:90,y:23}};},
    (g,e)=>{e.binding.canonical_dst='src_pe.add:x';},
    (g,e)=>{e.physicalTarget={side:'bottom',fraction:.5,inward:false};},
    g=>{const e=g.edges.find(e=>e.source==='enc.memory.value');e.physicalSource={side:'right',fraction:.5,inward:false};}
  ]){
    const g=load('Transformer','transformer_programmatic_guide','detailed'),e=g.edges.find(e=>e.source==='src_pe.buffer');
    corrupt(g,e);assert.equal(S.validateGraph(g).ok,false);
  }
});
test('old hand-placed drafts migrate presentation metadata without accepting a binding change',()=>{
  const original=load('Transformer','transformer_programmatic_guide','detailed'),saved=E.clone(original);
  E.move(saved,'src_pe.buffer',460,-38);const positions=E.clone(saved.nodes),routes=E.clone(saved.edges.map(e=>e.route));
  for(const e of saved.edges){delete e.portPolicy;delete e.binding.port_authority;}delete saved.semanticBaseline;
  E.upgradePresentation(saved,original);assert.deepEqual(saved.nodes,positions);assert.deepEqual(saved.edges.map(e=>e.route),routes);
  assert.equal(globalThis.SummarySourceContracts.validateGraph(saved).ok,true);
  const bad=E.clone(saved);delete bad.edges[0].binding.port_authority;bad.edges[0].binding.canonical_dst='src_pe.add:x';
  E.upgradePresentation(bad,original);assert.equal(globalThis.SummarySourceContracts.validateGraph(bad).ok,false);
});
test('LayerNorm moves its recorded ancestor exits so its output goes straight up',()=>{
  const C=globalThis.SummaryConstraints;
  for(const title of ['Transformer'])for(const dx of [-30,40]){
    const g=load(title,'transformer_programmatic_guide','detailed'),before=E.clone(g),id='enc.norm2.layernorm';
    const e=g.edges.find(e=>e.source===id&&e.target==='enc.memory.value');
    assert.ok(E.move(g,id,dx,0).has(id),JSON.stringify(g.lastMove));
    const start=E.endpoint(g,e,'source');assert.equal(e.route[1].x,start.x);assert.ok(e.route[1].y<start.y);assert.equal(e.route.length,4);
    const gates=C.activeGates(g,e);assert.ok(gates.length>=2);
    for(const gate of gates){const n=g.nodes.find(n=>n.id===gate.frame);assert.equal(gate.side,'top');assert.ok(Math.abs(C.gatePoint(n,gate).x-start.x)<1e-5);}
    for(const edge of g.edges)assert.equal(C.validate(g,edge,edge.route).ok,true,edge.id);
    assert.equal(C.validateSource(g).ok,true);assert.deepEqual(g.semanticBaseline,before.semanticBaseline);
  }
});
test('source tensor fan-outs share their trunk across views, rerouting and producer moves',()=>{
  const C=globalThis.SummaryConstraints;
  for(const title of ['Transformer','Transformer · compact'])for(const view of ['overview','modules','detailed']){
    const g=load(title,'transformer_programmatic_guide',view),es=g.edges.filter(e=>e.source==='src_pe.add');
    const stems=es.filter(e=>e.portPolicy.source.sharedStem);assert.ok(stems.length>=2);
    const before=E.clone(g.semanticBaseline),out=E.routeBatch(g,es.map(e=>e.id),options);assert.equal(out.failed,0);
    E.move(g,'src_pe.add',8,0);assert.equal(g.lastMove.blocked,false,JSON.stringify(g.lastMove));
    for(const e of stems){assert.equal(C.validate(g,e,e.route).ok,true);const p=C.sharedStemPoint(g,e);assert.ok(Math.abs(e.route[0].x-e.route[1].x)<1e-5);assert.ok(p.y>=Math.min(e.route[0].y,e.route[1].y)-1e-5&&p.y<=Math.max(e.route[0].y,e.route[1].y)+1e-5);}
    assert.deepEqual(g.semanticBaseline,before);
    const bad=E.clone(g),e=bad.edges.find(v=>v.id===stems[0].id);e.portPolicy.source.sharedStem=null;assert.equal(C.validateSource(bad).ok,false);
  }
});
test('registered junction dots follow the actual residual fork, including undo snapshots',()=>{
  const J=globalThis.SummaryJunctionMarkers,C=globalThis.SummaryConstraints;
  for(const title of ['Transformer','Transformer · compact'])for(const view of ['overview','modules','detailed']){
    const g=load(title,'transformer_programmatic_guide',view),producer=view==='detailed'?'enc.norm1.layernorm':'enc.norm1';
    const m=g.junctionMarkers.find(m=>m.owner===producer);assert.ok(m,producer+' '+title+' '+view);
    const before=E.clone(g),old=E.junctionPoint(g,m);assert.ok(old);
    assert.ok(E.move(g,producer,10,0).has(producer),JSON.stringify(g.lastMove));
    const now=E.junctionPoint(g,m);assert.ok(now);
    // A straight output fork follows the producer's lateral displacement.
    // A fork farther along a container corridor follows the actual branch,
    // whose position can remain stable while only the input leg changes.
    const first=before.edges.find(e=>e.id===m.edges[0]),start=E.endpoint(before,first,'source');
    if(first.portPolicy.source.sharedStem?.axis==='y'&&Math.abs(start.x-old.x)<1e-5)assert.equal(now.x,old.x+10);
    for(const id of m.edges)assert.ok(J.contains(g.edges.find(e=>e.id===id).route,now));
    assert.ok(J.rays(m.edges.map(id=>g.edges.find(e=>e.id===id).route),now).size>=3);
    assert.deepEqual(E.junctionPoint(before,m),old);assert.equal(C.validateSource(g).ok,true);
    const loaded=E.clone(g);E.upgradePresentation(loaded,load(title,'transformer_programmatic_guide',view));assert.deepEqual(E.junctionPoint(loaded,m),now);
    for(const n of g.nodes)assert.ok(!(m.fragments||[]).some(f=>n.html.includes(f.html)),'stale dot remains nested under a glyph');
  }
});
test('horizontal, vertical and reversed source forks use one generic route-based marker rule',()=>{
  const J=globalThis.SummaryJunctionMarkers;
  for(const transform of [(x,y)=>({x,y}),(x,y)=>({x:y,y:x}),(x,y)=>({x:-x,y}),(x,y)=>({x,y:-y})]){
    const p=transform(50,20),g={nodes:[{id:'source',x:0,y:0,base:[0,0]}],edges:[
      {id:'a',route:[transform(0,20),p,transform(50,60)]},
      {id:'b',route:[transform(0,20),p,transform(90,20)]}
    ]},m={owner:'source',original:[p.x,p.y],edges:['a','b']};
    assert.deepEqual(J.point(g,m),p);
    g.nodes[0].x+=17;g.nodes[0].y-=11;
    for(const e of g.edges)e.route=e.route.map(v=>({x:v.x+17,y:v.y-11}));
    assert.deepEqual(J.point(g,m),{x:p.x+17,y:p.y-11});
    g.edges[1].draft=true;assert.equal(J.point(g,m),null,'released draft leaves no stale junction');
  }
});
test('crossings without a source fork and forged junction ownership are rejected',()=>{
  const J=globalThis.SummaryJunctionMarkers;
  const g={nodes:[],edges:[{id:'a',route:[{x:0,y:20},{x:80,y:20}]},{id:'b',route:[{x:40,y:0},{x:40,y:60}]}]};
  assert.equal(J.point(g,{original:[40,20],edges:['a','b']}),null);
  const imported=load('Transformer','transformer_programmatic_guide','detailed');imported.junctionMarkers[0].owner='dec.norm3';
  assert.equal(globalThis.SummarySourceContracts.validateGraph(imported).ok,false);
  const disconnected=load('Transformer','transformer_programmatic_guide','detailed'),marker=disconnected.junctionMarkers.find(m=>m.owner==='enc.norm1.layernorm');
  disconnected.edges.find(e=>e.id===marker.edges[0]).route=[{x:0,y:0},{x:10,y:0}];
  assert.equal(globalThis.SummaryConstraints.validateJunctions(disconnected).ok,false);
});
test('legacy SVG dots migrate off unrelated glyphs without resetting manual positions',()=>{
  const original=load('Transformer','transformer_programmatic_guide','detailed'),saved=E.clone(original),m=original.junctionMarkers.find(m=>m.fragments.length);
  assert.ok(m);const fragment=m.fragments[0],owner=saved.nodes.find(n=>n.id===fragment.owner);
  owner.html+=fragment.legacyHtml;owner.x+=10;
  delete saved.junctionMarkers;delete saved.semanticBaseline;
  for(const e of saved.edges)for(const side of ['source','target'])if(e[side]===owner.id&&e.portPolicy[side].shape==='rectangle')e.portPolicy[side].shape='circle';
  const positions=saved.nodes.map(n=>[n.id,n.x,n.y]);E.upgradePresentation(saved,original);
  assert.deepEqual(saved.nodes.map(n=>[n.id,n.x,n.y]),positions);
  assert.ok(!owner.html.includes(fragment.legacyHtml));
  for(const e of saved.edges)for(const side of ['source','target'])if(e[side]===owner.id)assert.equal(e.portPolicy[side].shape,original.edges.find(v=>v.id===e.id).portPolicy[side].shape);
});

test('source-owned wire captions follow A@V moves, history snapshots and rerouting',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),a=g.routeLabels.find(a=>a.canonical_dst==='enc.self.sdpa.av:a');
  assert.ok(a);const before=E.clone(g),p0=E.routeLabelPlacements(g).get(a.id);
  const ids=E.move(g,'enc.self.sdpa.av',120,0,options);assert.ok(ids.has('enc.self.sdpa.av'));
  const p1=E.routeLabelPlacements(g).get(a.id);assert.notDeepEqual(p1.point,p0.point);
  assert.ok(globalThis.SummaryRouteLabels.project(E.labelPath(g,a),p1.point).distance<1e-6);
  assert.ok(globalThis.SummarySourceContracts.validateGraph(g).ok);assert.deepEqual(g.edges.map(e=>e.binding),before.edges.map(e=>e.binding));
  assert.deepEqual(E.routeLabelPlacements(before).get(a.id),p0);
  const undo=E.clone(before),redo=E.clone(g);assert.deepEqual(E.routeLabelPlacements(undo).get(a.id),p0);assert.deepEqual(E.routeLabelPlacements(redo).get(a.id),p1);
  const routed=E.routeBatch(g,g.edges.map(e=>e.id),options);assert.equal(routed.failed,0);
  const final=E.routeLabelPlacements(g).get(a.id);assert.ok(globalThis.SummaryRouteLabels.project(E.labelPath(g,a),final.point).distance<1e-6);
});
test('caption dragging snaps to its registered route in all directions and display styles',()=>{
  const L=globalThis.SummaryRouteLabels;
  for(const route of [[{x:50,y:60},{x:250,y:60}],[{x:250,y:60},{x:50,y:60}],[{x:80,y:50},{x:80,y:250}],[{x:80,y:250},{x:80,y:50}],[{x:50,y:50},{x:50,y:150},{x:250,y:150}]]){
    const g={canvas:[400,400],nodes:[],edges:[{id:'wire',route,style:'orthogonal'}],routeLabels:[{id:'caption',edge:'wire',bbox:[10,10,45,18]}]};const a=g.routeLabels[0];
    assert.ok(E.snapRouteLabel(g,a,{x:120,y:120}));assert.equal(a.edge,'wire');assert.equal(a.anchor.mode,'ratio');
    const p=E.routeLabelPlacements(g).get(a.id);assert.ok(L.project(route,p.point).distance<1e-6);assert.ok(p.score<1e6);
  }
  const g=load('Transformer','transformer_programmatic_guide','detailed'),a=g.routeLabels.find(a=>a.canonical_dst==='enc.self.sdpa.av:a');
  for(const style of ['orthogonal','octilinear','curved']){g.edges.find(e=>e.id===a.edge).style=style;
    const p=E.routeLabelPlacements(g).get(a.id);assert.ok(L.project(E.labelPath(g,a),p.point).distance<1e-6);}
});
test('all current source captions have legal path anchors without covering glyphs',()=>{
  let count=0;const collections=new Set();
  for(const c of catalog.cases.filter(c=>!c.historical))for(const v of c.views){if(!v.json)continue;
    const g=globalThis.SummaryConstraints.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json)))),placements=E.routeLabelPlacements(g);
    for(const a of g.routeLabels||[]){const p=placements.get(a.id);assert.ok(p,`${c.title}/${v.key}/${a.id}`);
      assert.ok(p.score<1e6,`caption collision ${c.title}/${v.key}/${a.id}`);
      assert.ok(globalThis.SummaryRouteLabels.project(E.labelPath(g,a),p.point).distance<1e-6);count++;collections.add(c.collection);
    }
  }
  assert.ok(count>=222);assert.ok(collections.size>=4);
});
test('moving a top-level source scope carries captions in every metadata-emitting collection',()=>{
  for(const [title,collection]of [['Transformer','transformer_programmatic_guide'],['densenet','model_zoo_programmatic_guide'],['highway','module_programmatic_guide'],['timemixer','timeseries_programmatic_guide'],['timemixer','arrow_semantic_audit']]){
    const F=require('../yworks_edge_router_lab/recursive-graph.js'),c=catalog.cases.find(c=>c.title===title&&c.collection===collection&&!c.historical),sources=Object.fromEntries(c.views.filter(v=>v.json).map(v=>[v.key,globalThis.SummaryConstraints.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))))]));
    // Exercise the editor's validated frontier. The archived audit SVG can
    // contain old collection overlaps/retraces that are repaired on import.
    const g=F.all(F.build(F.create(sources)),true);assert.equal(F.route(g).failed,0,title);
    const check=E.validateView(g);assert.ok(check.source.ok&&check.layout.ok&&check.edges.every(([,v])=>v.ok),title);
    const prior=E.clone(g),a=g.routeLabels[0];assert.ok(a,title);
    const parents=E.descendants(g,g.nodes.find(n=>!n.parent&&n.expanded).id),n=g.nodes.find(n=>!n.parent&&n.expanded),p0=E.routeLabelPlacements(g).get(a.id);
    const moved=E.move(g,n.id,8,0,options);assert.ok(moved.size,title);
    const p1=E.routeLabelPlacements(g).get(a.id);assert.ok(globalThis.SummaryRouteLabels.project(E.labelPath(g,a),p1.point).distance<1e-6);
    if(parents.has(g.edges.find(e=>e.id===a.edge).source)&&parents.has(g.edges.find(e=>e.id===a.edge).target))assert.notDeepEqual(p1.point,p0.point,title);
    assert.deepEqual(g.routeLabels,prior.routeLabels);assert.ok(globalThis.SummarySourceContracts.validateGraph(g).ok,title);
  }
});
test('caption source identity is immutable while path position is editable and migrates with drafts',()=>{
  const g=load('Transformer','transformer_programmatic_guide','detailed'),a=g.routeLabels[0],old=E.clone(g);
  E.snapRouteLabel(g,a,{x:300,y:450});const anchor=E.clone(a.anchor);E.upgradePresentation(g,old);assert.equal(g.routeLabels[0],a);assert.deepEqual(g.routeLabels[0].anchor,anchor);
  assert.ok(globalThis.SummarySourceContracts.validateGraph(g).ok);
  g.routeLabels[0].edge=g.edges.find(e=>e.id!==a.edge).id;
  assert.equal(globalThis.SummarySourceContracts.validateGraph(g).ok,false);
  E.upgradePresentation(g,old);assert.equal(globalThis.SummarySourceContracts.validateGraph(g).ok,false);
  const legacy=E.clone(old);delete legacy.routeLabels;const geometry=E.clone(legacy.nodes.map(n=>[n.id,n.x,n.y]));E.upgradePresentation(legacy,old);
  assert.deepEqual(legacy.nodes.map(n=>[n.id,n.x,n.y]),geometry);assert.equal(legacy.routeLabels.length,old.routeLabels.length);
  assert.ok(globalThis.SummarySourceContracts.validateGraph(legacy).ok);
});
test('painted wire clearance rejects near-parallel frame strokes on all four sides',()=>{
  const C=globalThis.SummaryConstraints,n={id:'frame',x:100,y:100,w:200,h:200,expanded:true,html:'<rect stroke-width="2.5"/>'},e={width:2.2};
  for(const route of [[{x:102,y:140},{x:102,y:260}],[{x:298,y:140},{x:298,y:260}],[{x:140,y:102},{x:260,y:102}],[{x:140,y:298},{x:260,y:298}]])assert.equal(C.borderContacts(e,n,route).length,1);
  for(const route of [[{x:106,y:140},{x:106,y:260}],[{x:294,y:140},{x:294,y:260}],[{x:140,y:106},{x:260,y:106}],[{x:140,y:294},{x:260,y:294}],[{x:200,y:90},{x:200,y:150}]])assert.equal(C.borderContacts(e,n,route).length,0);
  assert.equal(C.borderClearance(e,n),4.35);
});
test('all current views keep shaft strokes clear of container frames',()=>{
  for(const c of catalog.cases.filter(c=>!c.historical))for(const v of c.views){if(!v.json)continue;
    const g=globalThis.SummaryConstraints.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))));
    for(const e of g.edges)for(const n of g.nodes.filter(n=>n.expanded))assert.deepEqual(globalThis.SummaryConstraints.borderContacts(e,n,e.route),[],`${c.title}/${v.key}/${e.id}/${n.id}`);
  }
});
test('shared source forks adapt to a wall band and corner gates without changing source evidence',()=>{
  for(const [title,collection,view]of [['resnet','model_zoo_programmatic_guide','overview'],['ccvae','model_zoo_programmatic_guide','modules'],['mixhop layer','module_programmatic_guide','detailed']]){
    const g=load(title,collection,view),before=E.clone(g),out=E.routeBatch(g,g.edges.map(e=>e.id),options);assert.equal(out.failed,0,title);
    for(const e of g.edges)assert.ok(globalThis.SummaryConstraints.validate(g,e,e.route).ok,e.id);
    assert.ok(globalThis.SummaryConstraints.validateJunctions(g).ok,title);assert.deepEqual(g.nodes,before.nodes);assert.deepEqual(g.edges.map(e=>e.binding),before.edges.map(e=>e.binding));
  }
});

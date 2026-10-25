'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
global.EdgeRouterLabRouting=require('../yworks_edge_router_lab/router');
for(const file of ['physical-ports','junction-markers','route-labels','source-contracts','semantic-constraints','graph-engine','runtime-layout','recursive-graph'])require('../yworks_edge_router_lab/'+file);
const G=require('../yworks_edge_router_lab/generic-semantic'),E=global.SemanticEngine,A=global.SemanticAuthoring,F=global.SemanticCompositionLayout;
const read=p=>JSON.parse(fs.readFileSync(p)),copy=v=>JSON.parse(JSON.stringify(v)),ir=read('data/semantic/d6df94c94e8a5888.json');
function ready(){const graph=G.build(ir);assert.equal(G.route(graph).failed,0);assertValid(graph);return graph;}
function assertValid(graph){const check=SummaryEngine.validateView(graph);assert.deepEqual(check.source.violations,[]);assert.deepEqual(check.layout.violations,[]);assert.deepEqual(check.edges.filter(([,v])=>!v.ok),[]);}

test('native F0/F1 retain identical semantic cuts for every catalog model, independent of old geometry',()=>{
 for(const m of read('data/semantic/catalog.json').models){const source=read('data/semantic/'+m.ir);
  for(const action of ['overview','detail']){const state=action==='overview'?F.frontier({mode:'source'},action):G.initial(source),native=G.project(source,state),old=E.project(source,state);
   assert.deepEqual(native.nodes,old.nodes,m.title+' '+action+' nodes');
   const facts=edges=>edges.map(e=>Object.fromEntries(Object.entries(e).filter(([key])=>!['design_route','context_lane'].includes(key))));
   assert.deepEqual(facts(native.edges),facts(old.edges),m.title+' '+action+' edges');
   assert.deepEqual(native.node_accounting,old.node_accounting);assert.deepEqual(native.edge_accounting,old.edge_accounting);
  }
 }
});
test('fully expanding reviewed Transformer restores all source units, edges, call and operand records',()=>{
 const source=read('data/semantic/0216717d966327f4.json'),profile=read('data/semantic/presentations/transformer.json');
 const detail=G.build(source,profile.default_state);assert.equal(detail.nodes.length,82);assert.equal(detail.edges.length,80);
 const columns=detail.generic.layoutRules.moduleColumns;assert.ok(columns.length>1);for(const column of columns)assert.equal(new Set(column.members.map(id=>detail.nodes.find(n=>n.id===id).w)).size,1);
 const streams=detail.nodes.filter(n=>n.semantic.semantic_type==='source-function'&&n.expanded&&detail.nodes.find(p=>p.id===n.parent)?.modelHeading);assert.equal(streams.length,2);assert.equal(streams[0].y,streams[1].y);assert.notEqual(streams[0].h,streams[1].h);
 const bound=detail.nodes.filter(n=>n.semantic.invocation_binding);assert.ok(bound.length);for(const n of bound){const owner=detail.nodes.find(p=>p.id===n.parent);assert.ok(n.y>=owner.y+40);assert.ok(n.y+n.h<owner.y+owner.h);}
 const full=G.operate(detail,{kind:'all',open:true});assert.equal(full.nodes.length,3371);assert.equal(full.edges.length,3663);assert.deepEqual(full.generic.ir,source);assert.equal(G.validate(full).ok,true);
 const by=new Map(source.edges.map(e=>[e.id,e]));for(const edge of full.edges)assert.deepEqual(Object.fromEntries(Object.keys(by.get(edge.id)).map(k=>[k,edge.binding[k]])),by.get(edge.id));
});
test('canonical source, operands, node ownership, boundary order and lane identity cannot be changed by geometry',()=>{
 const graph=ready();
 for(const mutate of [g=>{g.edges[0].binding.target_port='wrong';},g=>{g.edges[0].source=g.edges[0].target;},g=>{g.edges[0].contract.wire='pretend-shared';},g=>{g.nodes.at(-1).parent=null;},g=>{g.edges.pop();},g=>{g.generic.receipts.node_accounting={};}]){const changed=copy(graph);mutate(changed);assert.equal(G.validate(changed).ok,false);}
 const nested=graph.edges.find(e=>G.boundarySequence(graph,e).length);assert.ok(nested);assert.equal(G.boundaryErrors(graph,nested,[]).length,1);
});
test('native save/load restores complete IR and original layout; tampered and duplicate layout imports fail atomically',()=>{
 const graph=ready(),document=G.document(graph),payload=G.read(copy(document)),base=G.build(payload.ir,payload.state,{layouts:payload.layouts});
 G.restore(base,payload.nativeLayout);assert.deepEqual(G.document(base),document);assertValid(base);
 for(const bad of [layout=>{layout.nodes[1]=copy(layout.nodes[0]);},layout=>{layout.edges[0].binding.source_port='changed';},layout=>{layout.nodes[0].x=NaN;}]){const layout=copy(document.nativeLayout);bad(layout);const before=JSON.stringify(base);assert.throws(()=>G.restore(base,layout));assert.equal(JSON.stringify(base),before);}
});
test('frontier round trips preserve parent movement, arrow drafts and native physical ports',()=>{
 let graph=ready();const roots=graph.nodes.filter(n=>!n.parent);assert.ok(roots.length);SummaryEngine.move(graph,roots[0].id,24,0,G.routeOptions());assertValid(graph);
 const first=graph.edges[0];first.arrow='open';const before=G.layoutSnapshot(graph);
 let overview=G.operate(graph,{kind:'frontier',action:'overview'});G.route(overview);
 graph=G.operate(overview,{kind:'frontier',action:'detail'});assert.equal(graph.nativeLayoutRestored,true);assert.deepEqual(G.layoutSnapshot(graph),before);assertValid(graph);
 const saved=G.document(graph),restored=G.read(saved);assert.ok(restored.layouts.length);
});
test('legacy canvas, architecture, authoring and plain IR preserve provenance without interpreting old coordinates',()=>{
 for(const value of [ir,{schema:'semantic-canvas/1',ir,state:{view:'publication',mode:'source',canvasPlacement:{invalid:'old renderer'}}},{schema:'archcanvas-architecture-document/1',ir,state:G.initial(ir)},A.fromIR(ir)]){
  const payload=G.read(value),graph=G.build(payload.ir,payload.state,{authoring:payload.authoring,migration:payload.migration});assert.deepEqual(graph.generic.ir,ir);assert.equal(G.validate(graph).ok,true);if(value.schema!==ir.schema)assert.deepEqual(graph.generic.migration.original,value);
 }
});
test('atomic assembly and real semantic edits use the native host without source writeback or false old certificates',()=>{
 const presets=read('data/semantic/authoring-presets.json').modules,d=A.empty('Assembled'),one=A.add(d,presets.find(p=>p.title==='Linear')).roots[0],two=A.add(d,presets.find(p=>p.title==='Add')).roots[0];
 const wire=A.connect(d,A.ports(d,one).outputs[0],A.ports(d,two).inputs[1]);A.validate(d);
 const source=A.sourceIR(d),graph=G.build(source,SemanticPublication.fullyExpanded(source,{mode:'merged'},E),{authoring:d});assert.ok(graph.edges.find(e=>e.id===wire.id));assert.equal(G.validate(graph).ok,true);assert.deepEqual(G.read(G.document(graph)).authoring,d);
 const raw=d.nodes.find(n=>n.operator==='linear');A.editNode(d,raw.id,{label:'Independent rename'});const edited=A.sourceIR(d);assert.equal(edited.semantic_contracts.length,0);assert.ok(edited.authoring.edited);assert.ok(raw.source_provenance);assert.equal(G.validate(G.build(edited)).ok,true);
});
test('renaming model and all labels changes presentation without changing native routing constraints or bindings',()=>{
 const renamed=copy(ir);renamed.title='Unseen model';for(const n of renamed.nodes)n.label='Unit '+n.id;
 const source=JSON.stringify(renamed),graph=G.build(renamed);assert.equal(G.validate(graph).ok,true);assert.equal(G.route(graph).failed,0);assertValid(graph);assert.equal(JSON.stringify(renamed),source);
});
test('spatial prior indexing and admissible A-star retain native route validity and route cost',()=>{
 const R=EdgeRouterLabRouting,nodes=[{id:'a',x:40,y:100,w:60,h:40},{id:'b',x:380,y:220,w:60,h:40},{id:'wall',x:210,y:50,w:70,h:180}],edge={source:'a',target:'b'},prior=[[{x:160,y:30},{x:160,y:310}]],settings={width:600,height:400,margin:8,stub:20,crossingCost:180,bendCost:40,edgeSpacing:0};
 const regular=R.routeEdge(edge,nodes,prior,settings),fast=R.routeEdge(edge,nodes,prior,{...settings,spatialPrior:true,aStar:true});assert.equal(regular.ok,true);assert.equal(fast.ok,true);assert.equal(fast.cost,regular.cost);
});

test('expanded-frame interfaces preserve outside ingress and inside egress without a fictitious boundary reversal',()=>{
 const m=read('data/semantic/catalog.json').models.find(m=>m.title==='LoopWithBoundary'),source=read('data/semantic/'+m.ir),graph=G.build(source);
 assert.equal(G.route(graph).failed,0);assertValid(graph);const wire=graph.edges.find(e=>graph.nodes.find(n=>n.id===e.target)?.expanded);assert.ok(wire);
 const bad=copy(graph);bad.edges.find(e=>e.id===wire.id).route[1]={x:NaN,y:0};assert.equal(SummaryConstraints.validate(bad,bad.edges.find(e=>e.id===wire.id),bad.edges.find(e=>e.id===wire.id).route).ok,false);
});

test('bounded native routing exposes pending geometry, preserves it in documents, and continues without changing any facts',()=>{
 const graph=G.build(ir),initial=JSON.stringify(graph.generic.ir),result=G.route(graph,{budgetMs:0});assert.equal(result.pending,graph.edges.length);assert.equal(G.validate(graph).ok,true);
 const validation=SummaryEngine.validateView(graph);assert.equal(validation.routing.pending.length,graph.edges.length);assert.ok(validation.edges.every(([,v])=>!v.ok));
 const payload=G.read(G.document(graph)),loaded=G.restore(G.build(payload.ir,payload.state),payload.nativeLayout);assert.equal(loaded.nativeRouting.pending,graph.edges.length);
 assert.equal(G.route(loaded).pending,0);assertValid(loaded);assert.equal(JSON.stringify(loaded.generic.ir),initial);
});
test('canonical local focus retains complete IR and accounting, and can return to the full source cut',()=>{
 const source=read('data/semantic/0216717d966327f4.json'),full=G.build(source,SemanticPublication.fullyExpanded(source,{view:'publication',mode:'source'},E));
 const owner=source.nodes.find(n=>n.kind==='composite'&&source.nodes.some(c=>c.parent===n.id)&&n.parent),local=G.operate(full,{kind:'focus',id:owner.id});
 const inside=new Set([owner.id]);let previous=-1;while(previous!==inside.size){previous=inside.size;for(const n of source.nodes)if(inside.has(n.parent))inside.add(n.id);}
 assert.ok(local.nodes.length>1);assert.equal(local.nodes.length,inside.size);assert.ok(local.nodes.length<full.nodes.length);assert.equal(local.generic.state.paperCanonical,true);assert.deepEqual(local.generic.ir,source);assert.equal(G.validate(local).ok,true);
 const back=G.operate(local,{kind:'back'});assert.equal(back.nodes.length,3371);assert.equal(back.edges.length,3663);assert.equal(G.validate(back).ok,true);
});

test('outer model is a heading, with no invisible wall, while exact source ownership remains enforced',()=>{
 const graph=ready(),heading=graph.nodes.find(n=>n.modelHeading);assert.ok(heading);assert.ok(!heading.html.includes('<rect'));assert.ok(heading.labelObstacles.length>=2);
 assert.deepEqual(SummaryConstraints.crossings([{x:heading.x-10,y:heading.y+100},{x:heading.x+heading.w+10,y:heading.y+100}],heading),[]);
 assert.deepEqual(SummaryConstraints.walls(heading,[]),[]);
 assert.ok(graph.edges.every(e=>G.boundarySequence(graph,e).every(b=>b.frame!==heading.id)));
 const child=graph.nodes.find(n=>n.parent===heading.id);assert.ok(child);const moved=copy(graph),item=moved.nodes.find(n=>n.id===child.id);item.x=heading.x+heading.w+100;
 assert.ok(!G.nodeErrors(moved).some(e=>e.includes('leaves source owner')));assert.equal(item.parent,heading.id);
 const bad=copy(graph);bad.nodes.find(n=>n.id===child.id).modelHeading=true;assert.equal(G.validate(bad).ok,false);
 const cut={nodes:[{id:'root',kind:'composite'},{id:'child',kind:'compute',parent:'root'}],positions:new Map([['root',{expanded:true}]]),edges:[]};
 assert.deepEqual([...G.headingIds(cut)],['root']);cut.edges=[{source:'root',target:'child'}];assert.equal(G.headingIds(cut).size,0);cut.edges=[];cut.positions.get('root').expanded=false;assert.equal(G.headingIds(cut).size,0);
});
test('semantic palette distinguishes certified roles and structural regions independently of labels',()=>{
 const roles=['multihead-attention','feed-forward','certified-role-stage'],fills=roles.map(semantic_type=>G.color({kind:'composite',semantic_type}));assert.equal(new Set(fills).size,3);assert.notEqual(G.color({kind:'compute',operator:'convolution'}),G.color({kind:'compute',operator:'activation'}));assert.notEqual(G.color({kind:'compute',operator:'reshape'}),G.color({kind:'compute',operator:'linear'}));
 assert.equal(G.color({kind:'composite',label:'attention'}),G.color({kind:'composite',label:'unrecognized'}));
 assert.notEqual(G.color({kind:'composite'},0),G.color({kind:'composite'},1));assert.notEqual(G.color({kind:'composite'},0,0),G.color({kind:'composite'},0,1));
 const before=G.build(ir),renamed=copy(ir);renamed.title='Novel program';for(const n of renamed.nodes)n.label='Unit '+n.id;
 const after=G.build(renamed);assert.deepEqual(before.nodes.map(n=>[n.id,n.fill]),after.nodes.map(n=>[n.id,n.fill]));
});
test('previous native renderer documents preserve their layouts as provenance and rebuild new heading geometry',()=>{
 const graph=ready(),old=G.document(graph);old.renderer='native-semantic/3';const saved=copy(old.nativeLayout),payload=G.read(old);
 assert.equal(payload.nativeLayout,null);assert.deepEqual(payload.migration.previousNativeLayout,saved);assert.deepEqual(payload.ir,ir);assert.equal(payload.migration.previousRenderer,'native-semantic/3');const minimal=copy(old);delete minimal.nativeLayout;assert.equal(G.read(minimal).migration.previousNativeLayout,null);
 const rebuilt=G.build(payload.ir,payload.state,{migration:payload.migration});assert.ok(rebuilt.nodes.some(n=>n.modelHeading));assert.equal(G.validate(rebuilt).ok,true);
});

test('short model headings fit both title and annotation above their centered source children',()=>{
 const graph=G.build(ir),heading=graph.nodes.find(n=>n.modelHeading);assert.ok(heading);
 for(const b of heading.labelObstacles){assert.ok(b.x>=0);assert.ok(b.x+b.w<=heading.w);}
 const children=graph.nodes.filter(n=>n.parent===heading.id);assert.ok(children.every(n=>n.y>heading.y+Math.max(...heading.labelObstacles.map(b=>b.y+b.h))));
 const moved=copy(graph),first=moved.nodes.filter(n=>n.parent===heading.id).sort((a,b)=>a.x-b.x)[0],before=first.x;
 SummaryEngine.movePreview(moved,first.id,3-before,0);assert.equal(first.x,3);assert.ok(first.x<heading.x);assert.equal(G.nodeErrors(moved).length,0);
});
test('bounded crossing refinement keeps semantic bindings and commits only a global visual improvement',()=>{
 const source=read('data/semantic/0216717d966327f4.json'),graph=G.build(source);G.route(graph,{refineCrossings:false});
 const before=EdgeRouterLabRouting.stats(graph.edges),bindings=graph.edges.map(e=>copy(e.binding));
 G.route(graph,{refinementBudgetMs:Infinity});const after=EdgeRouterLabRouting.stats(graph.edges);
 assert.ok(graph.nativeRefinement.accepted>0);assert.ok(after.crossings<before.crossings);assert.ok(after.length<=before.length*1.04);assert.deepEqual(graph.edges.map(e=>e.binding),bindings);assertValid(graph);
});

test('regular columns and vertical paths follow dependencies, with parallel, conditional and cycle counterexamples',()=>{
 const L=global.SemanticLayout;
 function sample(variant){
  const nodes=[{id:'r',kind:'composite',semantic_type:'source-function'},...['m','n'].map(id=>({id,parent:'r',kind:'composite',semantic_type:'source-module'})),
   ...['a','b','c'].map(id=>({id,parent:'m',kind:'compute'})),...['d','e','f'].map(id=>({id,parent:'n',kind:'compute'}))];
  const edge=(source,target)=>({id:source+target,source,target,kind:'data'}),edges=[edge('a','b'),edge('b','c'),edge('d','f'),edge('e','f')];
  if(variant!=='parallel')edges.push(edge('c','d'));if(variant==='cycle')edges.push(edge('f','a'));if(variant==='conditional')nodes.find(n=>n.id==='m').condition={source:'flag'};if(variant==='control')edges.at(-1).kind='control';
  const idx={nodes:new Map(nodes.map(n=>[n.id,n])),children:new Map()};for(const n of nodes){const parent=n.parent||null;if(!idx.children.has(parent))idx.children.set(parent,[]);idx.children.get(parent).push(n.id);}
  const options={regularModuleColumns:true,foldSerial:false,framePadding:20,frameHeader:50,gapX:32,gapY:36,nodeSize:n=>({w:['d','e','f'].includes(n.id)?240:112,h:44})};
  return {idx,edges,visible:new Set(nodes.map(n=>n.id)),options};
 }
 const value=sample(),layout=direction=>L.layout(value.idx,['r'],value.visible,value.edges,{}, {...value.options,direction}),down=layout('down'),up=layout('up');
 assert.equal(down.context.moduleColumns.length,1);assert.equal(down.get('m').w,down.get('n').w);assert.equal(down.context.localPathRows.length,0);
 for(const p of [down,up]){const [a,b,c]=['a','b','c'].map(id=>p.get(id));assert.equal(a.x+a.w/2,b.x+b.w/2);assert.equal(b.x+b.w/2,c.x+c.w/2);assert.ok(p===down?a.y+a.h<b.y&&b.y+b.h<c.y:c.y+c.h<b.y&&b.y+b.h<a.y);}
 for(const p of [down,up]){assert.equal(p.get('d').y,p.get('e').y);assert.ok(p.get('d').x+p.get('d').w<p.get('e').x);}
 assert.ok(down.get('m').y<down.get('n').y);assert.ok(up.get('m').y>up.get('n').y);assert.equal(down.get('r').h,up.get('r').h);
 for(const [id,p]of up){const owner=up.get(value.idx.nodes.get(id).parent);if(owner){assert.ok(p.y>=owner.y+owner.header);assert.ok(p.y+p.h<=owner.y+owner.h);}}
 for(const variant of ['parallel','cycle','conditional','control']){const s=sample(variant),p=L.layout(s.idx,['r'],s.visible,s.edges,{},s.options);assert.equal(p.context.moduleColumns.length,0,variant);assert.equal(p.context.localPathRows.length,0,variant);}
});

test('native semantic colors reserve yellow for certified regions and keep ordinary operations neutral',()=>{
 assert.notEqual(G.color({kind:'compute',operator:'add'}),G.color({kind:'composite',semantic_type:'certified-role-stage'}));
 assert.notEqual(G.color({kind:'compute',operator:'normalization'}),G.color({kind:'composite',semantic_type:'certified-role-stage'}));
 assert.notEqual(G.color({kind:'composite',semantic_type:'scaled-dot-product-attention'}),G.color({kind:'composite',semantic_type:'multihead-attention'}));
 assert.equal(G.color({kind:'compute',label:'Multi-head attention'}),G.color({kind:'compute',label:'arbitrary'}));
 const graph=ready(),old=G.document(graph);old.renderer='native-semantic/7';const loaded=G.read(old);assert.equal(loaded.nativeLayout,null);assert.deepEqual(loaded.ir,graph.generic.ir);assert.deepEqual(loaded.migration.previousNativeLayout,old.nativeLayout);
});


test('native source cuts preserve vertical dependencies inside certified modules',()=>{
 const source=read('data/semantic/0216717d966327f4.json'),state=read('data/semantic/presentations/transformer.json').default_state;
 for(const paperDirection of ['up','down']){
  const graph=G.build(source,{...state,paperDirection}),by=new Map(graph.nodes.map(n=>[n.id,n]));let serial=0;
  assert.deepEqual(graph.generic.layoutRules.localPathRows,[]);
  for(const frame of graph.nodes.filter(n=>n.expanded&&['feed-forward','certified-role-stage'].includes(n.semantic.semantic_type))){
   const kids=graph.nodes.filter(n=>n.parent===frame.id);assert.ok(kids.length>=3);
   assert.equal(new Set(kids.map(n=>n.x+n.w/2)).size,1);
   for(const e of graph.edges.filter(e=>by.get(e.source)?.parent===frame.id&&by.get(e.target)?.parent===frame.id)){
    const a=by.get(e.source),b=by.get(e.target);assert.ok(paperDirection==='down'?a.y+a.h<b.y:b.y+b.h<a.y);serial++;
   }
  }
  assert.ok(serial>10);
  assert.equal(G.validate(graph).ok,true);
 }
});
test('native evidence restores original path, source, contracts, binding and explicit boundaries without layout work',()=>{
 const source=read('data/semantic/0216717d966327f4.json'),graph=G.build(source),before=JSON.stringify(graph);
 const old=require('../semantic_studio/publication-renderer');let paths=0,contracts=0,bindings=0;
 for(const n of graph.nodes){const text=G.nodeEvidence(graph,n.id);assert.ok(text.includes(old.nodeTitle(n.semantic,G.expected(graph).idx)));
  for(const s of n.semantic.source||[])assert.ok(text.includes(s.file+':'+s.line));
  if(n.semantic.local_pipeline){assert.match(text,/Local dependency (path|tree|DAG):/);paths++;}
  if(n.semantic.contract_evidence?.length){assert.match(text,/Not asserted:/);contracts++;}
  if(n.semantic.invocation_binding){assert.match(text,/Fixed call argument:/);bindings++;}
 }
 assert.ok(paths&&contracts&&bindings);assert.equal(JSON.stringify(graph),before);
 const Evidence=require('../semantic_studio/semantic-evidence'),n={id:'safe',label:'<script>unsafe & text</script>',kind:'opaque',reason:'unsupported call',evidence_status:'unknown',condition:{source:'flag'},source:[{file:'a.py',line:3,expression:'external(x)'}]};
 const text=Evidence.nodeDetails(n,{nodes:new Map()});assert.match(text,/unknown/);assert.match(text,/unsupported call/);assert.match(text,/Condition:/);assert.match(text,/external\(x\)/);
 const glyph=G.glyph(n,{w:200,h:80},G.appearance(n));assert.ok(!glyph.html.includes('<script>'));assert.ok(glyph.html.includes('&lt;script&gt;'));
});

test('certified geometry reuses immutable evidence, while replacements, topology edits and physical errors remain checked',()=>{
 const graph=ready(),one=G.certifiedContext(graph);assert.equal(one.sourceCheck.ok,true);assert.equal(G.certifiedContext(graph).certification.reused,true);
 assert.ok(Object.isFrozen(graph.generic.ir.nodes[0]));assert.ok(Object.isFrozen(graph.nodes[0].semantic));
 const shell=G.cloneGeometry(graph);assert.equal(shell.generic.ir,graph.generic.ir);assert.notEqual(shell.nodes,graph.nodes);assert.notEqual(shell.edges[0].route,graph.edges[0].route);assert.equal(G.certifiedContext(shell).certification.reused,true);
 for(const mutate of [g=>{g.nodes[0].semantic={...g.nodes[0].semantic,label:'forged'};},g=>{g.edges[0].binding={...g.edges[0].binding,target_port:'wrong'};},g=>{g.edges[0].contract.wire='forged';},g=>{g.edges.pop();},g=>{g.generic.receipts={};},g=>{g.nodes.at(-1).parent=null;}]){
  const changed=G.cloneGeometry(graph);mutate(changed);const c=G.certifiedContext(changed);assert.equal(c.certification.reused,false);assert.equal(c.sourceCheck.ok,false);
 }
 const physical=G.cloneGeometry(graph);physical.edges[0].route[0].x+=1;assert.equal(G.certifiedContext(physical).certification.reused,true);assert.equal(G.certifiedContext(physical).sourceCheck.ok,false);
 const outside=G.cloneGeometry(graph),child=outside.nodes.find(n=>n.parent&&!outside.nodes.find(p=>p.id===n.parent)?.modelHeading);assert.ok(child);child.x=-1000;assert.equal(G.certifiedContext(outside).sourceCheck.ok,false);
 const changedCut=G.operate(graph,{kind:'frontier',action:'overview'});assert.equal(G.certifiedContext(changedCut).certification.reused,false);
 assertValid(graph);
});
test('worker geometry transport reuses evidence in both directions, survives undo and rejects unknown cores',()=>{
 const graph=ready(),a=G.transport('a'),b=G.transport('b'),wire=v=>structuredClone(v),first=a.pack(graph),received=b.unpack(wire(first));assert.ok(first.core);assert.equal(G.validate(received).ok,true);
 const reply=b.pack(received);assert.equal(reply.core,undefined);const main=a.unpack(wire(reply));
 const undo=G.cloneGeometry(main);main.nodes[0].x+=12;const second=a.pack(main);assert.equal(second.core,undefined);assert.ok(JSON.stringify(second).length<JSON.stringify(first).length);const moved=b.unpack(wire(second));assert.equal(moved.nodes[0].x,main.nodes[0].x);assert.equal(moved.generic.ir,received.generic.ir);
 const restored=b.unpack(wire(a.pack(undo)));assert.equal(restored.nodes[0].x,graph.nodes[0].x);
 const tampered=G.cloneGeometry(undo);tampered.edges[0].binding={...tampered.edges[0].binding,target_port:'wrong'};const fresh=a.pack(tampered);assert.ok(fresh.core);assert.equal(G.validate(b.unpack(wire(fresh))).ok,false);
 assert.throws(()=>G.transport('new').unpack(wire(second)),/缓存已过期/);
 const expanded=G.operate(undo,{kind:'frontier',action:'overview'});assert.ok(a.pack(expanded).core);
});
test('free physical ports straighten vertical serial paths without changing operands; narrow lanes do not block unrelated movement',()=>{
 const source=read('data/semantic/0216717d966327f4.json'),state=read('data/semantic/presentations/transformer.json').default_state,graph=G.build(source,state);assert.equal(G.route(graph).failed,0);assertValid(graph);
 const by=new Map(graph.nodes.map(n=>[n.id,n])),serial=graph.edges.filter(e=>by.get(e.source).parent===by.get(e.target).parent&&by.get(by.get(e.source).parent)?.semantic.semantic_type==='feed-forward');assert.equal(serial.length,6);
 for(const e of serial){assert.equal(e.route.length,2);assert.equal(e.route[0].x,e.route[1].x);assert.deepEqual(e.binding,G.expected(graph).edges.find(v=>v.id===e.id));}
 assert.ok(SummaryEngine.validateView(graph).routing.contacts.length,'there are stroke-safe narrow corridors');
 for(const name of ['Normal return','activation','add','Feed-forward']){const g=G.cloneGeometry(graph),n=g.nodes.find(n=>n.label===name),before=n.x;SummaryEngine.move(g,n.id,12,0,G.routeOptions());assert.equal(g.lastMove.blocked,false,name);assert.equal(n.x,before+12);assertValid(g);}
 const collision=G.cloneGeometry(graph),leaf=collision.nodes.find(n=>n.label==='activation'),other=collision.nodes.find(n=>n.parent===leaf.parent&&n.id!==leaf.id),before=leaf.x;SummaryEngine.move(collision,leaf.id,other.x-leaf.x,other.y-leaf.y,G.routeOptions());assert.equal(collision.lastMove.blocked,true);assert.equal(leaf.x,before);assertValid(collision);
});

test('joint input routing reserves a straight local input and moves lateral ingress to its own side in every direction',()=>{
 function sample({mirror=false,transpose=false,obstacle=false,fixed=false}={}){
  const nodes=[{id:'main',x:100,y:250,w:100,h:40},{id:'join',x:100,y:150,w:100,h:40},{id:'side',x:300,y:300,w:100,h:40},...(obstacle?[{id:'wall',x:142,y:215,w:16,h:20}]:[])].map(n=>({...n,parent:null,expanded:false}));
  const edges=[{id:'inline',source:'main',target:'join',fixedSource:{side:'top',fraction:.5},fixedTarget:{side:'bottom',fraction:.5},physicalSource:{side:'left',fraction:.5},physicalTarget:{side:'left',fraction:.5},route:[{x:100,y:270},{x:80,y:270},{x:80,y:170},{x:100,y:170}]},{id:'lateral',source:'side',target:'join',fixedSource:{side:'top',fraction:.5},fixedTarget:{side:'bottom',fraction:.25},route:[{x:350,y:300},{x:350,y:210},{x:125,y:210},{x:125,y:190}]}].map(e=>({...e,arrow:'target',style:'orthogonal',waypoints:[],portPolicy:{source:{mode:'free',shape:'rectangle',spacing:6},target:{mode:fixed?'fixed':'free',shape:'rectangle',spacing:6}},contract:{source:e.source,target:e.target,wire:e.id,bus:false,sharedStem:null,minimumTerminal:9,enforcePortApproach:true,gates:[]}}));
  if(mirror){for(const n of nodes)n.x=500-n.x-n.w;for(const e of edges){e.route=e.route.map(p=>({x:500-p.x,y:p.y}));for(const k of ['fixedSource','fixedTarget','physicalSource','physicalTarget'])if(e[k]){const f=e[k];e[k]={...f,side:({left:'right',right:'left'})[f.side]||f.side,fraction:['top','bottom'].includes(f.side)?1-f.fraction:f.fraction};}}}
  if(transpose){for(const n of nodes)[n.x,n.y,n.w,n.h]=[n.y,n.x,n.h,n.w];for(const e of edges){e.route=e.route.map(p=>({x:p.y,y:p.x}));for(const k of ['fixedSource','fixedTarget','physicalSource','physicalTarget'])if(e[k])e[k]={...e[k],side:({left:'top',right:'bottom',top:'left',bottom:'right'})[e[k].side]};}}
  return {nodes,edges};
 }
 for(const mirror of [false,true])for(const transpose of [false,true]){
  const g=sample({mirror,transpose}),before=EdgeRouterLabRouting.stats(g.edges);G.refineJoins(g,G.routeOptions(),SummaryConstraints.validationContext(g),1000);const after=EdgeRouterLabRouting.stats(g.edges);assert.equal(g.edges[0].route.length,2);assert.equal(g.edges[1].physicalTarget.side,transpose?(mirror?'top':'bottom'):(mirror?'left':'right'));assert.ok(after.bends<before.bends);assert.ok(after.length<before.length);assert.ok(after.crossings<=before.crossings);assertValid(g);
 }
 for(const opts of [{obstacle:true},{fixed:true}]){const g=sample(opts),before=JSON.stringify(g.edges);G.refineJoins(g,G.routeOptions(),SummaryConstraints.validationContext(g),1000);assert.equal(JSON.stringify(g.edges),before);assertValid(g);}
 const limited=sample(),before=JSON.stringify(limited.edges);G.refineJoins(limited,G.routeOptions({joinEdges:new Set(['inline'])}),SummaryConstraints.validationContext(limited),1000);assert.equal(JSON.stringify(limited.edges),before);
});

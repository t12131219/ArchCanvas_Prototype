/* Source semantics on the native canvas. Geometry never certifies a program. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('../semantic_studio/semantic-engine.js'):null);
  const P=root.SemanticPublication||(typeof require==='function'?require('../semantic_studio/publication.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('../semantic_studio/architecture-layout.js'):null);
  const F=root.SemanticCompositionLayout||(typeof require==='function'?require('../semantic_studio/composition-layout.js'):null);
  const Evidence=root.SemanticEvidence||(typeof require==='function'?require('../semantic_studio/semantic-evidence.js'):null);
  const A=root.SemanticAuthoring||(typeof require==='function'?require('../semantic_studio/authoring-model.js'):null);
  const clone=v=>JSON.parse(JSON.stringify(v)),stable=v=>JSON.stringify(normalize(v));
  function normalize(v){return Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;}
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const engine={...E,semanticOnly:true,project:(ir,state,plan,opts={})=>E.project(ir,state,plan,{...opts,semanticOnly:true})};
  const project=(ir,state)=>engine.project(ir,state);
  const Flow=root.SummaryFlowOptimizer||(typeof require==='function'?require('./flow-optimizer.js'):null);
  const VERSION='native-semantic/12',SCHEMA='archcanvas-native-semantic/1';
  const projectionInputs=new WeakMap(),certificates=new WeakMap(),sharedCertificates=new WeakMap(),frozen=new WeakSet();
  const projections=new WeakMap(),sharedProjections=new Map(),navigationIndexes=new WeakMap();
  function projectionKey(ir,state){return stable(ir)+'\n'+stable(state);}
  function cacheProjection(generic,cut,key=projectionKey(generic.ir,generic.state)){
    freezeEvidence(generic.ir);freezeEvidence(generic.state);
    projections.set(generic,cut);projectionInputs.set(generic,[generic.ir,generic.state]);sharedProjections.delete(key);sharedProjections.set(key,cut);
    while(sharedProjections.size>3)sharedProjections.delete(sharedProjections.keys().next().value);return cut;
  }
  function expected(graph){let cut=projections.get(graph.generic);const inputs=projectionInputs.get(graph.generic);if(cut&&inputs?.[0]===graph.generic.ir&&inputs?.[1]===graph.generic.state)return cut;
    const key=projectionKey(graph.generic.ir,graph.generic.state);cut=sharedProjections.get(key)||project(graph.generic.ir,graph.generic.state);
    return cacheProjection(graph.generic,cut,key);
  }
  function initial(ir,state){E.validate(ir);return state?{view:'publication',mode:'source',open:[],offsets:{},...clone(state)}:F.certifiedDetails(ir,F.frontier({mode:'source'},'detail'),{semanticOnly:true});}
  // Palette from the dedicated drawing. Only certified roles/operators choose
  // algorithm colors; unlabeled source containers use structural region tones.
  const palette={embedding:'#f8d4e1',ffn:'#c8ebfb',attention:'#ffddb3',norm:'#fff6bd',linear:'#dfdff8',softmax:'#c9f1cd',tensor:'#cdeaf8',control:'#f3f5f7',unknown:'#fff0e8'};
  const regionTones=['#e7f5fe','#fff0f5','#eef7e8','#f1edfa'];
  function color(n,region=0,depth=0){
    if(n.kind==='opaque')return palette.unknown;
    if(['control','state','buffer'].includes(n.kind))return palette.control;
    const type=n.semantic_type,op=n.operator;
    if(type==='multihead-attention')return palette.attention;
    if(type==='scaled-dot-product-attention')return '#fffaf2';
    if(type==='feed-forward')return palette.ffn;
    if(type==='certified-role-stage')return palette.norm;
    if(op==='normalization')return palette.control;
    if(op==='embedding')return palette.embedding;
    if(['softmax','activation','aten.relu.default','aten.tanh.default','aten._softmax.default'].includes(op))return palette.softmax;
    if(['convolution','pooling'].includes(op))return palette.ffn;
    if(['reshape','transpose','copy','shape','structure','getitem','device-cast','scalar-cast','aten.view.default','aten.t.default','aten.transpose.int','aten.expand.default','aten.clone.default','aten._unsafe_view.default','aten.stack.default'].includes(op))return palette.tensor;
    if(op==='dropout')return palette.control;
    if(op==='linear'||n.kind==='parameter')return palette.linear;
    if(n.kind==='interface')return palette.tensor;
    if(n.kind==='composite'){
      if(!['source-function','serial-repeat','repeat-instance'].includes(type)&&depth>0)return '#ffffff';
      const base=regionTones[region%regionTones.length],amount=type==='serial-repeat'?.08:type==='repeat-instance'?.8:depth===0?.5:.9;
      return '#'+base.slice(1).match(/../g).map(v=>Math.round(parseInt(v,16)*(1-amount)+255*amount).toString(16).padStart(2,'0')).join('');
    }
    return palette.control;
  }
  function appearance(n,region=0,depth=0){
    const raw=n.paper?.title||n.label||n.id,title=String(raw),captions=[...new Set(n.paper?.captions||[])];
    const lines=P.wrap(title,240,16),notes=captions.flatMap(t=>P.wrap(t,240,12)),fill=color(n,region,depth);
    return {title,lines,notes:notes.slice(0,2),allCaptions:captions,fill,w:Math.max(112,Math.min(280,Math.ceil(Math.max(...lines.map(t=>P.width(t,16)),...notes.slice(0,2).map(t=>P.width(t,12)),80))+32)),h:Math.max(44,16+lines.length*20+Math.min(2,notes.length)*15)};
  }
  // Relation meaning and evidence origin are independent. A solid static
  // dependency does not assert that a program was executed. Inspect every
  // member of a projected bundle; mixed/control relations must not become a
  // fictitious ordinary tensor wire merely because their endpoints coincide.
  function edgeAppearance(edge,by){
    const classify=e=>{
      if(e.evidence_status==='conflict'||['opaque','conflict','unresolved'].includes(e.evidence))return 'unresolved';
      if(e.kind==='control')return 'control';
      if(['state-write','effect'].includes(e.kind))return 'effect';
      if(['explanation','object-sharing','same-object','relation'].includes(e.kind))return 'relation';
      if(e.kind==='parameter-read')return 'resource';
      if(['data','alias','interface-binding'].includes(e.kind)){
        const n=by?.get(e.resolved_source||e.canonical_source||e.source)||by?.get(e.source);
        return n&&(n.invocation_binding||n.kind==='parameter'||n.kind==='buffer'||n.operator==='constant')?'resource':'data';
      }
      return 'unresolved';
    };
    const kinds=new Set((edge.bundle_members?.length?edge.bundle_members:[edge]).map(classify));
    const category=kinds.size===1?[...kinds][0]:[...kinds].every(k=>['data','resource'].includes(k))?'data':'mixed';
    return {category,dashed:!['data','resource'].includes(category),width:category==='data'?2.2:1.6,
      stroke:category==='resource'?'#72818c':'#263b4b',dashPattern:category==='relation'?'2 5':category==='mixed'?'7 4 2 4':category==='unresolved'?'3 4':'7 5'};
  }
  function headingIds(cut){
    const visible=new Set(cut.nodes.map(n=>n.id)),incident=new Set(cut.edges.flatMap(e=>[e.source,e.target]));
    return new Set(cut.nodes.filter(n=>!visible.has(n.parent)&&cut.positions.get(n.id)?.expanded&&n.kind==='composite'&&!incident.has(n.id)).map(n=>n.id));
  }
  function glyph(n,p,a){
    const frame=p.expanded,w=p.w,h=p.h,stroke='#263348',titleY=frame?26:22;
    if(p.modelHeading){
      const lines=P.wrap(a.title,Math.max(160,w-40),26),rows=lines.map((text,i)=>({text,y:38+i*30,font:26,bold:true}));
      rows.push({text:p.headingNote,y:rows.at(-1).y+29,font:17});
      return {html:rows.map(r=>`<text x="${w/2}" y="${r.y}" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="${r.font}"${r.bold?' font-weight="bold"':''} fill="${stroke}">${esc(r.text)}</text>`).join('')+`<desc>${esc([a.title,...a.allCaptions].join('\n'))}</desc>`,labelObstacles:rows.map(r=>({x:(w-P.width(r.text,r.font))/2-4,y:r.y-r.font,w:P.width(r.text,r.font)+8,h:r.font+5}))};
    }
    const lines=frame?P.wrap(a.title,Math.max(100,w-72),16).slice(0,2):a.lines;
    const text=lines.map((t,i)=>`<text x="${frame?16:w/2}" y="${titleY+i*20}" text-anchor="${frame?'start':'middle'}" font-family="DejaVu Sans,Arial,sans-serif" font-size="16" fill="${stroke}">${esc(t)}</text>`).join('');
    const notes=frame?'':a.notes.map((t,i)=>`<text x="${w/2}" y="${titleY+lines.length*20+i*15-3}" text-anchor="middle" font-family="DejaVu Sans,Arial,sans-serif" font-size="12" fill="#9aa0a6">${esc(t)}</text>`).join('');
    const html=`<rect x="0" y="0" width="${w}" height="${h}" rx="${frame?19:10}" fill="${a.fill}" stroke="${frame?'#92a2af':stroke}" stroke-width="${frame?1.4:2}"${n.kind==='opaque'?' stroke-dasharray="6 4"':''}/>${text}${notes}<desc>${esc([a.title,...a.allCaptions].join('\n'))}</desc>`;
    // Only the actual title text is an obstacle; no reserved full-width strip.
    const labelObstacles=frame?lines.map((t,i)=>({x:14,y:titleY-15+i*20,w:Math.min(w-60,P.width(t,16)+6),h:19})):[];
    return {html,labelObstacles};
  }
  function build(ir,state,extra={}){
    E.validate(ir);ir=clone(ir);const selected=initial(ir,state),cut=project(ir,selected),visible=new Set(cut.nodes.map(n=>n.id)),headings=headingIds(cut),looks=new Map();
    const regions=new Map(),depths=new Map();let ordinal=0;
    const region=id=>{if(regions.has(id))return regions.get(id);const n=cut.idx.nodes.get(id);if(!n||!visible.has(id)||headings.has(id))return 0;
      const parent=n.parent;if(!visible.has(parent)||headings.has(parent)){depths.set(id,0);regions.set(id,n.kind==='composite'?ordinal++:0);}
      else {regions.set(id,region(parent));depths.set(id,(depths.get(parent)||0)+1);}return regions.get(id);};
    for(const n of cut.nodes)looks.set(n.id,appearance(n,region(n.id),depths.get(n.id)||0));
    const roots=cut.nodes.filter(n=>!visible.has(n.parent)).map(n=>n.id);
    // Pure hierarchy/DAG arrangement is shared; old glyphs, arrow routing,
    // composition candidates and canvas interaction are never invoked.
    const positions=L.layout(cut.idx,roots,visible,cut.edges,{}, {
      foldSerial:false,regularModuleColumns:true,
      direction:selected.paperDirection==='up'?'up':'down',
      nodeSize:n=>looks.get(n.id)||appearance(n),
      frameHeader:n=>headings.has(n.id)?76+P.wrap(looks.get(n.id).title,600,26).length*30:24+Math.min(2,looks.get(n.id)?.lines.length||1)*20,
      framePadding:20,framePaddingFor:n=>headings.has(n.id)?0:20,frameMinWidthFor:n=>headings.has(n.id)?640:0,frameCenterBodyFor:()=>true,
      fixedInputIds:new Set(cut.nodes.filter(n=>n.invocation_binding).map(n=>n.id)),compactArgumentBand:true,
      compoundPorts:true,compoundStarts:true,compoundInputBand:true,followOutputSources:true,compoundOutputAlignment:true,headerClearance:6,
      gapX:32,gapY:36,alignForks:true,rankColumns:4,inputPlacement:'consumer',rankStrategy:'consumer',protectFrameTitles:false,maxWidth:1600
    });
    const ps=[...positions.values()],dx=48-Math.min(0,...ps.map(p=>p.x)),dy=48-Math.min(0,...ps.map(p=>p.y));
    const nodes=cut.nodes.map(n=>{const p={...positions.get(n.id),modelHeading:headings.has(n.id),headingNote:[selected.mode==='runtime'?'运行证据':selected.mode==='merged'?'源码与运行证据':'源码语义',selected.paperCanonical?'源码原子层':selected.paperGranularity==='stages'?'架构概览':'可逆语义图','可继续展开至源码细节'].join(' · ')};p.x+=dx;p.y+=dy;const a=looks.get(n.id);return {id:n.id,parent:visible.has(n.parent)?n.parent:null,x:p.x,y:p.y,w:p.w,h:p.h,base:[0,0],expanded:!!p.expanded,modelHeading:p.modelHeading,routingObstacle:!p.expanded,label:a.title,fill:a.fill,semantic:clone(n),...glyph(n,p,a)};});
    const graph={nodes,edges:[],canvas:[Math.max(900,...nodes.map(n=>n.x+n.w+64)),Math.max(600,...nodes.map(n=>n.y+n.h+64))],attachments:[],routeLabels:[],junctionMarkers:[],definitions:'',extras:'',irSha256:ir.ir_digest||A.sourceIR(A.fromIR(ir)).ir_digest,
      generic:{version:VERSION,ir,state:selected,navigation:{children:[...cut.idx.children],modules:[...cut.idx.nodes.values()].filter(n=>n.kind==='composite').map(n=>({id:n.id,label:n.paper?.title||n.label,source:n.source||[]}))},layouts:clone(extra.layouts||[]),authoring:extra.authoring?clone(extra.authoring):null,migration:extra.migration?clone(extra.migration):null,layoutRules:{moduleColumns:clone(positions.context.moduleColumns),localPathRows:clone(positions.context.localPathRows)},receipts:{node_accounting:cut.node_accounting,edge_accounting:cut.edge_accounting,representatives:cut.representatives,publication:cut.publication||null,annotations:[...cut.annotations],frame_ownership:cut.frame_ownership||[]}},sourceDraftOperations:[]};
    cacheProjection(graph.generic,cut);
    const by=new Map(nodes.map(n=>[n.id,n])),groups=new Map();
    for(const edge of cut.edges)for(const side of ['source','target']){const key=edge[side];if(!groups.has(key))groups.set(key,[]);groups.get(key).push([edge,side]);}
    const allocation=new Map();
    for(const [id,rows]of groups){const slots=new Map();for(const [edge,side]of rows){const slot=slotIdentity(edge,side);if(!slots.has(slot))slots.set(slot,slots.size);}
      for(const [edge,side]of rows){const rank=slots.get(slotIdentity(edge,side)),n=by.get(id),other=by.get(edge[side==='source'?'target':'source']),vertical=Math.abs(n.y+n.h/2-other.y-other.h/2)>=Math.abs(n.x+n.w/2-other.x-other.w/2),portSide=vertical?(other.y>n.y?'bottom':'top'):(other.x>n.x?'right':'left');
        allocation.set(edge.id+':'+side,{side:portSide,fraction:.12+.76*(rank+1)/(slots.size+1),...(n.expanded?{inward:within(nodes,edge[side==='source'?'target':'source'],id)}:{})});}
    }
    graph.edges=cut.edges.map(e=>{const s=by.get(e.source),t=by.get(e.target),fixedSource=allocation.get(e.id+':source'),fixedTarget=allocation.get(e.id+':target'),a=root.EdgeRouterLabRouting.port(s,fixedSource.side,fixedSource.fraction),b=root.EdgeRouterLabRouting.port(t,fixedTarget.side,fixedTarget.fraction);
      const appearance=edgeAppearance(e,cut.idx.nodes);
      return {id:e.id,source:e.source,target:e.target,projection:{presentationSlots:{source:slotIdentity(e,'source'),target:slotIdentity(e,'target')}},binding:clone(e),fixedSource,fixedTarget,portPolicy:{source:{mode:'free',shape:'rectangle',spacing:6,sharedStem:null},target:{mode:'free',shape:'rectangle',spacing:6}},route:[a,{x:a.x,y:b.y},b],waypoints:[],arrow:'target',style:'orthogonal',width:appearance.width,dashed:appearance.dashed,stroke:appearance.stroke,dashPattern:appearance.dashPattern,relationStyle:appearance.category,role:e.kind,contract:{version:1,source:e.source,target:e.target,gates:[],wire:stable(e.bundle_members?['bundle',e.id]:[e.resolved_source||e.canonical_source||e.source,e.source_port]),bus:false,sharedStem:null,minimumTerminal:9,enforcePortApproach:true}};
    });
    return graph;
  }
  // Delayed hover reads the already-certified projection; no layout or route work.
  function nodeEvidence(graph,id){const n=graph.nodes.find(n=>n.id===id)?.semantic;return n?Evidence.nodeDetails(n,expected(graph).idx):'';}
  function within(nodes,id,frame){const by=new Map(nodes.map(n=>[n.id,n]));let at=id;while(at){if(at===frame)return true;at=by.get(at)?.parent;}return false;}
  function slotIdentity(e,side){return stable(e.bundle_members?['bundle',e.id,side]:[side==='source'?e.resolved_source||e.canonical_source||e.source:e.canonical_target||e.target,side==='source'?e.source_port:e.target_port]);}
  function children(graph,id){let index=navigationIndexes.get(graph.generic);if(!index){index=new Map(graph.generic.navigation?.children||expected(graph).idx.children);navigationIndexes.set(graph.generic,index);}return index.get(id)||[];}
  // Cache native presentation by the actual semantic cut, not an arbitrary
  // source depth. Bound the cache; the complete IR remains stored only once.
  function cutKey(graph){return stable([graph.generic.state.mode,graph.nodes.map(n=>[n.id,n.parent,n.expanded]),expected(graph).edges.map(e=>e.id)]);}
  function layoutSnapshot(graph,compact=false){return {nodes:graph.nodes.map(n=>({id:n.id,x:n.x,y:n.y,w:n.w,h:n.h})),edges:graph.edges.map(e=>compact?Object.fromEntries(Object.entries(e).filter(([k])=>!['sourcePort','targetPort'].includes(k)&&(k!=='binding'||e.draft))):Object.fromEntries(Object.entries(clone(e)).filter(([k])=>!['sourcePort','targetPort'].includes(k)))),compact,sourceDraftOperations:clone(graph.sourceDraftOperations||[]),nativeRouting:clone(graph.nativeRouting||null)};}
  function remember(graph){
    const key=cutKey(graph),layout=layoutSnapshot(graph,true),row={key,layout},rows=(graph.generic.layouts||[]).filter(v=>v.key!==key);
    rows.push(row);while(rows.length>4||stable(rows).length>6000000){rows.shift();if(!rows.length)break;}graph.generic.layouts=rows;
  }
  function operate(graph,op){
    remember(graph);const ir=graph.generic.ir;let state=clone(graph.generic.state);
    if(op.kind==='all'){state=op.open?P.fullyExpanded(ir,state,E):{...state,paperAuto:false,open:[]};delete state.nativeSourceFocus;}
    else if(op.kind==='frontier'){delete state.nativeSourceFocus;state=F.frontier(state,op.action);if(op.action==='detail')state=F.certifiedDetails(ir,state,{semanticOnly:true});}
    else if(op.kind==='state')state={...state,...clone(op.patch)};
    else if(op.kind==='focus'){const back=clone(state);delete back.nativeFocusReturn;state={...state,paperFocus:op.id,paperRelation:null,paperAuto:true,open:state.paperCanonical?state.open:[],nativeFocusReturn:back,...(state.paperCanonical?{nativeSourceFocus:op.id}:{} )};}
    else if(op.kind==='back')state=state.nativeFocusReturn||state.paperFrontierReturn||state;
    else {const cut=expected(graph);if(!cut.idx.children.get(op.id)?.length)throw Error('此节点没有内部源码单位');state.paperAuto=false;state.open=clone(cut.publication?.open||state.open||[]);const open=new Set(state.open);if(op.force??!open.has(op.id))open.add(op.id);else open.delete(op.id);state.open=[...open];}
    delete state.canvasPlacement;delete state.offsets;
    const result=build(ir,state,{authoring:graph.generic.authoring,migration:graph.generic.migration,layouts:graph.generic.layouts});
    const cached=result.generic.layouts.find(v=>v.key===cutKey(result));
    if(cached){try{restore(result,cached.layout);result.nativeLayoutRestored=true;}catch(_){result.generic.layouts=result.generic.layouts.filter(v=>v!==cached);}}
    return result;
  }
  function boundarySequence(graph,e){
    const by=new Map(graph.nodes.map(n=>[n.id,n]));
    const chain=id=>{const result=[];let at=by.get(id);while(at){if(at.expanded&&!at.modelHeading)result.push(at.id);at=by.get(at.parent);}return result;};
    const a=chain(e.source),b=chain(e.target),same=new Set(a.filter(id=>b.includes(id)));
    return [...(by.get(e.source)?.expanded&&same.has(e.source)?[{frame:e.source,direction:'enter'}]:[]),...a.filter(id=>!same.has(id)).map(frame=>({frame,direction:'exit'})),...b.filter(id=>!same.has(id)).reverse().map(frame=>({frame,direction:'enter'})),...(by.get(e.target)?.expanded&&same.has(e.target)?[{frame:e.target,direction:'exit'}]:[])];
  }
  function boundaryErrors(graph,e,events,points=e.route,context){
    const sequences=context?(context.boundarySequences||(context.boundarySequences=new Map())):new Map(),key=e.id+':'+e.source+':'+e.target;
    if(!sequences.has(key))sequences.set(key,boundarySequence(graph,e));
    const expected=sequences.get(key),actual=events.map(({frame,direction,order})=>{
      // An endpoint on a frame is an interface, not a zero-length transit.
      // crossings() has no point beyond its terminal to infer this direction.
      if(frame===e.source&&Math.abs(order)<1e-5)direction=root.SummaryPhysicalPorts.active(e,'source')?.inward?'enter':'exit';
      if(frame===e.target&&Math.abs(order-(points.length-1))<1e-5)direction=root.SummaryPhysicalPorts.active(e,'target')?.inward?'exit':'enter';
      return {frame,direction};
    });
    return stable(expected)===stable(actual)?[]:['source containment boundary order changed'];
  }
  function constraints(graph,e,opts,context,C){
    const store=context||(context={});let index=store.nativeIndex;
    if(!index){
      const by=new Map(graph.nodes.map(n=>[n.id,n])),chains=new Map();
      for(const n of graph.nodes){const chain=[];let at=n;while(at){if(at.expanded&&!at.modelHeading)chain.push(at.id);at=by.get(at.parent);}chains.set(n.id,chain);}
      index=store.nativeIndex={by,chains,frames:graph.nodes.filter(n=>n.expanded&&!n.modelHeading),constraints:new Map()};
    }
    const key=stable([e.id,e.source,e.target,opts.margin]);let base=index.constraints.get(key);
    if(!base){
      const related=new Set([...index.chains.get(e.source)||[],...index.chains.get(e.target)||[]]),cross=new Set(boundarySequence(graph,e).map(g=>g.frame));
      const headingLabels=graph.nodes.filter(n=>n.modelHeading).flatMap(n=>(n.labelObstacles||[]).map(b=>({x:n.x+b.x,y:n.y+b.y,w:b.w,h:b.h,id:'label:'+n.id})));
      const blocking=new Set(index.frames.filter(n=>!related.has(n.id)).map(n=>n.id)),extra=[...headingLabels];
      const covered=id=>(index.chains.get(id)||[]).some(frame=>blocking.has(frame));
      // A whole unrelated frame already blocks every contained glyph. Remove
      // those redundant rectangles only from the visibility search, preserving
      // the same obstacle union and the complete final geometry validator.
      for(const n of index.frames){
        if(blocking.has(n.id)){
          if(!(index.chains.get(n.parent)||[]).some(id=>blocking.has(id)))extra.push(root.EdgeRouterLabRouting.expand(n,Math.max(4,opts.margin||0)));
        }else{
          if(!cross.has(n.id))extra.push(...C.walls(n,[],C.laneClearances(graph,e,n,store)));
          for(const b of n.labelObstacles||[])extra.push({x:n.x+b.x,y:n.y+b.y,w:b.w,h:b.h,id:'label:'+n.id});
        }
      }
      const frames=index.frames.filter(n=>related.has(n.id)),transit=frames.filter(n=>cross.has(n.id));
      base={excludedObstacleIds:new Set(graph.nodes.filter(n=>!n.expanded&&covered(n.id)).map(n=>n.id)),extraObstacles:extra,
        extraCoordinates:{xs:transit.flatMap(n=>[n.x-6,n.x+6,n.x+n.w-6,n.x+n.w+6]),ys:transit.flatMap(n=>[n.y-6,n.y+6,n.y+n.h-6,n.y+n.h+6])},
        segmentAllowed:(a,b)=>!frames.some(n=>C.borderContacts(e,n,[a,b]).length)};
      index.constraints.set(key,base);
    }
    return {...opts,...base};
  }
  function nodeErrors(graph){
    const cut=expected(graph),by=new Map(graph.nodes.map(n=>[n.id,n])),errors=[];
    if(by.size!==graph.nodes.length)errors.push('duplicate native node');
    if(by.size!==cut.nodes.length)errors.push('semantic frontier node count changed');
    const visible=new Set(cut.nodes.map(n=>n.id)),headings=headingIds(cut);
    for(const n of cut.nodes){const actual=by.get(n.id);
      if(actual&&!!actual.modelHeading!==headings.has(n.id))errors.push('invalid model heading '+n.id);if(!actual||stable(actual.semantic)!==stable(n)||actual.parent!==(visible.has(n.parent)?n.parent:null)||actual.expanded!==!!cut.positions.get(n.id)?.expanded)errors.push('semantic node or ownership changed '+n.id);}
    if(graph.irSha256!==(graph.generic.ir.ir_digest||graph.irSha256))errors.push('source IR identity changed');
    for(const [rows,ids]of [[cut.node_accounting,graph.generic.ir.nodes],[cut.edge_accounting,graph.generic.ir.edges]]){
      const all=Object.values(rows).flat(),count=new Set(all);if(all.length!==ids.length||count.size!==ids.length||ids.some(n=>!count.has(n.id)))errors.push('canonical accounting incomplete');
    }
    if(stable(graph.generic.receipts)!==stable({node_accounting:cut.node_accounting,edge_accounting:cut.edge_accounting,representatives:cut.representatives,publication:cut.publication||null,annotations:[...cut.annotations],frame_ownership:cut.frame_ownership||[]}))errors.push('semantic receipts changed');
    return [...errors,...nodeGeometryErrors(graph)];
  }
  function edgeErrors(graph,e,points=e.route,semanticOnly=false){
    const cut=expected(graph);let indexed=cut.nativeEdgeIndex;if(!indexed)cut.nativeEdgeIndex=indexed=new Map(cut.edges.map(v=>[v.id,v]));const saved=indexed.get(e.id),errors=[];
    if(!saved){if(!e.draft)errors.push('unregistered semantic connection');return errors;}
    if(stable(e.binding)!==stable(saved))errors.push('exact canonical dependency or operand changed');
    const wire=stable(saved.bundle_members?['bundle',saved.id]:[saved.resolved_source||saved.canonical_source||saved.source,saved.source_port]);
    if(!e.draft&&(e.contract?.wire!==wire||e.contract?.bus||e.contract?.minimumTerminal!==9||e.contract?.enforcePortApproach!==true||e.contract?.source!==saved.source||e.contract?.target!==saved.target))errors.push('source routing contract changed');
    if(!e.draft&&(e.source!==saved.source||e.target!==saved.target))errors.push('semantic endpoint changed');
    if(!semanticOnly&&!e.draft)errors.push(...root.SummaryPhysicalPorts.errors(graph,e,points));return errors;
  }
  function validate(graph,semanticOnly=false){
    const errors=nodeErrors(graph),ids=new Set(graph.edges.map(e=>e.id));if(ids.size!==graph.edges.length)errors.push('duplicate native edge');
    for(const saved of expected(graph).edges)if(!ids.has(saved.id)&&!(graph.sourceDraftOperations||[]).some(op=>op.kind==='remove-connection'&&op.id===saved.id&&stable(op.binding)===stable(saved)))errors.push('source connection missing '+saved.id);
    for(const e of graph.edges)errors.push(...edgeErrors(graph,e,e.route,semanticOnly).map(v=>e.id+': '+v));return {ok:!errors.length,violations:[...new Set(errors)]};
  }
  function nodeGeometryErrors(graph){
    const by=new Map(graph.nodes.map(n=>[n.id,n])),errors=[];
    for(const n of graph.nodes){
      const owner=by.get(n.parent);
      if(['x','y','w','h'].some(k=>!Number.isFinite(n[k]))||n.w<=0||n.h<=0)errors.push('invalid native node geometry '+n.id);
      if(owner&&!owner.modelHeading&&(n.x<owner.x||n.y<owner.y||n.x+n.w>owner.x+owner.w||n.y+n.h>owner.y+owner.h))errors.push('native child leaves source owner '+n.id);
    }return errors;
  }
  function freezeEvidence(value){
    if(!value||typeof value!=='object'||frozen.has(value))return value;
    frozen.add(value);for(const child of Object.values(value))freezeEvidence(child);return Object.freeze(value);
  }
  function topology(graph){return stable([graph.irSha256,graph.nodes.map(n=>[n.id,n.parent,n.expanded,n.modelHeading]),graph.edges.map(e=>[e.id,e.source,e.target,!!e.draft,e.contract]),graph.sourceDraftOperations||[]]);}
  function sameCore(graph,record){return record&&record.ir===graph.generic.ir&&record.state===graph.generic.state&&record.receipts===graph.generic.receipts&&record.nodes.length===graph.nodes.length&&record.edges.length===graph.edges.length&&record.nodes.every((n,i)=>n===graph.nodes[i].semantic)&&record.edges.every((e,i)=>e===graph.edges[i].binding);}
  // A private in-memory certificate, never a serialized "trusted" flag. Its
  // immutable core covers the complete IR and this cut's canonical bindings.
  // Geometry remains mutable and is checked for every transaction/candidate.
  function certifiedContext(graph){
    const key=topology(graph);let record=certificates.get(graph.generic);
    if(!sameCore(graph,record)||record.topology!==key)record=(sharedCertificates.get(graph.generic.ir)||[]).find(v=>sameCore(graph,v)&&v.topology===key);
    const reused=!!record;certificates.set(graph.generic,record);
    if(!reused){
      const errors=nodeErrors(graph),semanticEdges=new Map(graph.edges.map(e=>[e.id,edgeErrors(graph,e,e.route,true)]));
      const all=validate(graph,true);
      if(!all.ok)return {nodeErrors:errors,semanticEdges,sourceCheck:all,certification:{reused:false,full:true}};
      for(const v of [graph.generic.ir,graph.generic.state,graph.generic.receipts,graph.generic.navigation,graph.generic.authoring,graph.generic.migration,...graph.nodes.map(n=>n.semantic),...graph.edges.map(e=>e.binding)])freezeEvidence(v);
      record={ir:graph.generic.ir,state:graph.generic.state,receipts:graph.generic.receipts,nodes:graph.nodes.map(n=>n.semantic),edges:graph.edges.map(e=>e.binding),topology:key,semanticEdges};
      certificates.set(graph.generic,record);
      sharedCertificates.set(graph.generic.ir,[record,...(sharedCertificates.get(graph.generic.ir)||[])].slice(0,4));
    }
    const errors=nodeGeometryErrors(graph),physical=graph.edges.flatMap(e=>e.draft?[]:root.SummaryPhysicalPorts.errors(graph,e,e.route).map(v=>e.id+': '+v));
    return {nodeErrors:errors,semanticEdges:record.semanticEdges,sourceCheck:{ok:!errors.length&&!physical.length,violations:[...errors,...physical]},certification:{reused,full:!reused}};
  }
  // Geometry-only undo/worker snapshots share frozen evidence, with independent
  // positions, routes, stateful drafts and cached layouts. No thousands-node IR
  // serialization is needed for a second movement on the same semantic cut.
  const coreKeys=['ir','state','receipts','navigation','authoring','migration'];
  function coreOf(graph){return {fields:Object.fromEntries(coreKeys.map(k=>[k,graph.generic[k]])),nodes:graph.nodes.map(n=>[n.id,n.semantic]),edges:graph.edges.map(e=>[e.id,e.binding])};}
  function shellOf(graph){const shell={...graph,generic:{...graph.generic},nodes:graph.nodes.map(n=>({...n,semantic:null})),edges:graph.edges.map(e=>({...e,binding:null}))};for(const k of coreKeys)shell.generic[k]=null;return shell;}
  function hydrate(shell,core){
    const nodes=new Map(core.nodes),edges=new Map(core.edges);
    Object.assign(shell.generic,core.fields);for(const n of shell.nodes)n.semantic=nodes.get(n.id);for(const e of shell.edges)e.binding=edges.get(e.id);return shell;
  }
  function cloneGeometry(graph){
    if(!graph.generic)return clone(graph);
    const copy=hydrate(clone(shellOf(graph)),coreOf(graph));
    const record=certificates.get(graph.generic);if(sameCore(copy,record)&&record.topology===topology(copy))certificates.set(copy.generic,record);
    const inputs=projectionInputs.get(graph.generic),cut=projections.get(graph.generic);
    if(cut&&inputs?.[0]===graph.generic.ir&&inputs?.[1]===graph.generic.state){projections.set(copy.generic,cut);projectionInputs.set(copy.generic,inputs);}return copy;
  }
  function transport(prefix='local'){
    let next=0,records=new Map(),last=null;
    return {
      pack(graph){
        if(!graph?.generic)return graph;
        // Freeze before comparing references; replacing a field or
        // binding forces a new core, even when a document claims the same digest.
        for(const v of [...coreKeys.map(k=>graph.generic[k]),...graph.nodes.map(n=>n.semantic),...graph.edges.map(e=>e.binding)])freezeEvidence(v);
        const core=coreOf(graph),same=last&&coreKeys.every(k=>last.core.fields[k]===core.fields[k])&&core.nodes.length===last.core.nodes.length&&core.edges.length===last.core.edges.length&&core.nodes.every(([id,n],i)=>id===last.core.nodes[i][0]&&n===last.core.nodes[i][1])&&core.edges.every(([id,e],i)=>id===last.core.edges[i][0]&&e===last.core.edges[i][1]);
        if(!same)last={id:prefix+':'+(++next),core};
        records.set(last.id,last.core);while(records.size>4)records.delete(records.keys().next().value);
        return {nativeGeometryTransport:1,id:last.id,shell:shellOf(graph),...(same?{}:{core})};
      },
      unpack(packet){
        if(packet?.nativeGeometryTransport!==1)return packet;
        if(packet.core){records.set(packet.id,packet.core);while(records.size>4)records.delete(records.keys().next().value);}
        const core=records.get(packet.id);if(!core)throw Error('语义切面缓存已过期，请重新执行操作');
        last={id:packet.id,core};return hydrate(packet.shell,core);
      }
    };
  }
  function routeOptions(options={}){return {margin:6,stub:16,bendCost:40,crossingCost:450,overlapCost:2,edgeSpacing:12,sides:'any',style:'orthogonal',boundaryLanes:false,preferCurrentPorts:true,tryDirectPorts:true,maxSearchVertices:20000,searchPadding:768,aStar:true,pruneContainedObstacles:true,spatialPrior:true,...options};}
  function route(graph,options={}){
    const native=root.SummaryEngine,C=root.SummaryConstraints,context=C.validationContext(graph);
    const opts=routeOptions(options),large=graph.nodes.length>1000,budget=options.budgetMs??(large?8000:Infinity),started=performance.now();
    const candidates=graph.nativeRouting?graph.edges.filter(e=>e.pendingRouting||e.failed).sort((a,b)=>Number(!!b.pendingRouting)-Number(!!a.pendingRouting)):graph.edges;
    const selected=new Set(candidates),prior=graph.edges.filter(e=>!selected.has(e)&&!e.failed&&!e.pendingRouting).map(e=>Object.assign(e.route.slice(),{wire:e.contract.wire}));let routed=0;
    for(const e of candidates){
      if(performance.now()-started>=budget){e.pendingRouting=true;e.failed=true;e.reason='尚未布线：可继续处理或查看局部模块';continue;}
      delete e.pendingRouting;const result=native.routeOne(graph,e,prior,opts,context);
      if(result.ok){routed++;prior.push(Object.assign(e.route.slice(),{wire:e.contract.wire}));}
    }
    // Retry only unsolved wires after legal lanes are known. Pending work is
    // explicit and never promoted to a valid route to meet a time budget.
    for(const e of graph.edges.filter(e=>e.failed&&!e.pendingRouting)){
      if(performance.now()-started>=budget)break;
      const occupied=graph.edges.filter(v=>v!==e&&!v.failed&&!v.pendingRouting).map(v=>Object.assign(v.route.slice(),{wire:v.contract.wire}));
      for(const searchPadding of [256,1536]){if(performance.now()-started>=budget)break;const result=native.routeOne(graph,e,occupied,{...opts,searchPadding,maxSearchVertices:80000},context);if(result.ok){routed++;break;}}
    }
    // Small visible cuts can afford a bounded second pass. Reconsider only
    // crossed wires against all settled paths, including alternative physical
    // ports. Commit a legal candidate only when total crossings decrease and
    // the entire pass stays within 4% of the original line length. Large source
    // cuts keep their existing batched route budget and never enter this pass.
    if(options.refineCrossings!==false&&graph.nodes.length<=300&&graph.edges.length<=300&&!graph.edges.some(e=>e.failed||e.pendingRouting)){
      refineJoins(graph,opts,context,options.joinBudgetMs??1200);
      refineCrossings(graph,opts,context,options.refinementBudgetMs??2500);
    }
    if(options.refinePlacement!==false&&!graph.nativeLayoutRestored&&!graph.nativeRouting&&graph.nodes.length<=300&&graph.edges.length<=300&&!graph.edges.some(e=>e.failed||e.pendingRouting)&&performance.now()-started<budget)
      refinePlacement(graph,opts,Math.min(options.placementBudgetMs??1800,budget-(performance.now()-started)));
    if(options.refineChannels!==false&&graph.nodes.length<=300&&graph.edges.length<=300&&!graph.edges.some(e=>e.failed||e.pendingRouting)&&performance.now()-started<budget)
      refineChannels(graph,opts,Math.min(options.channelBudgetMs??600,budget-(performance.now()-started)));
    if(options.refineFlow!==false&&graph.nodes.length<=300&&graph.edges.length<=300&&!graph.edges.some(e=>e.failed||e.pendingRouting)&&performance.now()-started<budget){
      if(!graph.nativeLayoutRestored&&!graph.nativeRouting)Flow.reorder(graph,opts,Math.min(options.siblingBudgetMs??2200,budget-(performance.now()-started)));
      Flow.fanouts(graph,opts,Math.min(options.fanoutBudgetMs??600,Math.max(0,budget-(performance.now()-started))));
    }
    const pending=graph.edges.filter(e=>e.pendingRouting).length,failed=graph.edges.filter(e=>e.failed).length;
    graph.nativeRouting={pending,failed:failed-pending,complete:!pending};return {graph,routed,failed,pending};
  }
  // A drawing-only proposal inside existing parent bounds. Computation ranks,
  // source owners, conditional alternatives and operand identities are fixed.
  // Cyclic/effectful sibling regions retain their existing arrangement. Parallel
  // chains get separate columns; a remaining data path gets a common axis.
  function placementProposal(graph){
    const by=new Map(graph.nodes.map(n=>[n.id,n])),children=new Map(),records=[];
    for(const n of graph.nodes){if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n);}
    const depth=n=>{let d=0;while(n?.parent){d++;n=by.get(n.parent);}return d;};
    const shift=(n,dx)=>{n.x+=dx;for(const c of children.get(n.id)||[])shift(c,dx);};
    // A call-bound argument belongs to its source call, but its glyph need not
    // occupy the title rail. Dock it outside the one actual receiving sibling
    // scope when that shortens its exact uses and there is unoccupied room.
    // Shared inputs/multiple receiving scopes keep their existing position.
    for(const n of graph.nodes){
      if(!n.semantic.invocation_binding||n.expanded||graph.edges.some(e=>e.target===n.id))continue;
      const parent=by.get(n.parent),uses=graph.edges.filter(e=>e.source===n.id);if(!parent||!uses.length)continue;
      const scope=id=>{while(id&&by.get(id)?.parent!==parent.id)id=by.get(id)?.parent;return id;};
      const scopes=new Set(uses.map(e=>scope(e.target)));if(scopes.size!==1||scopes.has(undefined)||scopes.has(null))continue;
      const target=by.get([...scopes][0]);if(!target||target.id===n.id)continue;
      const peers=children.get(parent.id)||[],gap=14,center=target.x+target.w/2;
      const xs=[center-n.w/2,parent.x+20,parent.x+parent.w-n.w-20,target.x-n.w-gap,target.x+target.w+gap];
      const ys=[target.y-n.h-gap,target.y+target.h+gap,target.y+(target.h-n.h)/2];
      const overlap=(a,b)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
      const distance=box=>uses.reduce((sum,e)=>{const t=by.get(e.target),x=box.x+box.w/2,y=box.y+box.h/2;return sum+Math.max(t.x-x,0,x-t.x-t.w)+Math.max(t.y-y,0,y-t.y-t.h);},0);
      // Preserve the direct data corridor before minimizing this auxiliary
      // input's own distance. A fixed flag above a return value must not force
      // its outgoing tensor around the flag. Lift exact endpoints to this
      // receiving scope, while retaining their real consumer geometry.
      const corridors=[];
      for(const e of graph.edges){
        if(e.source===n.id||e.target===n.id)continue;
        const members=e.binding.bundle_members||[e.binding],origin=by.get(e.source)?.semantic;
        if(!members.every(m=>['data','alias','interface-binding'].includes(m.kind))||origin?.invocation_binding||['parameter','buffer'].includes(origin?.kind)||origin?.operator==='constant')continue;
        const a=scope(e.source),b=scope(e.target);if((a===target.id)===(b===target.id))continue;
        const other=by.get(a===target.id?e.target:e.source);if(!other)continue;
        if(center>=other.x&&center<=other.x+other.w){
          const top=Math.min(target.y+target.h,other.y+other.h),bottom=Math.max(target.y,other.y);
          if(bottom>top)corridors.push({edge:e.id,x:center-10,y:top,w:20,h:bottom-top});
        }
        const middle=target.y+target.h/2;
        if(middle>=other.y&&middle<=other.y+other.h){
          const left=Math.min(target.x+target.w,other.x+other.w),right=Math.max(target.x,other.x);
          if(right>left)corridors.push({edge:e.id,x:left,y:middle-10,w:right-left,h:20});
        }
      }
      const blocks=box=>corridors.filter(c=>box.x<c.x+c.w&&box.x+box.w>c.x&&box.y<c.y+c.h&&box.y+box.h>c.y).length;
      const before=distance(n),blocked=blocks(n),trials=xs.flatMap(x=>ys.map(y=>({...n,x,y}))).filter(p=>p.x>=parent.x+20&&p.x+p.w<=parent.x+parent.w-20&&p.y>=parent.y+44&&p.y+p.h<=parent.y+parent.h-20&&peers.every(other=>other===n||!overlap(p,other))&&
        !(parent.labelObstacles||[]).some(b=>overlap(p,{x:parent.x+b.x,y:parent.y+b.y,w:b.w,h:b.h}))).sort((a,b)=>blocks(a)-blocks(b)||distance(a)-distance(b));
      const best=trials[0];if(!best||blocks(best)>blocked||blocks(best)===blocked&&distance(best)>before-32)continue;
      const from={x:n.x,y:n.y};n.x=best.x;n.y=best.y;records.push({parent:parent.id,kind:'argument-dock',moved:[n.id],consumer:target.id,uses:uses.map(e=>e.id),corridors:{before:blocked,after:blocks(best),edges:[...new Set(corridors.map(c=>c.edge))]},from,to:{x:n.x,y:n.y}});
    }
    for(const frame of graph.nodes.filter(n=>n.expanded&&!n.modelHeading).sort((a,b)=>depth(b)-depth(a))){
      const kids=children.get(frame.id)||[];if(kids.length<3||kids.length>30)continue;
      const ids=new Set(kids.map(n=>n.id)),owner=id=>{while(id&&!ids.has(id))id=by.get(id)?.parent;return id;};
      const adj=new Map(kids.map(n=>[n.id,new Set()])),pred=new Map(kids.map(n=>[n.id,new Set()]));let guarded=false;
      for(const e of graph.edges){const a=owner(e.source),b=owner(e.target);if(!a||!b||a===b)continue;
        const members=e.binding.bundle_members||[e.binding];
        if(members.some(m=>m.iteration||['state-write','effect'].includes(m.kind))){guarded=true;break;}
        if(!members.every(m=>['data','alias','interface-binding'].includes(m.kind)&&!m.layout_after&&!m.design_route))continue;
        adj.get(a).add(b);pred.get(b).add(a);
      }
      if(guarded)continue;
      const degrees=new Map(kids.map(n=>[n.id,pred.get(n.id).size])),queue=kids.filter(n=>!degrees.get(n.id)).map(n=>n.id);
      for(let i=0;i<queue.length;i++)for(const id of adj.get(queue[i]))if(degrees.set(id,degrees.get(id)-1).get(id)===0)queue.push(id);
      if(queue.length!==kids.length)continue;
      const safe=id=>{const n=by.get(id).semantic;return !['opaque','control','state','buffer','parameter','interface'].includes(n.kind)&&!n.mutable&&!n.identity_display&&!n.observed_calls&&!n.invocation_binding&&
        !['serial-repeat','repeat-instance','serial-remainder','loop-template','iteration-region'].includes(n.semantic_type);};
      const claimed=new Set(),axes=[];
      for(const sink of queue){
        if(!safe(sink)||pred.get(sink).size<2)continue;const paths=[];
        for(const tip of pred.get(sink)){const path=[];let at=tip;
          while(safe(at)&&!claimed.has(at)&&adj.get(at).size===1){path.unshift(at);if(pred.get(at).size!==1)break;at=[...pred.get(at)][0];}
          if(path.length)paths.push(path);
        }
        if(paths.length<2||paths.length>4||new Set(paths.flat()).size!==paths.flat().length)continue;
        for(const path of paths){axes.push({path,center:by.get(path.at(-1)).x+by.get(path.at(-1)).w/2,kind:'parallel'});for(const id of path)claimed.add(id);}
      }
      const best=new Map();for(const id of queue){if(!safe(id)||claimed.has(id))continue;
        const previous=[...pred.get(id)].filter(p=>best.has(p)).sort((a,b)=>best.get(b).length-best.get(a).length)[0];best.set(id,[...(previous?best.get(previous):[]),id]);}
      const path=[...best.values()].sort((a,b)=>b.length-a.length)[0];if(path?.length>=3)axes.push({path,center:frame.x+frame.w/2,kind:'spine'});
      if(!axes.length)continue;
      const desired=new Map(),vertical=(a,b)=>a.y+a.h+12<=b.y||b.y+b.h+12<=a.y;
      for(const axis of axes){if(axis.path.some((id,i)=>i&&!vertical(by.get(id),by.get(axis.path[i-1]))))continue;
        for(const id of axis.path)desired.set(id,axis.center-by.get(id).w/2);}
      if(!desired.size)continue;
      const boxes=new Map(),left=frame.x+20,right=frame.x+frame.w-20,gap=20;
      const overlaps=(a,b)=>!vertical(a,b)&&a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x;
      let ok=true;
      for(const n of kids.filter(n=>desired.has(n.id))){const box={...n,x:desired.get(n.id)};
        if(box.x<left||box.x+box.w>right||[...boxes.values()].some(b=>overlaps(box,b))){ok=false;break;}boxes.set(n.id,box);}
      if(!ok)continue;
      for(const n of kids.filter(n=>!desired.has(n.id))){
        const trials=[n.x,...[...boxes.values()].flatMap(b=>[b.x-gap-n.w,b.x+b.w+gap])].map(x=>({...n,x})).filter(b=>b.x>=left&&b.x+b.w<=right&&![...boxes.values()].some(p=>overlaps(b,p))).sort((a,b)=>Math.abs(a.x-n.x)-Math.abs(b.x-n.x));
        if(!trials.length){ok=false;break;}boxes.set(n.id,trials[0]);
      }
      if(!ok)continue;const changes=kids.filter(n=>Math.abs(n.x-boxes.get(n.id).x)>1e-5);
      if(!changes.length)continue;
      for(const n of changes)shift(n,boxes.get(n.id).x-n.x);
      records.push({parent:frame.id,axes:axes.map(a=>({kind:a.kind,members:a.path})),moved:changes.map(n=>n.id)});
    }
    return records;
  }
  function refinePlacement(graph,options,budgetMs){
    const R=root.EdgeRouterLabRouting,C=root.SummaryConstraints,started=performance.now(),candidate=cloneGeometry(graph),records=placementProposal(candidate);
    if(!records.length)return;
    const before=R.stats(graph.edges),by=new Map(graph.nodes.map(n=>[n.id,n])),moved=new Set(candidate.nodes.filter(n=>n.x!==by.get(n.id).x||n.y!==by.get(n.id).y).map(n=>n.id)),context=C.validationContext(candidate);
    const released=new Set(records.filter(r=>r.corridors&&r.corridors.after<r.corridors.before).flatMap(r=>r.corridors.edges));
    let affected=0;
    for(const e of candidate.edges)if(released.has(e.id)||moved.has(e.source)||moved.has(e.target)||!C.validate(candidate,e,e.route,context).ok){e.pendingRouting=true;affected++;}
    candidate.nativeRouting={pending:affected,failed:0,complete:false};
    // Work only on affected wires and wires obstructed by moved glyphs. Local
    // links settle before cross-frame/context wires. Other settled routes stay.
    const order=new Map(candidate.edges.map((e,i)=>[e.id,i]));candidate.edges.sort((a,b)=>Number(!!by.get(a.source).semantic.invocation_binding)-Number(!!by.get(b.source).semantic.invocation_binding)||Number(by.get(a.source).parent!==by.get(a.target).parent)-Number(by.get(b.source).parent!==by.get(b.target).parent));
    route(candidate,{...options,refinePlacement:false,refineCrossings:false,refineChannels:false,refineFlow:false,budgetMs:Math.max(0,budgetMs-(performance.now()-started))});candidate.edges.sort((a,b)=>order.get(a.id)-order.get(b.id));
    const after=R.stats(candidate.edges),check=root.SummaryEngine.validateView(candidate);
    const accepted=!candidate.edges.some(e=>e.failed||e.pendingRouting)&&check.source.ok&&check.layout.ok&&check.edges.every(([,v])=>v.ok)&&
      after.length<=before.length+1e-5&&after.bends<=before.bends&&after.crossings<=before.crossings&&
      (after.length<before.length-1e-5||after.bends<before.bends||after.crossings<before.crossings);
    if(accepted){Object.assign(graph,{nodes:candidate.nodes,edges:candidate.edges});}
    graph.nativeLayoutRefinement={accepted,affected,records,before,after:accepted?after:before,candidate:after,ms:performance.now()-started};
  }
  function borderProximity(graph,route,frames=graph.nodes.filter(n=>n.expanded&&!n.modelHeading)){
      let cost=0;const xs=[],ys=[];
      for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i];for(const f of frames){
        if(Math.abs(a.x-b.x)<1e-5){const overlap=Math.min(Math.max(a.y,b.y),f.y+f.h)-Math.max(Math.min(a.y,b.y),f.y);if(overlap<80)continue;
          for(const x of [f.x,f.x+f.w])if(Math.abs(a.x-x)<18){cost+=overlap*(18-Math.abs(a.x-x))/18;xs.push(x-20,x+20);}
        }else if(Math.abs(a.y-b.y)<1e-5){const overlap=Math.min(Math.max(a.x,b.x),f.x+f.w)-Math.max(Math.min(a.x,b.x),f.x);if(overlap<80)continue;
          for(const y of [f.y,f.y+f.h])if(Math.abs(a.y-y)<18){cost+=overlap*(18-Math.abs(a.y-y))/18;ys.push(y-20,y+20);}
        }
      }}return {cost,xs:[...new Set(xs)],ys:[...new Set(ys)]};
  }
  // Reuse settled corridor coordinates while jointly reconsidering both
  // terminals. Distinct canonical values never share an overlapping stem.
  // Border clearance may trade up to 3% local length for a reduced long
  // parallel-border penalty; bends and crossings must never increase.
  function refineChannels(graph,options, budgetMs){
    if(graph.nodes.length>300||graph.edges.length>300||options.policy==='never')return;
    const R=root.EdgeRouterLabRouting,P=root.SummaryPhysicalPorts,C=root.SummaryConstraints,N=root.SummaryEngine,by=new Map(graph.nodes.map(n=>[n.id,n])),context=C.validationContext(graph),started=performance.now(),before=R.stats(graph.edges);let accepted=0,attempted=0;
    const crossings=(e,route)=>graph.edges.filter(v=>v!==e).reduce((n,v)=>n+route.slice(1).reduce((sum,p,i)=>sum+v.route.slice(1).filter((q,j)=>R.crossing(route[i],p,v.route[j],q)).length,0),0);
    const frames=graph.nodes.filter(n=>n.expanded&&!n.modelHeading),borderMeasure=route=>borderProximity(graph,route,frames),borderBefore=graph.edges.reduce((sum,e)=>sum+borderMeasure(e.route).cost,0);
    const queue=graph.edges.filter(e=>!e.draft&&!e.failed&&!e.pendingRouting&&!(options.preserve&&e.waypoints?.length)&&(!options.channelEdges||options.channelEdges.has(e.id))).map(e=>({e,border:borderMeasure(e.route).cost})).filter(v=>R.simplify(v.e.route).length>3||v.border).sort((a,b)=>b.border-a.border||b.e.route.length-a.e.route.length).map(v=>v.e);
    for(const e of queue){
      if(performance.now()-started>=budgetMs)break;
      const source=by.get(e.source),target=by.get(e.target),base=R.stats([e]),baseCrossings=crossings(e,e.route),lanes=graph.edges.filter(v=>v!==e&&(v.source===e.source||v.target===e.target||by.get(v.source).parent===source.parent&&by.get(v.target).parent===target.parent)).flatMap(v=>v.route),xs=[...new Set([...e.route,...lanes].map(p=>p.x))],ys=[...new Set([...e.route,...lanes].map(p=>p.y))];
      const border=borderMeasure(e.route);let best=null,bestCost=base.length+40*base.bends+border.cost*.5;
      const sources=P.candidates(graph,e,'source',options.sides),targets=P.candidates(graph,e,'target',options.sides);
      for(const a of sources)for(const b of targets){
        if(performance.now()-started>=budgetMs)break;
        const s=P.point(source,a),t=P.point(target,b),near=(values,mid)=>values.slice().sort((a,b)=>Math.abs(a-mid)-Math.abs(b-mid)).slice(0,4);
        const routes=[[s,{x:s.x,y:t.y},t],[s,{x:t.x,y:s.y},t],...[...new Set([...near(xs,(s.x+t.x)/2),...border.xs])].map(x=>[s,{x,y:s.y},{x,y:t.y},t]),...[...new Set([...near(ys,(s.y+t.y)/2),...border.ys])].map(y=>[s,{x:s.x,y},{x:t.x,y},t])];
        for(const points of routes){const route=R.simplify(points),stats=R.stats([{route}]),candidateBorder=borderMeasure(route).cost,cost=stats.length+40*stats.bends+candidateBorder*.5;
          if(cost>=bestCost-1e-5||stats.bends>base.bends||stats.length>base.length*(border.cost>candidateBorder?1.03:1)+1e-5)continue;
          const candidate={...e,route,physicalSource:a,physicalTarget:b};attempted++;
          if(!C.validate(graph,candidate,route,context).ok||N.overlapsWire(graph,candidate,route)||crossings(e,route)>baseCrossings)continue;
          best={route,physicalSource:a,physicalTarget:b};bestCost=cost;
        }
      }
      if(best){Object.assign(e,best);accepted++;}
    }
    graph.nativeChannelRefinement={accepted,attempted,before,after:R.stats(graph.edges),borderBefore,borderAfter:graph.edges.reduce((sum,e)=>sum+borderMeasure(e.route).cost,0),ms:performance.now()-started};
  }
  // A greedy edge pass can keep a bypass on the axial input of a join and
  // make a short inline input detour to avoid crossing it. Reconsider both
  // wires together: reserve a legal straight input, then let the other inputs
  // approach from the perpendicular sides. This is topology/geometry only;
  // no operator names, algorithm recognition or canonical operand swapping.
  function refineJoins(graph,options,context,budgetMs){
    const R=root.EdgeRouterLabRouting,C=root.SummaryConstraints,P=root.SummaryPhysicalPorts,N=root.SummaryEngine,started=performance.now(),by=new Map(graph.nodes.map(n=>[n.id,n]));
    const snapshot=edges=>edges.map(e=>[e,{...clone(e),binding:e.binding}]);
    const restore=rows=>{for(const [e,saved]of rows){for(const key of Object.keys(e))delete e[key];Object.assign(e,saved);}};
    const intersects=(a,b)=>a.route.slice(1).some((p,i)=>b.route.slice(1).some((q,j)=>R.crossing(a.route[i],p,b.route[j],q)||R.overlap(a.route[i],p,b.route[j],q)>1e-5));
    const score=s=>s.length+40*s.bends+Math.max(450,options.crossingCost||0)*s.crossings;
    if(graph.nodes.length>300||graph.edges.length>300)return;
    const baseline=R.stats(graph.edges);let attempted=0,accepted=0;
    for(const e of graph.edges){
      if(performance.now()-started>=budgetMs)break;
      const source=by.get(e.source),target=by.get(e.target),inputs=graph.edges.filter(v=>v.target===e.target);
      if(options.joinEdges&&!options.joinEdges.has(e.id)||options.joinTargets&&!options.joinTargets.has(e.target))continue;
      if(e.draft||e.contract.bus||e.pendingRouting||e.failed||source.junction||target.junction||source.expanded||target.expanded||source.parent!==target.parent||inputs.length<2||inputs.length>6||R.simplify(e.route).length===2||e.portPolicy?.source.mode!=='free'||e.portPolicy?.target.mode!=='free')continue;
      const candidates=[];
      for(const a of P.candidates(graph,e,'source',options.sides))for(const b of P.candidates(graph,e,'target',options.sides)){
        if(a.inward||b.inward)continue;
        const s=P.point(source,a),t=P.point(target,b),vertical=Math.abs(s.x-t.x)<1e-5,horizontal=Math.abs(s.y-t.y)<1e-5;
        if(!(vertical&&((a.side==='top'&&b.side==='bottom'&&s.y>t.y)||(a.side==='bottom'&&b.side==='top'&&s.y<t.y))||horizontal&&((a.side==='left'&&b.side==='right'&&s.x>t.x)||(a.side==='right'&&b.side==='left'&&s.x<t.x))))continue;
        const candidate={...e,physicalSource:a,physicalTarget:b,route:[s,t]};
        if(C.validate(graph,candidate,candidate.route,context).ok)candidates.push({candidate,vertical,center:Math.abs(a.fraction-.5)+Math.abs(b.fraction-.5)});
      }
      const proposal=candidates.sort((a,b)=>a.center-b.center)[0];if(!proposal)continue;
      const blockers=graph.edges.filter(v=>v!==e&&v.contract.wire!==e.contract.wire&&intersects(proposal.candidate,v));
      // The local transaction owns only this join's incoming wires. It cannot
      // move an unrelated dependency to hide a new crossing elsewhere.
      if(blockers.some(v=>v.target!==e.target||v.draft||v.contract.bus||v.portPolicy?.target.mode!=='free'||options.joinEdges&&!options.joinEdges.has(v.id))||blockers.length>3)continue;
      const group=[e,...blockers],saved=snapshot(group),before=R.stats(graph.edges);let best=null,bestScore=score(before);attempted++;
      const sides=proposal.vertical?['right','left']:['bottom','top'],excursion=side=>blockers.reduce((sum,v)=>sum+Math.max(0,...v.route.map(p=>side==='right'?p.x-target.x-target.w:side==='left'?target.x-p.x:side==='bottom'?p.y-target.y-target.h:target.y-p.y)),0);
      sides.sort((a,b)=>excursion(b)-excursion(a));
      for(const side of sides){
        if(performance.now()-started>=budgetMs)break;
        restore(saved);Object.assign(e,{route:proposal.candidate.route,physicalSource:proposal.candidate.physicalSource,physicalTarget:proposal.candidate.physicalTarget});let ok=true;
        for(const other of blockers){
          const node=by.get(other.source),end=by.get(other.target),prior=graph.edges.filter(v=>v!==other&&v.contract.wire!==other.contract.wire),channels=[...new Set(other.route.map(p=>proposal.vertical?p.x:p.y))];let bestRoute=null,bestCost=Infinity;
          const targets=P.candidates(graph,other,'target',options.sides).filter(p=>p.side===side).sort((a,b)=>Math.abs(a.fraction-.5)-Math.abs(b.fraction-.5)).slice(0,2);
          for(const a of P.candidates(graph,other,'source',options.sides))for(const b of targets)for(const lane of channels){
            const s=P.point(node,a),t=P.point(end,b),route=R.simplify(proposal.vertical?[s,{x:lane,y:s.y},{x:lane,y:t.y},t]:[s,{x:s.x,y:lane},{x:t.x,y:lane},t]),candidate={...other,physicalSource:a,physicalTarget:b};
            if(!C.validate(graph,candidate,route,context).ok||N.overlapsWire(graph,candidate,route))continue;
            const crossings=prior.reduce((v,p)=>v+route.slice(1).reduce((sum,q,i)=>sum+p.route.slice(1).filter((r,j)=>R.crossing(route[i],q,p.route[j],r)).length,0),0),cost=route.slice(1).reduce((v,p,i)=>v+R.dist(route[i],p),0)+40*(route.length-2)+Math.max(450,options.crossingCost||0)*crossings;
            if(cost<bestCost){bestCost=cost;bestRoute={route,physicalSource:a,physicalTarget:b};}
          }
          if(!bestRoute){ok=false;break;}Object.assign(other,bestRoute);
        }
        const after=R.stats(graph.edges);
        if(ok&&group.every(v=>C.validate(graph,v,v.route,context).ok&&!N.overlapsWire(graph,v,v.route))&&after.crossings<=before.crossings&&after.bends<=before.bends&&after.length<=before.length*1.04&&score(after)<bestScore-1e-5){best=snapshot(group);bestScore=score(after);break;}
      }
      restore(best||saved);if(best)accepted++;
    }
    graph.nativeJoinRefinement={attempted,accepted,before:baseline,after:R.stats(graph.edges)};
  }
  function refineCrossings(graph,options,context,budgetMs){
    const R=root.EdgeRouterLabRouting,started=performance.now(),baseline=R.stats(graph.edges),limit=baseline.length*1.04;
    const count=e=>graph.edges.filter(v=>v!==e).reduce((n,v)=>n+e.route.slice(1).reduce((sum,p,i)=>sum+v.route.slice(1).filter((q,j)=>R.crossing(e.route[i],p,v.route[j],q)).length,0),0);
    let attempted=0,accepted=0;
    for(let pass=0;pass<2;pass++){
      const queue=graph.edges.map(e=>({e,crossings:count(e)})).filter(v=>v.crossings).sort((a,b)=>b.crossings-a.crossings).slice(0,32);let improved=false;
      for(const {e}of queue){
        if(performance.now()-started>=budgetMs)break;
        if(!count(e))continue;
        const saved=clone(e),before=R.stats(graph.edges),prior=graph.edges.filter(v=>v!==e).map(v=>Object.assign(v.route.slice(),{wire:v.contract.wire}));
        const result=root.SummaryEngine.routeOne(graph,e,prior,{...options,tryDirectPorts:true,crossingCost:Math.max(1500,options.crossingCost||0)},context),after=R.stats(graph.edges);attempted++;
        if(result.ok&&after.crossings<before.crossings&&after.length<=limit){accepted++;improved=true;}
        else{for(const key of Object.keys(e))delete e[key];Object.assign(e,saved);}
      }
      if(!improved||performance.now()-started>=budgetMs)break;
    }
    graph.nativeRefinement={attempted,accepted,before:baseline,after:R.stats(graph.edges)};
  }
  function document(graph){const nativeLayout=layoutSnapshot(graph);return {schema:SCHEMA,renderer:graph.generic.version,ir:clone(graph.generic.ir),state:clone(graph.generic.state),authoring:clone(graph.generic.authoring),migration:clone(graph.generic.migration),layouts:clone(graph.generic.layouts||[]),nativeLayout:clone(nativeLayout)};}
  function read(value){
    let ir,state,authoring,migration,nativeLayout,layouts;
    if(value.schema===SCHEMA){({ir,state,authoring,migration,nativeLayout,layouts}=value);if(value.renderer!==VERSION){if(!/^native-semantic\/([1-9]|10|11)$/.test(value.renderer||''))throw Error('不支持的原生语义布局版本');migration={...(migration||{}),previousRenderer:value.renderer,previousNativeLayout:clone(nativeLayout||null),previousLayouts:clone(layouts||[])};nativeLayout=null;layouts=[];}}
    else if(value.schema==='semantic-authoring/1'){A.validate(value);authoring=value;ir=A.sourceIR(value);state={view:'publication',mode:'merged',paperCanonical:true,paperMedium:'canvas',paperAuto:false,open:value.open||[]};migration={schema:value.schema,original:clone(value)};}
    else if(['semantic-canvas/1','archcanvas-architecture-document/1'].includes(value.schema)){({ir,state}=value);authoring=value.authoring||null;migration={schema:value.schema,original:clone(value),geometry:'Retained as provenance; measured again for native canvas'};}
    else if(value.schema==='archcanvas-source-semantic/2')ir=value;
    else throw Error('不支持的通用语义文档格式');
    E.validate(ir);if(authoring)A.validate(authoring);return {ir,state,authoring,migration,nativeLayout,layouts};
  }
  function restore(graph,layout){
    if(!layout)return graph;
    const target=graph;graph={...graph,nodes:graph.nodes.map(n=>({...n})),edges:graph.edges};
    const by=new Map(graph.nodes.map(n=>[n.id,n]));if(new Set(layout.nodes.map(n=>n.id)).size!==by.size||layout.nodes.length!==by.size)throw Error('保存位置与当前语义切面不匹配');
    for(const p of layout.nodes){const n=by.get(p.id);if(!n||['x','y','w','h'].some(k=>!Number.isFinite(p[k]))||p.w!==n.w||p.h!==n.h)throw Error('保存图元尺寸或身份无效');n.x=p.x;n.y=p.y;}
    const canonical=new Map(graph.edges.map(e=>[e.id,e]));
    graph.edges=clone(layout.edges).map(e=>layout.compact&&!e.draft?{...canonical.get(e.id),...e,binding:canonical.get(e.id)?.binding}:e);graph.sourceDraftOperations=clone(layout.sourceDraftOperations||[]);graph.nativeRouting=clone(layout.nativeRouting||null);graph.canvas=[Math.max(900,...graph.nodes.map(n=>n.x+n.w+64)),Math.max(600,...graph.nodes.map(n=>n.y+n.h+64))];
    const check=validate(graph);if(!check.ok)throw Error(check.violations.slice(0,3).join('; '));Object.assign(target,{nodes:graph.nodes,edges:graph.edges,sourceDraftOperations:graph.sourceDraftOperations,nativeRouting:graph.nativeRouting,canvas:graph.canvas});return target;
  }
  function prepare(message){
    const graph=message.task==='generic-build'?build(message.ir,message.state,message.extra):message.task==='generic-route'?message.graph:operate(message.graph,message.operation||{});
    if(message.nativeLayout)restore(graph,message.nativeLayout);
    const result=message.nativeLayout||graph.nativeLayoutRestored?{routed:0,failed:0}:route(graph,message.options);delete graph.nativeLayoutRestored;
    const validation=root.SummaryEngine.validateView(graph);
    if(!validation.source.ok||validation.layout.nodes.length)throw Error([...validation.source.violations,...validation.layout.nodes.map(ids=>'overlapping source owners '+ids.join(' / '))].slice(0,4).join('; '));
    // Incomplete visual drafts remain visible and explicitly marked. They can
    // be saved/exported without pretending to satisfy geometry constraints.
    return {ok:true,graph,...result,failed:Math.max(result.failed,validation.edges.filter(([,v])=>!v.ok).length),validation};
  }
  const api={VERSION,SCHEMA,engine,project,initial,build,nodeEvidence,color,edgeAppearance,headingIds,appearance,glyph,children,operate,remember,expected,slotIdentity,boundarySequence,boundaryErrors,constraints,nodeErrors,edgeErrors,validate,certifiedContext,cloneGeometry,transport,prepare,route,placementProposal,refinePlacement,borderProximity,refineChannels,refineJoins,routeOptions,layoutSnapshot,document,read,restore,stable};
  root.SummaryNativeSemantic=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

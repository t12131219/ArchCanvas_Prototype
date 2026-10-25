/* Geometry-only interaction shared by source, architecture and publication views.
 * The dedicated editor's baseline/session/transaction pattern is adapted here;
 * canonical nodes, operands, call identities and styles are never rewritten. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('./architecture-layout.js'):null);
  const R=root.SemanticPublicationRenderer||(typeof require==='function'?require('./publication-renderer.js'):null);
  const Geometry=root.SemanticGeometryIndex||(typeof require==='function'?require('./geometry-index.js'):null);
  const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1e-5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1e-5;
  const path=points=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
  const shift=(points,dx,dy)=>points.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
  // A translated circular terminal and the same terminal recomputed from its
  // translated box can differ by a few floating-point units. Preserve saved
  // geometry while allowing only arithmetic roundoff, never pixel tolerance.
  const sameCoordinate=(a,b)=>Math.abs(a-b)<=8*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
  function owner(graph,id){let at=graph.idx.nodes.get(id)?.parent;while(at&&!graph.positions.has(at))at=graph.idx.nodes.get(at)?.parent;return at||null;}
  function routes(figure){return figure.prepared?.routes||figure.graph.edges.map(e=>({...e,route:E.route(e,figure.graph.positions)}));}
  function session(figure,id){
    const g=figure.graph,p=g.positions.get(id);if(!p)return null;
    const ids=new Set([id]),todo=[id];
    for(let i=0;i<todo.length;i++)for(const child of g.idx.children.get(todo[i])||[]){todo.push(child);if(g.positions.has(child))ids.add(child);}
    const parent=owner(g,id),ancestors=new Set();let at=parent;while(at){ancestors.add(at);at=owner(g,at);}
    const obstacles=g.nodes.filter(n=>!ids.has(n.id)&&!ancestors.has(n.id)).map(n=>g.positions.get(n.id));
    const origins=new Map([...ids].map(id=>[id,{...g.positions.get(id)}]));
    // If the root encloses its visible descendants, its swept destination
    // bounds are a sufficient broad phase. Only pre-existing intersections
    // require a per-descendant check; no new collision can be hidden inside it.
    const enclosed=[...origins.values()].every(q=>q.x>=p.x&&q.y>=p.y&&q.x+q.w<=p.x+p.w&&q.y+q.h<=p.y+p.h);
    const existing=enclosed?obstacles.filter(q=>overlap(p,q)):null;
    return {id,ids,origins,parent:parent&&g.positions.get(parent),enclosed,existing,
      bounds:figure.prepared?.bounds||g.bounds,
      obstacles,obstacleIndex:obstacles.length>64?Geometry.boxes(obstacles):null,
      edges:routes(figure).filter(e=>ids.has(e.source)||ids.has(e.target)),dx:0,dy:0};
  }
  function constrain(s,dx,dy){
    if(!s||!Number.isFinite(dx)||!Number.isFinite(dy))return {ok:false,reason:'invalid displacement'};
    const p=s.origins.get(s.id),b=s.parent||s.bounds,pad=s.parent?2:0;
    // Titles are ink, not a full-width reserved band. Match the dedicated
    // canvas: manually placed children may share/cover the title's row.
    const loX=b.x+pad-p.x,hiX=b.x+b.w-pad-p.x-p.w,loY=b.y+pad-p.y,hiY=b.y+b.h-pad-p.y-p.h;
    // A pre-existing tight frame must never cause a jump on pointerdown.
    dx=Math.max(Math.min(0,loX),Math.min(Math.max(0,hiX),dx));dy=Math.max(Math.min(0,loY),Math.min(Math.max(0,hiY),dy));
    const movedRoot={...p,x:p.x+dx,y:p.y+dy};
    if(s.enclosed){
      for(const obstacle of s.obstacleIndex?s.obstacleIndex.query(movedRoot):s.obstacles)
        if(overlap(movedRoot,obstacle)&&!overlap(p,obstacle))return {ok:false,reason:'node overlap',dx:s.dx,dy:s.dy};
      if(!s.existing.length)return {ok:true,dx,dy};
    }
    for(const original of s.origins.values()){
      const moved={...original,x:original.x+dx,y:original.y+dy};
      for(const obstacle of s.enclosed?s.existing:s.obstacleIndex?s.obstacleIndex.query(moved):s.obstacles)
        if(overlap(moved,obstacle)&&!overlap(original,obstacle))return {ok:false,reason:'node overlap',dx:s.dx,dy:s.dy};
    }
    return {ok:true,dx,dy};
  }
  // Never invoke a path finder during a pointer frame. Whole internal routes
  // translate; external routes retain their fixed end and an orthogonal lead-in.
  function previewRoute(e,s,dx,dy){
    const a=s.ids.has(e.source),b=s.ids.has(e.target),ps=e.route.points;
    if(a&&b)return shift(ps,dx,dy);
    if(!a&&!b)return ps;
    const ordered=b?ps.slice().reverse():ps.slice(),start=ordered[0],next=ordered[1]||start;
    if(ordered.length===2){
      // A straight route has no untouched interior join. Keep its fixed
      // endpoint AND the final arrow direction while previewing a dogleg.
      const horizontal=start.y===next.y,direction=horizontal?Math.sign(next.x-start.x):Math.sign(next.y-start.y),stub=16;
      const moved={x:start.x+dx,y:start.y+dy},lead={x:moved.x+(horizontal?direction*stub:0),y:moved.y+(horizontal?0:direction*stub)},tail={x:next.x-(horizontal?direction*stub:0),y:next.y-(horizontal?0:direction*stub)};
      const mid=horizontal?(lead.x+tail.x)/2:(lead.y+tail.y)/2;
      const result=horizontal?[moved,lead,{x:mid,y:lead.y},{x:mid,y:tail.y},tail,next]:[moved,lead,{x:lead.x,y:mid},{x:tail.x,y:mid},tail,next];
      return b?result.reverse():result;
    }
    const moved={x:start.x+dx,y:start.y+dy},lead={x:next.x+dx,y:next.y+dy};
    const join=ordered[2]||next;
    const bridge=start.x===next.x?{x:join.x,y:lead.y}:{x:lead.x,y:join.y};
    const result=[moved,lead,bridge,...ordered.slice(2)];return b?result.reverse():result;
  }
  function copyFigure(figure){
    const g=figure.graph,positions=new Map([...g.positions].map(([id,p])=>[id,{...p}]));
    positions.context={...g.positions.context,routeCache:new Map(),reserved:[]};
    return {graph:{...g,positions,constraint_receipts:E.clone(g.constraint_receipts||[])},prepared:figure.prepared,frontierLayout:figure.frontierLayout};
  }
  function physical(edge,positions){
    const ps=edge.route.points;if(!edge.route.ok||ps.length<2||ps.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return false;
    const boxes=L.routeObstacles(edge,positions);
    return ps.every((p,i)=>!i||((p.x===ps[i-1].x||p.y===ps[i-1].y)&&!L.blocked(ps[i-1],p,boxes)));
  }
  function terminals(edge,positions){
    const ps=edge.route.points,es=L.route(edge,positions,{terminalsOnly:true}).points;
    return ps.length>=2&&es.length===2&&sameCoordinate(ps[0].x,es[0].x)&&sameCoordinate(ps[0].y,es[0].y)&&
      sameCoordinate(ps.at(-1).x,es[1].x)&&sameCoordinate(ps.at(-1).y,es[1].y);
  }
  function optimizePorts(edges,positions,changed){
    const ctx=positions.context,sides=['top','bottom','left','right'],normals={top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]},score=r=>r.points.reduce((sum,p,i)=>sum+(i?Math.abs(p.x-r.points[i-1].x)+Math.abs(p.y-r.points[i-1].y):0),Math.max(0,r.points.length-2)*24);
    ctx.physicalPortSides={...ctx.physicalPortSides};
    for(const edge of edges){if(!changed.has(edge.id)||changed.get(edge.id).ok||!L.allowsPhysicalSides(edge,positions))continue;
      const original=ctx.physicalPortSides[edge.id],baseline=L.route(edge,positions),trials=[];
      for(const source of sides)for(const target of sides){
        ctx.physicalPortSides[edge.id]=[source,target];const [s,t]=L.route(edge,positions,{terminalsOnly:true}).points,stub=ctx.stubLength??16;
        const a={x:s.x+normals[source][0]*stub,y:s.y+normals[source][1]*stub},b={x:t.x+normals[target][0]*stub,y:t.y+normals[target][1]*stub};
        trials.push({sides:[source,target],bound:2*stub+Math.abs(a.x-b.x)+Math.abs(a.y-b.y)});
      }
      let best=baseline.ok?score(baseline):Infinity,choice=original;
      // Bounded side search runs only on release, never in a pointer frame.
      // Ordinary default layouts are unaffected by manual port optimization.
      for(const trial of trials.sort((a,b)=>a.bound-b.bound).slice(0,4)){
        if(trial.bound>=best)continue;ctx.physicalPortSides[edge.id]=trial.sides;
        const candidate=L.route(edge,positions);if(candidate.ok&&score(candidate)<best){choice=trial.sides;best=score(candidate);}
      }
      if(choice)ctx.physicalPortSides[edge.id]=choice;else delete ctx.physicalPortSides[edge.id];
    }
  }
  function qualityOK(before,after){
    return after.issues.every(x=>before.issues.includes(x))&&after.route_failures.length<=before.route_failures.length&&
      after.unplaced_port_labels.length<=before.unplaced_port_labels.length&&
      after.line_geometry.unrelated_contacts.length<=before.line_geometry.unrelated_contacts.length&&
      after.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=before.line_geometry.overlapping_paths.filter(p=>!p.same_value).length;
  }
  function reroute(figure,positions,changed,ir){
    return L.withRoutingIndex(positions,()=>rerouteIndexed(figure,positions,changed,ir));
  }
  function rerouteIndexed(figure,positions,changed,ir){
    const old=routes(figure),candidate=copyFigure(figure),g=candidate.graph;g.positions=positions;
    const ctx=positions.context,selected=figure.prepared?.routing?.shared_fanout_refinement?.selected||[];
    const broken=new Set(selected.filter(r=>r.edges.some(id=>changed.has(id))).flatMap(r=>r.edges));
    if(ctx.optimizePhysicalPorts)optimizePorts(old,positions,changed);
    let fresh=old.map(e=>({...e,route:changed.get(e.id)||e.route}));
    // Reallocating one physical side can change adjacent slots on that node.
    // Validate every incident terminal, including otherwise untouched wires.
    const affected=new Set(fresh.filter(e=>broken.has(e.id)||!physical(e,positions)||!terminals(e,positions)).map(e=>e.id));
    const segments=es=>es.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
    ctx.routeCache=new Map();ctx.reserved=segments(fresh.filter(e=>!affected.has(e.id)));
    fresh=fresh.map(e=>{if(!affected.has(e.id))return e;const route=E.route(e,positions);ctx.routeCache.set(e.id,route);ctx.reserved.push(...segments([{route}]));return {...e,route};});
    if(!fresh.every(e=>physical(e,positions)&&terminals(e,positions)))throw Error('此位置无法保留避障连线');
    E.auditConstraintRoutes(g,fresh);
    const applied=new Set((figure.graph.constraint_receipts||[]).filter(r=>r.status==='applied').map(r=>r.id));
    if(g.constraint_receipts.some(r=>applied.has(r.id)&&r.status!=='applied'))throw Error('此位置无法保留已认证的连接约束');
    ctx.routeCache=new Map(fresh.map(e=>[e.id,e.route]));ctx.reserved=segments(fresh);
    if(figure.prepared){
      candidate.prepared=R.evaluateRoutes(g,fresh,figure.prepared.quality.route_strategy);
      if(!qualityOK(figure.prepared.quality,candidate.prepared.quality)){
        // A bounded full routing pass is a settling fallback, never a pointer
        // frame operation. The old figure survives if it cannot pass the gate.
        candidate.prepared=R.prepare(g);
        if(!qualityOK(figure.prepared.quality,candidate.prepared.quality)||!candidate.prepared.routes.every(e=>physical(e,positions)))throw Error('此位置会增加连接或标签冲突');
      }
      candidate.prepared.routing={...candidate.prepared.routing,manual_move:{rerouted:affected.size},shared_fanout_refinement:{selected:[]}};
      // Rebuild shared stems from the settled terminals, retaining every use.
      const chosen=ir?R.prepareSharedFanouts(ir,{paperComposition:g.publication.composition?'architecture':'dependency'},candidate):candidate;
      if(candidate.frontierLayout)chosen.frontierLayout=candidate.frontierLayout;
      E.auditConstraintRoutes(chosen.graph,chosen.prepared.routes);
      // Shared stems explicitly replace some physical terminals. Their exact
      // canonical members remain governed by the fanout certificate.
      if(chosen.graph.constraint_receipts.some(r=>applied.has(r.id)&&r.status!=='applied')||!chosen.prepared.routes.every(e=>physical(e,chosen.graph.positions)))throw Error('移动后的连接约束未通过校验');
      ctx.routeCache=new Map(chosen.prepared.routes.map(e=>[e.id,e.route]));
      markers(chosen);return chosen;
    }
    return candidate;
  }
  function move(figure,id,dx,dy,ir){
    const s=session(figure,id),c=constrain(s,dx,dy);if(!c.ok)throw Error(c.reason==='node overlap'?'目标位置与其他图元重叠':'无效移动');
    if(!c.dx&&!c.dy)return {figure,moved:false,dx:0,dy:0};
    const candidate=copyFigure(figure),positions=candidate.graph.positions,changed=new Map();
    for(const [id,p]of s.origins)Object.assign(positions.get(id),{x:p.x+c.dx,y:p.y+c.dy});
    for(const e of s.edges)changed.set(e.id,{...e.route,points:previewRoute(e,s,c.dx,c.dy)});
    // Boundary routes must be solved against their actual canonical ports.
    for(const e of s.edges)if(s.ids.has(e.source)!==s.ids.has(e.target))changed.set(e.id,{...changed.get(e.id),ok:false});
    positions.context.optimizePhysicalPorts=true;
    let settled;try{settled=reroute(figure,positions,changed,ir);}catch(error){
      // A side proposal must pass the same fact/quality gate. Retry the
      // established policy before rejecting an otherwise legal move.
      positions.context.physicalPortSides=figure.graph.positions.context.physicalPortSides;
      positions.context.optimizePhysicalPorts=false;settled=reroute(figure,positions,changed,ir);
    }
    delete settled.graph.positions.context.optimizePhysicalPorts;
    return {figure:settled,moved:true,dx:c.dx,dy:c.dy};
  }
  function identity(g){return JSON.stringify([g.nodes.map(n=>[n.id,n.parent]).sort(),g.edges.map(e=>[e.id,e.source,e.target,e.source_port,e.target_port,e.originals]).sort()]);}
  function markers(figure){
    const groups=new Map();for(const e of figure.prepared.routes){if(e.bundle_members||e.condition||e.iteration||e.layout_after||e.design_route||e.context_lane||!['data','alias','interface-binding'].includes(e.kind))continue;const key=JSON.stringify([e.resolved_source||e.canonical_source||e.source,e.source_port]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
    const selected=[...groups.values()].filter(es=>es.length>1).map(es=>({resolved_source:es[0].resolved_source||es[0].canonical_source||es[0].source,source_port:es[0].source_port,edges:es.map(e=>e.id),junctions:L.fanoutJunctions(es).filter(p=>figure.prepared.routes.every(e=>es.includes(e)||!e.route.points.some((b,i,ps)=>i&&L.blocked(ps[i-1],b,[{x:p.x-4,y:p.y-4,w:8,h:8}]))))})).filter(r=>r.junctions.length);
    figure.prepared.routing={...figure.prepared.routing,shared_fanout_refinement:{selected}};
  }
  function placement(figure){return {schema:'semantic-canvas-placement/1',identity:identity(figure.graph),
    positions:[...figure.graph.positions].map(([id,p])=>[id,p.x,p.y,p.w,p.h]),routes:routes(figure).map(e=>[e.id,e.route]),
    policy:Object.fromEntries(['portOrder','ancestorPorts','stubLength','physicalPortSides'].map(k=>[k,figure.graph.positions.context[k]])),
    ...(figure.frontierLayout?{layout:figure.frontierLayout}:{})};}
  function placementLayout(saved){
    // Saved layout hints can only choose these existing geometry policies.
    // They cannot replace a focus, frontier, role request or source binding.
    const result={};if([false,'left','right'].includes(saved?.layout?.paperArchitecturePathRows))result.paperArchitecturePathRows=saved.layout.paperArchitecturePathRows;
    if(['aligned','compact'].includes(saved?.layout?.paperArchitectureStreams))result.paperArchitectureStreams=saved.layout.paperArchitectureStreams;
    for(const key of ['paperArchitectureTerminals','paperArchitectureInputs'])if(saved?.layout?.[key]===false)result[key]=false;
    return result;
  }
  function restore(figure,saved,ir){
    if(!saved||saved.schema!=='semantic-canvas-placement/1'||saved.identity!==identity(figure.graph))return null;
    const candidate=copyFigure(figure),g=candidate.graph,seen=new Set();if(saved.layout)candidate.frontierLayout=placementLayout(saved);
    if(saved.positions.length!==g.positions.size)return null;
    for(const [id,x,y,w,h]of saved.positions){const p=g.positions.get(id);if(!p||seen.has(id)||![x,y,w,h].every(Number.isFinite)||p.w!==w||p.h!==h)return null;seen.add(id);p.x=x;p.y=y;}
    // Validate final geometry, including moved parents, against its own scene.
    // Existing source layouts can contain intentional header intersections;
    // reject newly introduced collisions rather than deleting those facts.
    const owners=new Map(g.nodes.map(n=>[n.id,owner(g,n.id)])),siblings=new Map();
    for(const n of g.nodes){const parent=owners.get(n.id);if(!siblings.has(parent))siblings.set(parent,[]);siblings.get(parent).push({...g.positions.get(n.id),id:n.id});}
    const siblingIndexes=new Map([...siblings].filter(([,ns])=>ns.length>64).map(([parent,ns])=>[parent,Geometry.boxes(ns)]));
    for(const n of g.nodes){
      const p=g.positions.get(n.id),before=figure.graph.positions.get(n.id),parent=owners.get(n.id),frame=parent&&g.positions.get(parent),oldFrame=parent&&figure.graph.positions.get(parent);
      const inside=(a,b)=>a.x>=b.x&&a.y>=b.y&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h;
      if(frame&&inside(before,oldFrame)&&!inside(p,frame))return null;
      if(!frame&&!inside(p,figure.prepared?.bounds||g.bounds))return null;
      for(const other of siblingIndexes.has(parent)?siblingIndexes.get(parent).query(p):siblings.get(parent)){if(other.id===n.id)continue;
        if(overlap(p,g.positions.get(other.id))&&!overlap(before,figure.graph.positions.get(other.id)))return null;
      }
    }
    return L.withRoutingIndex(g.positions,()=>{
    const by=new Map(saved.routes);if(by.size!==g.edges.length)return null;
    const fresh=g.edges.map(e=>({...e,route:by.get(e.id)}));if(fresh.some(e=>!e.route)||!fresh.every(e=>physical(e,g.positions)))return null;
    const ctx=g.positions.context,policy=saved.policy||{};
    if(policy.physicalPortSides){
      const edges=new Map(g.edges.map(e=>[e.id,e]));
      for(const [id,sides]of Object.entries(policy.physicalPortSides))if(!edges.has(id)||!L.allowsPhysicalSides(edges.get(id),g.positions)||!Array.isArray(sides)||sides.length!==2||sides.some(s=>!['top','bottom','left','right'].includes(s)))return null;
    }
    for(const key of ['portOrder','ancestorPorts','stubLength','physicalPortSides'])if(Object.hasOwn(policy,key))ctx[key]=policy[key];
    ctx.routeCache=new Map();ctx.reserved=[];
    for(const e of fresh){
      // Physical paths were checked above. Terminal verification needs the
      // actual port allocation, not another visibility search per saved edge.
      const expected=L.route(e,g.positions,{terminalsOnly:true}),ps=e.route.points,es=expected.points;
      if(!es.length||!sameCoordinate(ps[0].x,es[0].x)||!sameCoordinate(ps[0].y,es[0].y)||
        !sameCoordinate(ps.at(-1).x,es.at(-1).x)||!sameCoordinate(ps.at(-1).y,es.at(-1).y))return null;
    }
    E.auditConstraintRoutes(g,fresh);
    if((figure.graph.constraint_receipts||[]).some(r=>r.status==='applied'&&!g.constraint_receipts.some(c=>c.id===r.id&&c.status==='applied')))return null;
    ctx.routeCache=new Map(fresh.map(e=>[e.id,e.route]));
    if(figure.prepared){
      candidate.prepared=R.evaluateRoutes(g,fresh,figure.prepared.quality.route_strategy);
      if(!qualityOK(figure.prepared.quality,candidate.prepared.quality))return null;
      candidate.prepared.routing={manual_move:{restored:true}};markers(candidate);
    }
    return candidate;
    });
  }
  const api={session,constrain,previewRoute,path,move,placement,restore,physical,qualityOK,placementLayout};
  root.SemanticCanvasInteraction=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

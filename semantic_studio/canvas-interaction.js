/* Geometry-only interaction shared by source, architecture and publication views.
 * The dedicated editor's baseline/session/transaction pattern is adapted here;
 * canonical nodes, operands, call identities and styles are never rewritten. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('./architecture-layout.js'):null);
  const R=root.SemanticPublicationRenderer||(typeof require==='function'?require('./publication-renderer.js'):null);
  const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1e-5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1e-5;
  const path=points=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
  const shift=(points,dx,dy)=>points.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
  function owner(graph,id){let at=graph.idx.nodes.get(id)?.parent;while(at&&!graph.positions.has(at))at=graph.idx.nodes.get(at)?.parent;return at||null;}
  function routes(figure){return figure.prepared?.routes||figure.graph.edges.map(e=>({...e,route:E.route(e,figure.graph.positions)}));}
  function session(figure,id){
    const g=figure.graph,p=g.positions.get(id);if(!p)return null;
    const ids=new Set([id]),todo=[id];
    for(let i=0;i<todo.length;i++)for(const child of g.idx.children.get(todo[i])||[]){todo.push(child);if(g.positions.has(child))ids.add(child);}
    const parent=owner(g,id),ancestors=new Set();let at=parent;while(at){ancestors.add(at);at=owner(g,at);}
    return {id,ids,origins:new Map([...ids].map(id=>[id,{...g.positions.get(id)}])),parent:parent&&g.positions.get(parent),
      bounds:figure.prepared?.bounds||g.bounds,
      obstacles:g.nodes.filter(n=>!ids.has(n.id)&&!ancestors.has(n.id)).map(n=>g.positions.get(n.id)),
      edges:routes(figure).filter(e=>ids.has(e.source)||ids.has(e.target)),dx:0,dy:0};
  }
  function constrain(s,dx,dy){
    if(!s||!Number.isFinite(dx)||!Number.isFinite(dy))return {ok:false,reason:'invalid displacement'};
    const p=s.origins.get(s.id),b=s.parent||s.bounds,pad=s.parent?2:0,header=s.parent?(s.parent.header||0):0;
    const loX=b.x+pad-p.x,hiX=b.x+b.w-pad-p.x-p.w,loY=b.y+header+pad-p.y,hiY=b.y+b.h-pad-p.y-p.h;
    // A pre-existing tight frame must never cause a jump on pointerdown.
    dx=Math.max(Math.min(0,loX),Math.min(Math.max(0,hiX),dx));dy=Math.max(Math.min(0,loY),Math.min(Math.max(0,hiY),dy));
    for(const original of s.origins.values())for(const obstacle of s.obstacles){
      const moved={...original,x:original.x+dx,y:original.y+dy};
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
  function qualityOK(before,after){
    return after.issues.every(x=>before.issues.includes(x))&&after.route_failures.length<=before.route_failures.length&&
      after.unplaced_port_labels.length<=before.unplaced_port_labels.length&&
      after.line_geometry.unrelated_contacts.length<=before.line_geometry.unrelated_contacts.length&&
      after.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=before.line_geometry.overlapping_paths.filter(p=>!p.same_value).length;
  }
  function reroute(figure,positions,changed,ir){
    const old=routes(figure),candidate=copyFigure(figure),g=candidate.graph;g.positions=positions;
    const ctx=positions.context,selected=figure.prepared?.routing?.shared_fanout_refinement?.selected||[];
    const broken=new Set(selected.filter(r=>r.edges.some(id=>changed.has(id))).flatMap(r=>r.edges));
    let fresh=old.map(e=>({...e,route:changed.get(e.id)||e.route}));
    const affected=new Set(fresh.filter(e=>broken.has(e.id)||changed.has(e.id)&&!physical(e,positions)||!physical(e,positions)).map(e=>e.id));
    const segments=es=>es.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
    ctx.routeCache=new Map();ctx.reserved=segments(fresh.filter(e=>!affected.has(e.id)));
    fresh=fresh.map(e=>{if(!affected.has(e.id))return e;const route=E.route(e,positions);ctx.routeCache.set(e.id,route);ctx.reserved.push(...segments([{route}]));return {...e,route};});
    if(!fresh.every(e=>physical(e,positions)))throw Error('此位置无法保留避障连线');
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
    return {figure:reroute(figure,positions,changed,ir),moved:true,dx:c.dx,dy:c.dy};
  }
  function identity(g){return JSON.stringify([g.nodes.map(n=>[n.id,n.parent]).sort(),g.edges.map(e=>[e.id,e.source,e.target,e.source_port,e.target_port,e.originals]).sort()]);}
  function markers(figure){
    const groups=new Map();for(const e of figure.prepared.routes){if(e.bundle_members||e.condition||e.iteration||e.layout_after||e.design_route||e.context_lane||!['data','alias','interface-binding'].includes(e.kind))continue;const key=JSON.stringify([e.resolved_source||e.canonical_source||e.source,e.source_port]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
    const selected=[...groups.values()].filter(es=>es.length>1).map(es=>({resolved_source:es[0].resolved_source||es[0].canonical_source||es[0].source,source_port:es[0].source_port,edges:es.map(e=>e.id),junctions:L.fanoutJunctions(es).filter(p=>figure.prepared.routes.every(e=>es.includes(e)||!e.route.points.some((b,i,ps)=>i&&L.blocked(ps[i-1],b,[{x:p.x-4,y:p.y-4,w:8,h:8}]))))})).filter(r=>r.junctions.length);
    figure.prepared.routing={...figure.prepared.routing,shared_fanout_refinement:{selected}};
  }
  function placement(figure){return {schema:'semantic-canvas-placement/1',identity:identity(figure.graph),
    positions:[...figure.graph.positions].map(([id,p])=>[id,p.x,p.y,p.w,p.h]),routes:routes(figure).map(e=>[e.id,e.route]),
    policy:Object.fromEntries(['portOrder','ancestorPorts','stubLength'].map(k=>[k,figure.graph.positions.context[k]])),
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
    for(const n of g.nodes){
      const p=g.positions.get(n.id),before=figure.graph.positions.get(n.id),parent=owner(g,n.id),frame=parent&&g.positions.get(parent),oldFrame=parent&&figure.graph.positions.get(parent);
      const inside=(a,b)=>a.x>=b.x&&a.y>=b.y+(b.header||0)&&a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h;
      if(frame&&inside(before,oldFrame)&&!inside(p,frame))return null;
      if(!frame&&!inside(p,figure.prepared?.bounds||g.bounds))return null;
      for(const other of g.nodes){if(other.id===n.id||owner(g,other.id)!==parent)continue;
        if(overlap(p,g.positions.get(other.id))&&!overlap(before,figure.graph.positions.get(other.id)))return null;
      }
    }
    const by=new Map(saved.routes);if(by.size!==g.edges.length)return null;
    const fresh=g.edges.map(e=>({...e,route:by.get(e.id)}));if(fresh.some(e=>!e.route)||!fresh.every(e=>physical(e,g.positions)))return null;
    const ctx=g.positions.context;Object.assign(ctx,saved.policy||{});ctx.routeCache=new Map();ctx.reserved=[];
    for(const e of fresh){
      // Physical paths were checked above. Terminal verification needs the
      // actual port allocation, not another visibility search per saved edge.
      const expected=L.route(e,g.positions,{terminalsOnly:true}),ps=e.route.points,es=expected.points;
      if(!es.length||ps[0].x!==es[0].x||ps[0].y!==es[0].y||ps.at(-1).x!==es.at(-1).x||ps.at(-1).y!==es.at(-1).y)return null;
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
  }
  const api={session,constrain,previewRoute,path,move,placement,restore,physical,qualityOK,placementLayout};
  root.SemanticCanvasInteraction=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

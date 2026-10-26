/* Geometry transactions for exact-value fan-outs and unordered sibling rows. */
(function(root){
 'use strict';
 const R=root.EdgeRouterLabRouting,EPS=1e-5;
 const key=e=>JSON.stringify([e.source,e.contract?.wire,e.projection?.presentationSlots?.source||e.binding?.source_port]);
 function eligible(e,by){const b=e.binding||{},n=by.get(e.source)?.semantic||{};
  return e.style==='orthogonal'&&typeof e.contract?.wire==='string'&&!e.draft&&!e.failed&&!e.pendingRouting&&!e.contract?.bus&&!e.waypoints?.length&&!b.bundle_members&&
   ['data','alias','interface-binding'].includes(b.kind)&&!b.iteration&&!b.condition&&!b.conditions&&!b.guard&&!b.branch&&
   !['opaque','state','buffer'].includes(n.kind)&&!n.mutable&&!n.condition&&!n.guard&&b.evidence_status!=='conflict'&&
   !['opaque','conflict','unresolved'].includes(b.evidence)&&e.portPolicy?.source.mode==='free'&&e.portPolicy?.target.mode==='free';
 }
 function groups(graph){const by=new Map(graph.nodes.map(n=>[n.id,n])),rows=new Map();
  for(const e of graph.edges)if(eligible(e,by)){const k=key(e);if(!rows.has(k))rows.set(k,[]);rows.get(k).push(e);}
  return [...rows.values()].filter(es=>es.length>1&&es.length<=12);
 }
 // Count the painted union per exact value, rather than counting a common
 // segment once for every consumer. Distinct values always count separately.
 function ink(edges){const bands=new Map();let total=0;
  for(const e of edges)for(let i=1;i<e.route.length;i++){const a=e.route[i-1],b=e.route[i],vertical=Math.abs(a.x-b.x)<EPS,k=JSON.stringify([key(e),vertical,vertical?a.x:a.y]),v=vertical?'y':'x';
   if(!bands.has(k))bands.set(k,[]);bands.get(k).push([Math.min(a[v],b[v]),Math.max(a[v],b[v])]);}
  for(const spans of bands.values()){spans.sort((a,b)=>a[0]-b[0]);let end=-Infinity;for(const [a,b]of spans){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}}
  return total;
 }
 function prefix(a,b){if(!a.length||!b.length||R.dist(a[0],b[0])>EPS)return [];
  let i=1,j=1,p={...a[0]},out=[p];
  while(i<a.length&&j<b.length){const x=a[i],y=b[j],dx=[Math.sign(x.x-p.x),Math.sign(x.y-p.y)],dy=[Math.sign(y.x-p.x),Math.sign(y.y-p.y)];
   if(dx[0]!==dy[0]||dx[1]!==dy[1])break;
   const step=Math.min(R.dist(p,x),R.dist(p,y));if(step<EPS)break;
   p={x:p.x+dx[0]*step,y:p.y+dx[1]*step};out.push(p);if(R.dist(p,x)<EPS)i++;if(R.dist(p,y)<EPS)j++;
  }return R.simplify(out);
 }
 // Dots are derived from actual common prefixes, never persisted as new IR
 // vertices or used as a reason to reject otherwise legal manual movement.
 function markers(graph){if(!graph.generic||graph.edges.length>300)return [];
  const J=root.SummaryJunctionMarkers,result=new Map();
  for(const es of groups(graph))for(let i=0;i<es.length;i++)for(const b of es.slice(i+1)){const a=es[i],shared=prefix(a.route,b.route),p=shared.at(-1);
   if(shared.length<2||R.dist(shared[0],p)<9||J.rays([a.route,b.route],p).size<3)continue;
   const id='value-fork:'+key(a)+':'+p.x+':'+p.y,prior=result.get(id),edges=[...new Set([...(prior?.edges||[]),a.id,b.id])];
   result.set(id,{id,point:p,owner:a.source,edges,wire:a.contract.wire,radius:2.7,fill:a.stroke||'#263b4b'});
  }return [...result.values()];
 }
 function fanouts(graph,options={},budgetMs=600){
  if(graph.nodes.length>300||graph.edges.length>300||options.policy==='never'||options.style&&options.style!=='orthogonal')return;
  const C=root.SummaryConstraints,P=root.SummaryPhysicalPorts,N=root.SummaryEngine,started=performance.now(),context=C.validationContext(graph),by=new Map(graph.nodes.map(n=>[n.id,n])),before=R.stats(graph.edges),inkBefore=ink(graph.edges);let accepted=0,attempted=0;
  for(const es of groups(graph)){
   if(options.flowEdges&&!es.some(e=>options.flowEdges.has(e.id)))continue;
   // Try a whole fan-out as a transaction first. Changing one branch alone
   // can temporarily duplicate the old trunk and hide a better shared tree.
   const snapshot=es.map(e=>({route:e.route,physicalSource:e.physicalSource,physicalTarget:e.physicalTarget}));
   const baseStats=R.stats(graph.edges),baseInk=ink(graph.edges);let bestTree=null,bestTreeCost=baseInk+40*baseStats.bends+450*baseStats.crossings;
   for(const anchor of es){
    if(options.flowEdges&&es.some(e=>!options.flowEdges.has(e.id)))break;
    if(performance.now()-started>=budgetMs)break;
    const source=P.active(anchor,'source');
    for(let i=1;i<anchor.route.length;i++){
     if(performance.now()-started>=budgetMs)break;
     const a=anchor.route[i-1],b=anchor.route[i],vertical=Math.abs(a.x-b.x)<EPS,axis=vertical?'y':'x';
     const splits=[b,...es.flatMap(e=>P.candidates(graph,e,'target',options.sides).map(port=>{const t=P.point(by.get(e.target),port);return vertical?{x:a.x,y:t.y+R.SIDE[port.side][1]*24}:{x:t.x+R.SIDE[port.side][0]*24,y:a.y};}))];
     for(const q of splits){
      if(performance.now()-started>=budgetMs)break;
      if(q[axis]<Math.min(a[axis],b[axis])-EPS||q[axis]>Math.max(a[axis],b[axis])+EPS)continue;
      const trunk=R.simplify([...anchor.route.slice(0,i),q]);if(R.dist(trunk[0],q)<9)continue;
      const rows=[];let valid=true;
      for(const e of es){
       if(e===anchor){rows.push({route:e.route,physicalSource:source,physicalTarget:P.active(e,'target')});continue;}
       if(!P.permitted(graph,e,'source',source)){valid=false;break;}
       let choice=null,cost=Infinity;
       for(const target of P.candidates(graph,e,'target',options.sides)){
        const t=P.point(by.get(e.target),target);
        for(const turn of [{x:q.x,y:t.y},{x:t.x,y:q.y}]){
         const route=R.simplify([...trunk,turn,t]),stats=R.stats([{route}]);if(stats.length+40*stats.bends>=cost)continue;
         const candidate={...e,route,physicalSource:source,physicalTarget:target};attempted++;
         if(!C.validate(graph,candidate,route,context).ok||N.overlapsWire(graph,candidate,route))continue;
         choice={route,physicalSource:source,physicalTarget:target};cost=stats.length+40*stats.bends;
        }
       }if(!choice){valid=false;break;}rows.push(choice);
      }
      if(!valid)continue;
      es.forEach((e,j)=>Object.assign(e,rows[j]));
      const stats=R.stats(graph.edges),painted=ink(graph.edges),cost=painted+40*stats.bends+450*stats.crossings;
      if(painted<baseInk-EPS&&stats.length<=baseStats.length*1.04&&stats.bends<=baseStats.bends+1&&stats.crossings<=baseStats.crossings&&cost<bestTreeCost-EPS){bestTree=rows;bestTreeCost=cost;}
      es.forEach((e,j)=>Object.assign(e,snapshot[j]));
     }
    }
   }
   if(bestTree){es.forEach((e,j)=>Object.assign(e,bestTree[j]));accepted++;}
   for(const e of es){
    if(options.flowEdges&&!options.flowEdges.has(e.id))continue;
    if(performance.now()-started>=budgetMs)break;
    const saved={route:e.route,physicalSource:e.physicalSource,physicalTarget:e.physicalTarget},base=R.stats(graph.edges),baseInk=ink(graph.edges);let best=null,bestScore=baseInk+40*base.bends+450*base.crossings;
    const target=by.get(e.target),ports=P.candidates(graph,e,'target',options.sides),oldLength=R.stats([{route:saved.route}]).length;
    for(const anchor of es.filter(a=>a!==e)){
     const source=P.active(anchor,'source');if(!P.permitted(graph,e,'source',source))continue;
     for(const tPort of ports){const t=P.point(target,tPort),normal=R.SIDE[tPort.side],stub=24;
      for(let i=1;i<anchor.route.length;i++){
       if(performance.now()-started>=budgetMs)break;
       const a=anchor.route[i-1],b=anchor.route[i],vertical=Math.abs(a.x-b.x)<EPS,axis=vertical?'y':'x';
       const projected=vertical?{x:a.x,y:t.y+normal[1]*stub}:{x:t.x+normal[0]*stub,y:a.y};
       const points=[b,projected].filter(p=>p[axis]>=Math.min(a[axis],b[axis])-EPS&&p[axis]<=Math.max(a[axis],b[axis])+EPS);
       for(const q of points)for(const bend of [{x:q.x,y:t.y},{x:t.x,y:q.y}]){
        const route=R.simplify([...anchor.route.slice(0,i),q,bend,t]);if(prefix(route,anchor.route).length<2)continue;
        e.route=route;e.physicalSource=source;e.physicalTarget=tPort;
        const candidateInk=ink(graph.edges),local=R.stats([e]);
        if(candidateInk>=baseInk-EPS||local.length>oldLength+base.length*.04||local.bends>saved.route.length)continue;
        attempted++;
        if(!C.validate(graph,e,route,context).ok||N.overlapsWire(graph,e,route))continue;
        const stats=R.stats(graph.edges),cost=candidateInk+40*stats.bends+450*stats.crossings;
        if(stats.crossings>base.crossings||stats.length>base.length*1.04||stats.bends>base.bends+1||cost>=bestScore-EPS)continue;
        best={route,physicalSource:source,physicalTarget:tPort};bestScore=cost;
       }
      }
     }
    }
    Object.assign(e,best||saved);if(best)accepted++;
   }
   if(performance.now()-started>=budgetMs)break;
  }
  graph.nativeFanoutRefinement={accepted,attempted,before,after:R.stats(graph.edges),inkBefore,inkAfter:ink(graph.edges),forks:markers(graph).length,ms:performance.now()-started};
 }
 function rowCandidates(graph){const by=new Map(graph.nodes.map(n=>[n.id,n])),children=new Map(),out=[];
  for(const n of graph.nodes){if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n);}
  const safe=n=>{const s=n.semantic||{};return !['opaque','control','state','buffer','parameter','interface'].includes(s.kind)&&!s.mutable&&!s.identity_display&&!s.observed_calls&&!s.invocation_binding&&!s.condition&&!s.conditions&&!s.guard&&
   !['serial-repeat','repeat-instance','serial-remainder','loop-template','iteration-region','conditional-collection','branch-region'].includes(s.semantic_type)&&(children.get(n.id)||[]).every(safe);};
  for(const [parent,kids]of children){if(!parent||!by.get(parent)?.expanded)continue;
   const ids=new Set(kids.map(n=>n.id)),owner=id=>{while(id&&!ids.has(id))id=by.get(id)?.parent;return id;},adj=new Map(kids.map(n=>[n.id,new Set()]));let guarded=false;
   for(const e of graph.edges){const a=owner(e.source),b=owner(e.target),members=e.binding?.bundle_members||[e.binding||{}];
    if((a||b)&&members.some(m=>m.iteration||['state-write','effect'].includes(m.kind))){guarded=true;break;}
    if(a&&b&&a!==b)adj.get(a).add(b);
   }if(guarded)continue;
   const reaches=(a,b,seen=new Set())=>{if(a===b)return true;if(seen.has(a))return false;seen.add(a);return [...adj.get(a)].some(c=>reaches(c,b,seen));};
   const rows=new Map();for(const n of kids.filter(safe)){const k=Math.round(n.y);if(!rows.has(k))rows.set(k,[]);rows.get(k).push(n);}
   for(const row of rows.values()){
    if(row.length<2||row.length>4||row.some(a=>row.some(b=>a!==b&&(reaches(a.id,b.id)||reaches(b.id,a.id)))))continue;
    row.sort((a,b)=>a.x-b.x);if(row.some((n,i)=>i&&n.x<row[i-1].x+row[i-1].w+12))continue;
    const edgeRows=graph.edges.map(e=>({e,a:owner(e.source),b:owner(e.target)})).filter(({e})=>['data','alias','interface-binding'].includes(e.binding?.kind));
    const gaps=row.slice(1).map((n,i)=>n.x-row[i].x-row[i].w),perms=xs=>xs.length<2?[xs]:xs.flatMap(n=>perms(xs.filter(v=>v!==n)).map(p=>[n,...p]));
    const proposal=order=>{let x=row[0].x;const positions=new Map();for(const [i,n]of order.entries()){positions.set(n.id,x);x+=n.w+(gaps[i]||0);}return positions;};
    const cost=positions=>{let sum=0;const center=id=>positions.has(id)?positions.get(id)+by.get(id).w/2:by.get(id).x+by.get(id).w/2;
     for(const {e,a,b}of edgeRows){if(positions.has(b)&&!positions.has(a))sum+=2*Math.abs(center(b)-(a?center(a):by.get(e.source).x+by.get(e.source).w/2));if(positions.has(a)&&!positions.has(b))sum+=Math.abs(center(a)-(b?center(b):by.get(e.target).x+by.get(e.target).w/2));}
     const common=new Map();for(const {e,b}of edgeRows)if(positions.has(b)&&!positions.has(owner(e.source))){const k=key(e);if(!common.has(k))common.set(k,new Set());common.get(k).add(b);}
     // Keep consumers of one exact input contiguous when their other costs
     // tie. This is independent of role names and of source declaration order.
     for(const ids of common.values())if(ids.size>1){const xs=[...ids].map(center),lo=Math.min(...xs),hi=Math.max(...xs);for(const n of row)if(!ids.has(n.id)&&center(n.id)>lo&&center(n.id)<hi)sum+=2*(n.w+32);}
     return sum;};
    const baseline=cost(proposal(row)),trials=perms(row).map(order=>({parent,order:order.map(n=>n.id),positions:proposal(order)})).map(p=>({...p,cost:cost(p.positions)})).filter(p=>p.cost<baseline-EPS).sort((a,b)=>a.cost-b.cost).slice(0,2);
    out.push(...trials.map(p=>({...p,from:row.map(n=>n.id),gain:baseline-p.cost})));
   }
  }return out.sort((a,b)=>b.gain-a.gain);
 }
 function reorder(graph,options={},budgetMs=2200){
  if(graph.nodes.length>300||graph.edges.length>300||options.policy==='never'||options.style&&options.style!=='orthogonal')return;
  const G=root.SummaryNativeSemantic,C=root.SummaryConstraints,N=root.SummaryEngine,started=performance.now(),before=R.stats(graph.edges),records=[],trials=[],done=new Set();let attempted=0;
  for(const proposal of rowCandidates(graph)){
   if(performance.now()-started>=budgetMs)break;
   if(done.has(proposal.parent+':'+proposal.from.join('|')))continue;
   const candidate=G.cloneGeometry(graph),oldX=new Map(graph.nodes.map(n=>[n.id,n.x])),by=new Map(candidate.nodes.map(n=>[n.id,n])),moved=new Set(),shift=(id,dx)=>{const n=by.get(id);n.x+=dx;moved.add(id);for(const c of candidate.nodes)if(c.parent===id)shift(c.id,dx);};
   for(const [id,x]of proposal.positions)if(Math.abs(by.get(id).x-x)>EPS)shift(id,x-by.get(id).x);
   const context=C.validationContext(candidate),affected=new Set();
   for(const e of candidate.edges){
    const dx=by.get(e.source).x-oldX.get(e.source),tx=by.get(e.target).x-oldX.get(e.target);
    if(dx||tx){
     const ps=e.route.map(p=>({...p}));
     if(Math.abs(dx-tx)<EPS)for(const p of ps)p.x+=dx;
     else {
      // Transfer the terminal ray with its module. A vertical ray needs its
      // elbow translated too; a horizontal ray only needs its endpoint.
      // Shared evidence and already legal intermediate channels stay intact.
      if(ps.length>2){if(Math.abs(ps[0].x-ps[1].x)<EPS)ps[1].x+=dx;if(Math.abs(ps.at(-1).x-ps.at(-2).x)<EPS)ps.at(-2).x+=tx;}
      ps[0].x+=dx;ps.at(-1).x+=tx;
     }
     e.route=R.simplify(ps);
    }
   }
   for(const e of candidate.edges)if(moved.has(e.source)&&!moved.has(e.target)||!C.validate(candidate,e,e.route,context).ok||N.overlapsWire(candidate,e,e.route)){affected.add(e.id);e.pendingRouting=true;}
   attempted++;
   candidate.nativeRouting={pending:affected.size,failed:0,complete:false};
   G.route(candidate,{...options,refinePlacement:false,refineCrossings:false,refineChannels:false,refineFlow:false,preferCurrentPorts:false,budgetMs:Math.min(1200,Math.max(0,budgetMs-(performance.now()-started)))});
   if(candidate.edges.some(e=>e.failed||e.pendingRouting)){trials.push({from:proposal.from,to:proposal.order,pending:candidate.edges.filter(e=>e.pendingRouting).length,failed:candidate.edges.filter(e=>e.failed&&!e.pendingRouting).length});continue;}
   fanouts(candidate,options,Math.min(160,Math.max(0,budgetMs-(performance.now()-started))));
   const old=R.stats(graph.edges),after=R.stats(candidate.edges),oldInk=ink(graph.edges),afterInk=ink(candidate.edges),check=N.validateView(candidate);
   trials.push({from:proposal.from,to:proposal.order,before:old,after,inkBefore:oldInk,inkAfter:afterInk,valid:check.source.ok&&check.layout.ok&&check.edges.every(([,v])=>v.ok)});
   if(check.source.ok&&check.layout.ok&&check.edges.every(([,v])=>v.ok)&&after.crossings<=old.crossings&&after.bends<=old.bends&&after.length<=old.length+EPS&&afterInk<=oldInk+EPS&&(after.crossings<old.crossings||after.bends<old.bends||afterInk<oldInk-EPS)){
    Object.assign(graph,{nodes:candidate.nodes,edges:candidate.edges});done.add(proposal.parent+':'+proposal.from.join('|'));records.push({parent:proposal.parent,from:proposal.from,to:proposal.order,affected:affected.size,before:old,after});
   }
  }
  graph.nativeSiblingRefinement={attempted,accepted:records.length,records,trials,before,after:R.stats(graph.edges),ms:performance.now()-started};
 }
 const api={groups,ink,prefix,markers,fanouts,rowCandidates,reorder};root.SummaryFlowOptimizer=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

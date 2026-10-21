/* Compound-graph layout and obstacle-aware orthogonal routing. Node labels and
 * model family names never determine topology or create connections. */
(function(root){
  'use strict';
  function components(ids,adj){
    let sequence=0;const stack=[],active=new Set(),number=new Map(),low=new Map(),result=[];
    function visit(id){number.set(id,sequence);low.set(id,sequence++);stack.push(id);active.add(id);
      for(const to of adj.get(id)||[])if(!number.has(to)){visit(to);low.set(id,Math.min(low.get(id),low.get(to)));}else if(active.has(to))low.set(id,Math.min(low.get(id),number.get(to)));
      if(low.get(id)===number.get(id)){const group=[];let item;do{item=stack.pop();active.delete(item);group.push(item);}while(item!==id);result.push(group);}
    }
    for(const id of ids)if(!number.has(id))visit(id);return result;
  }
  // A side entry is only a drawing preference: external values remain data,
  // with distinct uses, operand slots and conditions. No role is inferred.
  function contextEntries(idx,visible,edges,side='left'){
    const ancestors=id=>{const result=[];while(id!=null){result.push(id);id=idx.nodes.get(id)?.parent;}return result;};
    const ordinary=edge=>(edge.bundle_members||[edge]).every(m=>['data','alias','interface-binding'].includes(m.kind)&&!m.condition);
    const counts=new Map(),result=[];
    for(const e of edges){
      const owner=idx.nodes.get(e.target)?.parent,inside=id=>ancestors(id).includes(owner);
      if(!owner||!visible.has(owner)||inside(e.source)||ancestors(e.target).includes(e.source)||e.design_route||!ordinary(e))continue;
      const internal=edges.filter(other=>other.target===e.target&&other.source!==e.source&&inside(other.source)&&other.source!==owner&&ordinary(other)&&!other.design_route);
      if(!internal.length)continue;
      const index=counts.get(owner)||0;counts.set(owner,index+1);
      result.push({edge:e.id,owner,index,side:side==='left'?'left':'right',internal_inputs:internal.map(other=>other.id),
        scope:'visible dependency geometry; no auxiliary-input or execution assertion'});
    }
    return result;
  }
  // Follow an expanded region's actual exit with its existing downstream
  // nodes. Horizontal drawing alignment only; ranks, ownership and all
  // dependencies remain unchanged. Multiple source regions keep DAG layout.
  function regionFollowers(idx,nodes,edges,original){
    const positions=new Map([...original].map(([id,p])=>[id,{...p}])),records=[],moved=new Set();
    positions.context={...original.context,routeCache:new Map(),reserved:[]};
    const owner=(id,parent)=>{while(id&&idx.nodes.get(id)?.parent!==parent)id=idx.nodes.get(id)?.parent;return id;};
    const ordinary=e=>!e.design_route&&!e.layout_after&&(e.bundle_members||[e]).every(m=>['data','alias','interface-binding'].includes(m.kind)&&!m.condition);
    const overlap=(a,b)=>a.x<b.x+b.w+8&&a.x+a.w+8>b.x&&a.y<b.y+b.h+8&&a.y+a.h+8>b.y;
    for(const n of nodes.slice().sort((a,b)=>positions.get(a.id).y-positions.get(b.id).y)){
      const p=positions.get(n.id),parent=positions.get(n.parent);
      if(p.expanded||p.cyclic||!parent?.expanded||!['compute','composite','interface','opaque'].includes(n.kind)||
        n.condition||n.mutable||n.identity_display||n.observed_calls)continue;
      const incoming=edges.filter(e=>e.target===n.id),incident=edges.filter(e=>e.source===n.id||e.target===n.id);
      if(!incoming.length||incident.some(e=>!ordinary(e)))continue;
      const regions=[...new Set(incoming.map(e=>owner(e.source,n.parent)))];
      if(regions.length!==1||!regions[0]||regions[0]===n.id)continue;
      const source=positions.get(regions[0]);
      if(!source||source.cyclic||(!source.expanded&&!moved.has(regions[0]))||p.y<source.y+source.h)continue;
      const center=incoming.reduce((sum,e)=>{const at=positions.get(e.source);return sum+at.x+at.w/2;},0)/incoming.length;
      const lanes=positions.context.contextLanes.filter(c=>c.owner===n.parent&&c.selected!==false);
      const left=parent.x+16+(parent.design_gutter||0)+(lanes.some(c=>c.side==='left')?(parent.context_gutter||0):0);
      const right=parent.x+parent.w-16-(lanes.some(c=>c.side==='right')?(parent.context_gutter||0):0)-p.w;
      if(right<left)continue;
      const x=Math.max(left,Math.min(right,center-p.w/2));
      if(Math.abs(x-p.x)<1||nodes.some(k=>k.parent===n.parent&&k.id!==n.id&&overlap({...p,x},positions.get(k.id))))continue;
      records.push({node:n.id,parent:n.parent,source_region:regions[0],before:{x:p.x,y:p.y},after:{x,y:p.y},
        inputs:incoming.map(e=>({edge:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port})),
        scope:'Existing region exit and downstream terminals; horizontal drawing alignment only, no sequencing or equivalence assertion.'});
      p.x=x;moved.add(n.id);
    }
    return {positions,records};
  }
  // Only an existing, unguarded side entry may face its receiving region.
  // Ancestor boundaries and semantic state/bypass terminals keep their policy.
  function contextSourceSide(edge,positions){
    const ctx=positions.context,from=positions.get(edge.source),owner=positions.get(edge.context_lane?.owner);
    if(!ctx?.contextSourceFacing||!owner?.context_gutter||!from||edge.design_route||
      !(edge.bundle_members||[edge]).every(m=>['data','alias','interface-binding'].includes(m.kind)&&!m.condition))return null;
    const ancestors=id=>{const seen=new Set();while(id!=null){seen.add(id);id=ctx.idx.nodes.get(id)?.parent;}return seen;};
    if(ancestors(edge.target).has(edge.source)||ancestors(edge.source).has(edge.target))return null;
    if(from.x+from.w<=owner.x)return 'right';
    if(from.x>=owner.x+owner.w)return 'left';
    return null;
  }
  // Parallel labelled wires need clearance where their visible branches meet,
  // not in every helper in the figure. Use the drawing hierarchy after frame
  // ownership; source nesting may no longer be the visible containment tree.
  function labelClearances(idx,edges){
    const pairs=new Map(),regions=new Map();
    for(const e of edges){const key=JSON.stringify([e.source,e.target]);if(!pairs.has(key))pairs.set(key,[]);pairs.get(key).push(e);}
    const parents=id=>{const result=[];let at=idx.nodes.get(id)?.parent??null;while(at!==null){result.push(at);at=idx.nodes.get(at)?.parent??null;}result.push(null);return result;};
    for(const group of pairs.values()){
      if(group.length<2||!group.some(e=>e.condition||e.bundle_members))continue;
      const edge=group[0],a=parents(edge.source),b=new Set(parents(edge.target)),parent=a.find(id=>b.has(id));
      if(!regions.has(parent))regions.set(parent,{parent,gap_y:0,pairs:[]});
      const record=regions.get(parent),gap=32+28*group.length;
      record.gap_y=Math.max(record.gap_y,gap);record.pairs.push({source:edge.source,target:edge.target,edges:group.map(e=>e.id),gap_y:gap});
    }
    return [...regions.values()];
  }
  function layout(idx,roots,visible,edges,offsets={},options={}){
    const positions=new Map(),feedback=new Set(),compoundAlignments=[],branchColumns=[],rankClearances=[],inputDocks=[],fixedInputs=[];
    const laneOwners=new Map(),contextOwners=new Map(),contextLanes=[];
    const ancestry=id=>{const result=[];while(id!=null){result.push(id);id=idx.nodes.get(id)?.parent;}return result;};
    const laneKinds=['bypass','state-interface','iteration-feedback'];
    if(options.semanticLanes)for(const e of edges)if(laneKinds.includes(e.design_route?.kind)){
      const targetAnc=new Set(ancestry(e.target)),owner=ancestry(e.source).slice(1).find(id=>targetAnc.has(id));
      if(owner){e.design_route.owner=owner;laneOwners.set(owner,(laneOwners.get(owner)||0)+1);}
    }
    if(options.contextLanes)for(const entry of contextEntries(idx,visible,edges,options.contextLanes)){
      if(Array.isArray(options.contextEdges)&&!options.contextEdges.includes(entry.edge)){contextLanes.push({...entry,selected:false});continue;}
      entry.index=contextOwners.get(entry.owner)||0;
      const e=edges.find(e=>e.id===entry.edge);e.context_lane={...entry};delete e.context_lane.edge;
      contextOwners.set(entry.owner,(contextOwners.get(entry.owner)||0)+1);contextLanes.push(entry);
    }
    const gapX=options.gapX??40,gapY=options.gapY??76;
    function size(n){
      if(options.nodeSize)return options.nodeSize(n);
      if(n.kind==='compute'&&(['add','mult','mul'].includes(n.operator)||/^aten\.(add|mul)\./.test(n.operator||'')))return {w:64,h:64,symbol:n.operator==='add'||n.operator.startsWith('aten.add.')?'+':'×'};
      if(n.kind==='interface')return {w:130,h:42};
      if(n.kind==='value-alias')return {w:156,h:52};
      if(['parameter','buffer','state'].includes(n.kind))return {w:176,h:58};
      return {w:n.kind==='composite'?244:220,h:74};
    }
    function arrange(kids,parent){
      const gapY=Math.max(options.gapY??76,options.gapYForParent?.(parent)??0);
      const rankColumns=options.rankColumnsFor?.(idx.nodes.get(parent))??options.rankColumns;
      const kidSet=new Set(kids),owner=id=>{while(id!=null&&!kidSet.has(id)){if(id===parent)return null;id=idx.nodes.get(id)?.parent;}return id;};
      const adj=new Map(kids.map(id=>[id,new Set()])),pred=new Map(kids.map(id=>[id,new Set()]));
      for(const e of edges){const a=owner(e.source),b=owner(e.target);if(a&&b&&a!==b){
        // Only explicitly proved normal-completion backedges may be separated
        // from forward ranking. Other SCCs retain their ordinary cycle layout.
        if(e.design_route?.kind==='iteration-feedback'){feedback.add(e.id);continue;}
        adj.get(a).add(b);pred.get(b).add(a);}}
      // A relation may request a reading order without inventing a data edge.
      // For example, a loop result follows the source body template although
      // zero iterations can bypass that body. Existing dependencies win.
      for(const e of edges)if(e.layout_after){
        const a=owner(e.layout_after),b=owner(e.target);
        if(!a||!b||a===b)continue;
        const todo=[b],seen=new Set();for(let i=0;i<todo.length;i++){const at=todo[i];if(seen.has(at))continue;seen.add(at);todo.push(...adj.get(at)||[]);}
        if(!seen.has(a)){adj.get(a).add(b);pred.get(b).add(a);}
      }
      const scc=components(kids,adj),unit=new Map();scc.forEach((group,i)=>group.forEach(id=>unit.set(id,i)));
      // Relocate an existing external terminal beside its actual consumers.
      // No copied values, role inference, containment or ranking edges arise.
      // This is only a candidate; the publication renderer measures real routes.
      function finish(box,band=null){
        if(!options.inputDocks||!scc.every(g=>g.length===1))return box;
        const guarded=id=>{const n=idx.nodes.get(id);return !n||['opaque','control','state','buffer','parameter'].includes(n.kind)||n.condition||n.mutable||n.identity_display||n.observed_calls||n.evidence_status==='runtime-only'||
          ['conditional-region','conditional-collection','loop-template','iteration-region','observed-variant'].includes(n.semantic_type);};
        const regions=kids.filter(id=>positions.get(id).expanded&&!guarded(id));
        if(!regions.length)return box;
        const relative=id=>{let x=0,y=0;while(id!=null&&!kidSet.has(id)){const p=positions.get(id);if(!p||guarded(id))return null;x+=p.x;y+=p.y;id=idx.nodes.get(id)?.parent;}
          return regions.includes(id)?{region:id,x:x+positions.get(id).x,y:y+positions.get(id).y}:null;};
        const ordinary=e=>!e.design_route&&!e.layout_after&&(e.bundle_members||[e]).every(m=>['data','alias','interface-binding'].includes(m.kind)&&!m.condition&&!m.iteration);
        const inputs=kids.filter(id=>{const n=idx.nodes.get(id);return n.kind==='interface'&&n.role==='input'&&!guarded(id)&&!pred.get(id).size;});
        let remaining=inputs.length;
        const overlap=(a,b)=>a.x<b.x+b.w+gapX&&a.x+a.w+gapX>b.x&&a.y<b.y+b.h+gapY/2&&a.y+a.h+gapY/2>b.y;
        const median=xs=>{xs.sort((a,b)=>a-b);return xs[Math.floor(xs.length/2)];};
        // Keep two entry anchors where available; prioritize the terminals
        // with most distinct visible uses rather than source declaration order.
        const ordered=inputs.slice().sort((a,b)=>edges.filter(e=>e.source===b).length-edges.filter(e=>e.source===a).length);
        for(const id of ordered){
          if(remaining<=Math.min(2,inputs.length-1)||inputDocks.filter(r=>r.parent===parent).length>=4)break;
          const uses=edges.filter(e=>e.source===id),p=positions.get(id);
          if(uses.length<2||uses.some(e=>!ordinary(e))||edges.some(e=>e.target===id))continue;
          const targets=uses.map(e=>{const at=relative(e.target),t=positions.get(e.target);return at?{...at,x:at.x+t.w/2,y:at.y+t.h/2}:null;});
          if(targets.some(t=>!t))continue;
          const top=median(targets.map(t=>t.y))-p.h/2;
          if(top-p.y<3*gapY)continue;
          const cost=a=>targets.reduce((sum,t)=>sum+Math.abs(a.x+a.w/2-t.x)+Math.abs(a.y+a.h/2-t.y),0),before=cost(p);
          const bounds=targets.map(t=>positions.get(t.region)),left=Math.min(...bounds.map(p=>p.x)),right=Math.max(...bounds.map(p=>p.x+p.w));
          const trials=[{side:'left',x:left-gapX-p.w},{side:'right',x:right+gapX}].map(a=>({...a,y:top,w:p.w,h:p.h}));
          const candidate=trials.filter(a=>kids.every(other=>other===id||!overlap(a,positions.get(other)))).sort((a,b)=>cost(a)-cost(b))[0];
          if(!candidate||cost(candidate)>before*.85)continue;
          const record={parent,node:id,side:candidate.side,edges:uses.map(e=>({edge:e.id,target:e.target,source_port:e.source_port,target_port:e.target_port})),regions:[...new Set(targets.map(t=>t.region))],
            initial:{x:p.x,y:p.y},candidate:{x:candidate.x,y:candidate.y},estimated_before:before,estimated_after:cost(candidate),
            scope:'One existing source terminal, exact uses and source ownership retained; geometry only, no scheduling or input-role assertion.'};
          Object.assign(p,{x:candidate.x,y:candidate.y,arrangement:'input-dock'});inputDocks.push(record);remaining--;
          if(band){band.inputs=band.inputs.filter(other=>other!==id);(band.docked_inputs||=[]).push(id);}
        }
        const moved=inputDocks.filter(r=>r.parent===parent);if(!moved.length)return box;
        const shift=Math.max(0,-Math.min(...kids.map(id=>positions.get(id).x)));
        if(shift)for(const id of kids)positions.get(id).x+=shift;
        for(const record of moved)record.translation_x=shift;
        return {w:Math.max(...kids.map(id=>{const p=positions.get(id);return p.x+p.w;})),h:Math.max(...kids.map(id=>{const p=positions.get(id);return p.y+p.h;}))};
      }
      const ca=scc.map(()=>new Set()),degree=scc.map(()=>0),rank=scc.map(()=>0);
      for(const [a,targets]of adj)for(const b of targets){const x=unit.get(a),y=unit.get(b);if(x!==y&&!ca[x].has(y)){ca[x].add(y);degree[y]++;}}
      const queue=scc.map((_,i)=>i).filter(i=>!degree[i]);
      for(let i=0;i<queue.length;i++)for(const b of ca[queue[i]]){rank[b]=Math.max(rank[b],rank[queue[i]]+1);if(!--degree[b])queue.push(b);}
      // Move slack computations toward their first consumer in the condensed
      // DAG. Inputs, interfaces and SCCs keep their original ranks. Reverse
      // topological order preserves every inter-component dependency; this is
      // a drawing choice, not a claim about execution scheduling or fusion.
      if(options.rankStrategy==='consumer')for(const u of queue.slice().reverse()){
        if(scc[u].length!==1||!ca[u].size||scc[u].some(id=>!pred.get(id).size||idx.nodes.get(id)?.kind==='interface'))continue;
        rank[u]=Math.min(...[...ca[u]].map(v=>rank[v]-1));
      }
      // External inputs may enter next to their first consumer. This shortens
      // long context/state/control wires without copying a value or scheduling
      // a call. Edges, slots and SCC membership are unchanged.
      if(options.inputPlacement==='consumer')for(const u of queue){
        if(scc[u].length!==1||!ca[u].size)continue;
        const id=scc[u][0],n=idx.nodes.get(id);
        if(pred.get(id).size||n?.kind!=='interface'||n.role!=='input')continue;
        rank[u]=Math.min(...[...ca[u]].map(v=>rank[v]-1));
      }
      for(const e of edges){const a=owner(e.source),b=owner(e.target);if(a&&b&&a!==b&&unit.get(a)===unit.get(b))feedback.add(e.id);}
      // SCCs are explicitly kept as cycles; they cannot be topologically sorted
      // into a fictional feed-forward chain. Arrange their members side by side.
      const rows=new Map();for(const id of kids){const r=rank[unit.get(id)];if(!rows.has(r))rows.set(r,[]);rows.get(r).push(id);}
      if(options.alignForks)for(const row of rows.values()){
        const candidates=row.filter(id=>idx.nodes.get(id)?.kind==='compute'&&!positions.get(id).symbol);
        for(const id of candidates){const peers=candidates.filter(other=>[...pred.get(id)].some(p=>pred.get(other).has(p)));if(peers.length>1){const w=Math.max(...peers.map(id=>positions.get(id).w));for(const peer of peers)positions.get(peer).w=w;}}
      }
      const sorted=[...rows.keys()].sort((a,b)=>a-b),order=new Map();
      // Reserve label space at the receiving rank, not in every rank of its
      // frame. Same-rank/SCC pairs have no unique vertical channel and keep
      // the conservative parent-wide spacing.
      const requests=options.rankLabelClearances?.find(r=>r.parent===parent),rankGaps=new Map();
      let rankRecord=null;
      if(requests){
        const pairs=requests.pairs.map(pair=>{const a=owner(pair.source),b=owner(pair.target),from=a?rank[unit.get(a)]:null,to=b?rank[unit.get(b)]:null;
          const before=from!==null&&to!==null&&from!==to?sorted[sorted.indexOf(Math.max(from,to))-1]:null;
          return {...pair,source_child:a,target_child:b,source_rank:from,target_rank:to,after_rank:before};});
        const fallback=pairs.some(p=>p.after_rank===null);
        for(const r of sorted)rankGaps.set(r,fallback?gapY:options.rankBaseGapY??options.gapY??76);
        if(!fallback)for(const p of pairs)rankGaps.set(p.after_rank,Math.max(rankGaps.get(p.after_rank),p.gap_y));
        rankRecord={parent,mode:fallback?'parent':'rank',reason:fallback?'A same-rank or unranked pair has no unique vertical channel.':null,pairs,ranks:[],applied:true};
        rankClearances.push(rankRecord);
      }
      // Wrapped cells within a rank retain their existing clearance. Only
      // the gaps between distinct dependency ranks are candidates here.
      const rowGapY=gapY;
      const gapAfter=r=>rankGaps.get(r)??gapY;
      for(const row of rows.values())row.forEach((id,i)=>order.set(id,i));
      for(let pass=0;pass<6;pass++)for(const r of pass%2?sorted.slice().reverse():sorted){
        const row=rows.get(r),neighbors=pass%2?adj:pred;
        const score=id=>{const ns=[...neighbors.get(id)].filter(n=>rank[unit.get(n)]!==r);return ns.length?ns.reduce((s,n)=>s+order.get(n),0)/ns.length:order.get(id);};
        const scores=new Map(row.map(id=>[id,score(id)]));row.sort((a,b)=>scores.get(a)-scores.get(b)||order.get(a)-order.get(b));row.forEach((id,i)=>order.set(id,i));
      }
      // Put newly entering interfaces at the edge of the rank so their wires
      // can reach a context/state gutter without traversing another operation.
      if(options.inputPlacement==='consumer')for(const row of rows.values())row.sort((a,b)=>{
        const input=id=>idx.nodes.get(id)?.kind==='interface'&&idx.nodes.get(id)?.role==='input';
        return Number(input(b))-Number(input(a));
      });
      // Trace independent local chains into a common consumer. Columns are
      // dependency paths, not semantic names or execution-parallel branches.
      const branchGroups=[],claimed=new Set();
      if(options.branchColumns)for(const sink of kids){
        const safe=id=>{const n=idx.nodes.get(id);return scc[unit.get(id)].length===1&&!positions.get(id).expanded&&
          ['compute','composite'].includes(n.kind)&&!n.condition&&!n.mutable&&!n.identity_display&&!n.observed_calls&&
          !['conditional-region','conditional-collection','loop-template','iteration-region','serial-repeat','repeat-instance','serial-remainder'].includes(n.semantic_type);};
        if(!safe(sink))continue;
        const chains=[];
        for(const tip of pred.get(sink)){
          const path=[];let at=tip,next=sink;
          while(safe(at)&&adj.get(at).size===1&&adj.get(at).has(next)&&!claimed.has(at)){
            const uses=edges.filter(e=>owner(e.source)===at&&owner(e.target)===next);
            if(!uses.length||uses.some(e=>e.design_route||e.layout_after||(e.bundle_members||[e]).some(m=>!['data','alias','interface-binding'].includes(m.kind)||m.condition)))break;
            path.unshift(at);if(pred.get(at).size!==1)break;next=at;at=[...pred.get(at)][0];
          }
          if(path.length>=2)chains.push({nodes:path,edges:edges.filter(e=>path.includes(owner(e.source))&&(path.includes(owner(e.target))||owner(e.target)===sink)).map(e=>e.id),
            ports:edges.filter(e=>owner(e.source)===tip&&owner(e.target)===sink).map(e=>({edge:e.id,port:e.target_port}))});
        }
        if(chains.length<2||chains.length>6)continue;
        // Rank equality is a local placement prerequisite, not stage or
        // operator equivalence. Unequal chains retain ordinary DAG geometry.
        const levels=chains[0].nodes.map(id=>rank[unit.get(id)]);
        if(chains.some(c=>c.nodes.length!==levels.length||c.nodes.some((id,i)=>rank[unit.get(id)]!==levels[i])))continue;
        chains.sort((a,b)=>edges.findIndex(e=>e.id===a.ports[0].edge)-edges.findIndex(e=>e.id===b.ports[0].edge));
        const group={parent,sink,chains,widths:chains.map(c=>Math.max(...c.nodes.map(id=>positions.get(id).w))),ranks:levels,
          scope:'visible serial paths into distinct consumer operands; scheduling and stage equivalence not asserted'};
        branchGroups.push(group);for(const c of chains)for(const id of c.nodes)claimed.add(id);branchColumns.push(group);
      }
      const grids=sorted.map(r=>{const ids=rows.get(r),cols=Math.min(rankColumns||ids.length,ids.length),widths=Array(cols).fill(0),heights=Array(Math.ceil(ids.length/cols)).fill(0);
        ids.forEach((id,i)=>{const p=positions.get(id);widths[i%cols]=Math.max(widths[i%cols],p.w);heights[Math.floor(i/cols)]=Math.max(heights[Math.floor(i/cols)],p.h);});
        return {cols,widths,heights,w:widths.reduce((s,w)=>s+w,0)+(cols-1)*gapX,h:heights.reduce((s,h)=>s+h,0)+(heights.length-1)*rowGapY};});
      if(branchGroups.length)for(const [i,r]of sorted.entries()){
        const groups=branchGroups.filter(g=>g.ranks.includes(r));if(!groups.length)continue;
        const assigned=new Set(groups.flatMap(g=>g.chains.flatMap(c=>c.nodes.filter(id=>rank[unit.get(id)]===r))));
        const rest=rows.get(r).filter(id=>!assigned.has(id)),bands=[];
        if(rest.length){
          const cols=Math.min(rankColumns||rest.length,rest.length),widths=Array(cols).fill(0),heights=Array(Math.ceil(rest.length/cols)).fill(0);
          rest.forEach((id,j)=>{const p=positions.get(id);widths[j%cols]=Math.max(widths[j%cols],p.w);heights[Math.floor(j/cols)]=Math.max(heights[Math.floor(j/cols)],p.h);});
          bands.push({w:widths.reduce((a,b)=>a+b,0)+(cols-1)*gapX,h:heights.reduce((a,b)=>a+b,0)+(heights.length-1)*rowGapY,
            cells:rest.map((id,j)=>({id,x:widths.slice(0,j%cols).reduce((a,b)=>a+b+gapX,0)+(widths[j%cols]-positions.get(id).w)/2,y:heights.slice(0,Math.floor(j/cols)).reduce((a,b)=>a+b+rowGapY,0)}))});
        }
        for(const g of groups){const step=g.ranks.indexOf(r),ids=g.chains.map(c=>c.nodes[step]);
          bands.push({w:g.widths.reduce((a,b)=>a+b,0)+(ids.length-1)*gapX,h:Math.max(...ids.map(id=>positions.get(id).h)),
            cells:ids.map((id,j)=>({id,x:g.widths.slice(0,j).reduce((a,b)=>a+b+gapX,0)+(g.widths[j]-positions.get(id).w)/2,y:0}))});
        }
        const w=Math.max(...bands.map(b=>b.w)),cells=[];let y=0;
        for(const band of bands){cells.push(...band.cells.map(c=>({...c,x:c.x+(w-band.w)/2,y:c.y+y})));y+=band.h+rowGapY;}
        grids[i]={...grids[i],w,h:y-rowGapY,cells};
      }
      const rowWidths=grids.map(g=>g.w);
      const width=Math.max(0,...rowWidths),rowTops=new Map();let y=0;
      sorted.forEach((r,i)=>{const row=rows.get(r),grid=grids[i],left=(width-rowWidths[i])/2;
        rowTops.set(r,y);
        if(rankRecord)rankRecord.ranks.push({rank:r,nodes:row.slice(),top:y,height:grid.h,gap_after:i<sorted.length-1?gapAfter(r):0});
        if(grid.cells){for(const c of grid.cells){const p=positions.get(c.id);p.x=left+c.x;p.y=y+c.y;p.cyclic=scc[unit.get(c.id)].length>1;}}else row.forEach((id,j)=>{const p=positions.get(id),col=j%grid.cols,gr=Math.floor(j/grid.cols);p.x=left+grid.widths.slice(0,col).reduce((s,w)=>s+w+gapX,0)+(grid.widths[col]-p.w)/2;p.y=y+grid.heights.slice(0,gr).reduce((s,h)=>s+h+rowGapY,0);p.cyclic=scc[unit.get(id)].length>1;});
        y+=grid.h+(i<sorted.length-1?gapAfter(r):0);
      });
      const vertical={w:width,h:Math.max(0,y)};
      // An edge into a late internal stage does not require the whole target
      // frame to start below its producer's frame. Use actual visible ports
      // to align independently entered compound flows in adjacent columns.
      // Source ownership, endpoints and the full compound hierarchy survive.
      if(options.compoundPorts&&scc.every(group=>group.length===1)&&kids.filter(id=>positions.get(id).expanded).length>1){
        const relative=(id,ancestor)=>{let y=0,at=id;while(at&&at!==ancestor){y+=positions.get(at)?.y||0;at=idx.nodes.get(at)?.parent;}return at===ancestor?y:null;};
        const weights=new Map(kids.map(id=>[id,new Map()])),entryBindings=[];let late=false;
        const reaches=(from,to)=>{const todo=[from],seen=new Set();for(let i=0;i<todo.length;i++){const at=todo[i];if(at===to)return true;if(seen.has(at))continue;seen.add(at);todo.push(...adj.get(at)||[]);}return false;};
        for(const e of edges){const a=owner(e.source),b=owner(e.target);if(!a||!b||a===b||e.design_route?.kind==='iteration-feedback')continue;
          const pa=positions.get(a),pb=positions.get(b),sy=relative(e.source,a),ty=relative(e.target,b);
          const flows=e.bundle_members||[e],data=flows.every(e=>['data','alias','interface-binding'].includes(e.kind)&&!e.condition);
          // The target needs a distinct, independently sourced entry. Merely
          // nesting a serial operation deeply inside a helper is insufficient.
          const independent=edges.find(other=>{const from=owner(other.source);if(!from||from===a||from===b||owner(other.target)!==b||reaches(a,from))return false;
            const uses=other.bundle_members||[other],entry=relative(other.target,b);
            return uses.every(e=>['data','alias','interface-binding'].includes(e.kind)&&!e.condition)&&entry!==null&&entry<=ty+gapY;
          });
          const internal=data&&pa.expanded&&pb.expanded&&sy!==null&&ty!==null&&e.target!==b&&independent;
          // An independently entered region need not start below the producer
          // of its later context input. This optional drawing convention keeps
          // the cross-region arrow (possibly upward); it does not assert time.
          const guarded=id=>{const n=idx.nodes.get(id);return ['opaque','control'].includes(n.kind)||n.condition||n.mutable||n.identity_display||n.observed_calls||
            ['conditional-region','conditional-collection','loop-template','iteration-region','observed-variant'].includes(n.semantic_type);};
          const entry=internal&&options.compoundStarts&&!e.design_route&&![a,b,e.source,e.target].some(guarded);
          const distance=entry?0:internal?sy+positions.get(e.source).h-ty+gapY:pa.h+gapY;
          if(entry)entryBindings.push({edge:e.id,source_frame:a,target_frame:b,source:e.source,target:e.target,independent_entry:independent.id});
          if(internal&&ty>pb.header+gapY)late=true;
          weights.get(a).set(b,Math.max(weights.get(a).get(b)??-Infinity,distance));
        }
        // Reading-order constraints and any unmodeled dependency retain the
        // conservative full-frame distance. No control boundary is crossed.
        for(const [a,targets]of adj)for(const b of targets)if(!weights.get(a).has(b))weights.get(a).set(b,positions.get(a).h+gapY);
        if(late){
          // A wrapped row of entry interfaces must not push an entire expanded
          // column sideways. Reserve their existing rows above the regions.
          // This is only a geometry candidate: no interface is copied and no
          // dependency, condition, state or execution order is changed.
          const inputs=kids.filter(id=>!pred.get(id).size&&idx.nodes.get(id)?.kind==='interface'&&idx.nodes.get(id)?.role==='input');
          const band=options.compoundInputBand&&options.compoundStarts&&entryBindings.length&&inputs.length>1?
            {inputs,regions:kids.filter(id=>!inputs.includes(id)),gap_y:gapY}:null;
          const floor=band?Math.max(...inputs.map(id=>positions.get(id).y+positions.get(id).h))+gapY:0;
          const tops=new Map(kids.map(id=>[id,band?(inputs.includes(id)?positions.get(id).y:floor):!pred.get(id).size&&idx.nodes.get(id)?.kind==='interface'?positions.get(id).y:0]));
          for(const u of queue){const a=scc[u][0];for(const [b,distance]of weights.get(a))tops.set(b,Math.max(tops.get(b),tops.get(a)+distance));}
          const placed=[],candidate=new Map(),ordinal=new Map(queue.map((u,i)=>[scc[u][0],i]));
          for(const id of kids.slice().sort((a,b)=>tops.get(a)-tops.get(b)||ordinal.get(a)-ordinal.get(b))){
            const p=positions.get(id),top=tops.get(id),overlap=placed.filter(q=>top<q.y+q.h+gapY/2&&top+p.h+gapY/2>q.y);
            const xs=[0,...overlap.map(q=>q.x+q.w+gapX)].sort((a,b)=>a-b);
            const x=xs.find(x=>overlap.every(q=>x+p.w+gapX<=q.x||x>=q.x+q.w+gapX));
            const box={id,x,y:top,w:p.w,h:p.h};candidate.set(id,box);placed.push(box);
          }
          if(band){
            // Use the regions' available width instead of the global rank's
            // column count. Order entries by their actual consumer positions;
            // shared inputs keep one terminal and all of their distinct uses.
            const available=Math.max(...band.regions.map(id=>{const p=candidate.get(id);return p.x+p.w;}),...inputs.map(id=>positions.get(id).w));
            const relativeX=(id,ancestor)=>{let x=0;while(id&&id!==ancestor){x+=positions.get(id).x;id=idx.nodes.get(id)?.parent;}return x;};
            const desired=id=>{const uses=edges.filter(e=>owner(e.source)===id&&band.regions.includes(owner(e.target)));
              return uses.length?uses.reduce((sum,e)=>sum+candidate.get(owner(e.target)).x+relativeX(e.target,owner(e.target))+positions.get(e.target).w/2,0)/uses.length:0;};
            const ordered=inputs.map((id,i)=>({id,i,w:positions.get(id).w,h:positions.get(id).h,desired:desired(id)})).sort((a,b)=>a.desired-b.desired||a.i-b.i);
            const rows=[];let row=[],used=0;
            for(const cell of ordered){if(row.length&&used+gapX+cell.w>available){rows.push(row);row=[];used=0;}row.push(cell);used+=(row.length>1?gapX:0)+cell.w;}
            if(row.length)rows.push(row);let top=0;
            for(const cells of rows){
              let right=-gapX;for(const cell of cells){cell.x=Math.max(right+gapX,Math.min(available-cell.w,cell.desired-cell.w/2));right=cell.x+cell.w;}
              let left=available+gapX;for(const cell of cells.slice().reverse()){cell.x=Math.min(cell.x,left-gapX-cell.w);left=cell.x;}
              for(const cell of cells)Object.assign(candidate.get(cell.id),{x:cell.x,y:top});
              top+=Math.max(...cells.map(c=>c.h))+gapY;
            }
            const shift=top-floor;for(const id of band.regions)candidate.get(id).y+=shift;
          }
          const box={w:Math.max(...placed.map(p=>p.x+p.w)),h:Math.max(...placed.map(p=>p.y+p.h))};
          const score=b=>Math.max(b.w/1.6,b.h);
          const accepted=box.h<vertical.h*.9&&score(box)<score(vertical)*.9&&box.w*box.h<=vertical.w*vertical.h*2;
          compoundAlignments.push({parent,before:vertical,candidate:box,accepted,...(options.compoundStarts?{mode:'entries',entry_bindings:entryBindings}:{}),...(band?{input_band:band}:{}),scope:'visible endpoint geometry; no execution-order assertion'});
          if(accepted){
            if(rankRecord){rankRecord.applied=false;rankRecord.reason='Compound port alignment uses its existing clearance policy.';}
            for(const [id,p]of candidate){Object.assign(positions.get(id),{x:p.x,y:p.y,arrangement:'compound-port-alignment'});}
            return finish(box,band);
          }
        }
      }
      // Fold a long, narrow acyclic rank sequence into a reading path. Nodes
      // within one rank stay parallel; skip edges keep their exact endpoints.
      // Broad branching and SCC feedback retain the ordinary layered layout.
      // Layout carries no claim that adjacent cells have a dependency.
      const prefix=options.foldBoundaryRanks&&rows.get(sorted[0])?.length>1?1:0;
      const suffix=options.foldBoundaryRanks&&rows.get(sorted.at(-1))?.length>1?1:0;
      const foldedRanks=sorted.slice(prefix,sorted.length-suffix||undefined);
      const bypassFlow=options.semanticLanes&&edges.some(e=>laneKinds.includes(e.design_route?.kind)&&owner(e.target));
      if(options.foldSerial&&!bypassFlow&&sorted.length>=(options.foldMinRanks??5)&&scc.every(group=>group.length===1)&&foldedRanks.every(r=>rows.get(r).length<=(options.foldMaxParallel??2)&&rows.get(r).length<=(rankColumns||Infinity))){
        const foldGapX=options.foldGapX??gapY;
        const cells=foldedRanks.map(r=>({ids:rows.get(r),w:rowWidths[sorted.indexOf(r)],h:Math.max(...rows.get(r).map(id=>positions.get(id).h))}));
        const topH=prefix?grids[0].h+gapY:0,bottomH=suffix?grids.at(-1).h+gapY:0;
        const score=box=>Math.max(box.w/1.5,box.h)+Math.max(0,box.w-(options.maxWidth||Infinity))*4;let best=null;
        for(let cols=2;cols<cells.length&&cols<=(options.foldMaxColumns??Infinity);cols++){
          const widths=Array(cols).fill(0),heights=Array(Math.ceil(cells.length/cols)).fill(0),grid=[];
          cells.forEach((cell,i)=>{const row=Math.floor(i/cols),col=row%2?cols-1-i%cols:i%cols;widths[col]=Math.max(widths[col],cell.w);heights[row]=Math.max(heights[row],cell.h);grid.push({cell,row,col});});
          const innerW=widths.reduce((s,w)=>s+w,0)+foldGapX*(cols-1);
          const box={w:Math.max(innerW,prefix?rowWidths[0]:0,suffix?rowWidths.at(-1):0),h:topH+bottomH+heights.reduce((s,h)=>s+h,0)+gapY*(heights.length-1)};
          if(score(box)<score(vertical)*(options.foldGain??.8)&&(!best||score(box)<score(best.box)))best={box,widths,heights,grid};
        }
        if(best){if(rankRecord){rankRecord.applied=false;rankRecord.reason='Folded rank columns use their existing clearance policy.';}for(const [rank,{cell,row,col}]of best.grid.entries()){
          const innerW=best.widths.reduce((s,w)=>s+w,0)+foldGapX*(best.widths.length-1);
          let x=(best.box.w-innerW)/2+best.widths.slice(0,col).reduce((s,w)=>s+w+foldGapX,0)+(best.widths[col]-cell.w)/2;
          const y=topH+best.heights.slice(0,row).reduce((s,h)=>s+h+gapY,0)+(best.heights[row]-cell.h)/2;
          for(const id of cell.ids){const p=positions.get(id);p.x=x;p.y=y;p.topological_rank=rank+prefix;p.arrangement='folded-ranks';x+=p.w+gapX;}
        }
          // Wide input/output ranks occupy their own bands; they do not force
          // every column of the computation path to inherit their full width.
          for(const i of [...(prefix?[0]:[]),...(suffix?[sorted.length-1]:[])])for(const id of rows.get(sorted[i])){
            const p=positions.get(id),oldTop=rowTops.get(sorted[i]);p.x+=(best.box.w-width)/2;p.y=p.y-oldTop+(i===0?0:best.box.h-grids[i].h);p.topological_rank=i;p.arrangement='boundary-band';
          }
          return finish(best.box);}
      }
      return finish(vertical);
    }
    function place(id){const n=idx.nodes.get(id),kids=(idx.children.get(id)||[]).filter(c=>visible.has(c)),p={id,x:0,y:0,...size(n),expanded:!!kids.length};positions.set(id,p);
      if(kids.length){
        kids.forEach(place);
        const fixed=kids.filter(c=>options.fixedInputIds?.has(c)&&!edges.some(e=>e.target===c)),body=kids.filter(c=>!fixed.includes(c));
        const box=body.length?arrange(body,id):{w:0,h:0},pad=options.framePadding??32;
        let title=typeof options.frameHeader==='function'?options.frameHeader(n):options.frameHeader??74;
        const titleWidth=Math.max(212,p.w),railGap=28,railRows=[];let row=[],used=0;
        // These are the original canonical terminals, moved beside the source
        // title. Their data/control/effect edges remain real routed edges.
        for(const child of fixed){const at=positions.get(child);if(row.length&&used+railGap+at.w>480){railRows.push(row);row=[];used=0;}row.push(child);used+=(row.length>1?railGap:0)+at.w;}
        if(row.length)railRows.push(row);
        const railHeight=railRows.reduce((h,row)=>h+Math.max(...row.map(c=>positions.get(c).h)),0)+Math.max(0,railRows.length-1)*28;
        // Leave room for the normal 16px terminal stub and 8px obstacle pad,
        // including between rows and above the first body node.
        if(fixed.length)title=Math.max(title,railHeight+32);
        const header=title+(options.headerClearance??20),gutter=laneOwners.has(id)?28+Math.min(3,laneOwners.get(id))*20:0;
        p.header=header;p.protected_header_height=title-10;p.design_gutter=gutter;
        const railWidth=Math.max(0,...railRows.map(row=>row.reduce((w,c)=>w+positions.get(c).w,0)+(row.length-1)*railGap));
        p.w=Math.max(options.nodeSize?212:300,box.w+pad*2+gutter+(contextOwners.has(id)?32+contextOwners.get(id)*16:0),fixed.length?titleWidth+pad+railWidth+pad:0);
        if(contextOwners.has(id))p.context_gutter=32+contextOwners.get(id)*16;
        p.h=box.h+header+pad;
        for(const child of body){positions.get(child).x+=pad+gutter+(options.contextLanes==='left'?(p.context_gutter||0):0);positions.get(child).y+=header;}
        if(fixed.length){
          p.protected_header_width=titleWidth;
          let top=10;for(const row of railRows){let left=titleWidth+pad;for(const child of row){const at=positions.get(child);Object.assign(at,{x:left,y:top,arrangement:'fixed-call-argument'});left+=at.w+railGap;}top+=Math.max(...row.map(c=>positions.get(c).h))+28;}
          fixedInputs.push({parent:id,nodes:fixed,title_width:titleWidth,scope:'Existing invocation-bound literal terminals; identity, containment and all dependencies retained. Geometry only.'});
        }
      }
    }
    roots.filter(id=>visible.has(id)).forEach(place);
    arrange(roots.filter(id=>visible.has(id)),null);
    function absolute(id,dx,dy){const p=positions.get(id),off=offsets[id]||{x:0,y:0};p.x+=dx+off.x;p.y+=dy+off.y;for(const c of idx.children.get(id)||[])if(positions.has(c))absolute(c,p.x,p.y);}
    for(const id of roots)if(positions.has(id))absolute(id,32,30);
    positions.context={contextSourceFacing:options.contextSourceFacing,idx,edges,feedback,compoundAlignments,contextLanes,branchColumns,rankClearances,inputDocks,fixedInputs,
      entryBandRouting:compoundAlignments.some(r=>entryBandGeometry(r,positions))};return positions;
  }
  function branchGeometry(group,positions){
    const paths=group.chains.map(c=>c.nodes.map(id=>positions.get(id)));
    if(paths.some(ps=>ps.some(p=>!p)))return false;
    const close=(a,b)=>Math.abs(a-b)<1e-6;
    if(!paths.every(ps=>ps.every((p,i)=>close(p.x+p.w/2,ps[0].x+ps[0].w/2)&&(!i||p.y>=ps[i-1].y+ps[i-1].h))))return false;
    if(!paths.every(ps=>ps.every((p,i)=>close(p.y,paths[0][i].y))))return false;
    if(!paths.every((ps,i)=>!i||Math.min(...ps.map(p=>p.x))>=Math.max(...paths[i-1].map(p=>p.x+p.w))))return false;
    const sink=positions.get(group.sink);return !!sink&&paths.every(ps=>sink.y>=ps.at(-1).y+ps.at(-1).h);
  }
  function inputDockGeometry(record,positions){
    const p=positions.get(record.node),parent=positions.get(record.parent),idx=positions.context.idx;
    if(!p||!parent||idx.nodes.get(record.node)?.parent!==record.parent||p.y<parent.y+parent.header||p.x<parent.x||p.x+p.w>parent.x+parent.w||p.y+p.h>parent.y+parent.h)return false;
    const regions=record.regions.map(id=>positions.get(id));if(regions.some(p=>!p))return false;
    if(record.side==='left'?!regions.every(r=>p.x+p.w<=r.x):!regions.every(r=>p.x>=r.x+r.w))return false;
    return (idx.children.get(record.parent)||[]).filter(id=>id!==record.node&&positions.has(id)).every(id=>{
      const q=positions.get(id);return p.x+p.w<=q.x||q.x+q.w<=p.x||p.y+p.h<=q.y||q.y+q.h<=p.y;
    });
  }
  function entryGeometry(record,positions){
    return record.accepted&&record.entry_bindings?.length>0&&record.entry_bindings.every(binding=>{
      const a=positions.get(binding.source_frame),b=positions.get(binding.target_frame);
      return a&&b&&(a.x+a.w<=b.x||b.x+b.w<=a.x)&&a.y<b.y+b.h&&b.y<a.y+a.h;
    });
  }
  function entryBandGeometry(record,positions){
    const band=record.input_band;
    if(!band||!entryGeometry(record,positions)||band.inputs.length<2||!band.regions.length)return false;
    if(![...band.inputs,...band.regions].every(id=>positions.has(id)))return false;
    const floor=Math.max(...band.inputs.map(id=>{const p=positions.get(id);return p.y+p.h;}))+band.gap_y;
    return band.regions.every(id=>positions.get(id).y>=floor);
  }
  const point=(x,y)=>({x,y});
  function simplify(points){const out=[];for(const p of points){if(out.length&&out.at(-1).x===p.x&&out.at(-1).y===p.y)continue;while(out.length>1&&((out.at(-2).x===out.at(-1).x&&out.at(-1).x===p.x)||(out.at(-2).y===out.at(-1).y&&out.at(-1).y===p.y)))out.pop();out.push(p);}return out;}
  function blocked(a,b,boxes){return boxes.some(r=>{
    if(r.circle){const radius=r.w/2,cx=r.x+radius,cy=r.y+radius,d=a.x===b.x?Math.abs(a.x-cx):Math.abs(a.y-cy);if(d>=radius-1e-8)return false;const half=Math.sqrt(radius*radius-d*d);return a.x===b.x?Math.max(a.y,b.y)>cy-half+1e-8&&Math.min(a.y,b.y)<cy+half-1e-8:Math.max(a.x,b.x)>cx-half+1e-8&&Math.min(a.x,b.x)<cx+half-1e-8;}
    return a.x===b.x?a.x>r.x&&a.x<r.x+r.w&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.h:a.y>r.y&&a.y<r.y+r.h&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.w;
  });}
  function route(e,positions){
    const a=positions.get(e.source),b=positions.get(e.target);if(!a||!b)return {points:[],ok:false,reason:'missing-endpoint'};
    const context=positions.context,idx=context?.idx;
    const ancestors=id=>{const set=new Set([id]);while(idx?.nodes.get(id)?.parent){id=idx.nodes.get(id).parent;set.add(id);}return set;};
    const sourceAnc=ancestors(e.source),targetAnc=ancestors(e.target);
    const vertical=b.y>=a.y+a.h,up=a.y>=b.y+b.h,side=!vertical&&!up;
    let ss,ts;
    if(side){ss=b.x>=a.x?'right':'left';ts=ss==='right'?'left':'right';}
    else {ss=vertical?'bottom':'top';ts=vertical?'top':'bottom';}
    // When the endpoint is an expanded ancestor, attach to its *inner* boundary.
    // It is legal to cross ancestors; unrelated containers remain obstacles.
    const startInward=e.source!==e.target&&a.expanded&&targetAnc.has(e.source),endInward=e.source!==e.target&&b.expanded&&sourceAnc.has(e.target);
    const headerControl=e.kind==='control'&&context?.ancestorPorts==='header';
    if(startInward)ss=headerControl?'top':'bottom';if(endInward)ts=headerControl?'top':'bottom';
    if(headerControl&&(startInward||endInward))ss=ts='top';
    const laneOwner=positions.get(e.design_route?.owner);
    const semanticBypass=['bypass','state-interface','iteration-feedback'].includes(e.design_route?.kind)&&laneOwner?.design_gutter;
    if(semanticBypass)ss=ts='left';
    const contextOwner=positions.get(e.context_lane?.owner),contextLane=!!contextOwner?.context_gutter;
    if(contextLane){ts=e.context_lane.side;ss=contextSourceSide(e,positions)||ss;}
    function sideFor(edge,isSource){
      const from=positions.get(edge.source),to=positions.get(edge.target);if(!from||!to)return null;
      const down=to.y>=from.y+from.h,up=from.y>=to.y+to.h;
      let sourceSide,targetSide;
      if(!down&&!up){sourceSide=to.x>=from.x?'right':'left';targetSide=sourceSide==='right'?'left':'right';}
      else{sourceSide=down?'bottom':'top';targetSide=down?'top':'bottom';}
      const header=edge.kind==='control'&&context?.ancestorPorts==='header';
      if(edge.source!==edge.target&&from.expanded&&ancestors(edge.target).has(edge.source))sourceSide=header?'top':'bottom';
      if(edge.source!==edge.target&&to.expanded&&ancestors(edge.source).has(edge.target))targetSide=header?'top':'bottom';
      if(header&&edge.source!==edge.target&&(from.expanded&&ancestors(edge.target).has(edge.source)||to.expanded&&ancestors(edge.source).has(edge.target)))sourceSide=targetSide='top';
      if(['bypass','state-interface','iteration-feedback'].includes(edge.design_route?.kind)&&positions.get(edge.design_route.owner)?.design_gutter)sourceSide=targetSide='left';
      if(edge.context_lane&&positions.get(edge.context_lane.owner)?.context_gutter){
        targetSide=edge.context_lane.side;sourceSide=contextSourceSide(edge,positions)||sourceSide;
      }
      return isSource?sourceSide:targetSide;
    }
    function port(id,other,isSource,which){
      const p=positions.get(id),siblings=[];
      // Folded paths can enter and leave through the same side. Allocate all
      // incident terminals together so the outgoing stub cannot retrace an
      // incoming arrow at the very same physical point.
      for(const edge of context?.edges||[e])for(const source of [true,false])if((source?edge.source:edge.target)===id&&sideFor(edge,source)===which)siblings.push({edge,source});
      if(context?.portOrder==='neighbors'){
        // Physical order follows the opposite endpoint on this side. It does
        // not change a canonical operand slot or merge repeated uses. Match
        // parallel-edge ties at both ends to avoid an artificial braid.
        const horizontal=which==='top'||which==='bottom';
        const coordinate=item=>{const other=positions.get(item.source?item.edge.target:item.edge.source);return horizontal?other.x+other.w/2:other.y+other.h/2;};
        siblings.sort((a,b)=>coordinate(a)-coordinate(b)||a.edge.id.localeCompare(b.edge.id)||Number(a.source)-Number(b.source));
      }
      // Every canonical boundary edge receives a distinct physical terminal.
      const i=siblings.findIndex(x=>x.edge.id===e.id&&x.source===isSource),fraction=(Math.max(0,i)+1)/(siblings.length+1);
      if(which==='top'||which==='bottom'){
        const x=p.x+16+(p.w-32)*fraction,delta=p.symbol?p.w/2-Math.sqrt((p.w/2)**2-(x-p.x-p.w/2)**2):0;
        // A control dependency of an open scope belongs to its header. Its
        // inward stub enters the body without traversing all enclosed stages.
        const header=headerControl&&which==='top'&&(isSource?startInward:endInward);
        return point(x,header?p.y+p.header-10:which==='top'?p.y+delta:p.y+p.h-delta);
      }
      const y=p.y+14+(p.h-28)*fraction,delta=p.symbol?p.w/2-Math.sqrt((p.w/2)**2-(y-p.y-p.h/2)**2):0;
      return point(which==='left'?p.x+delta:p.x+p.w-delta,y);
    }
    const s=port(e.source,e.target,true,ss),t=port(e.target,e.source,false,ts),normals={top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]};
    const sn=normals[ss],tn=normals[ts],stub=headerControl&&(startInward||endInward)?1:(context?.stubLength??16);
    const start=point(s.x+sn[0]*stub*(startInward?-1:1),s.y+sn[1]*stub*(startInward?-1:1));
    const end=point(t.x+tn[0]*stub*(endInward?-1:1),t.y+tn[1]*stub*(endInward?-1:1));
    const boxes=[];
    // Ancestor frames may be crossed at their body boundary, but their titles
    // remain obstacles for every wire, including ordinary data dependencies.
    for(const [id,p]of positions)if(p.expanded&&p.header&&(sourceAnc.has(id)||targetAnc.has(id)))boxes.push({x:p.x,y:p.y,w:p.protected_header_width??p.w,h:p.protected_header_height??p.header-10});
    for(const [id,p]of positions){
      if(sourceAnc.has(id)||targetAnc.has(id))continue;
      // The outermost unrelated frame is enough; its children add no obstacles.
      let parent=idx?.nodes.get(id)?.parent,covered=false;
      while(parent){if(positions.has(parent)&&!sourceAnc.has(parent)&&!targetAnc.has(parent)){covered=true;break;}parent=idx?.nodes.get(parent)?.parent;}
      if(!covered)boxes.push({x:p.x-8,y:p.y-8,w:p.w+16,h:p.h+16});
    }
    // Terminals are legal on the boundary; subsequent segments may not cut
    // back through the endpoint body. An inward ancestor interface is exempt.
    if(!startInward)boxes.push({x:a.x,y:a.y,w:a.w,h:a.h,circle:!!a.symbol});
    if(!endInward)boxes.push({x:b.x,y:b.y,w:b.w,h:b.h,circle:!!b.symbol});
    const middle=(start.y+end.y)/2;
    const candidates=[
      [start,point(start.x,end.y),end],
      [start,point(end.x,start.y),end],
      [start,point(start.x,middle),point(end.x,middle),end]
    ];
    const laneCandidates=semanticBypass?[16,36,56].filter(x=>x<laneOwner.design_gutter).flatMap(dx=>{
      const x=laneOwner.x+dx,leave=a.y+a.h+16,enter=b.y-16;
      const corridors=[...new Set([start.y,end.y,a.y-16,leave,enter,b.y+b.h+16,...boxes.flatMap(r=>[r.y-2,r.y+r.h+2])])];
      const nearest=y=>corridors.slice().sort((a,b)=>Math.abs(a-y)-Math.abs(b-y)).slice(0,6);
      return [[start,point(x,start.y),point(x,end.y),end],
        [start,point(start.x,leave),point(x,leave),point(x,enter),point(end.x,enter),end],
        ...nearest(start.y).flatMap(leave=>nearest(end.y).filter(enter=>enter!==leave).map(enter=>
          [start,point(start.x,leave),point(x,leave),point(x,enter),point(end.x,enter),end]))];
    }):[];
    if(contextLane){
      const x=e.context_lane.side==='left'?contextOwner.x+(contextOwner.design_gutter||0)+16+e.context_lane.index*16:contextOwner.x+contextOwner.w-16-e.context_lane.index*16;
      laneCandidates.push([start,point(x,start.y),point(x,end.y),end]);
      const corridors=[...new Set([start.y,a.y+a.h+16,...boxes.flatMap(r=>[r.y-2,r.y+r.h+2])])];
      for(const y of corridors)laneCandidates.push([start,point(start.x,y),point(x,y),point(x,end.y),end]);
      // An entry above a region cannot descend through that region's title
      // to reach its internal gutter. Approach around an ancestor boundary,
      // then enter the gutter below the title. Every segment still passes the
      // same actual obstacle and congestion checks as an ordinary route.
      if(context.entryBandRouting){
        const escapes=[...new Set([...targetAnc].map(id=>positions.get(id)).filter(p=>p?.expanded)
          .map(p=>e.context_lane.side==='left'?p.x-16:p.x+p.w+16))];
        const entries=[...new Set([contextOwner.y+contextOwner.header+8,b.y-16,...boxes.flatMap(r=>[r.y-2,r.y+r.h+2])])]
          .filter(y=>y!==end.y).sort((a,b)=>Math.abs(a-end.y)-Math.abs(b-end.y)).slice(0,8);
        const leaves=[...new Set([start.y,a.y+a.h+16,...boxes.map(r=>r.y+r.h+2)])]
          .filter(y=>y>=start.y).sort((a,b)=>a-b).slice(0,6);
        for(const outside of escapes)for(const leave of leaves)for(const enter of entries)
          laneCandidates.push([start,point(start.x,leave),point(outside,leave),point(outside,enter),point(x,enter),point(x,end.y),end]);
      }
    }
    const reserved=context?.reserved||[];
    // Normalize the fixed reservation snapshot once. Keep its original order
    // so fractional overlap penalties are accumulated in exactly the same
    // sequence as before, including zero-length reserved segments.
    const reservationBounds=reserved.map(([c,d])=>({vertical:c.x===d.x,x:c.x,y:c.y,
      left:Math.min(c.x,d.x),right:Math.max(c.x,d.x),top:Math.min(c.y,d.y),bottom:Math.max(c.y,d.y)}));
    if(reserved.length)for(const delta of [-12,12,-24,24,-40,40]){
      candidates.push([start,point(start.x,middle+delta),point(end.x,middle+delta),end]);
      const x=(start.x+end.x)/2+delta;candidates.push([start,point(x,start.y),point(x,end.y),end]);
    }
    const clear=ps=>ps.every((p,i)=>!i||!blocked(ps[i-1],p,boxes));
    function congestion(a,b){let penalty=0;
      const vertical=a.x===b.x,left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
      for(const r of reservationBounds){
      if(vertical===r.vertical){
        if(vertical?a.x!==r.x:a.y!==r.y)continue;
        const overlap=vertical?Math.min(bottom,r.bottom)-Math.max(top,r.top):Math.min(right,r.right)-Math.max(left,r.left);
        penalty+=Math.max(0,overlap)*24;
      }else{
        const vx=vertical?a.x:r.x,hy=vertical?r.y:a.y,hleft=vertical?r.left:left,hright=vertical?r.right:right,vtop=vertical?top:r.top,vbottom=vertical?bottom:r.bottom;
        if(vx>hleft&&vx<hright&&hy>vtop&&hy<vbottom)penalty+=context?.crossingCost??18;
        else if(context?.contactCost&&vx>=hleft&&vx<=hright&&hy>=vtop&&hy<=vbottom)penalty+=context.contactCost;
      }
    }return penalty;}
    // Candidate arrays and the obstacle/reservation snapshot do not change
    // during one route. Reuse scores without changing comparison or tie order.
    const lengths=new WeakMap();
    const length=ps=>{if(!lengths.has(ps))lengths.set(ps,ps.reduce((s,p,i)=>s+(i?Math.abs(p.x-ps[i-1].x)+Math.abs(p.y-ps[i-1].y)+congestion(ps[i-1],p):0),0)+ps.length*12);return lengths.get(ps);};
    let best=laneCandidates.filter(clear).sort((a,b)=>length(a)-length(b))[0]||candidates.filter(clear).sort((a,b)=>length(a)-length(b))[0];
    const crowded=best&&best.some((p,i)=>i&&congestion(best[i-1],p)>100);
    if(!best||crowded){
      // Compressed visibility grid; obstacles contribute only their boundaries.
      // First try the endpoint corridor, then expand to include all obstacles.
      for(const margin of [160,Infinity]){
        const local=boxes.filter(r=>r.x+r.w>=Math.min(start.x,end.x)-margin&&r.x<=Math.max(start.x,end.x)+margin&&r.y+r.h>=Math.min(start.y,end.y)-margin&&r.y<=Math.max(start.y,end.y)+margin);
        const nearby=reserved.filter(([a,b])=>Math.max(a.x,b.x)>=Math.min(start.x,end.x)-margin&&Math.min(a.x,b.x)<=Math.max(start.x,end.x)+margin&&Math.max(a.y,b.y)>=Math.min(start.y,end.y)-margin&&Math.min(a.y,b.y)<=Math.max(start.y,end.y)+margin);
        const xs=[...new Set([start.x,end.x,...local.flatMap(r=>[r.x-2,r.x+r.w+2]),...nearby.flatMap(([a,b])=>a.x===b.x?[a.x-12,a.x+12]:[])])].sort((a,b)=>a-b);
        const ys=[...new Set([start.y,end.y,...local.flatMap(r=>[r.y-2,r.y+r.h+2]),...nearby.flatMap(([a,b])=>a.y===b.y?[a.y-12,a.y+12]:[])])].sort((a,b)=>a-b);
        const sx=xs.indexOf(start.x),sy=ys.indexOf(start.y),tx=xs.indexOf(end.x),ty=ys.indexOf(end.y);
        // Both direction states may visit the same undirected adjacent grid
        // segment. Only its obstacle/penalty result is shared; search costs,
        // turn penalties, heap order and the visit budget remain unchanged.
        // This cache belongs to this grid and route, never to another trial.
        const segments=new Map();
        const key=(x,y,d)=>`${x},${y},${d}`,cost=new Map(),prev=new Map(),heap=[];
        function push(item){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;}
        function pop(){const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;}
        const initial=key(sx,sy,'s');cost.set(initial,0);push({x:sx,y:sy,d:'s',g:0,f:0,k:initial});let final=null,visits=0;
        while(heap.length&&visits++<24000){const cur=pop();if(cur.g!==cost.get(cur.k))continue;
          if(cur.x===tx&&cur.y===ty){final=cur.k;break;}
          for(const [dx,dy,d]of [[-1,0,'h'],[1,0,'h'],[0,-1,'v'],[0,1,'v']]){
            const x=cur.x+dx,y=cur.y+dy;if(x<0||y<0||x>=xs.length||y>=ys.length)continue;
            const p=point(xs[x],ys[y]),from=point(xs[cur.x],ys[cur.y]);
            const segmentKey=(Math.min(y,cur.y)*xs.length+Math.min(x,cur.x))*2+(d==='v'?1:0);
            let segment=segments.get(segmentKey);
            if(!segment){const hit=blocked(from,p,boxes);segment={blocked:hit,penalty:hit?0:congestion(from,p)};segments.set(segmentKey,segment);}
            if(segment.blocked)continue;
            const g=cur.g+Math.abs(p.x-from.x)+Math.abs(p.y-from.y)+segment.penalty+(cur.d!==d&&cur.d!=='s'?24:0),k=key(x,y,d);
            if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);prev.set(k,cur.k);
            push({x,y,d,g,k,f:g+Math.abs(p.x-end.x)+Math.abs(p.y-end.y)});
          }
        }
        if(final){const found=[];for(let k=final;k;k=prev.get(k)){const [x,y]=k.split(',').map(Number);found.push(point(xs[x],ys[y]));}found.reverse();
          const inContext=ps=>{const lo=e.context_lane.side==='left'?contextOwner.x+(contextOwner.design_gutter||0):contextOwner.x+contextOwner.w-contextOwner.context_gutter;
            const hi=e.context_lane.side==='left'?lo+contextOwner.context_gutter:contextOwner.x+contextOwner.w;
            return ps.some((p,i)=>i&&p.x===ps[i-1].x&&p.y!==ps[i-1].y&&p.x>lo&&p.x<hi);};
          const preserveContext=context?.entryBandRouting&&contextLane&&best&&inContext(best);
          if((!semanticBypass||!best||found.some(p=>p.x>laneOwner.x&&p.x<laneOwner.x+laneOwner.design_gutter))&&
            (!preserveContext||inContext(found))&&(!best||length(found)<length(best)))best=found;break;}
      }
    }
    if(!best)return {points:simplify([s,start,point(start.x,end.y),end,t]),ok:false,reason:'no-obstacle-free-route-within-budget'};
    const points=simplify([s,...best,t]);
    const ok=clear(points);
    return {points,ok,reason:ok?null:'endpoint-stub-obstructed',feedback:e.source===e.target||context?.feedback.has(e.id)||false,
      source_side:ss,target_side:ts};
  }
  function path(e,positions){const r=route(e,positions);return r.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');}
  const api={layout,route,path,components,blocked,contextEntries,contextSourceSide,regionFollowers,branchGeometry,entryGeometry,entryBandGeometry,inputDockGeometry,labelClearances};root.SemanticLayout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

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
  function layout(idx,roots,visible,edges,offsets={},options={}){
    const positions=new Map(),feedback=new Set();
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
      const rankColumns=options.rankColumnsFor?.(idx.nodes.get(parent))??options.rankColumns;
      const kidSet=new Set(kids),owner=id=>{while(id!=null&&!kidSet.has(id)){if(id===parent)return null;id=idx.nodes.get(id)?.parent;}return id;};
      const adj=new Map(kids.map(id=>[id,new Set()])),pred=new Map(kids.map(id=>[id,new Set()]));
      for(const e of edges){const a=owner(e.source),b=owner(e.target);if(a&&b&&a!==b){adj.get(a).add(b);pred.get(b).add(a);}}
      const scc=components(kids,adj),unit=new Map();scc.forEach((group,i)=>group.forEach(id=>unit.set(id,i)));
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
      for(const e of edges){const a=owner(e.source),b=owner(e.target);if(a&&b&&a!==b&&unit.get(a)===unit.get(b))feedback.add(e.id);}
      // SCCs are explicitly kept as cycles; they cannot be topologically sorted
      // into a fictional feed-forward chain. Arrange their members side by side.
      const rows=new Map();for(const id of kids){const r=rank[unit.get(id)];if(!rows.has(r))rows.set(r,[]);rows.get(r).push(id);}
      const sorted=[...rows.keys()].sort((a,b)=>a-b),order=new Map();
      for(const row of rows.values())row.forEach((id,i)=>order.set(id,i));
      for(let pass=0;pass<6;pass++)for(const r of pass%2?sorted.slice().reverse():sorted){
        const row=rows.get(r),neighbors=pass%2?adj:pred;
        const score=id=>{const ns=[...neighbors.get(id)].filter(n=>rank[unit.get(n)]!==r);return ns.length?ns.reduce((s,n)=>s+order.get(n),0)/ns.length:order.get(id);};
        const scores=new Map(row.map(id=>[id,score(id)]));row.sort((a,b)=>scores.get(a)-scores.get(b)||order.get(a)-order.get(b));row.forEach((id,i)=>order.set(id,i));
      }
      const grids=sorted.map(r=>{const ids=rows.get(r),cols=Math.min(rankColumns||ids.length,ids.length),widths=Array(cols).fill(0),heights=Array(Math.ceil(ids.length/cols)).fill(0);
        ids.forEach((id,i)=>{const p=positions.get(id);widths[i%cols]=Math.max(widths[i%cols],p.w);heights[Math.floor(i/cols)]=Math.max(heights[Math.floor(i/cols)],p.h);});
        return {cols,widths,heights,w:widths.reduce((s,w)=>s+w,0)+(cols-1)*gapX,h:heights.reduce((s,h)=>s+h,0)+(heights.length-1)*gapY};});
      const rowWidths=grids.map(g=>g.w);
      const width=Math.max(0,...rowWidths);let y=0;
      sorted.forEach((r,i)=>{const row=rows.get(r),grid=grids[i],left=(width-rowWidths[i])/2;
        row.forEach((id,j)=>{const p=positions.get(id),col=j%grid.cols,gr=Math.floor(j/grid.cols);p.x=left+grid.widths.slice(0,col).reduce((s,w)=>s+w+gapX,0)+(grid.widths[col]-p.w)/2;p.y=y+grid.heights.slice(0,gr).reduce((s,h)=>s+h+gapY,0);p.cyclic=scc[unit.get(id)].length>1;});
        y+=grid.h+gapY;
      });
      const vertical={w:width,h:Math.max(0,y-gapY)};
      // Fold a long, narrow acyclic rank sequence into a reading path. Nodes
      // within one rank stay parallel; skip edges keep their exact endpoints.
      // Broad branching and SCC feedback retain the ordinary layered layout.
      // Layout carries no claim that adjacent cells have a dependency.
      const prefix=options.foldBoundaryRanks&&rows.get(sorted[0])?.length>1?1:0;
      const suffix=options.foldBoundaryRanks&&rows.get(sorted.at(-1))?.length>1?1:0;
      const foldedRanks=sorted.slice(prefix,sorted.length-suffix||undefined);
      if(options.foldSerial&&sorted.length>=(options.foldMinRanks??5)&&scc.every(group=>group.length===1)&&foldedRanks.every(r=>rows.get(r).length<=(options.foldMaxParallel??2)&&rows.get(r).length<=(rankColumns||Infinity))){
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
        if(best){for(const [rank,{cell,row,col}]of best.grid.entries()){
          const innerW=best.widths.reduce((s,w)=>s+w,0)+foldGapX*(best.widths.length-1);
          let x=(best.box.w-innerW)/2+best.widths.slice(0,col).reduce((s,w)=>s+w+foldGapX,0)+(best.widths[col]-cell.w)/2;
          const y=topH+best.heights.slice(0,row).reduce((s,h)=>s+h+gapY,0)+(best.heights[row]-cell.h)/2;
          for(const id of cell.ids){const p=positions.get(id);p.x=x;p.y=y;p.topological_rank=rank+prefix;p.arrangement='folded-ranks';x+=p.w+gapX;}
        }
          // Wide input/output ranks occupy their own bands; they do not force
          // every column of the computation path to inherit their full width.
          for(const i of [...(prefix?[0]:[]),...(suffix?[sorted.length-1]:[])])for(const id of rows.get(sorted[i])){
            const p=positions.get(id),oldTop=grids.slice(0,i).reduce((s,g)=>s+g.h+gapY,0);p.x+=(best.box.w-width)/2;p.y=p.y-oldTop+(i===0?0:best.box.h-grids[i].h);p.topological_rank=i;p.arrangement='boundary-band';
          }
          return best.box;}
      }
      return vertical;
    }
    function place(id){const n=idx.nodes.get(id),kids=(idx.children.get(id)||[]).filter(c=>visible.has(c)),p={id,x:0,y:0,...size(n),expanded:!!kids.length};positions.set(id,p);
      if(kids.length){kids.forEach(place);const box=arrange(kids,id),pad=options.framePadding??32,header=typeof options.frameHeader==='function'?options.frameHeader(n):options.frameHeader??74;p.header=header;p.w=Math.max(options.nodeSize?212:300,box.w+pad*2);p.h=box.h+header+pad;for(const child of kids){positions.get(child).x+=pad;positions.get(child).y+=header;}}
    }
    roots.filter(id=>visible.has(id)).forEach(place);
    arrange(roots.filter(id=>visible.has(id)),null);
    function absolute(id,dx,dy){const p=positions.get(id),off=offsets[id]||{x:0,y:0};p.x+=dx+off.x;p.y+=dy+off.y;for(const c of idx.children.get(id)||[])if(positions.has(c))absolute(c,p.x,p.y);}
    for(const id of roots)if(positions.has(id))absolute(id,32,30);
    positions.context={idx,edges,feedback};return positions;
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
    if(headerControl)for(const [id,p]of positions)if(p.expanded&&(sourceAnc.has(id)||targetAnc.has(id)))boxes.push({x:p.x,y:p.y,w:p.w,h:p.header-10});
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
    const reserved=context?.reserved||[];
    if(reserved.length)for(const delta of [-12,12,-24,24,-40,40]){
      candidates.push([start,point(start.x,middle+delta),point(end.x,middle+delta),end]);
      const x=(start.x+end.x)/2+delta;candidates.push([start,point(x,start.y),point(x,end.y),end]);
    }
    const clear=ps=>ps.every((p,i)=>!i||!blocked(ps[i-1],p,boxes));
    function congestion(a,b){let penalty=0;for(const [c,d]of reserved){
      const vertical=a.x===b.x,otherVertical=c.x===d.x;
      if(vertical===otherVertical){
        if(vertical?a.x!==c.x:a.y!==c.y)continue;
        const overlap=vertical?Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)):Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x));
        penalty+=Math.max(0,overlap)*24;
      }else{
        const v=vertical?[a,b]:[c,d],h=vertical?[c,d]:[a,b];
        if(v[0].x>Math.min(h[0].x,h[1].x)&&v[0].x<Math.max(h[0].x,h[1].x)&&h[0].y>Math.min(v[0].y,v[1].y)&&h[0].y<Math.max(v[0].y,v[1].y))penalty+=context?.crossingCost??18;
        else if(context?.contactCost&&v[0].x>=Math.min(h[0].x,h[1].x)&&v[0].x<=Math.max(h[0].x,h[1].x)&&h[0].y>=Math.min(v[0].y,v[1].y)&&h[0].y<=Math.max(v[0].y,v[1].y))penalty+=context.contactCost;
      }
    }return penalty;}
    const length=ps=>ps.reduce((s,p,i)=>s+(i?Math.abs(p.x-ps[i-1].x)+Math.abs(p.y-ps[i-1].y)+congestion(ps[i-1],p):0),0)+ps.length*12;
    let best=candidates.filter(clear).sort((a,b)=>length(a)-length(b))[0];
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
        const key=(x,y,d)=>`${x},${y},${d}`,cost=new Map(),prev=new Map(),heap=[];
        function push(item){heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].f<=item.f)break;heap[i]=heap[p];i=p;}heap[i]=item;}
        function pop(){const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return top;}
        const initial=key(sx,sy,'s');cost.set(initial,0);push({x:sx,y:sy,d:'s',g:0,f:0,k:initial});let final=null,visits=0;
        while(heap.length&&visits++<24000){const cur=pop();if(cur.g!==cost.get(cur.k))continue;
          if(cur.x===tx&&cur.y===ty){final=cur.k;break;}
          for(const [dx,dy,d]of [[-1,0,'h'],[1,0,'h'],[0,-1,'v'],[0,1,'v']]){
            const x=cur.x+dx,y=cur.y+dy;if(x<0||y<0||x>=xs.length||y>=ys.length)continue;
            const p=point(xs[x],ys[y]),from=point(xs[cur.x],ys[cur.y]);if(blocked(from,p,boxes))continue;
            const g=cur.g+Math.abs(p.x-from.x)+Math.abs(p.y-from.y)+congestion(from,p)+(cur.d!==d&&cur.d!=='s'?24:0),k=key(x,y,d);
            if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);prev.set(k,cur.k);
            push({x,y,d,g,k,f:g+Math.abs(p.x-end.x)+Math.abs(p.y-end.y)});
          }
        }
        if(final){const found=[];for(let k=final;k;k=prev.get(k)){const [x,y]=k.split(',').map(Number);found.push(point(xs[x],ys[y]));}found.reverse();if(!best||length(found)<length(best))best=found;break;}
      }
    }
    if(!best)return {points:simplify([s,start,point(start.x,end.y),end,t]),ok:false,reason:'no-obstacle-free-route-within-budget'};
    const points=simplify([s,...best,t]);
    const ok=clear(points);
    return {points,ok,reason:ok?null:'endpoint-stub-obstructed',feedback:e.source===e.target||context?.feedback.has(e.id)||false,
      source_side:ss,target_side:ts};
  }
  function path(e,positions){const r=route(e,positions);return r.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');}
  const api={layout,route,path,components,blocked};root.SemanticLayout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

/* Presentation of the recorded call tree. Never creates semantic nodes/wires. */
(function(root){
  'use strict';
  const VERSION='dual-lane-bottom-up/1',R=root.EdgeRouterLabRouting;
  const LEFT=['input:src','runtime:call1','runtime:call5','runtime:call9','runtime:memory'];
  const RIGHT=['input:tgt','runtime:call43','runtime:call47','runtime:call51','runtime:call101','runtime:logits'];
  const AUX=['input:src_key_padding_mask','input:tgt_key_padding_mask','input:tgt_mask','buffer:position.pe'];
  function place(nodes){
    const by=new Map(nodes.map(n=>[n.id,n])),children=new Map();
    for(const n of nodes){const list=children.get(n.parent)||[];list.push(n);children.set(n.parent,list);}
    function shift(n,dx,dy){n.x+=dx;n.y+=dy;for(const c of children.get(n.id)||[])shift(c,dx,dy);}
    function move(n,x,y){shift(n,x-n.x,y-n.y);}
    function size(n){
      const kids=(children.get(n.id)||[]).sort((a,b)=>a.runtimeOrder-b.runtimeOrder||a.id.localeCompare(b.id));
      n.x=0;n.y=0;
      if(!kids.length){n.w=n.expanded?330:n.w>330?330:n.w;n.h=n.expanded?84:n.h>100?84:n.h;return;}
      for(const c of kids)size(c);
      if(!n.parent){
        const cols=[LEFT,RIGHT,AUX].map(ids=>ids.map(id=>by.get(id)).filter(Boolean));
        const totals=cols.map(col=>col.reduce((v,c)=>v+c.h+56,0));
        const bottom=96+Math.max(...totals),pad=80+(n.runtimeWireCount||16)*12;
        let x=32;
        for(let i=0;i<cols.length;i++){
          let y=bottom;const col=cols[i],width=Math.max(330,...col.map(c=>c.w));
          for(const c of col){y-=c.h;move(c,x+(width-c.w)/2,y);c.runtimeColumn=i;y-=56;}
          x+=width+pad;
        }
        n.w=x+24;n.h=bottom+pad;
      }else{
        let y=84;const width=Math.max(330,...kids.map(c=>c.w));
        for(const c of kids.slice().reverse()){move(c,28,y);y+=c.h+28;}
        n.runtimeRoutingPadding=64+(n.runtimeWireCount||0)*12;
        n.w=28+width+n.runtimeRoutingPadding;n.h=y;
      }
    }
    const top=nodes.find(n=>!n.parent);size(top);move(top,60,60);
    return nodes;
  }
  function seeds(graph){
    const by=new Map(graph.nodes.map(n=>[n.id,n])),top=graph.nodes.find(n=>!n.parent),lanes=new Map(),routes=new Map();
    const chain=id=>{const out=[];while(id){out.push(id);id=by.get(id)?.parent;}return out;};
    const owner=e=>{const tc=chain(e.target);return chain(e.source).find(id=>tc.includes(id));};
    const wire=e=>e.contract?.wire||JSON.stringify(e.binding.wire_identity);
    for(const e of graph.edges){const id=owner(e),list=lanes.get(id)||[];if(!list.includes(wire(e)))list.push(wire(e));lanes.set(id,list);}
    const point=(e,side)=>{const n=by.get(e[side]),f=root.SummaryPhysicalPorts.active(e,side);return R.port(n,f.side,f.fraction);};
    const escape=(e,side,p)=>{const f=root.SummaryPhysicalPorts.active(e,side),d=R.SIDE[f.side];return f.side==='right'?p:{x:p.x+d[0]*14,y:p.y+d[1]*14};};
    const topChildren=graph.nodes.filter(n=>n.parent===top.id),cols=[0,1,2].map(i=>topChildren.filter(n=>n.runtimeColumn===i));
    const right=cols.map(col=>Math.max(...col.map(n=>n.x+n.w)));
    const branch=id=>{let n=by.get(id);while(n?.parent&&n.parent!==top.id)n=by.get(n.parent);return n;};
    const prior=[];
    for(const e of graph.edges){
      const s=point(e,'source'),t=point(e,'target'),id=owner(e),parent=by.get(id),index=lanes.get(id).indexOf(wire(e));
      if(id!==top.id){const x=parent.x+parent.w-28-index*12;routes.set(e.id,R.simplify([s,{x,y:s.y},{x,y:t.y},t]));continue;}
      const a=branch(e.source),b=branch(e.target);
      if(!Number.isInteger(a?.runtimeColumn)||!Number.isInteger(b?.runtimeColumn))continue;
      const sx=right[a.runtimeColumn]+24+index*12,tx=right[b.runtimeColumn]+24+index*12,sp=escape(e,'source',s),tp=escape(e,'target',t);
      if(a.runtimeColumn===b.runtimeColumn){const ps=R.simplify([s,sp,{x:sx,y:sp.y},{x:sx,y:tp.y},tp,t]);routes.set(e.id,ps);const path=ps.map(p=>({...p}));path.wire=wire(e);prior.push(path);continue;}
      const start={id:'route-source',x:sx,y:sp.y,w:0,h:0,routingObstacle:false},end={id:'route-target',x:tx,y:tp.y,w:0,h:0,routingObstacle:false};
      const result=R.routeEdge({source:start.id,target:end.id,waypoints:[],contract:{wire:wire(e)}},[...topChildren.map(n=>({...n,routingObstacle:true})),start,end],prior,{width:top.x+top.w+40,height:top.y+top.h+40,margin:10,stub:14,bendCost:40,edgeSpacing:10,sourceCandidates:['top','bottom','right'].map(side=>({side,fraction:.5})),targetCandidates:['top','bottom','right'].map(side=>({side,fraction:.5}))});
      // Manual movement can close a reserved corridor. Leave that edge to
      // the ordinary gate-aware router instead of failing the interaction.
      if(!result.ok)continue;
      const ps=R.simplify([s,sp,...result.points,tp,t]);routes.set(e.id,ps);const path=ps.map(p=>({...p}));path.wire=wire(e);prior.push(path);
    }
    return routes;
  }
  const api={VERSION,place,seeds};root.SummaryRuntimeLayout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

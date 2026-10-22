/* A measured architecture composition, independent of model names. This is
 * a drawing projection: canonical operations, calls and edges are untouched. */
(function(root){
  'use strict';
  const P=root.SemanticPublication||(typeof require==='function'?require('./publication.js'):null);
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  function compose(graph,state={}){
    const old=graph.positions,source=old.context.idx;
    const nodes=graph.nodes.map(n=>({...n,paper:{...n.paper}})),by=new Map(nodes.map(n=>[n.id,n]));
    const idx={nodes:new Map(source.nodes),children:new Map()};
    for(const n of nodes){
      let parent=source.nodes.get(n.id)?.parent;while(parent&&!by.has(parent))parent=source.nodes.get(parent)?.parent;
      idx.nodes.set(n.id,{...source.nodes.get(n.id),parent,paper:n.paper});
      if(!idx.children.has(parent||null))idx.children.set(parent||null,[]);idx.children.get(parent||null).push(n.id);
    }
    const positions=new Map(),records=[],docks=[];
    const parents=id=>{const ids=[];while(id){ids.push(id);id=idx.nodes.get(id)?.parent;}return ids;};
    const ordinary=e=>(e.bundle_members||[e]).every(m=>['data','alias','interface-binding'].includes(m.kind)&&!m.condition&&!m.iteration);
    for(const n of nodes){
      const uses=graph.edges.filter(e=>e.source===n.id),oldParent=idx.nodes.get(n.id)?.parent;
      if(n.kind!=='interface'||n.role!=='input'||!uses.length||uses.some(e=>!ordinary(e))||graph.edges.some(e=>e.target===n.id)||n.condition||n.mutable)continue;
      const owners=uses.map(e=>parents(idx.nodes.get(e.target)?.parent));
      const owner=owners[0].find(id=>owners.every(xs=>xs.includes(id)));
      if(!owner||owner===oldParent||!parents(owner).includes(oldParent)||!old.get(owner)?.expanded||
        parents(owner).some(id=>{const a=idx.nodes.get(id);return a?.condition||a?.mutable||['opaque','control'].includes(a?.kind);} ))continue;
      idx.children.set(oldParent,(idx.children.get(oldParent)||[]).filter(id=>id!==n.id));
      if(!idx.children.has(owner))idx.children.set(owner,[]);idx.children.get(owner).push(n.id);
      idx.nodes.set(n.id,{...idx.nodes.get(n.id),parent:owner});n.parent=owner;
      docks.push({node:n.id,source_parent:oldParent,drawing_parent:owner,kind:uses.length===1?'entry':'side',
        edges:uses.map(e=>({edge:e.id,target:e.target,source_port:e.source_port,target_port:e.target_port})),
        scope:'One existing external input moved into its receiving drawing scope. Canonical parent, identity, every use and source availability remain unchanged.'});
    }
    const children=id=>(idx.children.get(id)||[]).filter(id=>old.has(id));
    function measure(id){
      const n=by.get(id),original=old.get(id),kids=children(id);
      const p={...original,x:0,y:0};positions.set(id,p);
      const w=original.symbol?original.w:n.kind==='interface'?Math.max(154,original.w):Math.max(320,Math.min(480,original.w));
      const complex=n.paper.read_binding_rows||n.paper.call_boundary||n.local_pipeline;
      const captions=complex?n.paper.captions.flatMap(s=>P.wrap(s,w-28,13)):P.wrap(n.paper.caption,w-28,13);
      Object.assign(n.paper,{lines:P.wrap(n.paper.title,w-28,n.paper.font),captions,w});
      const textHeight=22+n.paper.lines.length*20+captions.length*16;
      if(!original.expanded||!kids.length){p.w=w;p.h=original.symbol?original.h:Math.max(n.kind==='interface'?44:54,textHeight);n.paper.h=p.h;return p;}
      for(const child of kids)measure(child);
      const side=kids.filter(child=>docks.some(d=>d.node===child&&d.kind==='side'));
      const rows=[];
      for(const child of kids.filter(c=>!side.includes(c)).sort((a,b)=>old.get(a).y-old.get(b).y||old.get(a).x-old.get(b).x)){
        let row=rows.find(r=>Math.abs(r.y-old.get(child).y)<4);
        if(!row){row={y:old.get(child).y,ids:[]};rows.push(row);}row.ids.push(child);
      }
      const under=(child,scope)=>{let at=child;while(at){if(at===scope)return true;at=idx.nodes.get(at)?.parent;}return false;};
      const streams=kids.filter(child=>old.get(child).expanded&&graph.edges.some(e=>under(e.target,child)&&
        by.get(e.source)?.kind==='interface'&&by.get(e.source)?.role==='input'&&!e.condition));
      if(streams.length>1){
        const first=Math.min(...streams.map(c=>old.get(c).y));
        for(const row of rows)row.ids=row.ids.filter(c=>!streams.includes(c));
        rows.push({y:first+.1,ids:streams.slice().sort((a,b)=>old.get(a).x-old.get(b).x)});
        rows.splice(0,rows.length,...rows.filter(r=>r.ids.length).sort((a,b)=>a.y-b.y));
      }
      const gutter=original.design_gutter||0,pad=18,gap=32;
      p.w=Math.max(w,...rows.map(r=>r.ids.reduce((sum,c)=>sum+positions.get(c).w,0)+Math.max(0,r.ids.length-1)*72+pad*2+gutter));
      const bodyWidth=p.w;
      if(side.length)p.w+=Math.max(...side.map(c=>positions.get(c).w))+32;
      n.paper.lines=P.wrap(n.paper.title,p.w-28,n.paper.font);
      n.paper.captions=P.wrap(n.paper.caption,p.w-28,13);
      p.header=22+n.paper.lines.length*20+n.paper.captions.length*16+12;
      let y=p.header;
      for(const row of rows){
        const width=row.ids.reduce((sum,c)=>sum+positions.get(c).w,0)+(row.ids.length-1)*72;
        let x=gutter+pad+(bodyWidth-gutter-pad*2-width)/2;
        for(const child of row.ids){const c=positions.get(child);Object.assign(c,{x,y});x+=c.w+72;}
        y+=Math.max(...row.ids.map(c=>positions.get(c).h))+gap;
      }
      p.h=y-gap+pad;
      let sideY=p.header;for(const child of side){const c=positions.get(child);Object.assign(c,{x:bodyWidth+8,y:sideY});sideY+=c.h+24;}
      p.h=Math.max(p.h,sideY+pad);
      records.push({node:id,children:kids,rows:rows.map(r=>r.ids),before:{w:original.w,h:original.h},after:{w:p.w,h:p.h},
        scope:'Measured sibling rows and wider cards; dependencies and source ownership unchanged. Row alignment does not assert parallel execution.'});
      return p;
    }
    const roots=nodes.filter(n=>!by.has(idx.nodes.get(n.id)?.parent)).map(n=>n.id);
    let x=32;for(const id of roots){const p=measure(id);p.x=x;p.y=30;x+=p.w+72;}
    function absolute(id,dx,dy){const p=positions.get(id);p.x+=dx;p.y+=dy;for(const child of children(id))absolute(child,p.x,p.y);}
    for(const id of roots)absolute(id,0,0);
    positions.context={...old.context,idx,edges:graph.edges,routeCache:new Map(),reserved:[],
      compoundAlignments:[],contextLanes:[],branchColumns:[],rankClearances:[],inputDocks:[],fixedInputs:[],sourceForkWidths:[],
      crossScopePorts:[],coincidentPorts:[],localBypassScopes:[],entryBandRouting:false};
    const facing=[];
    for(const e of graph.edges){
      if(!ordinary(e)||e.design_route||e.context_lane||old.context.feedback?.has(e.id))continue;
      const a=positions.get(e.source),b=positions.get(e.target),sp=parents(e.source),tp=parents(e.target);
      const common=sp.find(id=>tp.includes(id));
      const branch=(path)=>path[path.indexOf(common)-1];
      const left=positions.get(branch(sp)),right=positions.get(branch(tp));
      const dock=docks.find(d=>d.node===e.source&&d.kind==='side');
      const separate=left&&right&&left!==right&&left.expanded&&right.expanded&&
        (left.x+left.w<=right.x||right.x+right.w<=left.x);
      const externalInput=by.get(e.source)?.kind==='interface'&&by.get(e.source)?.role==='input'&&tp.includes(idx.nodes.get(e.source)?.parent);
      if(!dock&&!separate&&!externalInput)continue;
      // A primary one-use entry remains on its local vertical main chain.
      if(externalInput&&!dock&&graph.edges.filter(x=>x.source===e.source).length===1)continue;
      const sourceSide=a.x+a.w/2<=b.x+b.w/2?'right':'left',targetSide=sourceSide==='right'?'left':'right';
      facing.push({edge:e.id,source_side:sourceSide,target_side:targetSide,
        scope:'Existing cross-region or side-input binding faces its consumer. Canonical source, result slot, target and operand remain distinct.'});
    }
    positions.context.crossScopePorts=facing;
    const boxes=[...positions.values()],left=Math.min(...boxes.map(p=>p.x))-28,top=Math.min(...boxes.map(p=>p.y))-28;
    const bounds={x:left,y:top,w:Math.max(...boxes.map(p=>p.x+p.w))+28-left,h:Math.max(...boxes.map(p=>p.y+p.h))+28-top};
    const result={...graph,nodes,idx,positions,bounds,publication:{...graph.publication,composition:{schema:'architecture-composition/1',round:3,records,input_docks:docks,facing}}};
    return result;
  }
  const api={compose};root.SemanticCompositionLayout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

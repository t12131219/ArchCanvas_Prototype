/* A measured architecture composition, independent of model names. This is
 * a drawing projection: canonical operations, calls and edges are untouched. */
(function(root){
  'use strict';
  const P=root.SemanticPublication||(typeof require==='function'?require('./publication.js'):null);
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('./architecture-layout.js'):null);
  function compose(graph,state={}){
    const old=graph.positions,source=old.context.idx;
    const nodes=graph.nodes.map(n=>({...n,paper:{...n.paper}})),by=new Map(nodes.map(n=>[n.id,n]));
    const idx={nodes:new Map(source.nodes),children:new Map()};
    for(const n of nodes){
      let parent=source.nodes.get(n.id)?.parent;while(parent&&!by.has(parent))parent=source.nodes.get(parent)?.parent;
      idx.nodes.set(n.id,{...source.nodes.get(n.id),parent,paper:n.paper});
      if(!idx.children.has(parent||null))idx.children.set(parent||null,[]);idx.children.get(parent||null).push(n.id);
    }
    // Keep nonvisible children in the drawing index too: controls need them
    // to reopen closed summaries. Only visible children participate in layout.
    for(const n of source.nodes.values())if(!by.has(n.id)){
      if(!idx.children.has(n.parent||null))idx.children.set(n.parent||null,[]);idx.children.get(n.parent||null).push(n.id);
    }
    const positions=new Map(),records=[],docks=[],followers=[],streamAlignments=[];
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
      const w=original.symbol?original.w:n.kind==='interface'?Math.max(154,original.w):n.role_path_stage?240:Math.max(320,Math.min(480,original.w));
      const complex=n.paper.read_binding_rows||n.paper.call_boundary||n.local_pipeline;
      const captions=complex?n.paper.captions.flatMap(s=>P.wrap(s,w-28,13)):P.wrap(n.paper.caption,w-28,13);
      Object.assign(n.paper,{lines:P.wrap(n.paper.title,w-28,n.paper.font),captions,w});
      const textHeight=22+n.paper.lines.length*20+captions.length*16;
      if(!original.expanded||!kids.length){p.w=w;p.h=original.symbol?original.h:Math.max(n.kind==='interface'?44:54,textHeight);n.paper.h=p.h;return p;}
      for(const child of kids)measure(child);
      const side=kids.filter(child=>docks.some(d=>d.node===child&&d.kind==='side')||by.get(child)?.invocation_binding);
      const core=kids.filter(c=>!side.includes(c)),coreSet=new Set(core);
      const branch=id=>{let at=id;while(at&&!coreSet.has(at))at=idx.nodes.get(at)?.parent;return at;};
      const adj=new Map(core.map(c=>[c,new Set()]));
      for(const e of graph.edges){
        if(e.design_route?.kind==='iteration-feedback'||old.context.feedback?.has(e.id))continue;
        const a=branch(e.source),b=branch(e.target);if(a&&b&&a!==b)adj.get(a).add(b);
      }
      // Rebuild sibling dependency ranks at this frontier. Old y coordinates
      // may belong to containers replaced by certified stages and cannot
      // prove that two computations can share a row.
      const groups=L.components(core,adj),unit=new Map();groups.forEach((g,i)=>g.forEach(c=>unit.set(c,i)));
      const links=groups.map(()=>new Set()),indeg=groups.map(()=>0),rank=groups.map(()=>0);
      for(const [a,bs]of adj)for(const b of bs){const x=unit.get(a),y=unit.get(b);if(x!==y&&!links[x].has(y)){links[x].add(y);indeg[y]++;}}
      const todo=groups.map((_,i)=>i).filter(i=>!indeg[i]);
      for(let k=0;k<todo.length;k++){const i=todo[k];for(const j of links[i]){rank[j]=Math.max(rank[j],rank[i]+1);if(!--indeg[j])todo.push(j);}}
      const rows=[];
      const declaration=id=>{const n=by.get(id),anchor=source.nodes.get(n.role_path_stage?.anchor)||n;return anchor.source?.[0]||{};};
      for(const child of core.sort((a,b)=>{const x=declaration(a),y=declaration(b);return String(x.file||'').localeCompare(String(y.file||''))||
        (x.line??Infinity)-(y.line??Infinity)||(x.column??0)-(y.column??0)||old.get(a).x-old.get(b).x||old.get(a).y-old.get(b).y;})){
        const y=rank[unit.get(child)];let row=rows.find(r=>r.y===y);if(!row){row={y,ids:[]};rows.push(row);}row.ids.push(child);
      }
      rows.sort((a,b)=>a.y-b.y);
      const under=(child,scope)=>{let at=child;while(at){if(at===scope)return true;at=idx.nodes.get(at)?.parent;}return false;};
      const streams=core.filter(child=>old.get(child).expanded&&graph.edges.some(e=>under(e.target,child)&&
        by.get(e.source)?.kind==='interface'&&by.get(e.source)?.role==='input'&&!e.condition&&
        graph.edges.filter(v=>v.source===e.source).length===1&&!graph.edges.some(v=>v.target===e.source)&&
        !by.get(e.source)?.invocation_binding&&(()=>{let at=source.nodes.get(e.source)?.parent;while(at){if(at===child)return false;at=source.nodes.get(at)?.parent;}return true;})()));
      if(streams.length>1){
        const first=Math.min(...streams.map(c=>rank[unit.get(c)]));
        for(const row of rows)row.ids=row.ids.filter(c=>!streams.includes(c));
        rows.push({y:first+.1,ids:streams.slice().sort((a,b)=>old.get(a).x-old.get(b).x)});
        rows.splice(0,rows.length,...rows.filter(r=>r.ids.length).sort((a,b)=>a.y-b.y));
        // Keep independent entry chains on their shared entry baseline while
        // aligning their exit-side expanded cores. Extra height belongs to
        // the gap before the core, not above a shorter enclosing stream.
        // This uses measured dependency rows, never module names or roles.
        const height=Math.max(...streams.map(c=>positions.get(c).h));
        for(const child of streams){
          const p=positions.get(child),extra=height-p.h;
          if(extra<=0)continue;
          const record=records.find(r=>r.node===child);
          if(!record)continue;
          const expandedRows=record.rows.map((ids,i)=>({i,ids:ids.filter(id=>positions.get(id)?.expanded)})).filter(r=>r.ids.length);
          const last=expandedRows.at(-1);
          if(!last||last.i===0||last.ids.length!==1)continue;
          const landmark=last.ids[0],members=record.rows.flat(),memberSet=new Set(members);
          if(members.some(id=>{const n=by.get(id);return n.condition||n.mutable||['opaque','control'].includes(n.kind);} ))continue;
          const branchOf=id=>{let at=id;while(at&&!memberSet.has(at))at=idx.nodes.get(at)?.parent;return at;};
          const links=new Map(members.map(id=>[id,new Set()]));
          let guarded=false;
          for(const e of graph.edges){const a=branchOf(e.source),b=branchOf(e.target);if(!a||!b||a===b)continue;
            if(!ordinary(e)||(e.design_route&&e.design_route.kind!=='bypass')||old.context.feedback?.has(e.id)){guarded=true;break;}links.get(a).add(b);
          }
          if(guarded)continue;
          const reaches=(from,to)=>{const todo=[from],seen=new Set();for(let i=0;i<todo.length;i++){const at=todo[i];if(at===to)return true;if(seen.has(at))continue;seen.add(at);todo.push(...links.get(at)||[]);}return false;};
          // Require a strictly ordered corridor at this sibling frontier.
          // Parallel branches, cycles and disconnected islands keep their
          // geometry. A certified forward bypass is still an ordinary use.
          if(members.some((a,i)=>members.slice(i+1).some(b=>reaches(a,b)===reaches(b,a))))continue;
          const boundary=Math.min(...record.rows[last.i].map(id=>positions.get(id).y));
          const shifted=children(child).filter(id=>positions.get(id).y>=boundary);
          for(const id of shifted)positions.get(id).y+=extra;
          p.h=height;record.after.h=height;
          streamAlignments.push({owner:id,stream:child,landmark,extra_height:extra,shifted,
            scope:'Equal measured stream height; the dependency corridor receives slack before its exit-side expanded core. Entry identity, source ownership and every edge remain unchanged.'});
        }
      }
      const gutter=original.design_gutter||0,pad=18,gap=32;
      p.w=Math.max(w,...rows.map(r=>r.ids.reduce((sum,c)=>sum+positions.get(c).w,0)+Math.max(0,r.ids.length-1)*72+pad*2+gutter));
      const bodyWidth=p.w;
      const sideInline=side.length&&side.every(child=>{
        const targets=graph.edges.filter(e=>e.source===child).map(e=>branch(e.target)).filter(Boolean);
        return targets.length&&targets.every(target=>{const row=rows.find(r=>r.ids.includes(target));
          return row?.ids.length===1&&(bodyWidth-gutter-pad*2-positions.get(target).w)/2>=positions.get(child).w+32;});
      });
      if(side.length&&!sideInline)p.w+=Math.max(...side.map(c=>positions.get(c).w))+32;
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
      // A single downstream card follows the unique sibling region that
      // actually supplies it. This does not create a new execution relation.
      const branchOf=target=>{let at=target;while(at&&idx.nodes.get(at)?.parent!==id)at=idx.nodes.get(at)?.parent;return at;};
      for(const row of rows){
        if(row.ids.length!==1)continue;
        const child=row.ids[0],c=positions.get(child);
        if(c.expanded||by.get(child)?.condition||by.get(child)?.mutable)continue;
        const incoming=graph.edges.filter(e=>under(e.target,child));
        if(!incoming.length||incoming.some(e=>!ordinary(e)))continue;
        const origins=[...new Set(incoming.map(e=>branchOf(e.source)).filter(Boolean))];
        if(origins.length!==1||origins[0]===child)continue;
        const from=positions.get(origins[0]);if(!from||from.y>=c.y)continue;
        c.x=Math.max(gutter+pad,Math.min(bodyWidth-pad-c.w,from.x+(from.w-c.w)/2));
        followers.push({node:child,source_scope:origins[0],edges:incoming.map(e=>e.id),
          scope:'A downstream drawing card follows its unique actual source region; canonical relations remain unchanged.'});
      }
      let sideY=p.header;for(const child of side){const c=positions.get(child);
        const consumers=graph.edges.filter(e=>e.source===child).map(e=>positions.get(branchOf(e.target))).filter(Boolean);
        const preferred=consumers.length?Math.min(...consumers.map(p=>p.y)):p.header;
        const placed=Math.max(sideY,preferred);Object.assign(c,{x:sideInline?bodyWidth-pad-c.w:bodyWidth+8,y:placed});sideY=placed+c.h+24;}
      p.h=Math.max(p.h,sideY+pad);
      records.push({node:id,children:kids,rows:rows.map(r=>r.ids),before:{w:original.w,h:original.h},after:{w:p.w,h:p.h},
        scope:'Measured sibling rows and wider cards; dependencies and source ownership unchanged. Row alignment does not assert parallel execution.'});
      return p;
    }
    const roots=nodes.filter(n=>!by.has(idx.nodes.get(n.id)?.parent)).map(n=>n.id);
    let x=32;for(const id of roots){const p=measure(id);p.x=x;p.y=30;x+=p.w+72;}
    // Reverse body rows only. Headings remain above their own body and text
    // is never reflected. The router then recomputes actual upward paths.
    if(state.paperDirection==='up')for(const id of nodes.map(n=>n.id)){
      const p=positions.get(id);if(!p.expanded)continue;
      for(const child of children(id)){const c=positions.get(child);c.y=p.header+p.h-18-c.y-c.h;}
    }
    function absolute(id,dx,dy){const p=positions.get(id),off=state.offsets?.[id]||{};p.x+=dx+(Number(off.x)||0);p.y+=dy+(Number(off.y)||0);for(const child of children(id))absolute(child,p.x,p.y);}
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
      const dock=docks.find(d=>d.node===e.source&&d.kind==='side')||by.get(e.source)?.invocation_binding;
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
    const result={...graph,nodes,idx,positions,bounds,publication:{...graph.publication,composition:{schema:'architecture-composition/1',round:6,direction:state.paperDirection==='up'?'up':'down',records,input_docks:docks,facing,followers,stream_alignments:streamAlignments}}};
    return result;
  }
  function frontier(state,action){
    const copy=E.clone(state);
    if(action==='return'&&copy.paperFrontierReturn)return E.clone(copy.paperFrontierReturn);
    const previous=copy.paperFrontierReturn;
    delete copy.paperFrontierReturn;
    for(const key of ['paperFocus','paperRelation','paperRepresentative','paperRepresentativeGroup','paperRoleDetails','paperRolePaths',
      'paperFrontierRecipe','paperExpressionDetails','paperRolePathStageOwners','paperDiagramPlan','paperDiagramReturn'])delete copy[key];
    Object.assign(copy,{view:'publication',paperMedium:'canvas',paperComposition:'architecture',paperDirection:state.paperDirection||'up',
      paperAuto:true,paperAdaptive:false,paperCompact:true,open:[],offsets:{},paperGranularity:'stages'});
    if(action==='detail'){
      const back=previous||(state.paperGranularity==='stages'?state:copy);
      copy.paperFrontierReturn=E.clone(back);delete copy.paperFrontierReturn.paperFrontierReturn;
      Object.assign(copy,{paperGranularity:'roles',paperRolePathStages:true,paperRoleSourceFrames:true});
    }
    return copy;
  }
  function certifiedDetails(ir,state){
    const defaults={paperSampleFrame:true,paperReadBindingRows:true,paperSourceHeadings:true};
    const first=E.project(ir,{...defaults,...state});
    const requests=first.nodes.filter(n=>n.kind==='composite'&&n.semantic_contracts?.length&&!first.positions.get(n.id).expanded&&
      !n.condition&&!n.mutable&&n.evidence_status!=='runtime-only'&&!n.runtime_evidence?.length).map(n=>n.id);
    const RF=root.SemanticRoleFrontier||(typeof require==='function'?require('./role-frontier.js'):null);
    const paths=[],deferred=[];
    for(const node of requests)for(const c of first.architecture.semantic_contracts||[]){
      if(c.node!==node)continue;
      if(c.members?.some(id=>{const n=first.idx.nodes.get(id);return n&&(n.condition||n.mutable||['opaque','control'].includes(n.kind)||n.evidence_status==='runtime-only'||n.runtime_evidence?.length);} )){
        deferred.push({node,certificate:c.id,reason:'Nested control/effect/unknown scope remains a separately selectable local detail.'});continue;
      }
      for(const ref of RF.references(c.roles,first.idx.nodes)){
        const target=first.idx.nodes.get(ref.node);if(target?.kind!=='compute')continue;
        let at=target,safe=true;
        while(at&&at.id!==node){if(at.condition||at.mutable||['opaque','control'].includes(at.kind)||
          at.evidence_status==='runtime-only'||at.runtime_evidence?.length){safe=false;break;}at=first.idx.nodes.get(at.parent);}
        if(safe&&at?.id===node)paths.push({node,certificate:c.id,role:ref.keys});
      }
    }
    const selected={...state,paperRolePaths:[...(state.paperRolePaths||[]),...paths]};
    const second=paths.length?E.project(ir,{...defaults,...selected}):first;
    const stages=second.nodes.filter(n=>n.contract_stage&&!second.positions.get(n.id).expanded).map(n=>n.id);
    return {...selected,paperAuto:false,open:[...new Set([...second.publication.open,...stages])],
      paperFrontierRecipe:{schema:'certified-detail-frontier/1',nested_candidates:requests,role_paths:paths,nested_deferred:deferred,stage_requests:stages,
        scope:'Safe compute roles of one additional visible certificate layer and the computations of certified local stages. Unknown, conditional, mutable, repeated and independent boundaries retain their own expansion controls.'}};
  }
  const api={compose,frontier,certifiedDetails};root.SemanticCompositionLayout=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

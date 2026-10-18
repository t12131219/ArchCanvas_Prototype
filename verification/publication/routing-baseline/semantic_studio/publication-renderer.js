/* Shared vector figure renderer for the interactive canvas and CLI exports. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const P=root.SemanticPublication||(typeof require==='function'?require('./publication.js'):null);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const css=`.publication text{font-family:Arial,'Noto Sans SC',sans-serif;fill:#293746} .paper-edge{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:1;stroke-dasharray:none}.paper-edge-halo{fill:none;stroke:white;stroke-width:5;stroke-linejoin:round;pointer-events:none}.paper-edge.control{stroke-dasharray:5 4}.paper-port-label{font-size:13px;font-weight:500;fill:#526170}.paper-title{font-weight:600}.paper-caption{fill:#66717f;font-size:13px}`;
  const defs=`<marker id="paper-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M1 1 L9 5 L1 9Z" fill="#5d6b7a" stroke="none"/></marker>`;
  const path=points=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
  function nodeTitle(n,idx){
    const uses=n.boundary_uses||[];
    return [n.label,...uses.map(e=>`${e.id}: ${idx.nodes.get(e.target)?.label||e.target} [${e.target_port}] · ${e.evidence}`)].join('\n');
  }
  function nodeBody(n,p){
    const a=n.paper,symbol=p.symbol,pad=14,header=p.header||p.h;
    const shape=symbol?`<circle cx="24" cy="24" r="23" fill="${a.fill}" stroke="${a.stroke}" stroke-width="1.5"/>`:n.kind==='control'&&!p.expanded?`<path d="M12 0H${p.w-12}L${p.w} ${p.h/2}L${p.w-12} ${p.h}H12L0 ${p.h/2}Z" fill="${a.fill}" stroke="${a.stroke}"/>`:`<rect width="${p.w}" height="${p.h}" rx="${n.kind==='interface'&&!p.expanded?Math.min(22,p.h/2):p.expanded?10:7}" fill="${p.expanded?'#ffffff':a.fill}" stroke="${a.stroke}" stroke-width="${p.expanded?1.3:1.1}" ${n.kind==='opaque'?'stroke-dasharray="4 3"':''}/>`;
    if(symbol)return `${shape}<text x="24" y="33" text-anchor="middle" font-size="28" class="paper-title">${symbol}</text>`;
    const title=`<text x="${pad}" y="${n.kind==='interface'&&a.lines.length===1&&!a.captions.length?p.h/2+5:24}" font-size="${a.font}" class="paper-title">${a.lines.map((line,i)=>`<tspan x="${pad}" dy="${i?20:0}">${esc(line)}</tspan>`).join('')}</text>`;
    const caption=a.captions.length?`<text x="${pad}" y="${25+a.lines.length*20}" class="paper-caption">${a.captions.map((line,i)=>`<tspan x="${pad}" dy="${i?16:0}">${esc(line)}</tspan>`).join('')}</text>`:'';
    const line=p.expanded?`<path d="M1 ${header-10} H${p.w-1}" stroke="#e8edf2" fill="none"/>`:'';
    return shape+line+title+caption;
  }
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  function lineGeometry(routes){
    const overlaps=[];let crossings=0;
    for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
      const first=routes[i],second=routes[j];let sharedLength=0;
      for(let a=1;a<first.route.points.length;a++)for(let b=1;b<second.route.points.length;b++){
        const p=first.route.points[a-1],q=first.route.points[a],u=second.route.points[b-1],v=second.route.points[b],vertical=p.x===q.x,otherVertical=u.x===v.x;
        if(vertical===otherVertical){
          if(vertical?p.x!==u.x:p.y!==u.y)continue;
          const length=vertical?Math.min(Math.max(p.y,q.y),Math.max(u.y,v.y))-Math.max(Math.min(p.y,q.y),Math.min(u.y,v.y)):Math.min(Math.max(p.x,q.x),Math.max(u.x,v.x))-Math.max(Math.min(p.x,q.x),Math.min(u.x,v.x));
          if(length>8)sharedLength+=length;
        }else{
          const [a,b,c,d]=vertical?[p,q,u,v]:[u,v,p,q];
          if(a.x>Math.min(c.x,d.x)&&a.x<Math.max(c.x,d.x)&&c.y>Math.min(a.y,b.y)&&c.y<Math.max(a.y,b.y))crossings++;
        }
      }
      if(sharedLength)overlaps.push({edges:[first.id,second.id],length:sharedLength,same_value:first.resolved_source===second.resolved_source&&first.source_port===second.source_port});
    }
    return {crossings,overlapping_paths:overlaps};
  }
  function labels(graph,routes){
    const placed=[],suppressed=[],obstacles=graph.nodes.map(n=>{const p=graph.positions.get(n.id);return p.expanded?{x:p.x,y:p.y,w:p.w,h:p.header-10}:p;});
    for(const item of routes){
      const text=[...new Set((item.paper_labels||[]).map(l=>l.text))].join(' · ');if(!text)continue;
      const w=P.width(text,13)+12,h=23,candidates=[];
      for(let i=1;i<item.route.points.length;i++){
        const a=item.route.points[i-1],b=item.route.points[i],len=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
        if(len<24)continue;
        for(const f of [.5,.3,.7,.15,.85]){const x=a.x+(b.x-a.x)*f,y=a.y+(b.y-a.y)*f;
          // A short dogleg may still have enough free space around it. Let
          // obstacle checks decide whether the whole label fits beside it.
          if(a.y===b.y)candidates.push({x:x-w/2,y:y-h-4,w,h},{x:x-w/2,y:y+4,w,h});
          if(a.x===b.x&&len>=h+8)candidates.push({x:x+8,y:y-h/2,w,h},{x:x-w-8,y:y-h/2,w,h});
        }
        // A label may interrupt its own straight edge with a white knockout.
        // This keeps long branch labels between nearby parallel paths instead
        // of pushing them across another edge. End positions permit staggering.
        if(a.x===b.x&&len>=h+8)for(const f of [(h/2+4)/len,1-(h/2+4)/len,.5]){
          const y=a.y+(b.y-a.y)*f;candidates.push({x:a.x-w/2,y:y-h/2,w,h,knockout:true});
        }
      }
      const cutsOtherEdge=box=>routes.some(other=>other.id!==item.id&&other.route.points.some((b,i)=>{if(!i)return false;const a=other.route.points[i-1];return a.x===b.x?a.x>box.x&&a.x<box.x+box.w&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.h:a.y>box.y&&a.y<box.y+box.h&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.w;}));
      const box=candidates.find(b=>!obstacles.some(o=>overlap(b,o))&&!placed.some(o=>overlap(b,o))&&!cutsOtherEdge(b));
      if(box)placed.push({...box,text,edge:item.id});else suppressed.push({edge:item.id,text,evidence:item.paper_labels});
    }
    return {placed,suppressed};
  }
  function prepare(graph){
    const context=graph.positions.context;context.routeCache=new Map();context.reserved=[];
    const distance=e=>{const a=graph.positions.get(e.source),b=graph.positions.get(e.target);return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);};
    for(const e of graph.edges.slice().sort((a,b)=>distance(a)-distance(b)||a.id.localeCompare(b.id))){const route=E.route(e,graph.positions);context.routeCache.set(e.id,route);for(let i=1;i<route.points.length;i++)context.reserved.push([route.points[i-1],route.points[i]]);}
    const routes=graph.edges.map(e=>({...e,route:context.routeCache.get(e.id)})),b={...graph.bounds},labeling=labels(graph,routes);
    const boxes=[...routes.flatMap(e=>e.route.points.map(p=>({x:p.x-14,y:p.y-14,w:28,h:28}))),...labeling.placed];
    for(const p of boxes){const right=b.x+b.w,bottom=b.y+b.h;b.x=Math.min(b.x,p.x-8);b.y=Math.min(b.y,p.y-8);b.w=Math.max(right,p.x+p.w+8)-b.x;b.h=Math.max(bottom,p.y+p.h+8)-b.y;}
    const failures=routes.filter(e=>!e.route.ok).map(e=>({id:e.id,reason:e.route.reason}));
    const notes=labeling.suppressed.map(l=>{const e=graph.edges.find(e=>e.id===l.edge);return `${graph.idx.nodes.get(e.source).label} → ${graph.idx.nodes.get(e.target).label}: ${l.text}`;}),noteLines=notes.flatMap(s=>P.wrap(s,b.w-28,13));
    const noteHeight=noteLines.length?20+noteLines.length*17:0,totalH=b.h+noteHeight;
    // Width is a maximum column width. Small tall circuits should use less
    // column width instead of being enlarged to 20pt text and a second page.
    const physicalWidth=graph.publication.fit_page?Math.min(graph.publication.paper_width_mm,240*b.w/totalH):graph.publication.paper_width_mm;
    const printScale=physicalWidth/25.4*72/b.w,minFontPt=Math.min(...graph.nodes.map(n=>n.paper.captions.length?13:n.paper.font),...(labeling.placed.length||noteLines.length?[13]:[]))*printScale;
    const quality={schema:'publication-quality/1',min_print_font_pt:Number(minFontPt.toFixed(2)),target_min_font_pt:8,
      requested_width_mm:graph.publication.paper_width_mm,width_mm:physicalWidth,height_mm:Number((physicalWidth*totalH/b.w).toFixed(1)),
      route_failures:failures,unplaced_port_labels:labeling.suppressed,line_geometry:lineGeometry(routes),issues:[]};
    if(minFontPt<8)quality.issues.push('font-below-8pt');
    if(quality.height_mm>245)quality.issues.push('figure-taller-than-245mm');
    if(failures.length)quality.issues.push('route-failure');
    if(quality.line_geometry.overlapping_paths.some(p=>!p.same_value))quality.issues.push('edge-path-overlap');
    if(labeling.suppressed.length)quality.issues.push('port-label-requires-note');
    return {routes,bounds:b,labeling,quality,notes,noteLines,totalH};
  }
  function edgeBody(e){
    const d=path(e.route.points),color=!e.route.ok?'#b16d39':e.evidence==='runtime-tensor'?'#347b68':e.kind==='control'?'#aa9256':'#617487';
    const bundle=e.bundle_members?` data-bundle-members="${esc(JSON.stringify(e.bundle_members.map(m=>m.id)))}" style="stroke-width:3"`:'';
    const title=e.bundle_members?e.bundle_members.map(m=>`${m.id}: ${m.canonical_source}[${m.source_port}] → ${m.canonical_target}[${m.target_port}]`).join('\n'):e.source_port+' → '+e.target_port+' · '+e.evidence;
    return `<path class="paper-edge-halo" d="${d}"/><path class="edge paper-edge ${e.kind==='control'?'control':''}" data-edge-id="${esc(e.id)}" data-route-valid="${e.route.ok}" data-canonical-source="${esc(e.canonical_source)}" data-canonical-target="${esc(e.canonical_target)}"${bundle} d="${d}" stroke="${color}" marker-end="url(#paper-arrow)"><title>${esc(title)}</title></path>`;
  }
  function labelBody(label){return `<g class="paper-label" data-label-edge="${esc(label.edge)}"><rect x="${label.x}" y="${label.y}" width="${label.w}" height="${label.h}" rx="4" fill="#fff" fill-opacity=".96"/><text x="${label.x+6}" y="${label.y+16}" class="paper-port-label">${esc(label.text)}</text></g>`;}
  function render(ir,state){
    E.validate(ir);state={...state,view:'publication'};const g=E.project(ir,state),prepared=prepare(g),{bounds:b,routes,labeling,quality}=prepared;
    const frames=[],nodes=[];
    for(const n of g.nodes){const p=g.positions.get(n.id),body=`<g class="node" data-node-id="${esc(n.id)}" data-id="${esc(n.id)}" transform="translate(${p.x},${p.y})"><title>${esc(nodeTitle(n,g.idx))}</title>${nodeBody(n,p)}</g>`;(p.expanded?frames:nodes).push(body);}
    // Crossing halos express overpasses, never junctions. Separate canonical
    // edges and terminals remain individually inspectable in the vector file.
    const {notes,noteLines,totalH}=prepared;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" class="publication" width="${quality.width_mm}mm" height="${quality.width_mm*totalH/b.w}mm" viewBox="${b.x} ${b.y} ${b.w} ${totalH}" role="img" aria-label="${esc(ir.title)}"><title>${esc(ir.title)} · architecture</title><desc>Source-backed architecture; unresolved regions remain explicit. Crossings without a node are not junctions. ${esc(notes.join('; '))}</desc><metadata>${esc(JSON.stringify({schema:'archcanvas-publication/1',canonical_digest:ir.ir_digest,quality}))}</metadata><style>${css}</style><defs>${defs}</defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${totalH}" fill="#fff"/><g id="frames">${frames.join('')}</g><g id="edges">${routes.map(edgeBody).join('')}</g><g id="nodes">${nodes.join('')}</g><g id="port-labels">${labeling.placed.map(labelBody).join('')}</g>${noteLines.length?`<text x="${b.x+14}" y="${b.y+b.h+20}" class="paper-port-label">${noteLines.map((line,i)=>`<tspan x="${b.x+14}" dy="${i?17:0}">${esc(line)}</tspan>`).join('')}</text>`:''}</svg>\n`;
    return {svg,graph:g,prepared,document:{schema:'archcanvas-architecture-document/1',ir,state,architecture:g.architecture,publication:g.publication,
      layout:{bounds:{...b,h:totalH},nodes:[...g.positions.values()],edges:routes,edge_accounting:g.edge_accounting,node_accounting:g.node_accounting,representatives:g.representatives,labels:labeling.placed},
      diagnostics:{route_failures:quality.route_failures,publication:quality}}};
  }
  const api={css,defs,nodeTitle,nodeBody,edgeBody,labelBody,prepare,render,overlap,lineGeometry};root.SemanticPublicationRenderer=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

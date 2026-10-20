/* Shared vector figure renderer for the interactive canvas and CLI exports. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('./architecture-layout.js'):null);
  const P=root.SemanticPublication||(typeof require==='function'?require('./publication.js'):null);
  const Goals=root.SemanticExpressionGoals||(typeof require==='function'?require('./expression-goals.js'):null);
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const css=`.publication text{font-family:Arial,'Noto Sans SC',sans-serif;fill:#293746} .paper-edge{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:1;stroke-dasharray:none}.paper-edge-halo{fill:none;stroke:white;stroke-width:5;stroke-linejoin:round;pointer-events:none}.paper-edge.control{stroke-dasharray:5 4}.paper-port-label{font-size:13px;font-weight:500;fill:#526170}.paper-title{font-weight:600}.paper-caption{fill:#66717f;font-size:13px}`;
  const defs=`<marker id="paper-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M1 1 L9 5 L1 9Z" fill="#5d6b7a" stroke="none"/></marker>`;
  const path=points=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
  // Canvas legibility is measured at the SVG's native CSS scale. Print
  // estimates remain informational there and must not choose its frontier.
  const fontMetric=q=>q.medium==='canvas'?q.min_canvas_font_px:q.min_print_font_pt;
  const fontFloor=q=>q.medium==='canvas'?12:8;
  const areaMetric=q=>q.medium==='canvas'?q.native_width_px*q.native_height_px:q.width_mm*q.height_mm;
  function nodeTitle(n,idx){
    const uses=n.boundary_uses||[];
    const contents=n.content_inventory;
    return [n.label,...(n.contract_stage?['Certified role subregion: '+n.contract_stage.certificate,n.contract_stage.scope,'Original operations remain individually expandable.']:[]),...(n.local_pipeline?['Local dependency path: '+n.local_pipeline.operations.map(o=>o.label).join(' → '),n.local_pipeline.scope]:[]),...(n.role_annotations||[]).map(r=>'Certified role: '+r.role+' · '+r.certificate+' · '+r.scope),...(n.frame_ownership||[]).map(r=>'Source ownership: '+r.label+' ['+r.node+'] · '+r.kind+' · '+r.scope),...(n.source_label?['Source label: '+n.source_label]:[]),
      ...(n.contract_evidence||[]).flatMap(c=>[c.rule+': '+c.scope,...c.proof,'Not asserted: '+c.not_asserted.join('; ')]),
      ...(n.observed_calls?[`${n.observed_calls.observations.length} observed calls; ${n.observed_calls.basis}`]:[]),
      ...(contents?['Contents of extracted units (unordered; parameter sharing not asserted):',
      ...contents.terms.map(t=>`${t.label} × ${t.count}`),...contents.units.map(u=>`${u.label}: ${u.term} · ${u.evidence_status}`)]:[]),
      ...uses.map(e=>`${e.id}: ${idx.nodes.get(e.target)?.label||e.target} [${e.target_port}] · ${e.evidence}`)].join('\n');
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
    const overlaps=[],contacts=[];let crossings=0;
    for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
      const first=routes[i],second=routes[j],touches=new Set();let sharedLength=0;
      const sameValue=first.resolved_source===second.resolved_source&&first.source_port===second.source_port;
      for(let a=1;a<first.route.points.length;a++)for(let b=1;b<second.route.points.length;b++){
        const p=first.route.points[a-1],q=first.route.points[a],u=second.route.points[b-1],v=second.route.points[b],vertical=p.x===q.x,otherVertical=u.x===v.x;
        if(vertical===otherVertical){
          if(vertical?p.x!==u.x:p.y!==u.y)continue;
          const length=vertical?Math.min(Math.max(p.y,q.y),Math.max(u.y,v.y))-Math.max(Math.min(p.y,q.y),Math.min(u.y,v.y)):Math.min(Math.max(p.x,q.x),Math.max(u.x,v.x))-Math.max(Math.min(p.x,q.x),Math.min(u.x,v.x));
          if(length>8)sharedLength+=length;
        }else{
          const [a,b,c,d]=vertical?[p,q,u,v]:[u,v,p,q];
          if(a.x>Math.min(c.x,d.x)&&a.x<Math.max(c.x,d.x)&&c.y>Math.min(a.y,b.y)&&c.y<Math.max(a.y,b.y))crossings++;
          else if(!sameValue&&a.x>=Math.min(c.x,d.x)&&a.x<=Math.max(c.x,d.x)&&c.y>=Math.min(a.y,b.y)&&c.y<=Math.max(a.y,b.y)){
            const endpoint=edge=>[edge.route.points[0],edge.route.points.at(-1)].some(p=>p.x===a.x&&p.y===c.y);
            // A bend touching another wire is visually a junction even though
            // strict segment-interior crossing tests do not count it.
            if(!(endpoint(first)&&endpoint(second)))touches.add(JSON.stringify([a.x,c.y]));
          }
        }
      }
      if(sharedLength)overlaps.push({edges:[first.id,second.id],length:sharedLength,same_value:sameValue});
      for(const p of touches){const [x,y]=JSON.parse(p);contacts.push({edges:[first.id,second.id],x,y});}
    }
    return {crossings,overlapping_paths:overlaps,unrelated_contacts:contacts};
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
          if(a.y===b.y)candidates.push({x:x-w/2,y:y-h-4,w,h},{x:x-w/2,y:y+4,w,h},{x:x-w/2,y:y-h/2,w,h,knockout:true});
          if(a.x===b.x&&len>=h+4)candidates.push({x:x+8,y:y-h/2,w,h},{x:x-w-8,y:y-h/2,w,h});
        }
        // A label may interrupt its own straight edge with a white knockout.
        // This keeps long branch labels between nearby parallel paths instead
        // of pushing them across another edge. End positions permit staggering.
        if(a.x===b.x&&len>=h+4)for(const f of [(h/2+4)/len,1-(h/2+4)/len,.5]){
          const y=a.y+(b.y-a.y)*f;candidates.push({x:a.x-w/2,y:y-h/2,w,h,knockout:true});
        }
      }
      const cutsOtherEdge=box=>routes.some(other=>other.id!==item.id&&other.route.points.some((b,i)=>{if(!i)return false;const a=other.route.points[i-1];return a.x===b.x?a.x>box.x&&a.x<box.x+box.w&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.h:a.y>box.y&&a.y<box.y+box.h&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.w;}));
      const box=candidates.find(b=>!obstacles.some(o=>overlap(b,o))&&!placed.some(o=>overlap(b,o))&&!cutsOtherEdge(b));
      if(box)placed.push({...box,text,edge:item.id});else suppressed.push({edge:item.id,text,evidence:item.paper_labels});
    }
    return {placed,suppressed};
  }
  function prepareTrial(graph,strategy){
    const context=graph.positions.context;context.routeCache=new Map();context.reserved=[];
    context.portOrder=strategy.startsWith('neighbors')?'neighbors':'canonical';
    context.ancestorPorts=strategy.includes('-header-')?'header':'boundary';
    context.crossingCost=strategy.includes('-clear-')?90:18;context.contactCost=0;context.stubLength=16;
    const distance=e=>{const a=graph.positions.get(e.source),b=graph.positions.get(e.target);return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);};
    const direction=strategy.endsWith('long')?-1:1;
    for(const e of graph.edges.slice().sort((a,b)=>direction*(distance(a)-distance(b))||a.id.localeCompare(b.id))){const route=E.route(e,graph.positions);context.routeCache.set(e.id,route);for(let i=1;i<route.points.length;i++)context.reserved.push([route.points[i-1],route.points[i]]);}
    return evaluateRoutes(graph,graph.edges.map(e=>({...e,route:context.routeCache.get(e.id)})),strategy);
  }
  function evaluateRoutes(graph,routes,strategy){
    const b={...graph.bounds},labeling=labels(graph,routes);
    const boxes=[...routes.flatMap(e=>e.route.points.map(p=>({x:p.x-14,y:p.y-14,w:28,h:28}))),...labeling.placed];
    for(const p of boxes){const right=b.x+b.w,bottom=b.y+b.h;b.x=Math.min(b.x,p.x-8);b.y=Math.min(b.y,p.y-8);b.w=Math.max(right,p.x+p.w+8)-b.x;b.h=Math.max(bottom,p.y+p.h+8)-b.y;}
    const failures=routes.filter(e=>!e.route.ok).map(e=>({id:e.id,reason:e.route.reason}));
    const notes=labeling.suppressed.map(l=>{const e=graph.edges.find(e=>e.id===l.edge);return `${graph.idx.nodes.get(e.source).label} → ${graph.idx.nodes.get(e.target).label}: ${l.text}`;}),noteLines=notes.flatMap(s=>P.wrap(s,b.w-28,13));
    const noteHeight=noteLines.length?20+noteLines.length*17:0,totalH=b.h+noteHeight;
    // Width is a maximum column width. Small tall circuits should use less
    // column width instead of being enlarged to 20pt text and a second page.
    const physicalWidth=graph.publication.fit_page?Math.min(graph.publication.paper_width_mm,240*b.w/totalH):graph.publication.paper_width_mm;
    const minNativeFont=Math.min(...graph.nodes.map(n=>n.paper.captions.length?13:n.paper.font),...(labeling.placed.length||noteLines.length?[13]:[]));
    const printScale=physicalWidth/25.4*72/b.w,minFontPt=minNativeFont*printScale;
    const wireLength=routes.reduce((s,e)=>s+e.route.points.slice(1).reduce((s,p,i)=>s+Math.abs(p.x-e.route.points[i].x)+Math.abs(p.y-e.route.points[i].y),0),0);
    const quality={schema:'publication-quality/1',route_strategy:strategy,wire_length:Number(wireLength.toFixed(1)),min_print_font_pt:Number(minFontPt.toFixed(2)),target_min_font_pt:8,
      requested_width_mm:graph.publication.paper_width_mm,width_mm:physicalWidth,height_mm:Number((physicalWidth*totalH/b.w).toFixed(1)),
      route_failures:failures,unplaced_port_labels:labeling.suppressed,line_geometry:lineGeometry(routes),issues:[]};
    if(graph.publication.medium==='canvas'){
      const limits=graph.publication.canvas_limits;
      Object.assign(quality,{schema:'publication-quality/2',medium:'canvas',scale_scope:'native-svg-css-pixels; viewport zoom is separate',
        native_width_px:b.w,native_height_px:totalH,min_canvas_font_px:minNativeFont,target_min_canvas_font_px:12,canvas_limits:limits});
      if(minNativeFont<12)quality.issues.push('canvas-font-below-12px');
      if(b.w>limits.width_px)quality.issues.push('canvas-width-budget');
      if(totalH>limits.height_px)quality.issues.push('canvas-height-budget');
      if(b.w*totalH>limits.area_px2)quality.issues.push('canvas-area-budget');
      if(graph.nodes.length>limits.nodes)quality.issues.push('canvas-node-budget');
      if(graph.edges.length>limits.edges)quality.issues.push('canvas-edge-budget');
    }else{
      if(minFontPt<8)quality.issues.push('font-below-8pt');
      if(quality.height_mm>245)quality.issues.push('figure-taller-than-245mm');
    }
    if(failures.length)quality.issues.push('route-failure');
    if(quality.line_geometry.overlapping_paths.some(p=>!p.same_value))quality.issues.push('edge-path-overlap');
    if(labeling.suppressed.length)quality.issues.push('port-label-requires-note');
    return {routes,bounds:b,labeling,quality,notes,noteLines,totalH};
  }
  function prepare(graph){
    const baseline=prepareTrial(graph,'canonical-short'),trials=[baseline];let best=baseline;
    if(baseline.quality.line_geometry.crossings||baseline.quality.issues.length){
      const strategies=['neighbors-short','neighbors-long','canonical-long','neighbors-clear-short','neighbors-clear-long'];
      if(graph.edges.some(e=>e.kind==='control'&&(graph.positions.get(e.source).expanded||graph.positions.get(e.target).expanded)))strategies.push('neighbors-header-short','neighbors-header-long');
      for(const strategy of strategies){
        const trial=prepareTrial(graph,strategy),q=trial.quality,b=best.quality;
        trials.push(trial);
        // Reduce crossings only while preserving each baseline quality gate.
        // Physical scale and label placement are checked after route bounds.
        if(q.issues.some(issue=>!baseline.quality.issues.includes(issue))||q.route_failures.length>baseline.quality.route_failures.length||q.unplaced_port_labels.length>baseline.quality.unplaced_port_labels.length||fontMetric(q)<Math.min(fontFloor(q),fontMetric(baseline.quality)))continue;
        if(q.issues.length<b.issues.length||q.issues.length===b.issues.length&&(q.line_geometry.crossings<b.line_geometry.crossings||q.line_geometry.crossings===b.line_geometry.crossings&&q.wire_length<b.wire_length*.99))best=trial;
      }
    }
    // Earlier greedy routes have never seen later wires. Revisit the most
    // crossed edges with all other selected routes reserved. Keep each trial
    // local: rejected routes must not leak into the cache or reservations.
    const refinement={attempts:0,accepted:[],before_crossings:best.quality.line_geometry.crossings,before_contacts:best.quality.line_geometry.unrelated_contacts.length};
    const segments=routes=>routes.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
    if((best.quality.line_geometry.crossings||best.quality.line_geometry.unrelated_contacts.length)&&graph.edges.length<=128){
      const context=graph.positions.context,strategy=best.quality.route_strategy;
      context.portOrder=strategy.startsWith('neighbors')?'neighbors':'canonical';
      context.ancestorPorts=strategy.includes('-header-')?'header':'boundary';
      // Finish the crossing pass first. A separate contact pass also reaches
      // zero-crossing diagrams and may remove a false junction without having
      // to improve the crossing count at the same time.
      // A final bounded pass may replace ambiguous contacts by one additional
      // explicit overpass. Keep the ordinary monotone repairs first, and only
      // An ambiguous contact costs twice an explicit overpass: replacing one
      // false junction with one crossing improves interpretation. Retain the
      // one-crossing ceiling and require a smaller weighted conflict count.
      for(const phase of (graph.edges.length<=64?['crossings','contacts','separation']:['contacts','separation'])){
      const separation=phase==='separation',crossingCeiling=Math.min(baseline.quality.line_geometry.crossings,best.quality.line_geometry.crossings+1);
      for(let pass=0;pass<(separation?1:2);pass++){
        let improved=false;
        const score=geometry=>phase==='crossings'?geometry.crossings:geometry.unrelated_contacts.length;
        const scored=best.routes.map(e=>({id:e.id,score:best.routes.reduce((s,other)=>s+(other.id===e.id?0:score(lineGeometry([e,other]))),0)}))
          .filter(e=>e.score).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,separation?4:8);
        for(const edge of scored){
          if(!score(best.quality.line_geometry))break;
          // Fixed 16-unit stubs can themselves meet in a 32-unit row gap.
          // Contact repair may shorten their lead-in while keeping the exact
          // physical terminal and canonical operand unchanged.
          const policies=phase!=='crossings'?[[180,16],[540,16],[540,12],[540,8]]:[[180,16],[540,16]];
          for(const [crossingCost,stubLength]of policies){
            const current=best.routes.find(e=>e.id===edge.id);
            context.routeCache=new Map();context.reserved=segments(best.routes.filter(e=>e.id!==edge.id));context.crossingCost=crossingCost;context.contactCost=crossingCost*(phase==='crossings'?1:2);context.stubLength=stubLength;
            const route=E.route(current,graph.positions);refinement.attempts++;
            if(!route.ok)continue;
            const candidate=evaluateRoutes(graph,best.routes.map(e=>e.id===edge.id?{...e,route}:e),strategy),q=candidate.quality,b=best.quality;
            const contactPairs=new Set(b.line_geometry.unrelated_contacts.map(c=>JSON.stringify(c.edges)));
            if(q.line_geometry.unrelated_contacts.some(c=>!contactPairs.has(JSON.stringify(c.edges))))continue;
            const extraCrossings=q.line_geometry.crossings-b.line_geometry.crossings;
            if(extraCrossings>0&&(!separation||q.line_geometry.crossings>crossingCeiling||extraCrossings>=2*(b.line_geometry.unrelated_contacts.length-q.line_geometry.unrelated_contacts.length)))continue;
            if(score(q.line_geometry)>=score(b.line_geometry)||q.line_geometry.unrelated_contacts.length>b.line_geometry.unrelated_contacts.length||q.issues.some(issue=>!b.issues.includes(issue))||q.issues.length>b.issues.length||
              q.route_failures.length>b.route_failures.length||q.unplaced_port_labels.length>b.unplaced_port_labels.length||fontMetric(q)<Math.min(fontFloor(q),fontMetric(b)))continue;
            refinement.accepted.push({phase,edge:edge.id,crossing_cost:crossingCost,stub_length:stubLength,crossings:[b.line_geometry.crossings,q.line_geometry.crossings],contacts:[b.line_geometry.unrelated_contacts.length,q.line_geometry.unrelated_contacts.length],...(extraCrossings>0?{tradeoff:'contacts-to-crossings'}:{})});
            best=candidate;improved=true;break;
          }
        }
        if(!improved)break;
      }
      }
    }
    refinement.after_crossings=best.quality.line_geometry.crossings;
    refinement.after_contacts=best.quality.line_geometry.unrelated_contacts.length;
    const context=graph.positions.context;
    context.portOrder=best.quality.route_strategy.startsWith('neighbors')?'neighbors':'canonical';
    context.ancestorPorts=best.quality.route_strategy.includes('-header-')?'header':'boundary';
    context.crossingCost=best.quality.route_strategy.includes('-clear-')?90:18;
    context.contactCost=0;context.stubLength=16;
    context.routeCache=new Map(best.routes.map(e=>[e.id,e.route]));
    context.reserved=best.routes.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
    return {...best,routing:{selected:best.quality.route_strategy,baseline_crossings:baseline.quality.line_geometry.crossings,refinement,
      candidates:trials.map(t=>({strategy:t.quality.route_strategy,crossings:t.quality.line_geometry.crossings,
        issues:t.quality.issues,wire_length:t.quality.wire_length,min_print_font_pt:t.quality.min_print_font_pt,route_failures:t.quality.route_failures.length,unplaced_labels:t.quality.unplaced_port_labels.length}))}};
  }
  function edgeBody(e){
    const d=path(e.route.points),color=!e.route.ok?'#b16d39':e.evidence==='runtime-tensor'?'#347b68':e.kind==='control'?'#aa9256':'#617487';
    const bundle=e.bundle_members?` data-bundle-members="${esc(JSON.stringify(e.bundle_members.map(m=>m.id)))}" data-bundle-endpoints="${esc(JSON.stringify(e.bundle_members.map(m=>({id:m.id,source:m.canonical_source,target:m.canonical_target}))))}" style="stroke-width:3"`:'';
    const canonical=e.bundle_members?'':` data-canonical-source="${esc(e.canonical_source)}" data-canonical-target="${esc(e.canonical_target)}"`;
    const title=e.bundle_members?e.bundle_members.map(m=>`${m.id}: ${m.canonical_source}[${m.source_port}] → ${m.canonical_target}[${m.target_port}]`).join('\n'):e.source_port+' → '+e.target_port+' · '+e.evidence;
    const channel=e.context_lane?` data-context-owner="${esc(e.context_lane.owner)}" data-context-side="${esc(e.context_lane.side)}"`:'';
    const design=e.design_route?` data-design-route="${esc(e.design_route.kind)}" data-design-certificate="${esc(e.design_route.certificate)}"`:'';
    const ports=` data-source-port="${esc(e.source_port)}" data-target-port="${esc(e.target_port)}" data-semantic-bindings="${esc(JSON.stringify(e.semantic_bindings||[]))}"`;
    return `<path class="paper-edge-halo" d="${d}"/><path class="edge paper-edge ${e.kind==='control'?'control':''}" data-edge-id="${esc(e.id)}" data-route-valid="${e.route.ok}"${canonical}${bundle}${design}${channel}${ports} d="${d}" stroke="${color}" marker-end="url(#paper-arrow)"><title>${esc(title)}</title></path>`;
  }
  function labelBody(label){return `<g class="paper-label" data-label-edge="${esc(label.edge)}"><rect x="${label.x}" y="${label.y}" width="${label.w}" height="${label.h}" rx="4" fill="#fff" fill-opacity=".96"/><text x="${label.x+6}" y="${label.y+16}" class="paper-port-label">${esc(label.text)}</text></g>`;}
  function prepareLabels(ir,state){
    let graph=E.project(ir,{...state,view:'publication'}),prepared=prepare(graph);
    // Print-scale optimization can squeeze recurrent/branch labels into a gap
    // that routes fit but text does not. Recheck a bounded set of larger gaps
    // only after actual label placement fails, keeping user positions intact.
    if(!prepared.quality.unplaced_port_labels.length||(state.paperAuto===false&&prepared.quality.medium!=='canvas')||Object.keys(state.offsets||{}).length)return {graph,prepared};
    const baseline=prepared.quality,candidates=[];
    for(const gap of [60,84,112]){
      const trialGraph=E.project(ir,{...state,view:'publication',paperLabelGapY:gap}),trial=prepare(trialGraph),q=trial.quality,b=prepared.quality;
      const accepted=q.unplaced_port_labels.length<b.unplaced_port_labels.length&&q.issues.every(issue=>baseline.issues.includes(issue))&&
        fontMetric(q)>=Math.min(fontFloor(q),fontMetric(baseline))&&q.route_failures.length<=baseline.route_failures.length&&
        q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length;
      candidates.push({gap_y:gap,unplaced_labels:q.unplaced_port_labels.length,min_print_font_pt:q.min_print_font_pt,
        issues:q.issues,crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,accepted});
      if(accepted){graph=trialGraph;prepared=trial;}
      if(!prepared.quality.unplaced_port_labels.length)break;
    }
    prepared.routing.layout_refinement={reason:'unplaced-port-labels',before_unplaced_labels:baseline.unplaced_port_labels.length,
      after_unplaced_labels:prepared.quality.unplaced_port_labels.length,candidates};
    return {graph,prepared};
  }
  function prepareTopology(ir,state={}){
    const baseline=prepareLabels(ir,state),b=baseline.prepared.quality;
    // Evaluate one topology alternative only where routed crossings remain.
    // Each candidate receives the same print fitting, routing and label checks.
    // Manual node positions and explicit profiles are not replaced. On a
    // canvas, manual folding selects evidence detail, not a layout profile.
    if((state.paperAuto===false&&b.medium!=='canvas')||state.paperRankStrategy||Object.keys(state.offsets||{}).length||
      !b.line_geometry.crossings||baseline.graph.edges.length>64)return baseline;
    const trial=prepareLabels(ir,{...state,paperRankStrategy:'consumer'}),q=trial.prepared.quality;
    const accepted=q.line_geometry.crossings<b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
      q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      areaMetric(q)<=areaMetric(b)*1.1&&q.wire_length<=b.wire_length*1.1;
    const chosen=accepted?trial:baseline;
    const metrics=q=>({crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,
      issues:q.issues,min_print_font_pt:q.min_print_font_pt,unplaced_labels:q.unplaced_port_labels.length,
      route_failures:q.route_failures.length,width_mm:q.width_mm,height_mm:q.height_mm,wire_length:q.wire_length});
    chosen.prepared.routing.topology_refinement={strategy:'consumer',accepted,before:metrics(b),candidate:metrics(q),
      selected:accepted?'consumer':'earliest',max_area_ratio:1.1,max_wire_ratio:1.1};
    return chosen;
  }
  function prepareContext(ir,state={}){
    const baseline=prepareTopology(ir,state),b=baseline.prepared.quality;
    // Context entries are a soft geometry proposal, never a semantic rule.
    // Automatic selection must preserve the frontier and all quality gates.
    if(b.medium!=='canvas'||baseline.graph.publication.granularity!=='roles'||state.paperContextLanes!==undefined||
      Object.keys(state.offsets||{}).length||!b.line_geometry.crossings||baseline.graph.edges.length>128||!L.contextEntries(baseline.graph.idx,new Set(baseline.graph.positions.keys()),baseline.graph.edges).length)return baseline;
    const trial=prepareTopology(ir,{...state,paperContextLanes:'left'}),q=trial.prepared.quality;
    if(!trial.graph.positions.context.contextLanes.length)return baseline;
    const identity=g=>JSON.stringify({nodes:g.nodes.map(n=>n.id),edges:g.edges.map(e=>({id:e.id,source:e.source,target:e.target,
      source_port:e.source_port,target_port:e.target_port,originals:e.originals,bundle_members:e.bundle_members,kind:e.kind,condition:e.condition}))});
    const accepted=identity(baseline.graph)===identity(trial.graph)&&q.line_geometry.crossings<b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
      q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=Math.min(fontMetric(b),fontFloor(q))&&
      areaMetric(q)<=areaMetric(b)*1.15&&q.wire_length<=b.wire_length*1.1;
    const chosen=accepted?trial:baseline,metrics=q=>({crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,
      issues:q.issues,wire_length:q.wire_length,width:q.native_width_px,height:q.native_height_px});
    chosen.prepared.routing.context_refinement={strategy:'left',accepted,before:metrics(b),candidate:metrics(q),
      candidates:trial.graph.positions.context.contextLanes.length,max_area_ratio:1.15,max_wire_ratio:1.1,
      scope:'measured visible dependency geometry; no semantic or execution claim'};
    return chosen;
  }
  function prepareBranches(ir,state={}){
    const baseline=prepareContext(ir,state),b=baseline.prepared.quality;
    if(b.medium!=='canvas'||baseline.graph.publication.granularity!=='roles'||state.paperBranchColumns!==undefined||
      Object.keys(state.offsets||{}).length||baseline.graph.edges.length>128)return baseline;
    const channel=baseline.graph.positions.context.contextLanes[0]?.side||false;
    const candidateState={...state,paperBranchColumns:true,paperContextLanes:channel};
    const probe=E.project(ir,{...candidateState,view:'publication'});
    if(!probe.positions.context.branchColumns.length)return baseline;
    const trial=prepareTopology(ir,candidateState),groups=trial.graph.positions.context.branchColumns,q=trial.prepared.quality;
    const aligned=positions=>groups.filter(group=>L.branchGeometry(group,positions)).length;
    const before=aligned(baseline.graph.positions),after=aligned(trial.graph.positions);
    const identity=g=>JSON.stringify({nodes:g.nodes.map(n=>n.id),edges:g.edges.map(e=>({id:e.id,source:e.source,target:e.target,
      source_port:e.source_port,target_port:e.target_port,originals:e.originals,bundle_members:e.bundle_members,kind:e.kind,condition:e.condition}))});
    const accepted=identity(baseline.graph)===identity(trial.graph)&&after>before&&q.line_geometry.crossings<=b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&q.issues.every(issue=>b.issues.includes(issue))&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&
      fontMetric(q)>=fontMetric(b)&&areaMetric(q)<=areaMetric(b)*1.1&&q.wire_length<=b.wire_length*1.1;
    const chosen=accepted?trial:baseline;
    if(accepted&&baseline.prepared.routing.context_refinement)chosen.prepared.routing.context_refinement=baseline.prepared.routing.context_refinement;
    chosen.prepared.routing.branch_refinement={accepted,aligned_groups_before:before,aligned_groups_after:after,
      crossings_before:b.line_geometry.crossings,crossings_candidate:q.line_geometry.crossings,
      issues_before:b.issues,issues_candidate:q.issues,contacts_before:b.line_geometry.unrelated_contacts.length,contacts_candidate:q.line_geometry.unrelated_contacts.length,
      wire_before:b.wire_length,wire_candidate:q.wire_length,max_area_ratio:1.1,max_wire_ratio:1.1,
      scope:'measured local path columns; original bindings retained, no stage equivalence or concurrent execution asserted'};
    return chosen;
  }
  function prepareFlows(ir,state={}){
    const baseline=prepareBranches(ir,state),b=baseline.prepared.quality;
    if(b.medium!=='canvas'||state.paperFlowAlignment!==undefined||Object.keys(state.offsets||{}).length||
      baseline.graph.edges.length>128||!baseline.graph.positions.context.compoundAlignments.some(c=>c.accepted))return baseline;
    const candidateState={...state,paperFlowAlignment:'entries',paperBranchColumns:!!baseline.graph.positions.context.branchColumns.length,
      paperContextLanes:baseline.graph.positions.context.contextLanes[0]?.side||false,
      paperRankStrategy:state.paperRankStrategy||baseline.prepared.routing.topology_refinement?.selected||'earliest'};
    const probe=E.project(ir,{...candidateState,view:'publication'});
    if(!probe.positions.context.compoundAlignments.some(c=>L.entryGeometry(c,probe.positions)))return baseline;
    const trial=prepareLabels(ir,candidateState),q=trial.prepared.quality;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const identity=g=>JSON.stringify({nodes:g.nodes.map(n=>n.id),edges:g.edges.map(e=>({id:e.id,source:e.source,target:e.target,
      source_port:e.source_port,target_port:e.target_port,originals:e.originals,bundle_members:e.bundle_members,kind:e.kind,condition:e.condition}))});
    const conflicts=r=>new Set(r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id));
    const routes=r=>new Map(r.prepared.routes.map(e=>[e.id,e]));
    const columns=r=>r.graph.positions.context.branchColumns.filter(g=>L.branchGeometry(g,r.graph.positions)&&g.chains.every(c=>c.edges.every(id=>routes(r).get(id)?.route.ok))).length;
    const contexts=r=>r.graph.positions.context.contextLanes.filter(c=>{const p=r.graph.positions.get(c.owner),route=routes(r).get(c.edge)?.route;
      const lo=c.side==='left'?p.x+(p.design_gutter||0):p.x+p.w-p.context_gutter,hi=c.side==='left'?lo+p.context_gutter:p.x+p.w;
      return route?.ok&&route.target_side===c.side&&route.points.some((p,i,ps)=>i&&p.x===ps[i-1].x&&p.y!==ps[i-1].y&&p.x>lo&&p.x<hi);}).length;
    const entries=trial.graph.positions.context.compoundAlignments.filter(c=>L.entryGeometry(c,trial.graph.positions)&&c.entry_bindings.every(e=>routes(trial).get(e.edge)?.route.ok&&routes(trial).get(e.independent_entry)?.route.ok));
    const accepted=identity(baseline.graph)===identity(trial.graph)&&entries.length>0&&
      q.native_height_px<=b.native_height_px*.9&&q.native_width_px<=b.native_width_px*1.1&&areaMetric(q)<areaMetric(b)*.9&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&
      fontMetric(q)>=fontMetric(b)&&q.wire_length<=b.wire_length*1.1&&[...conflicts(trial)].every(c=>conflicts(baseline).has(c))&&
      columns(trial)>=columns(baseline)&&contexts(trial)>=contexts(baseline);
    const chosen=accepted?trial:baseline;
    if(accepted)for(const key of ['context_refinement','branch_refinement','topology_refinement'])if(baseline.prepared.routing[key])chosen.prepared.routing[key]=baseline.prepared.routing[key];
    const metrics=r=>({width:r.prepared.quality.native_width_px,height:r.prepared.quality.native_height_px,crossings:r.prepared.quality.line_geometry.crossings,
      contacts:r.prepared.quality.line_geometry.unrelated_contacts.length,wire_length:r.prepared.quality.wire_length,issues:r.prepared.quality.issues,
      realized_columns:columns(r),realized_contexts:contexts(r),constraint_conflicts:[...conflicts(r)]});
    chosen.prepared.routing.flow_refinement={accepted,before:metrics(baseline),candidate:metrics(trial),candidate_regions:entries.length,
      scope:'independently entered compound regions; cross-region arrows remain exact and can point upward; no execution scheduling assertion'};
    return chosen;
  }
  const clearanceIdentity=g=>JSON.stringify({nodes:g.nodes.map(n=>n.id),open:g.publication.open,
    edges:g.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,
      originals:e.originals,bundle_members:e.bundle_members,kind:e.kind,condition:e.condition})),
    nodes_accounted:g.node_accounting,edges_accounted:g.edge_accounting,boundary:g.publication.boundary,roles:g.publication.role_frontier});
  const clearanceMetrics=q=>({width:q.native_width_px,height:q.native_height_px,area:areaMetric(q),
    crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,wire_length:q.wire_length,
    overlaps:q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length,unplaced_labels:q.unplaced_port_labels.length,issues:q.issues});
  function acceptClearance(baseline,trial){
    const b=baseline.prepared.quality,q=trial.prepared.quality;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    return clearanceIdentity(baseline.graph)===clearanceIdentity(trial.graph)&&conflicts(trial).every(id=>conflicts(baseline).includes(id))&&
      areaMetric(q)<areaMetric(b)*.98&&q.native_width_px<=b.native_width_px*1.05&&q.native_height_px<=b.native_height_px&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
      q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.wire_length<=b.wire_length;
  }
  function prepareClearance(ir,state={}){
    const baseline=prepareFlows(ir,state),b=baseline.prepared.quality,clearance=baseline.graph.publication.label_clearance;
    if(b.medium!=='canvas'||state.paperLabelSpacing!==undefined||Object.keys(state.offsets||{}).length||
      !clearance||clearance.global_gap_y<=clearance.base_gap_y)return baseline;
    // Retain the measured baseline's other geometric choices. This candidate
    // changes only label clearance scope, never the user's semantic frontier.
    const candidateState={...state,paperLabelSpacing:'local',
      paperRankStrategy:state.paperRankStrategy||baseline.prepared.routing.topology_refinement?.selected||'earliest',
      paperContextLanes:baseline.graph.positions.context.contextLanes[0]?.side||false,
      paperBranchColumns:!!baseline.graph.positions.context.branchColumns.length,
      paperFlowAlignment:baseline.prepared.routing.flow_refinement?.accepted?'entries':state.paperFlowAlignment};
    const trial=prepareLabels(ir,candidateState),q=trial.prepared.quality;
    const accepted=acceptClearance(baseline,trial),chosen=accepted?trial:baseline;
    const receipt={accepted,selected:accepted?'local':'global',before:clearanceMetrics(b),candidate:clearanceMetrics(q),regions:clearance.regions,
      scope:'visible drawing-parent clearance; identical semantic frontier, operands and accounting required'};
    if(accepted)for(const key of ['topology_refinement','context_refinement','branch_refinement','flow_refinement'])
      if(baseline.prepared.routing[key])chosen.prepared.routing[key]=baseline.prepared.routing[key];
    chosen.prepared.routing.clearance_refinement=receipt;
    return chosen;
  }
  function prepareRankClearance(ir,state={}){
    const baseline=prepareClearance(ir,state),clearance=baseline.graph.publication.label_clearance;
    if(baseline.prepared.quality.medium!=='canvas'||state.paperLabelSpacing!==undefined||Object.keys(state.offsets||{}).length||
      !clearance||clearance.global_gap_y<=clearance.base_gap_y)return baseline;
    const candidateState={...state,paperLabelSpacing:'rank',
      paperRankStrategy:state.paperRankStrategy||baseline.prepared.routing.topology_refinement?.selected||'earliest',
      paperContextLanes:baseline.graph.positions.context.contextLanes[0]?.side||false,
      paperBranchColumns:!!baseline.graph.positions.context.branchColumns.length,
      paperFlowAlignment:baseline.prepared.routing.flow_refinement?.accepted?'entries':state.paperFlowAlignment};
    const spacingConfig=s=>Object.fromEntries(['paperLabelSpacing','paperLabelRankParents','paperLabelRankFallback','paperRankStrategy','paperContextLanes','paperBranchColumns','paperFlowAlignment'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
    const trial=prepareLabels(ir,candidateState),allAccepted=acceptClearance(baseline,trial);
    let chosen=allAccepted?trial:baseline;
    const attempts=[{parents:'all',configuration:spacingConfig(candidateState),accepted:allAccepted,before:clearanceMetrics(baseline.prepared.quality),candidate:clearanceMetrics(trial.prepared.quality)}],selected=[];
    // When shrinking the entire drawing fails, measure at most three local
    // parents. Keep all other parents at the selected baseline spacing. Each
    // accepted step must satisfy the same factual and geometric guard.
    if(!allAccepted){
      const regions=(trial.graph.publication.label_clearance?.rank_layout||[]).filter(r=>r.applied&&r.mode==='rank');
      const saving=r=>r.ranks.slice(0,-1).reduce((sum,rank)=>sum+Math.max(0,clearance.global_gap_y-rank.gap_after),0);
      regions.sort((a,b)=>saving(b)-saving(a)||String(a.parent).localeCompare(String(b.parent)));
      for(const region of regions.slice(0,3)){
        const parents=[...selected,region.parent],localState={...candidateState,paperLabelRankParents:parents,paperLabelRankFallback:clearance.mode},local=prepareLabels(ir,localState);
        const accepted=acceptClearance(chosen,local);
        attempts.push({parents,configuration:spacingConfig(localState),accepted,before:clearanceMetrics(chosen.prepared.quality),candidate:clearanceMetrics(local.prepared.quality)});
        if(accepted){chosen=local;selected.push(region.parent);}
      }
    }
    const accepted=chosen!==baseline;
    if(accepted)for(const key of ['topology_refinement','context_refinement','branch_refinement','flow_refinement','clearance_refinement'])
      if(baseline.prepared.routing[key])chosen.prepared.routing[key]=baseline.prepared.routing[key];
    chosen.prepared.routing.rank_clearance_refinement={accepted,selected:accepted?'rank':clearance.mode,
      before:clearanceMetrics(baseline.prepared.quality),all_candidate:clearanceMetrics(trial.prepared.quality),selected_metrics:clearanceMetrics(chosen.prepared.quality),
      rank_layout:trial.graph.publication.label_clearance?.rank_layout||[],
      attempts,selected_parents:allAccepted?'all':selected,
      scope:'vertical receiving-rank clearance; unchanged semantic frontier; folded and compound layouts retain parent clearance'};
    return chosen;
  }
  function attachExpressionEvidence(ir,chosen){
    const g=chosen.graph;
    E.auditConstraintRoutes(g,chosen.prepared.routes);
    g.expression_goals=Goals.build(ir,g.architecture);
    g.expression_coverage=Goals.evaluate(g.expression_goals,g,chosen.prepared);
    if(g.publication.local_expressions){
      const expressions=root.SemanticLocalExpressions||(typeof require==='function'?require('./local-expressions.js'):null);
      expressions.verify(g.publication.local_expressions,g,chosen.prepared);
    }
    return chosen;
  }
  function prepareAdaptive(ir,state={}){
    let chosen=prepareRankClearance(ir,state);
    if(state.paperAdaptive!==true||state.paperMedium!=='canvas'||state.paperGranularity!=='roles'||state.paperAuto===false||state.paperRelation||Object.keys(state.offsets||{}).length)return chosen;
    const engine=root.SemanticAdaptiveFrontier||(typeof require==='function'?require('./adaptive-frontier.js'):null);
    attachExpressionEvidence(ir,chosen);
    const initial=engine.metrics(chosen),attempts=[],preflights=[],seen=new Set();let selectedState={...state},measured=0;
    // At most three actual routed trials. Cheap projections rank at most 12
    // opportunities per step; rejected trials never change the saved request.
    while(measured<3&&preflights.length<36){
      const opportunities=engine.candidates(chosen.graph,selectedState).filter(c=>!seen.has(c.id)),shortlist=[];
      for(const candidate of opportunities.slice(0,Math.min(12,36-preflights.length))){
        seen.add(candidate.id);
        const next=engine.apply(selectedState,candidate),graph=E.project(ir,{...next,view:'publication'}),before=new Set(chosen.graph.nodes.map(n=>n.id));
        const added=graph.nodes.filter(n=>!before.has(n.id)),request=candidate.kind==='roles'?graph.publication.role_frontier?.detail_requests.find(r=>r.node===candidate.node):null;
        const reason=request&&request.status!=='expanded'?'protected-or-budgeted-role':!added.length?'no-new-visible-detail':null;
        const estimate=added.filter(n=>['compute','opaque','control'].includes(n.kind)).length;
        const row={candidate,added_nodes:added.length,estimated_operations:estimate,reason};preflights.push(row);
        if(!reason)shortlist.push({candidate,next,estimate,added:added.length});
      }
      shortlist.sort((a,b)=>b.candidate.priority-a.candidate.priority||b.estimate/Math.max(1,b.added)-a.estimate/Math.max(1,a.added)||a.candidate.id.localeCompare(b.candidate.id));
      // Untested shortlist entries remain eligible after a successful local
      // step, with preflight repeated against that newly selected frontier.
      for(const item of shortlist)seen.delete(item.candidate.id);
      const item=shortlist[0];if(!item){if(opportunities.length>12)continue;break;}seen.add(item.candidate.id);
      const trial=attachExpressionEvidence(ir,prepareRankClearance(ir,item.next)),assessment=engine.assess(ir,chosen,trial);measured++;
      attempts.push({opportunity:item.candidate,requested_state:{paperRoleDetails:item.next.paperRoleDetails||[],paperExpressionDetails:item.next.paperExpressionDetails||[]},...assessment});
      if(assessment.accepted){chosen=trial;selectedState=item.next;}
    }
    const remaining=engine.candidates(chosen.graph,selectedState).filter(c=>!seen.has(c.id));
    const receipt={rule_version:engine.VERSION,requested:true,baseline:initial,selected:engine.metrics(chosen),attempts,preflights,
      selected_role_details:selectedState.paperRoleDetails||[],selected_expression_details:selectedState.paperExpressionDetails||[],
      unmeasured_opportunities:remaining.length,measurement_limit:3,preflight_limit:36,
      scope:'Bounded local role/relation refinement of the requested canvas frontier; fulfilled goals only, not coverage of all hidden instances. Canonical IR and saved requests remain unchanged.'};
    chosen.graph.publication.adaptive_frontier=receipt;chosen.prepared.routing.semantic_refinement=receipt;
    return chosen;
  }
  function selectFigure(ir,state={}){
    let chosen=prepareAdaptive(ir,state);
    const base=chosen,requested=chosen.graph.publication.budget,granularity=chosen.graph.publication.granularity;
    // A zoomable canvas keeps the requested semantic frontier. Route/resource
    // failures remain explicit; silently replacing it with an overview is not
    // a repair. Single-page print selection below has its own policy.
    if(chosen.graph.publication.medium==='canvas')return chosen;
    if(state.paperAuto===false||Object.keys(state.offsets||{}).length||!chosen.prepared.quality.issues.length)return chosen;
    const attempts=[];
    // Semantic presets are bounded by measured print readability. Detail that
    // cannot fit remains a named, inspectable module, with its own panel; the
    // canonical graph and requested preset stay unchanged.
    const profiles=[{paperCompact:true},
      ...(granularity==='detailed'?[{paperGranularity:'modules',paperBudget:Math.min(requested,20)}]:[]),
      ...(granularity!=='overview'?[{paperGranularity:'overview',paperBudget:Math.min(requested,12)}]:[]),
      ...(granularity!=='overview'?[{paperGranularity:'overview',paperBudget:Math.min(requested,12),paperCompact:true}]:[]),
      ...[...new Set([Math.floor(requested*.65),12,8,6,4])].filter(n=>n<requested&&n>=4).map(paperBudget=>({paperBudget}))];
    for(const profile of profiles){
      const candidate=prepareTopology(ir,{...state,...profile}),q=candidate.prepared.quality,b=chosen.prepared.quality;
      const improves=q.issues.length<b.issues.length||q.issues.length===b.issues.length&&q.min_print_font_pt>b.min_print_font_pt+.2&&q.line_geometry.crossings<=b.line_geometry.crossings;
      const accepted=improves&&q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
        q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.min_print_font_pt>=Math.min(8,b.min_print_font_pt)&&
        q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length;
      attempts.push({budget:profile.paperBudget??requested,granularity:profile.paperGranularity||granularity,compact:!!profile.paperCompact,issues:q.issues,min_font_pt:q.min_print_font_pt,accepted});
      if(accepted)chosen=candidate;
      if(!chosen.prepared.quality.issues.length)break;
    }
    chosen.prepared.routing.granularity_refinement={requested:granularity,requested_budget:requested,
      selected:chosen.graph.publication.granularity,selected_budget:chosen.graph.publication.budget,before_issues:base.prepared.quality.issues,attempts,
      deferred_panels:chosen.graph.nodes.filter(n=>n.kind==='composite'&&!chosen.graph.positions.get(n.id).expanded&&(chosen.graph.idx.children.get(n.id)||[]).length).map(n=>n.id)};
    return chosen;
  }
  function prepareFigure(ir,state={}){
    return attachExpressionEvidence(ir,selectFigure(ir,state));
  }
  function render(ir,state){
    E.validate(ir);state={...state,view:'publication'};return renderPrepared(ir,state,prepareFigure(ir,state));
  }
  // Serialize an already measured figure, including rejected audit trials,
  // without rerouting it or substituting a different selected frontier.
  function renderPrepared(ir,state,{graph:g,prepared}){
    const {bounds:b,routes,labeling,quality}=prepared;
    const expressionGoals=g.expression_goals,expressionCoverage=g.expression_coverage;
    const frames=[],nodes=[];
    for(const n of E.drawingOrder(g.nodes,g.idx)){const p=g.positions.get(n.id),body=`<g class="node" data-node-id="${esc(n.id)}" data-id="${esc(n.id)}"${n.identity_display?` data-identity="${esc(JSON.stringify(n.identity_display))}"`:''} transform="translate(${p.x},${p.y})"><title>${esc(nodeTitle(n,g.idx))}</title>${nodeBody(n,p)}</g>`;(p.expanded?frames:nodes).push(body);}
    // Crossing halos express overpasses, never junctions. Separate canonical
    // edges and terminals remain individually inspectable in the vector file.
    const {notes,noteLines,totalH}=prepared;
    const dimensions=quality.medium==='canvas'?`width="${b.w}px" height="${totalH}px"`:`width="${quality.width_mm}mm" height="${quality.width_mm*totalH/b.w}mm"`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" class="publication" ${dimensions} viewBox="${b.x} ${b.y} ${b.w} ${totalH}" role="img" aria-label="${esc(ir.title)}"><title>${esc(ir.title)} · architecture</title><desc>Source-backed architecture; unresolved regions remain explicit. Crossings without a node are not junctions. ${esc(notes.join('; '))}</desc><metadata>${esc(JSON.stringify({schema:'archcanvas-publication/1',canonical_digest:ir.ir_digest,quality}))}</metadata><style>${css}</style><defs>${defs}</defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${totalH}" fill="#fff"/><g id="frames">${frames.join('')}</g><g id="edges">${routes.map(edgeBody).join('')}</g><g id="nodes">${nodes.join('')}</g><g id="port-labels">${labeling.placed.map(labelBody).join('')}</g>${noteLines.length?`<text x="${b.x+14}" y="${b.y+b.h+20}" class="paper-port-label">${noteLines.map((line,i)=>`<tspan x="${b.x+14}" dy="${i?17:0}">${esc(line)}</tspan>`).join('')}</text>`:''}</svg>\n`;
    return {svg,graph:g,prepared,document:{schema:'archcanvas-architecture-document/1',ir,state,architecture:g.architecture,publication:g.publication,expression_goals:expressionGoals,expression_coverage:expressionCoverage,
      layout:{bounds:{...b,h:totalH},nodes:[...g.positions.values()],edges:routes,edge_accounting:g.edge_accounting,node_accounting:g.node_accounting,representatives:g.representatives,...(g.frame_ownership?.length?{frame_ownership:g.frame_ownership}:{}),labels:labeling.placed,constraint_receipts:g.constraint_receipts,
        ...(g.positions.context.compoundAlignments.length?{compound_alignments:g.positions.context.compoundAlignments.map(record=>{
          if(record.mode!=='entries')return record;
          const geometry=L.entryGeometry(record,g.positions),valid=record.entry_bindings.every(b=>routes.find(e=>e.id===b.edge)?.route.ok&&routes.find(e=>e.id===b.independent_entry)?.route.ok);
          return {...record,status:geometry&&valid?'realized':'deferred',geometry_verified:!!geometry,routes_verified:valid};
        })}:{}),
        ...(g.positions.context.branchColumns.length?{branch_columns:g.positions.context.branchColumns.map(group=>{
          const geometry=L.branchGeometry(group,g.positions),pathIds=group.chains.flatMap(c=>c.edges),valid=pathIds.every(id=>routes.find(e=>e.id===id)?.route.ok);
          return {...group,status:geometry&&valid?'realized':'deferred',geometry_verified:geometry,routes_verified:valid,
            reason:geometry&&valid?'exact dependency paths aligned in separate columns with final routes':'final geometry or path routing did not realize column correspondence'};
        })}:{}),
        ...(g.positions.context.contextLanes.length?{context_lanes:g.positions.context.contextLanes.map(entry=>{
          const owner=g.positions.get(entry.owner),edge=routes.find(e=>e.id===entry.edge),low=entry.side==='left'?owner.x+(owner.design_gutter||0):owner.x+owner.w-owner.context_gutter;
          const high=entry.side==='left'?low+owner.context_gutter:owner.x+owner.w;
          const used=edge.route.ok&&edge.route.target_side===entry.side&&edge.route.points.some((p,i,ps)=>i&&p.x===ps[i-1].x&&p.y!==ps[i-1].y&&p.x>low&&p.x<high);
          return {...entry,status:used?'realized':'deferred',reason:used?'final side terminal and vertical channel verified':'obstacle-aware fallback did not realize a vertical channel'};
        })}:{})},
      diagnostics:{route_failures:quality.route_failures,publication:quality,routing:prepared.routing}}};
  }
  const api={css,defs,nodeTitle,nodeBody,edgeBody,labelBody,prepare,prepareFigure,render,renderPrepared,overlap,lineGeometry};root.SemanticPublicationRenderer=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

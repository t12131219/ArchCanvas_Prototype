/* Shared vector figure renderer for the interactive canvas and CLI exports. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('./architecture-layout.js'):null);
  const InvocationInputs=root.SemanticInvocationInputs||(typeof require==='function'?require('./invocation-inputs.js'):null);
  const P=root.SemanticPublication||(typeof require==='function'?require('./publication.js'):null);
  const Goals=root.SemanticExpressionGoals||(typeof require==='function'?require('./expression-goals.js'):null);
  const SummaryGoals=root.SemanticSummaryGoals||(typeof require==='function'?require('./summary-goals.js'):null);
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
    const pipeline=n.local_pipeline,labels=new Map(pipeline?.operations.map(o=>[o.node,o.label])||[]);
    const expression=t=>labels.get(t.node)+(t.inputs.length?' ← {'+t.inputs.map(i=>expression(i.expression)).join('; ')+'}':'');
    return [n.label,...(n.transform_configurations||[]).flatMap(r=>['Source literal configuration: '+r.text,r.scope,
      'Original operation: '+r.node+'; slots: '+JSON.stringify(r.slots)]),...(n.normal_return?[n.normal_return.scope,'Selected source return: '+n.normal_return.selected_return.node,
      'Fixed predicate: '+n.normal_return.predicate.slot+' = '+n.normal_return.predicate.value,
      'Retained source-alternative inputs: '+JSON.stringify(n.normal_return.alternative_inputs)]:[]),...(n.module_arguments||[]).flatMap(r=>[r.label,r.scope,'Reference: '+r.module_identity,JSON.stringify(r.edge),'Construction evidence: '+JSON.stringify(r.proof.construction_evidence)]),...(n.invocation_binding?['Fixed call argument: '+n.invocation_binding.label,n.invocation_binding.proof_scope,n.invocation_binding.claim,
      ...n.invocation_binding.uses.map(e=>`${e.id}: ${e.source} [${e.source_port}] → ${e.target} [${e.target_port}] · ${e.kind}`)]:[]),...(n.contract_stage?['Certified role subregion: '+n.contract_stage.certificate,n.contract_stage.scope,'Original operations remain individually expandable.']:[]),...(pipeline?[
      pipeline.dependency_dag?'Local dependency DAG: '+JSON.stringify(pipeline.dependency_dag):pipeline.dependency_tree?'Local dependency tree: '+expression(pipeline.dependency_tree):'Local dependency path: '+pipeline.operations.map(o=>o.label).join(' → '),pipeline.scope,
      ...(pipeline.path_display?[pipeline.path_display.scope,'Individual calls: '+JSON.stringify(pipeline.operations)]:[]),
      ...(pipeline.dependency_tree||pipeline.dependency_dag?pipeline.bindings.map(b=>`${b.edge}: ${b.producer} [${b.source_port}] → ${b.target} [${b.target_port}]`):[]),
      ...(pipeline.parameter_reads||[]).flatMap(p=>p.edges.map(e=>`Parameter read ${e.id}: ${p.node} → ${e.target} [${e.target_port}]`)),
      ...(pipeline.source_reads||[]).flatMap(p=>[p.scope,...p.edges.map(e=>`Source read ${e.id}: ${p.expression} (${p.node}) → ${e.target} [${e.target_port}]`)])]:[]),...(n.role_annotations||[]).map(r=>'Certified role: '+r.role+
        (r.role_keys?.some(k=>k.includes('.')||/^\d+$/.test(k))?' · exact keys: '+JSON.stringify(r.role_keys):'')+' · '+r.certificate+' · '+r.scope),...(n.frame_ownership||[]).map(r=>'Source ownership: '+r.label+' ['+r.node+'] · '+r.kind+' · '+r.scope),...(n.source_label?['Source label: '+n.source_label]:[]),
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
  function evaluateRoutes(graph,routes,strategy,fixedLabeling){
    const b={...graph.bounds},labeling=fixedLabeling||labels(graph,routes);
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
  function prepare(graph,{parallelRepairs=false}={}){
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
            context.repairRoute=parallelRepairs&&phase!=='crossings'?current.route:null;
            let route;try{route=E.route(current,graph.positions);}finally{context.repairRoute=null;}refinement.attempts++;
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
  function acceptClearance(baseline,trial,wireBenefit=false){
    const b=baseline.prepared.quality,q=trial.prepared.quality;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    return clearanceIdentity(baseline.graph)===clearanceIdentity(trial.graph)&&conflicts(trial).every(id=>conflicts(baseline).includes(id))&&
      (areaMetric(q)<areaMetric(b)*.98||wireBenefit&&areaMetric(q)<=areaMetric(b)&&q.wire_length<=b.wire_length*.9)&&
      q.native_width_px<=b.native_width_px*1.05&&q.native_height_px<=b.native_height_px&&
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
    if(g.publication.role_frontier?.path_requests?.length){
      const proof=Goals.canonicalPaths(ir,chosen.prepared.routes),physical=proof.paths;
      for(const r of g.publication.role_frontier.path_requests){
        const incoming=ir.edges.filter(e=>e.target===r.target&&['data','alias','interface-binding'].includes(e.kind));
        const missing=incoming.filter(e=>!physical.has(e.id)).map(e=>e.id),failed=incoming.filter(e=>physical.get(e.id)?.some(p=>!p.path.route.ok)).map(e=>e.id),
          missingBindings=incoming.filter(e=>!proof.exact(e.id)).map(e=>e.id);
        r.operand_check={status:r.status==='exposed'&&incoming.length&&!missing.length&&!failed.length&&!missingBindings.length?'fulfilled':'deferred',
          edges:incoming.map(e=>e.id),missing_edges:missing,missing_exact_bindings:missingBindings,route_failures:failed,
          scope:'Selected role endpoint and its canonical incoming flow bindings only; not the entire certificate computation or execution coverage.'};
      }
    }
    g.expression_goals=Goals.build(ir,g.architecture);
    g.expression_coverage=Goals.evaluate(g.expression_goals,g,chosen.prepared,ir);
    g.summary_goals=SummaryGoals.build(ir,g.architecture);
    g.summary_coverage=SummaryGoals.evaluate(g.summary_goals,ir,g,chosen.prepared);
    if(g.publication.local_expressions){
      const expressions=root.SemanticLocalExpressions||(typeof require==='function'?require('./local-expressions.js'):null);
      expressions.verify(g.publication.local_expressions,g,chosen.prepared);
    }
    return chosen;
  }
  function realizedRelations(r){
      const positions=r.graph.positions,routes=new Map(r.prepared.routes.map(e=>[e.id,e])),ctx=positions.context;
      const entries=ctx.compoundAlignments.filter(c=>L.entryGeometry(c,positions)&&c.entry_bindings.every(b=>routes.get(b.edge)?.route.ok&&routes.get(b.independent_entry)?.route.ok));
      const columns=ctx.branchColumns.filter(c=>L.branchGeometry(c,positions)&&c.chains.every(p=>p.edges.every(id=>routes.get(id)?.route.ok)));
      const contexts=ctx.contextLanes.filter(c=>{if(c.selected===false)return false;const p=positions.get(c.owner),route=routes.get(c.edge)?.route;
        const lo=c.side==='left'?p.x+(p.design_gutter||0):p.x+p.w-p.context_gutter,hi=c.side==='left'?lo+p.context_gutter:p.x+p.w;
        return route?.ok&&route.target_side===c.side&&(route.points.some((p,i,ps)=>i&&p.x===ps[i-1].x&&p.y!==ps[i-1].y&&p.x>lo&&p.x<hi)||directDockEntry(r,c.edge));});
      return {entries:entries.map(c=>JSON.stringify(c.entry_bindings)),columns:columns.map(c=>JSON.stringify(c.chains)),contexts:contexts.map(c=>c.edge)};
  }
  function directDockEntry(r,id){
    const e=r.prepared.routes.find(e=>e.id===id),p=e?.route?.points;
    return !!(e?.route.ok&&e.context_lane&&e.route.target_side===e.context_lane.side&&p.length===2&&p[0].y===p[1].y&&
      r.graph.positions.context.inputDocks.some(d=>d.node===e.source&&d.edges.some(use=>use.edge===id)&&L.inputDockGeometry(d,r.graph.positions)));
  }
  function prepareEntryBand(ir,state={}){
    const baseline=prepareRankClearance(ir,state),g=baseline.graph;
    if(baseline.prepared.quality.medium!=='canvas'||state.paperEntryBand!==undefined||Object.keys(state.offsets||{}).length||
      g.edges.length>128||!g.positions.context.compoundAlignments.some(c=>c.accepted))return baseline;
    // Keep all previously selected geometric policies. Trial one additional
    // arrangement at the same semantic frontier, then inspect real routes.
    const rank=baseline.prepared.routing.rank_clearance_refinement;
    const selectedRank=rank?.attempts.filter(a=>a.accepted).at(-1)?.configuration||{};
    const before=realizedRelations(baseline);
    const candidateState={...state,...selectedRank,paperEntryBand:true,paperFlowAlignment:'entries',
      paperRankStrategy:state.paperRankStrategy||baseline.prepared.routing.topology_refinement?.selected||'earliest',
      paperContextEdges:state.paperContextEdges||before.contexts,paperBranchColumns:!!g.positions.context.branchColumns.length,paperContextLanes:g.positions.context.contextLanes[0]?.side||false,
      ...(g.publication.label_clearance?{paperLabelSpacing:g.publication.label_clearance.mode}:{})};
    const probe=E.project(ir,{...candidateState,view:'publication'});
    if(!probe.positions.context.compoundAlignments.some(c=>L.entryBandGeometry(c,probe.positions)))return baseline;
    const trial=prepareLabels(ir,candidateState);
    const after=realizedRelations(trial),bands=trial.graph.positions.context.compoundAlignments.filter(c=>L.entryBandGeometry(c,trial.graph.positions));
    const accepted=bands.length>0&&acceptClearance(baseline,trial,true)&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const chosen=accepted?trial:baseline;
    if(accepted)for(const key of ['topology_refinement','context_refinement','branch_refinement','flow_refinement','clearance_refinement','rank_clearance_refinement'])
      if(baseline.prepared.routing[key])chosen.prepared.routing[key]=baseline.prepared.routing[key];
    chosen.prepared.routing.entry_band_refinement={accepted,before:clearanceMetrics(baseline.prepared.quality),candidate:clearanceMetrics(trial.prepared.quality),
      realized_before:before,realized_candidate:after,candidate_regions:bands.map(c=>c.parent),configuration:{paperEntryBand:true,paperContextEdges:candidateState.paperContextEdges},
      scope:'Entry interfaces occupy a separate top band; identical frontier, canonical bindings and realized relations required. No execution scheduling claim.'};
    return chosen;
  }
  function prepareSampleFrame(ir,state={}){
    const baseline=prepareEntryBand(ir,state),g=baseline.graph;
    if(baseline.prepared.quality.medium!=='canvas'||g.publication.granularity!=='roles'||state.paperSampleFrame!==undefined||
      state.paperFrameView==='source'||Object.keys(state.offsets||{}).length||g.edges.length>128||
      !g.nodes.some(n=>n.sequence_sample&&g.positions.get(n.id)?.expanded))return baseline;
    const trial=prepareEntryBand(ir,{...state,paperSampleFrame:true});
    const frames=(trial.graph.frame_ownership||[]).filter(r=>r.kind==='sequence-sample'),ids=new Set(frames.map(r=>r.node));
    if(!ids.size)return baseline;
    const identity=h=>JSON.stringify({nodes:h.nodes.filter(n=>!ids.has(n.id)).map(n=>n.id),open:h.publication.open,
      edges:h.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,
        originals:e.originals,bundle_members:e.bundle_members,kind:e.kind,condition:e.condition})),
      node_accounting:Object.fromEntries(Object.entries(h.node_accounting).map(([k,v])=>[k,v.filter(id=>!ids.has(id))])),
      edge_accounting:h.edge_accounting,boundary:h.publication.boundary,roles:h.publication.role_frontier});
    const q=trial.prepared.quality,b=baseline.prepared.quality,before=realizedRelations(baseline),after=realizedRelations(trial);
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    const facts=identity(g)===identity(trial.graph)&&frames.every(r=>g.positions.get(r.node)?.expanded&&
      trial.graph.node_accounting.attached.includes(r.node)&&trial.graph.positions.has(r.target));
    const accepted=facts&&areaMetric(q)<areaMetric(b)*.98&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&
      q.wire_length<=b.wire_length&&q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
      q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      conflicts(trial).every(id=>conflicts(baseline).includes(id))&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const chosen=accepted?trial:baseline;
    chosen.prepared.routing.sample_frame_refinement={accepted,facts_preserved:facts,frames,before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      realized_before:before,realized_candidate:after,
      scope:'One concrete representative shares its sequence frame; actual calls, source identities, suffixes and exact bindings retained. One measured trial; no output equality.'};
    return chosen;
  }
  function prepareInputDocks(ir,state={}){
    const baseline=prepareSampleFrame(ir,state),g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||g.publication.granularity!=='roles'||state.paperInputDocks!==undefined||Object.keys(state.offsets||{}).length||g.edges.length>128)return baseline;
    const before=realizedRelations(baseline),rank=baseline.prepared.routing.rank_clearance_refinement;
    const candidateState={...state,...rank?.attempts.filter(a=>a.accepted).at(-1)?.configuration,paperInputDocks:true,
      paperEntryBand:g.positions.context.compoundAlignments.some(c=>L.entryBandGeometry(c,g.positions)),
      paperFlowAlignment:g.positions.context.compoundAlignments.some(c=>c.accepted&&c.mode==='entries')?'entries':state.paperFlowAlignment,
      paperSampleFrame:(g.frame_ownership||[]).some(r=>r.kind==='sequence-sample'),
      paperRankStrategy:state.paperRankStrategy||baseline.prepared.routing.topology_refinement?.selected||'earliest',
      paperContextEdges:state.paperContextEdges||before.contexts,paperBranchColumns:!!g.positions.context.branchColumns.length,
      paperContextLanes:g.positions.context.contextLanes.find(c=>c.selected!==false)?.side||false,
      ...(g.publication.label_clearance?{paperLabelSpacing:g.publication.label_clearance.mode}:{})};
    const probe=E.project(ir,{...candidateState,view:'publication'});
    if(!probe.positions.context.inputDocks.length)return baseline;
    const trial=prepareLabels(ir,candidateState),q=trial.prepared.quality,after=realizedRelations(trial),docks=trial.graph.positions.context.inputDocks;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    const bands=r=>r.graph.positions.context.compoundAlignments.filter(c=>L.entryBandGeometry(c,r.graph.positions)).map(c=>c.parent);
    const facts=clearanceIdentity(g)===clearanceIdentity(trial.graph);
    const accepted=facts&&docks.length>0&&docks.every(r=>L.inputDockGeometry(r,trial.graph.positions))&&
      q.wire_length<=b.wire_length*.9&&q.native_width_px<=b.native_width_px*1.12&&q.native_height_px<=b.native_height_px&&areaMetric(q)<=areaMetric(b)*1.12&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      conflicts(trial).every(id=>conflicts(baseline).includes(id))&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)))&&bands(baseline).every(id=>bands(trial).includes(id));
    const chosen=accepted?trial:baseline;
    if(accepted)for(const [key,value]of Object.entries(baseline.prepared.routing))if(key.endsWith('_refinement'))chosen.prepared.routing[key]=value;
    chosen.prepared.routing.input_dock_refinement={accepted,facts_preserved:facts,before:clearanceMetrics(b),candidate:clearanceMetrics(q),docks,
      realized_before:before,realized_candidate:after,configuration:candidateState,
      scope:'Existing input terminals move beside their uses. Same frontier, canonical bindings and realized relations required; at least 10% less wire permits up to 12% more width/area, with no added height, crossings, contacts or routing failures.'};
    return chosen;
  }
  function prepareRoleSourceFrames(ir,state={}){
    const baseline=prepareInputDocks(ir,state),g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||g.publication.granularity!=='roles'||state.paperRoleSourceFrames!==undefined||state.paperFrameView==='source'||
      Object.keys(state.offsets||{}).length||g.edges.length>128)return baseline;
    const rank=baseline.prepared.routing.rank_clearance_refinement,before=realizedRelations(baseline);
    const candidateState={...state,...rank?.attempts.filter(a=>a.accepted).at(-1)?.configuration,paperRoleSourceFrames:true,
      paperInputDocks:g.positions.context.inputDocks.length>0,
      paperEntryBand:g.positions.context.compoundAlignments.some(c=>L.entryBandGeometry(c,g.positions)),
      paperFlowAlignment:g.positions.context.compoundAlignments.some(c=>c.accepted&&c.mode==='entries')?'entries':state.paperFlowAlignment,
      paperSampleFrame:(g.frame_ownership||[]).some(r=>r.kind==='sequence-sample'),
      paperRankStrategy:state.paperRankStrategy||baseline.prepared.routing.topology_refinement?.selected||'earliest',
      paperContextEdges:state.paperContextEdges||before.contexts,paperBranchColumns:!!g.positions.context.branchColumns.length,
      paperContextLanes:g.positions.context.contextLanes.find(c=>c.selected!==false)?.side||false,
      ...(g.publication.label_clearance?{paperLabelSpacing:g.publication.label_clearance.mode}:{})};
    const probe=E.project(ir,{...candidateState,view:'publication'}),frames=(probe.frame_ownership||[]).filter(r=>r.kind==='role-source');
    if(!frames.length)return baseline;
    const trial=prepareLabels(ir,candidateState),q=trial.prepared.quality,ids=new Set(frames.map(r=>r.node)),after=realizedRelations(trial);
    const identity=h=>JSON.stringify({nodes:h.nodes.filter(n=>!ids.has(n.id)).map(n=>n.id),open:h.publication.open,
      edges:h.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,originals:e.originals,bundle_members:e.bundle_members,kind:e.kind,condition:e.condition})),
      node_accounting:Object.fromEntries(Object.entries(h.node_accounting).map(([k,v])=>[k,v.filter(id=>!ids.has(id))])),
      edge_accounting:h.edge_accounting,boundary:h.publication.boundary,roles:h.publication.role_frontier});
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    const facts=identity(g)===identity(trial.graph)&&frames.every(r=>g.positions.get(r.node)?.expanded&&trial.graph.node_accounting.attached.includes(r.node)&&trial.graph.positions.has(r.target));
    const accepted=facts&&areaMetric(q)<areaMetric(b)*.98&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&
      q.wire_length<=b.wire_length&&q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      conflicts(trial).every(id=>conflicts(baseline).includes(id))&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const chosen=accepted?trial:baseline;
    if(accepted)for(const [key,value]of Object.entries(baseline.prepared.routing))if(key.endsWith('_refinement'))chosen.prepared.routing[key]=value;
    chosen.prepared.routing.role_source_frame_refinement={accepted,facts_preserved:facts,frames,before:clearanceMetrics(b),candidate:clearanceMetrics(q),realized_before:before,realized_candidate:after,configuration:candidateState,
      scope:'Expanded ordinary helpers become source-ownership annotations inside the existing certified role scope. Exact source cuts, operations, bindings and selected frontier remain; one measured trial, no helper equivalence or execution claim.'};
    return chosen;
  }
  function prepareInvocationDocks(ir,state={}){
    const baseline=prepareRoleSourceFrames(ir,state),g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||g.publication.granularity!=='roles'||state.paperInvocationInputDocks!==undefined||
      Object.keys(state.offsets||{}).length||g.edges.length>128||!g.nodes.some(n=>n.invocation_binding))return baseline;
    const rank=baseline.prepared.routing.rank_clearance_refinement,before=realizedRelations(baseline);
    const candidateState={...state,...rank?.attempts.filter(a=>a.accepted).at(-1)?.configuration,paperInvocationInputDocks:true,
      paperInputDocks:g.positions.context.inputDocks.length>0,
      paperEntryBand:g.positions.context.compoundAlignments.some(c=>L.entryBandGeometry(c,g.positions)),
      paperFlowAlignment:g.positions.context.compoundAlignments.some(c=>c.accepted&&c.mode==='entries')?'entries':state.paperFlowAlignment,
      paperSampleFrame:(g.frame_ownership||[]).some(r=>r.kind==='sequence-sample'),
      paperRoleSourceFrames:(g.frame_ownership||[]).some(r=>r.kind==='role-source'),
      paperRankStrategy:state.paperRankStrategy||baseline.prepared.routing.topology_refinement?.selected||'earliest',
      paperContextEdges:state.paperContextEdges||before.contexts,paperBranchColumns:!!g.positions.context.branchColumns.length,
      paperContextLanes:g.positions.context.contextLanes.find(c=>c.selected!==false)?.side||false,
      ...(g.publication.label_clearance?{paperLabelSpacing:g.publication.label_clearance.mode}:{})};
    const probe=E.project(ir,{...candidateState,view:'publication'});
    if(!probe.positions.context.fixedInputs.length)return baseline;
    const trial=prepareLabels(ir,candidateState),q=trial.prepared.quality,after=realizedRelations(trial);
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    const facts=clearanceIdentity(g)===clearanceIdentity(trial.graph);
    const accepted=facts&&(areaMetric(q)<areaMetric(b)*.98||areaMetric(q)<=areaMetric(b)&&q.wire_length<=b.wire_length*.9)&&
      q.native_width_px<=b.native_width_px*1.1&&q.native_height_px<=b.native_height_px*1.1&&q.wire_length<=b.wire_length&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
      q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      conflicts(trial).every(id=>conflicts(baseline).includes(id))&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const chosen=accepted?trial:baseline;
    if(accepted)for(const [key,value]of Object.entries(baseline.prepared.routing))if(key.endsWith('_refinement'))chosen.prepared.routing[key]=value;
    chosen.prepared.routing.invocation_input_refinement={accepted,facts_preserved:facts,before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      docks:trial.graph.positions.context.fixedInputs,realized_before:before,realized_candidate:after,configuration:candidateState,
      scope:'One measured header arrangement of existing invocation-bound literal terminals. Same frontier, original operands and realized relations; reduced area or wire required, with no added crossings, contacts, routing failures or constraint conflicts. Fixed values stay explicit if the arrangement is rejected.'};
    return chosen;
  }
  function preparePresented(ir,state){
    // Measure the same presentation that will be serialized. Post-selection
    // alignment would otherwise make semantic decisions on different paths
    // and leave their quality/evidence receipts stale in the final SVG.
    const chosen=prepareRegionFollowers(ir,state,prepareContextSources(ir,state,prepareInvocationDocks(ir,state)));
    return chosen.prepared.quality.medium==='canvas'?prepareFinalGeometry(ir,state,chosen):chosen;
  }
  function prepareAdaptive(ir,state={}){
    let chosen=preparePresented(ir,state);
    if(state.paperAdaptive!==true||state.paperMedium!=='canvas'||state.paperGranularity!=='roles'||state.paperAuto===false||state.paperRelation||Object.keys(state.offsets||{}).length)return chosen;
    const engine=root.SemanticAdaptiveFrontier||(typeof require==='function'?require('./adaptive-frontier.js'):null);
    attachExpressionEvidence(ir,chosen);
    const planning=state.paperAdaptivePolicy==='structure';
    const initial=engine.metrics(chosen),attempts=[],preflights=[],seen=new Set();let selectedState={...state},measured=0;
    // Compare up to two routed alternatives against the same frontier before
    // choosing. Three routed trials total still bound the search; projected
    // benefit is an estimate, never a coverage or safety receipt.
    while(measured<3&&preflights.length<36){
      const opportunities=engine.candidates(chosen.graph,selectedState).filter(c=>!seen.has(c.id)),shortlist=[];
      for(const candidate of opportunities.slice(0,Math.min(12,36-preflights.length))){
        seen.add(candidate.id);
        const next=engine.apply(selectedState,candidate),graph=E.project(ir,{...next,view:'publication'}),before=new Set(chosen.graph.nodes.map(n=>n.id));
        const added=graph.nodes.filter(n=>!before.has(n.id)),request=candidate.kind==='roles'?graph.publication.role_frontier?.detail_requests.find(r=>r.node===candidate.node):null;
        const pathRequest=candidate.kind==='role-path'?graph.publication.role_frontier?.path_requests?.find(r=>r.node===candidate.node&&r.certificate===candidate.certificate&&JSON.stringify(r.role)===JSON.stringify(candidate.role)):null;
        let reason=request&&request.status!=='expanded'||candidate.kind==='role-path'&&(!pathRequest||pathRequest.status!=='exposed')?'protected-or-budgeted-role':!added.length?'no-new-visible-detail':null;
        const estimate=added.filter(n=>['compute','opaque','control'].includes(n.kind)).length;
        const benefit=reason||!planning?null:engine.preview(ir,chosen,graph);
        if(benefit?.only_summary_internal&&!benefit.structure&&!benefit.critical)reason='dependency-structure-already-expressed';
        const row={candidate,added_nodes:added.length,estimated_operations:estimate,estimated_benefit:benefit,reason};preflights.push(row);
        if(!reason)shortlist.push({candidate,next,benefit,estimate,added:added.length});
      }
      shortlist.sort((a,b)=>planning?(engine.compare({...a.benefit,cost:1,score:[a.benefit.critical,a.benefit.structure,a.benefit.detail]},
        {...b.benefit,cost:1,score:[b.benefit.critical,b.benefit.structure,b.benefit.detail]})||
        b.estimate/Math.max(1,b.added)-a.estimate/Math.max(1,a.added)||a.candidate.id.localeCompare(b.candidate.id)):
        b.candidate.priority-a.candidate.priority||b.estimate/Math.max(1,b.added)-a.estimate/Math.max(1,a.added)||a.candidate.id.localeCompare(b.candidate.id));
      // Spend the existing two-trial comparison on different granularities
      // of the same scope when available, rather than two full expansions.
      if(planning&&shortlist[0]?.candidate.kind==='roles'){
        const alternative=shortlist.findIndex((item,i)=>i>0&&item.candidate.kind==='role-path'&&item.candidate.node===shortlist[0].candidate.node);
        if(alternative>1)shortlist.splice(1,0,...shortlist.splice(alternative,1));
      }
      // Untested shortlist entries remain eligible after a successful local
      // step, with preflight repeated against that newly selected frontier.
      for(const item of shortlist)seen.delete(item.candidate.id);
      if(!shortlist.length){if(opportunities.length>12)continue;break;}
      const trials=[];
      for(const item of shortlist.slice(0,Math.min(planning?2:1,3-measured))){
        seen.add(item.candidate.id);
        const trial=attachExpressionEvidence(ir,preparePresented(ir,item.next)),assessment=engine.assess(ir,chosen,trial);measured++;
        const receipt={opportunity:item.candidate,requested_state:{paperRoleDetails:item.next.paperRoleDetails||[],paperRolePaths:item.next.paperRolePaths||[],paperExpressionDetails:item.next.paperExpressionDetails||[]},
          ...assessment,eligible:assessment.accepted,accepted:false,comparison_round:attempts.length};
        trials.push({item,trial,assessment,receipt});
      }
      const eligible=trials.filter(t=>t.assessment.accepted).sort((a,b)=>engine.compare(a.assessment.selection_benefit,b.assessment.selection_benefit)||a.item.candidate.id.localeCompare(b.item.candidate.id));
      const best=eligible[0];
      for(const t of trials){
        if(t===best)t.receipt.accepted=true;
        else if(t.receipt.eligible){t.receipt.reasons=[...t.receipt.reasons,'lower-measured-benefit'];seen.delete(t.item.candidate.id);}
        attempts.push(t.receipt);
      }
      if(best){chosen=best.trial;selectedState=best.item.next;}
    }
    const remaining=engine.candidates(chosen.graph,selectedState).filter(c=>!seen.has(c.id));
    const receipt={rule_version:engine.VERSION,requested:true,policy:planning?'structure':'detail',baseline:initial,selected:engine.metrics(chosen),attempts,preflights,
      selected_role_details:selectedState.paperRoleDetails||[],selected_role_paths:selectedState.paperRolePaths||[],selected_expression_details:selectedState.paperExpressionDetails||[],
      unmeasured_opportunities:remaining.length,measurement_limit:3,preflight_limit:36,
      geometry_scope:'Every canvas baseline and candidate includes the complete final geometry pipeline, including port/operand refinement, frame attachment, routing, header reflow and residual empty-band compaction, before evidence, quality and benefit are compared. Selected metrics describe the serialized figure.',
      scope:'Bounded measured comparison of local role/relation expressions; critical boundaries, newly expressed structure and detailed paths remain distinct. Existing summaries preserve structure without fulfilling atomic detail. Canonical IR and saved requests remain unchanged; this is not global summary/detail or graph-set planning.'};
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
  function prepareContextSources(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||g.publication.granularity!=='roles'||state.paperContextSourceFacing!==undefined||
      Object.keys(state.offsets||{}).length||g.edges.length>128||!g.positions.context.contextLanes.some(c=>c.selected!==false))return baseline;
    // Copy only drawing state. Canonical facts and the selected frontier stay
    // identical, and a rejected route search cannot poison baseline caches.
    const positions=new Map([...g.positions].map(([id,p])=>[id,{...p}]));
    positions.context={...g.positions.context,contextSourceFacing:true,routeCache:new Map(),reserved:[]};
    const graph={...g,positions,constraint_receipts:JSON.parse(JSON.stringify(g.constraint_receipts))};
    const changes=g.edges.map(e=>({edge:e.id,side:L.contextSourceSide(e,positions)})).filter(c=>c.side);
    if(!changes.some(c=>baseline.prepared.routes.find(e=>e.id===c.edge)?.route.source_side!==c.side))return baseline;
    const trial={graph,prepared:prepare(graph)},q=trial.prepared.quality;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const before=realizedRelations(baseline),after=realizedRelations(trial);
    const conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    const accepted=(q.line_geometry.crossings<b.line_geometry.crossings||q.wire_length<b.wire_length-1)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
      q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      areaMetric(q)<=areaMetric(b)&&q.wire_length<=b.wire_length&&conflicts(trial).every(id=>conflicts(baseline).includes(id))&&
      Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const chosen=accepted?trial:baseline;
    if(accepted)chosen.prepared.routing={...baseline.prepared.routing,...chosen.prepared.routing};
    chosen.prepared.routing.context_source_refinement={accepted,changes,before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      realized_before:before,realized_candidate:after,
      scope:'One source-facing routing candidate at identical node geometry and semantic frontier. Exact operands, distinct uses and existing realized relations are retained.'};
    return chosen;
  }
  function prepareRegionFollowers(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||!['roles','stages'].includes(g.publication.granularity)||state.paperRegionFollowers===false||
      g.publication.granularity==='stages'&&state.paperRegionFollowers!==true||
      Object.keys(state.offsets||{}).length||g.edges.length>128)return baseline;
    const proposal=L.regionFollowers(g.idx,g.nodes,g.edges,g.positions);
    if(!proposal.records.length)return baseline;
    const graph={...g,positions:proposal.positions,constraint_receipts:JSON.parse(JSON.stringify(g.constraint_receipts))};
    const trial={graph,prepared:prepare(graph)},q=trial.prepared.quality;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const before=realizedRelations(baseline),after=realizedRelations(trial),conflicts=r=>r.graph.constraint_receipts.filter(c=>c.status==='conflict').map(c=>c.id);
    const accepted=(q.line_geometry.crossings<b.line_geometry.crossings||q.wire_length<b.wire_length-1)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&
      q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&fontMetric(q)>=fontMetric(b)&&
      areaMetric(q)<=areaMetric(b)&&q.wire_length<=b.wire_length&&conflicts(trial).every(id=>conflicts(baseline).includes(id))&&
      Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const chosen=accepted?trial:baseline;
    if(accepted)chosen.prepared.routing={...baseline.prepared.routing,...chosen.prepared.routing};
    chosen.prepared.routing.region_follower_refinement={accepted,records:proposal.records,before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      realized_before:before,realized_candidate:after,
      scope:'One measured horizontal alignment of existing downstream nodes with a single expanded source region. Identical semantic frontier, ranks, containment and exact operand identities.'};
    return chosen;
  }
  // Revisit the already selected paths, not a fresh greedy routing run. A
  // dense figure may have spent its ordinary repair budget before the last
  // ambiguous rail became visible. Nodes and physical terminals stay fixed.
  function polishRoutes(baseline){
    const g=baseline.graph,b=baseline.prepared.quality,ctx=g.positions.context;
    if(b.medium!=='canvas'||g.edges.length>128||!b.line_geometry.crossings&&!b.line_geometry.unrelated_contacts.length)return baseline;
    let chosen=baseline;
    const savedContext={...ctx},savedReceipts=JSON.parse(JSON.stringify(g.constraint_receipts));
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id)),relations=realizedRelations(baseline);
    const score=q=>q.crossings+2*q.unrelated_contacts.length+4*q.overlapping_paths.filter(p=>!p.same_value).length;
    const record={attempts:0,accepted:[],before:clearanceMetrics(b),max_attempts:32,max_extra_crossings:1,max_wire_ratio:1.02};
    ctx.portOrder=b.route_strategy.startsWith('neighbors')?'neighbors':'canonical';
    ctx.ancestorPorts=b.route_strategy.includes('-header-')?'header':'boundary';
    ctx.crossingCost=180;ctx.contactCost=360;ctx.stubLength=16;
    const samePoint=(a,b)=>a.x===b.x&&a.y===b.y;
    for(let pass=0;pass<2;pass++){
      let improved=false;
      const scored=chosen.prepared.routes.map(e=>({id:e.id,score:chosen.prepared.routes.reduce((sum,o)=>sum+(o.id===e.id?0:score(lineGeometry([e,o]))),0)}))
        .filter(e=>e.score).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,8);
      for(const item of scored){
        const current=chosen.prepared.routes.find(e=>e.id===item.id),before=chosen.prepared.quality;
        ctx.reserved=chosen.prepared.routes.filter(e=>e.id!==item.id).flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
        for(const repair of [false,true]){
          ctx.routeCache=new Map();ctx.repairRoute=repair?current.route:null;
          let route;try{route=E.route(current,g.positions);}finally{ctx.repairRoute=null;}
          record.attempts++;
          if(!route.ok||route.points.length<2||!samePoint(route.points[0],current.route.points[0])||
            !samePoint(route.points.at(-1),current.route.points.at(-1))||route.source_side!==current.route.source_side||route.target_side!==current.route.target_side)continue;
          const prepared=evaluateRoutes(g,chosen.prepared.routes.map(e=>e.id===item.id?{...e,route}:e),b.route_strategy),q=prepared.quality;
          const contacts=new Set(before.line_geometry.unrelated_contacts.map(c=>JSON.stringify(c.edges)));
          if(score(q.line_geometry)>=score(before.line_geometry)||q.line_geometry.crossings>b.line_geometry.crossings+1||
            q.line_geometry.unrelated_contacts.length>before.line_geometry.unrelated_contacts.length||
            q.line_geometry.unrelated_contacts.some(c=>!contacts.has(JSON.stringify(c.edges)))||
            q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length>before.line_geometry.overlapping_paths.filter(p=>!p.same_value).length||
            q.issues.some(issue=>!before.issues.includes(issue))||q.route_failures.length>before.route_failures.length||
            q.unplaced_port_labels.length>before.unplaced_port_labels.length||fontMetric(q)<fontMetric(b)||
            q.native_width_px>b.native_width_px||q.native_height_px>b.native_height_px||q.wire_length>b.wire_length*1.02)continue;
          const trial={graph:g,prepared};E.auditConstraintRoutes(g,prepared.routes);
          const after=realizedRelations(trial);
          if(g.constraint_receipts.some(r=>applied.has(r.id)&&r.status!=='applied')||
            Object.keys(relations).some(k=>relations[k].some(id=>!after[k].includes(id)))){
            E.auditConstraintRoutes(g,chosen.prepared.routes);continue;
          }
          record.accepted.push({pass,edge:item.id,method:repair?'parallel-rail':'reserved-route',before:clearanceMetrics(before),after:clearanceMetrics(q)});
          chosen=trial;improved=true;break;
        }
      }
      if(!improved)break;
    }
    Object.assign(ctx,savedContext);ctx.repairRoute=null;
    ctx.routeCache=new Map(chosen.prepared.routes.map(e=>[e.id,e.route]));
    ctx.reserved=chosen.prepared.routes.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
    if(chosen===baseline)g.constraint_receipts=savedReceipts;else E.auditConstraintRoutes(g,chosen.prepared.routes);
    record.after=clearanceMetrics(chosen.prepared.quality);
    record.scope='Bounded refinement of selected routes; identical nodes, canonical bindings and physical terminals. Previously realized relations retained; no area or font regression.';
    chosen.prepared.routing={...baseline.prepared.routing,selected_route_refinement:record};
    return chosen;
  }
  function prepareCoupledRoutes(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||state.paperCoupledRoutes===false||Object.keys(state.offsets||{}).length||
      g.edges.length>128||!b.line_geometry.crossings)return baseline;
    // Single-wire repair cannot leave a local minimum when either wire needs
    // the corridor currently occupied by the other. Release only an actual
    // crossing pair, keep every other selected path, and measure both orders.
    const ordinary=e=>e.route.ok&&!e.design_route&&!e.context_lane&&!e.iteration&&!e.layout_after&&
      !g.positions.context.feedback?.has(e.id)&&(e.bundle_members||[e]).every(m=>
        ['data','alias','interface-binding','parameter-read','buffer-read'].includes(m.kind)&&!m.design_route&&!m.context_lane&&!m.iteration&&!m.layout_after);
    const pairs=[];
    for(let i=0;i<baseline.prepared.routes.length;i++)for(let j=i+1;j<baseline.prepared.routes.length;j++){
      const a=baseline.prepared.routes[i],c=baseline.prepared.routes[j];
      if(!ordinary(a)||!ordinary(c))continue;
      const crossings=lineGeometry([a,c]).crossings;
      if(crossings)pairs.push({edges:[a.id,c.id].sort(),crossings});
    }
    pairs.sort((a,c)=>c.crossings-a.crossings||a.edges[0].localeCompare(c.edges[0])||a.edges[1].localeCompare(c.edges[1]));
    if(!pairs.length)return baseline;
    const copy=x=>JSON.parse(JSON.stringify(x)),samePoint=(a,c)=>a.x===c.x&&a.y===c.y;
    const identity=clearanceIdentity(g),goals=Goals.build(ir,g.architecture),record={max_pairs:12,max_attempts:48,max_wire_ratio:1.02,before:clearanceMetrics(b),attempts:[]};
    let chosen=baseline,relations=realizedRelations(baseline);
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    let applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
    let covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    for(const pair of pairs.slice(0,record.max_pairs))for(const reverse of [false,true])for(const cost of [180,540]){
      const base=chosen,old=base.prepared.quality,previous=new Map(base.prepared.routes.map(e=>[e.id,e]));
      if(!lineGeometry(pair.edges.map(id=>previous.get(id))).crossings)continue;
      const positions=new Map([...base.graph.positions].map(([id,p])=>[id,{...p}]));
      const ctx=positions.context={...base.graph.positions.context,routeCache:new Map(),
        portOrder:b.route_strategy.startsWith('neighbors')?'neighbors':'canonical',ancestorPorts:b.route_strategy.includes('-header-')?'header':'boundary',
        crossingCost:cost,contactCost:cost*2,stubLength:16,repairRoute:null,
        reserved:base.prepared.routes.filter(e=>!pair.edges.includes(e.id)).flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]))};
      const graph={...base.graph,positions,constraint_receipts:copy(base.graph.constraint_receipts)},fresh=new Map();
      const order=reverse?pair.edges.slice().reverse():pair.edges;
      for(const id of order){const e=previous.get(id),route=L.route(e,positions);fresh.set(id,{...e,route});
        ctx.reserved.push(...route.points.slice(1).map((p,i)=>[route.points[i],p]));}
      const prepared=evaluateRoutes(graph,base.prepared.routes.map(e=>fresh.get(e.id)||e),b.route_strategy),q=prepared.quality;
      const physical=[...fresh.values()].every(e=>{const was=previous.get(e.id);return e.route.ok&&
        e.route.source_side===was.route.source_side&&e.route.target_side===was.route.target_side&&
        samePoint(e.route.points[0],was.route.points[0])&&samePoint(e.route.points.at(-1),was.route.points.at(-1));});
      const facts=clearanceIdentity(graph)===identity;
      const contacts=new Set(old.line_geometry.unrelated_contacts.map(c=>JSON.stringify(c.edges)));
      const geometry=physical&&facts&&q.line_geometry.crossings<old.line_geometry.crossings&&q.wire_length<=b.wire_length*record.max_wire_ratio&&
        q.line_geometry.unrelated_contacts.length<=old.line_geometry.unrelated_contacts.length&&
        q.line_geometry.unrelated_contacts.every(c=>contacts.has(JSON.stringify(c.edges)))&&
        q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.issues.every(issue=>old.issues.includes(issue))&&q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&
        fontMetric(q)>=fontMetric(b)&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px;
      let accepted=false,after,coverage;
      if(geometry){
        E.auditConstraintRoutes(graph,prepared.routes);after=realizedRelations({graph,prepared});
        coverage=new Set(Goals.evaluate(goals,graph,prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
        accepted=graph.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&
          Object.keys(relations).every(k=>relations[k].every(id=>after[k].includes(id)))&&[...covered].every(id=>coverage.has(id));
      }
      record.attempts.push({edges:pair.edges,order,crossing_cost:cost,accepted,physical_terminals_preserved:physical,facts_preserved:facts,
        before:clearanceMetrics(old),candidate:clearanceMetrics(q),...(geometry?{realized_before:relations,realized_candidate:after,direct_goals_before:covered.size,direct_goals_candidate:coverage.size}:{})});
      if(accepted){chosen={graph,prepared};relations=after;covered=coverage;applied=new Set(graph.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));}
    }
    record.after=clearanceMetrics(chosen.prepared.quality);
    record.scope='At most twelve actual crossing pairs and forty-eight route measurements after final compaction; fixed nodes, exact physical terminals and all distant paths retained. Existing facts, constraints, realized relations and direct expression goals are acceptance requirements. No semantic inference.';
    chosen.prepared.routing={...baseline.prepared.routing,coupled_route_refinement:record};return chosen;
  }
  function prepareCrossScopePorts(ir,state,baseline,{final=false}={}){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||state.paperCrossScopePorts===false||(final&&state.paperFinalScopeEntries===false)||Object.keys(state.offsets||{}).length||g.edges.length>128||
      !b.line_geometry.crossings&&!b.line_geometry.unrelated_contacts.length)return baseline;
    const proposals=L.crossScopeEntries(g.positions).filter(c=>{
      const route=baseline.prepared.routes.find(e=>e.id===c.edge)?.route;
      return route&&(route.source_side!==c.source_side||route.target_side!==c.target_side);
    });
    const groups=new Map(),by=new Map(g.edges.map(e=>[e.id,e]));
    for(const c of proposals){const key=JSON.stringify([by.get(c.edge).source,c.owner]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
    const score=group=>group.reduce((sum,c)=>{const e=baseline.prepared.routes.find(e=>e.id===c.edge);
      return sum+baseline.prepared.routes.reduce((n,other)=>n+(other.id===e.id?0:lineGeometry([e,other]).crossings),0);},0);
    const candidates=[...groups.values()].map(group=>({group,score:score(group)})).filter(c=>c.score)
      .sort((a,b)=>b.score-a.score||a.group[0].edge.localeCompare(b.group[0].edge)).slice(0,3);
    if(!candidates.length)return baseline;
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    let applied=new Set(g.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id)),before=realizedRelations(baseline);
    const goals=Goals.build(ir,g.architecture);
    let covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(c=>c.status==='fulfilled').map(c=>c.goal));
    const record={max_trials:final?6:3,attempts:[],before:clearanceMetrics(b),scope:final?
      'Final side-facing entry review after local arrangements; at most three source/frame groups and six route measurements. Fixed nodes, canonical slots and existing realized relations retained; distant selected paths may survive. No input-role or scheduling assertion.':
      'Measured side-facing entries from horizontally separate scopes; fixed nodes and canonical operand bindings. No input-role or scheduling assertion.'};
    let chosen=baseline,selected=final?[...g.positions.context.crossScopePorts||[]]:[];
    if(final)record.initial_entries=selected.slice();
    for(const {group}of candidates){
      const base=final?chosen:baseline;
      const plan=[...new Map([...selected,...group].map(c=>[c.edge,c])).values()],positions=new Map([...base.graph.positions].map(([id,p])=>[id,{...p}]));
      positions.context={...base.graph.positions.context,crossScopePorts:plan,routeCache:new Map(),reserved:[]};
      const graph={...base.graph,positions,constraint_receipts:JSON.parse(JSON.stringify(base.graph.constraint_receipts))},full=prepare(graph);
      const variants=[['full',full]],touched=new Set();
      if(final){
        // Changing a physical side also redistributes the other terminals on
        // either endpoint. Refresh all their incident uses, keeping distant
        // selected routes only as a measured candidate, never as a shortcut
        // around geometry, exact-slot or realized-relation validation.
        const peers=new Set(group.flatMap(c=>{const e=by.get(c.edge);return [e.source,e.target];}));
        for(const e of g.edges)if(peers.has(e.source)||peers.has(e.target))touched.add(e.id);
        const refreshed=new Map(full.routes.map(e=>[e.id,e]));
        variants.push(['retained',evaluateRoutes(graph,base.prepared.routes.map(e=>touched.has(e.id)?refreshed.get(e.id):e),full.quality.route_strategy)]);
      }
      for(const [routeMode,prepared]of variants){
      const measured=final?{...graph,positions:new Map([...positions].map(([id,p])=>[id,{...p}])),constraint_receipts:JSON.parse(JSON.stringify(graph.constraint_receipts))}:graph;
      if(final)measured.positions.context={...positions.context,routeCache:new Map(),reserved:[]};
      let trial={graph:measured,prepared};
      if(state.paperSelectedRoutes!==false)trial=polishRoutes(trial);
      const q=trial.prepared.quality,old=chosen.prepared.quality;
      E.auditConstraintRoutes(measured,trial.prepared.routes);
      const after=realizedRelations(trial),coverage=new Set(Goals.evaluate(goals,measured,trial.prepared,ir).filter(c=>c.status==='fulfilled').map(c=>c.goal));
      const facts=clearanceIdentity(g)===clearanceIdentity(measured);
      const terminals=new Set();let distinct=true;
      if(final)for(const e of trial.prepared.routes)for(const [node,source,p]of [[e.source,true,e.route.points[0]],[e.target,false,e.route.points.at(-1)]]){
        const key=JSON.stringify([node,source,p]);if(terminals.has(key))distinct=false;terminals.add(key);
      }
      const accepted=facts&&distinct&&q.line_geometry.crossings<old.line_geometry.crossings&&
        q.line_geometry.unrelated_contacts.length<=old.line_geometry.unrelated_contacts.length&&
        q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.issues.every(issue=>old.issues.includes(issue))&&q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&
        fontMetric(q)>=fontMetric(b)&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&q.wire_length<=(final?old.wire_length:b.wire_length*1.02)&&
        measured.constraint_receipts.every(c=>!applied.has(c.id)||c.status==='applied')&&
        Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)))&&[...covered].every(id=>coverage.has(id));
      record.attempts.push({entries:group,...(final?{route_mode:routeMode,refreshed_edges:[...touched],distinct_terminals:distinct}:{}),accepted,facts_preserved:facts,before:clearanceMetrics(old),candidate:clearanceMetrics(q),
        realized_before:before,realized_candidate:after,direct_goals_before:covered.size,direct_goals_candidate:coverage.size});
      if(accepted){chosen=trial;selected=plan;before=after;covered=coverage;applied=new Set(measured.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));}
      }
    }
    record.after=clearanceMetrics(chosen.prepared.quality);record.selected=selected;
    chosen.prepared.routing={...baseline.prepared.routing,...chosen.prepared.routing,[final?'final_scope_entry_refinement':'cross_scope_refinement']:record};
    return chosen;
  }
  function prepareConsumerArguments(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||g.publication.granularity!=='roles'||state.paperConsumerArguments===false||Object.keys(state.offsets||{}).length||g.edges.length>128)return baseline;
    const literals=InvocationInputs.compile(ir);if(!literals.size)return baseline;
    let chosen=baseline,before=realizedRelations(baseline);
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    let applied=new Set(g.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));
    const goals=Goals.build(ir,g.architecture);
    let covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(c=>c.status==='fulfilled').map(c=>c.goal));
    const record={max_trials:2,attempts:[],before:clearanceMetrics(b)},seen=new Set();
    for(const preference of ['left','right']){
      const proposal=L.consumerArguments(g.positions,literals,preference),key=JSON.stringify(proposal.records);
      if(!proposal.records.length||seen.has(key))continue;seen.add(key);
      const graph={...g,positions:proposal.positions,constraint_receipts:JSON.parse(JSON.stringify(g.constraint_receipts))};
      let trial={graph,prepared:prepare(graph)};if(state.paperSelectedRoutes!==false)trial=polishRoutes(trial);
      E.auditConstraintRoutes(graph,trial.prepared.routes);
      const q=trial.prepared.quality,old=chosen.prepared.quality,after=realizedRelations(trial);
      const coverage=new Set(Goals.evaluate(goals,graph,trial.prepared,ir).filter(c=>c.status==='fulfilled').map(c=>c.goal)),facts=clearanceIdentity(g)===clearanceIdentity(graph);
      const accepted=facts&&(q.line_geometry.crossings<old.line_geometry.crossings||q.wire_length<old.wire_length*.98)&&
        q.line_geometry.crossings<=old.line_geometry.crossings&&q.wire_length<=old.wire_length&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&fontMetric(q)>=fontMetric(b)&&
        q.line_geometry.unrelated_contacts.length<=old.line_geometry.unrelated_contacts.length&&
        q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&q.issues.every(issue=>old.issues.includes(issue))&&
        graph.constraint_receipts.every(c=>!applied.has(c.id)||c.status==='applied')&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)))&&[...covered].every(id=>coverage.has(id));
      record.attempts.push({preference,records:proposal.records,accepted,facts_preserved:facts,before:clearanceMetrics(old),candidate:clearanceMetrics(q),
        realized_before:before,realized_candidate:after,direct_goals_before:covered.size,direct_goals_candidate:coverage.size});
      if(accepted){chosen=trial;before=after;covered=coverage;applied=new Set(graph.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));
        chosen.graph.positions.context.consumerArguments=proposal.records;}
    }
    if(!record.attempts.length)return baseline;
    record.after=clearanceMetrics(chosen.prepared.quality);record.selected=chosen.graph.positions.context.consumerArguments||[];
    record.scope='At most two measured placements of existing fixed call inputs beside their single closed consumer; no semantic frontier change, branch pruning or scheduling assertion.';
    chosen.prepared.routing={...baseline.prepared.routing,...chosen.prepared.routing,consumer_argument_refinement:record};return chosen;
  }
  function prepareOperandRows(ir,state,baseline,{declared=false}={}){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||g.publication.granularity!=='roles'||state.paperOperandRows===false||(declared&&state.paperDeclaredOperandOrder===false)||Object.keys(state.offsets||{}).length||g.edges.length>128)return baseline;
    let chosen=baseline,before=realizedRelations(baseline);
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    let applied=new Set(g.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));
    const goals=Goals.build(ir,g.architecture);
    let covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(c=>c.status==='fulfilled').map(c=>c.goal));
    const record={max_trials:declared?6:4,max_arrangements:declared?3:2,attempts:[],before:clearanceMetrics(b)},seen=new Set();
    const aligned=(rows,positions)=>rows.filter(r=>r.nodes.every(n=>positions.get(n.node)?.y===positions.get(r.nodes[0].node)?.y)).length;
    const ordered=(rows,positions)=>rows.filter(r=>{
      const ids=r.declaration?r.declaration.inputs.map(n=>n.node):g.edges.filter(e=>e.target===r.sink&&r.nodes.some(n=>n.node===e.source)).map(e=>e.source);
      return ids.every((id,i)=>!i||positions.get(ids[i-1]).x+positions.get(ids[i-1]).w/2<positions.get(id).x+positions.get(id).w/2);
    }).length;
    const plans=declared?L.operandRows(g.positions,'declared',ir.edges).records
      .sort((a,b)=>g.positions.get(a.sink).y-g.positions.get(b.sink).y||g.positions.get(a.sink).x-g.positions.get(b.sink).x||a.sink.localeCompare(b.sink))
      .slice(0,record.max_arrangements).map(r=>({order:'declared',sink:r.sink})):['existing','operands'].map(order=>({order}));
    for(const {order,sink}of plans){
      const base=declared?chosen:baseline,baseGraph=base.graph;
      const proposal=L.operandRows(baseGraph.positions,order,ir.edges,{sink}),key=JSON.stringify(proposal.records.flatMap(r=>r.nodes.map(n=>[n.node,n.after.x,n.after.y])).sort((a,b)=>a[0].localeCompare(b[0])));
      if(!proposal.records.length||seen.has(key))continue;seen.add(key);
      const graph={...baseGraph,positions:proposal.positions,constraint_receipts:JSON.parse(JSON.stringify(baseGraph.constraint_receipts))};
      const full=prepare(graph),moved=new Set(proposal.records.flatMap(r=>r.nodes.filter(n=>n.before.x!==n.after.x||n.before.y!==n.after.y).map(n=>n.node))),peers=new Set(moved);
      for(const e of g.edges)if(moved.has(e.source)||moved.has(e.target)){peers.add(e.source);peers.add(e.target);}
      // Keep good distant paths as a second candidate. All incident terminal
      // peers and any old path hit by a relocated body are refreshed from the
      // fully routed candidate. Final geometry and exact coverage still gate it.
      const touched=new Set(g.edges.filter(e=>peers.has(e.source)||peers.has(e.target)).map(e=>e.id));
      for(const e of base.prepared.routes)if([...moved].some(id=>{
        const p=graph.positions.get(id),box={x:p.x-8,y:p.y-8,w:p.w+16,h:p.h+16};
        return e.source!==id&&e.target!==id&&e.route.points.some((v,i,ps)=>i&&L.blocked(ps[i-1],v,[box]));
      }))touched.add(e.id);
      const refreshed=new Map(full.routes.map(e=>[e.id,e]));
      const retained=evaluateRoutes(graph,base.prepared.routes.map(e=>touched.has(e.id)?refreshed.get(e.id):e),full.quality.route_strategy);
      for(const [routeMode,initial]of [['full',full],['retained',retained]]){
      const trialGraph={...graph,positions:new Map([...graph.positions].map(([id,p])=>[id,{...p}])),constraint_receipts:JSON.parse(JSON.stringify(g.constraint_receipts))};
      trialGraph.positions.context={...graph.positions.context,routeCache:new Map(),reserved:[]};
      let trial={graph:trialGraph,prepared:initial};if(state.paperSelectedRoutes!==false)trial=polishRoutes(trial);
      const measured=trial.graph;
      E.auditConstraintRoutes(measured,trial.prepared.routes);
      const q=trial.prepared.quality,old=chosen.prepared.quality,after=realizedRelations(trial),rowsBefore=aligned(proposal.records,chosen.graph.positions),rowsAfter=aligned(proposal.records,graph.positions);
      const orderBefore=ordered(proposal.records,chosen.graph.positions),orderAfter=ordered(proposal.records,measured.positions);
      const terminals=new Set();let distinct=true;
      for(const e of trial.prepared.routes)for(const [node,source,p]of [[e.source,true,e.route.points[0]],[e.target,false,e.route.points.at(-1)]]){
        const key=JSON.stringify([node,source,p]);if(terminals.has(key))distinct=false;terminals.add(key);
      }
      const coverage=new Set(Goals.evaluate(goals,measured,trial.prepared,ir).filter(c=>c.status==='fulfilled').map(c=>c.goal)),facts=clearanceIdentity(g)===clearanceIdentity(measured);
      const previousRows=[...chosen.graph.positions.context.operandRows||[],...chosen.graph.positions.context.declaredOperandRows||[]];
      const accepted=facts&&distinct&&rowsAfter===proposal.records.length&&(rowsAfter>rowsBefore||orderAfter>orderBefore||q.line_geometry.crossings<old.line_geometry.crossings||q.wire_length<old.wire_length*.98)&&
        aligned(previousRows,measured.positions)===previousRows.length&&previousRows.every(r=>!ordered([r],chosen.graph.positions)||ordered([r],measured.positions)===1)&&
        q.line_geometry.crossings<=old.line_geometry.crossings&&q.wire_length<=old.wire_length&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&fontMetric(q)>=fontMetric(b)&&
        q.line_geometry.unrelated_contacts.length<=old.line_geometry.unrelated_contacts.length&&q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&q.issues.every(issue=>old.issues.includes(issue))&&
        measured.constraint_receipts.every(c=>!applied.has(c.id)||c.status==='applied')&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)))&&[...covered].every(id=>coverage.has(id));
      record.attempts.push({order,route_mode:routeMode,refreshed_edges:[...touched],records:proposal.records,accepted,facts_preserved:facts,distinct_terminals:distinct,before:clearanceMetrics(old),candidate:clearanceMetrics(q),aligned_before:rowsBefore,aligned_candidate:rowsAfter,ordered_before:orderBefore,ordered_candidate:orderAfter,
        realized_before:before,realized_candidate:after,direct_goals_before:covered.size,direct_goals_candidate:coverage.size});
      if(accepted){chosen=trial;before=after;covered=coverage;applied=new Set(measured.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));
        if(declared)chosen.graph.positions.context.declaredOperandRows=[...(chosen.graph.positions.context.declaredOperandRows||[]).filter(r=>!proposal.records.some(p=>p.sink===r.sink)),...proposal.records];
        else chosen.graph.positions.context.operandRows=proposal.records;}
      }
    }
    if(!record.attempts.length)return baseline;
    record.after=clearanceMetrics(chosen.prepared.quality);record.selected=chosen.graph.positions.context[declared?'declaredOperandRows':'operandRows']||[];
    record.scope=declared?'At most three individually measured source declaration orders and six route measurements; exact canonical bindings, existing aligned rows and realized constraints retained. No semantic frontier or scheduling change.':
      'At most two row arrangements and four route measurements of independent closed visible operands; exact bindings and all boundaries retained, no semantic frontier or scheduling change.';
    chosen.prepared.routing={...baseline.prepared.routing,...chosen.prepared.routing,[declared?'declared_operand_refinement':'operand_row_refinement']:record};return chosen;
  }
  function prepareFinalSampleFrames(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||!['stages','roles'].includes(g.publication.granularity)||state.paperFinalSampleFrames===false||state.paperSampleFrame!==undefined||
      state.paperFrameView==='source'||state.paperProtectFrameTitles===true||Object.keys(state.offsets||{}).length||g.edges.length>128)return baseline;
    const F=root.SemanticFrameOwnership||(typeof require==='function'?require('./frame-ownership.js'):null);
    const frames=[...F.select({ir,idx:g.idx,visible:new Set(g.positions.keys()),open:new Set(g.publication.open),
      roots:[g.publication.focus],flattenSequenceSamples:true}).values()].filter(r=>r.kind==='sequence-sample');
    if(!frames.length)return baseline;
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    const copy=x=>JSON.parse(JSON.stringify(x)),ids=new Set(frames.map(r=>r.node));
    if(g.edges.some(e=>ids.has(e.source)||ids.has(e.target))||g.positions.context.contextLanes.some(r=>ids.has(r.owner)))return baseline;
    const targets=new Map(frames.map(r=>[r.node,r.target])),destination=id=>targets.get(id)||id;
    // Nested simultaneous attachments need a separate ownership/size proof.
    // Keep those boundaries rather than partially applying a transitive move.
    if(frames.some(r=>ids.has(r.target)))return baseline;
    const nodes=[...g.idx.nodes.values()].map(copy);
    for(const n of nodes){n.parent=destination(n.parent);if(n.frame_ownership)n.frame_ownership=n.frame_ownership.map(r=>({...r,target:destination(r.target)}));}
    const idx=E.index({nodes});
    for(const r of frames){const owner=idx.nodes.get(r.target),sample=idx.nodes.get(r.node);
      owner.frame_ownership=[...owner.frame_ownership||[],...sample.frame_ownership||[],r].map(r=>({...r,target:owner.id}));
      P.decorate(owner,idx);
    }
    const drawingIdx=E.index({nodes}),positions=new Map([...g.positions].filter(([id])=>!ids.has(id)).map(([id,p])=>[id,{...p}])),windows=[];
    for(const r of frames){const p=positions.get(r.target),old=g.positions.get(r.target),sample=g.positions.get(r.node),paper=drawingIdx.nodes.get(r.target).paper;
      const extra=paper.h-g.idx.nodes.get(r.target).paper.h;
      Object.assign(p,{...paper,w:old.w,h:old.h,header:old.header+extra,protected_header_height:(old.protected_header_height||0)+extra});
      if(sample.design_gutter)p.design_gutter=Math.max(p.design_gutter||0,sample.x+sample.design_gutter-p.x);
      windows.push({top:Math.max(sample.y+8,p.y+p.header+8),bottom:sample.y+sample.header});
    }
    const bands=L.emptyBands(positions,baseline.prepared.routes,windows,baseline.prepared.labeling.placed);
    if(!bands.length)return baseline;
    const map=y=>y-bands.reduce((sum,r)=>sum+Math.max(0,Math.min(y,r.bottom)-r.top),0);
    for(const p of positions.values()){const bottom=map(p.y+p.h),y=map(p.y);p.h=bottom-y;p.y=y;}
    const context={...g.positions.context,idx:drawingIdx,routeCache:new Map(),reserved:[]};
    // Geometry receipts describe the current layout. Earlier routing-stage
    // measurements stay untouched and continue to describe their own stage.
    for(const key of ['consumerArguments','operandRows'])if(context[key]){
      context[key]=copy(context[key]);for(const row of context[key])for(const n of row.nodes||[row])for(const at of ['before','after'])if(n[at])n[at].y=map(n[at].y);
    }
    const edges=g.edges.map(e=>e.design_route?{...e,design_route:{...e.design_route,owner:destination(e.design_route.owner)}}:e);
    context.edges=edges;positions.context=context;
    const accounting=copy(g.node_accounting);
    accounting.visible=accounting.visible.filter(id=>!ids.has(id));accounting.attached=[...new Set([...accounting.attached,...ids])];
    const graph={...g,nodes:g.nodes.filter(n=>!ids.has(n.id)).map(n=>drawingIdx.nodes.get(n.id)),positions,idx:drawingIdx,edges,node_accounting:accounting,
      frame_ownership:[...g.frame_ownership||[],...frames].map(r=>({...r,target:destination(r.target)})),
      representatives:Object.fromEntries(Object.entries(g.representatives).map(([id,target])=>[id,destination(target)])),
      constraint_receipts:copy(g.constraint_receipts),bounds:{...g.bounds,h:map(g.bounds.y+g.bounds.h)-map(g.bounds.y)}};
    const routes=baseline.prepared.routes.map(e=>({...e,...(e.design_route?{design_route:{...e.design_route,owner:destination(e.design_route.owner)}}:{}),
      route:{...e.route,points:e.route.points.map(p=>({...p,y:map(p.y)}))}}));
    const prepared=evaluateRoutes(graph,routes,b.route_strategy),trial={graph,prepared},q=prepared.quality,before=realizedRelations(baseline),after=realizedRelations(trial);
    E.auditConstraintRoutes(graph,routes);
    const applied=new Set(g.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id)),goals=Goals.build(ir,g.architecture);
    const done=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const evaluated=Goals.evaluate(goals,graph,prepared,ir),covered=new Set(evaluated.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const summaries=SummaryGoals.build(ir,g.architecture);
    const summarized=new Set(SummaryGoals.evaluate(summaries,ir,g,baseline.prepared).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const summaryEvaluation=SummaryGoals.evaluate(summaries,ir,graph,prepared),summaryCovered=new Set(summaryEvaluation.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const accepted=areaMetric(q)<areaMetric(b)&&q.native_width_px<=b.native_width_px&&q.native_height_px<b.native_height_px&&q.wire_length<=b.wire_length&&fontMetric(q)>=fontMetric(b)&&
      q.line_geometry.crossings<=b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.issues.every(issue=>b.issues.includes(issue))&&
      graph.constraint_receipts.every(c=>!applied.has(c.id)||c.status==='applied')&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)))&&[...done].every(id=>covered.has(id))&&[...summarized].every(id=>summaryCovered.has(id));
    const chosen=accepted?trial:baseline;
    chosen.prepared.routing={...baseline.prepared.routing,final_sample_frame_refinement:{accepted,frames,windows,bands,before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      realized_before:before,realized_candidate:after,direct_goals_before:done.size,direct_goals_candidate:covered.size,
      summary_goals_before:summarized.size,summary_goals_candidate:summaryCovered.size,
      lost_summaries:summaryEvaluation.filter(r=>summarized.has(r.goal)&&r.status!=='fulfilled'),
      lost_goals:evaluated.filter(r=>done.has(r.goal)&&r.status!=='fulfilled'),
      scope:'One final ownership candidate, no rerouting. A common monotone map removes globally empty title bands, preserving concrete nodes, horizontal wires, labels, terminals and exact bindings; no call equivalence or execution claim.'}};
    return chosen;
  }
  function prepareCoincidentPorts(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||state.paperCoincidentPorts===false||Object.keys(state.offsets||{}).length||g.edges.length>128||
      !b.line_geometry.crossings)return baseline;
    const score=r=>baseline.prepared.routes.filter(e=>r.before.some(i=>i.edge===e.id)).reduce((sum,e)=>sum+
      baseline.prepared.routes.reduce((n,o)=>n+(o.id===e.id?0:lineGeometry([e,o]).crossings),0),0);
    const plans=L.coincidentPorts(g.positions,baseline.prepared.routes).map(plan=>({plan,score:score(plan)})).filter(r=>r.score)
      .sort((a,b)=>b.score-a.score||a.plan.node.localeCompare(b.plan.node)||a.plan.side.localeCompare(b.plan.side)).slice(0,3);
    if(!plans.length)return baseline;
    let chosen=baseline,relations=realizedRelations(baseline);
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    let applied=new Set(g.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));
    const goals=Goals.build(ir,g.architecture);
    let covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const record={max_trials:3,before:clearanceMetrics(b),attempts:[]},point=(a,b)=>a.x===b.x&&a.y===b.y;
    for(const {plan}of plans){
      const base=chosen,positions=new Map([...base.graph.positions].map(([id,p])=>[id,{...p}]));
      const selection={node:plan.node,side:plan.side,order:plan.after.map(({edge,source,other})=>({edge,source,other}))};
      positions.context={...base.graph.positions.context,coincidentPorts:[...base.graph.positions.context.coincidentPorts||[],selection],routeCache:new Map(),reserved:[]};
      const graph={...base.graph,positions,constraint_receipts:JSON.parse(JSON.stringify(base.graph.constraint_receipts))},ctx=positions.context;
      ctx.portOrder=b.route_strategy.startsWith('neighbors')?'neighbors':'canonical';ctx.ancestorPorts=b.route_strategy.includes('-header-')?'header':'boundary';ctx.crossingCost=180;ctx.contactCost=360;ctx.stubLength=16;
      const touched=new Set(graph.edges.filter(e=>e.source===plan.node||e.target===plan.node).map(e=>e.id)),refreshed=new Map();
      ctx.reserved=base.prepared.routes.filter(e=>!touched.has(e.id)).flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
      for(const e of graph.edges.filter(e=>touched.has(e.id))){const route=L.route(e,positions);refreshed.set(e.id,{...e,route});
        ctx.reserved.push(...route.points.slice(1).map((p,i)=>[route.points[i],p]));}
      let trial={graph,prepared:evaluateRoutes(graph,base.prepared.routes.map(e=>refreshed.get(e.id)||e),b.route_strategy)};
      if(state.paperSelectedRoutes!==false)trial=polishRoutes(trial);
      E.auditConstraintRoutes(graph,trial.prepared.routes);
      const q=trial.prepared.quality,old=base.prepared.quality,after=realizedRelations(trial),original=new Map(base.prepared.routes.map(e=>[e.id,e])),terminals=new Set();let distinct=true;
      const physical=trial.prepared.routes.every(e=>{const prev=original.get(e.id);return e.route.source_side===prev.route.source_side&&e.route.target_side===prev.route.target_side&&
        [[true,e.source,e.route.points[0],prev.route.points[0]],[false,e.target,e.route.points.at(-1),prev.route.points.at(-1)]].every(([source,node,p,was])=>{
          const key=JSON.stringify([node,p]);if(terminals.has(key))distinct=false;terminals.add(key);
          return node===plan.node&&(source?e.route.source_side:e.route.target_side)===plan.side||point(p,was);
        });});
      const coverage=new Set(Goals.evaluate(goals,graph,trial.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal)),facts=clearanceIdentity(g)===clearanceIdentity(graph);
      const accepted=facts&&physical&&distinct&&q.line_geometry.crossings<old.line_geometry.crossings&&q.wire_length<=old.wire_length&&
        q.native_width_px<=old.native_width_px&&q.native_height_px<=old.native_height_px&&fontMetric(q)>=fontMetric(old)&&
        q.line_geometry.unrelated_contacts.length<=old.line_geometry.unrelated_contacts.length&&q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&q.issues.every(issue=>old.issues.includes(issue))&&
        graph.constraint_receipts.every(c=>!applied.has(c.id)||c.status==='applied')&&Object.keys(relations).every(k=>relations[k].every(id=>after[k].includes(id)))&&[...covered].every(id=>coverage.has(id));
      record.attempts.push({plan,refreshed_edges:[...touched],accepted,facts_preserved:facts,physical_terminals_preserved:physical,distinct_terminals:distinct,
        before:clearanceMetrics(old),candidate:clearanceMetrics(q),realized_before:relations,realized_candidate:after,direct_goals_before:covered.size,direct_goals_candidate:coverage.size});
      if(accepted){chosen=trial;relations=after;covered=coverage;applied=new Set(graph.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));}
    }
    record.after=clearanceMetrics(chosen.prepared.quality);record.selected=chosen.graph.positions.context.coincidentPorts||[];
    record.scope='At most three measured physical port tie orders on fixed geometry. Only coincident neighbor centers are reordered by distance; every value, condition and operand slot stays distinct. No source-role, scheduling or value-equivalence inference.';
    chosen.prepared.routing={...baseline.prepared.routing,coincident_port_refinement:record};return chosen;
  }
  function prepareEmptyBandCompaction(ir,state,baseline,{minimum=16,diagnostic='empty_band_compaction'}={}){
    const g=baseline.graph,b=baseline.prepared.quality,ctx=g.positions.context;
    if(b.medium!=='canvas'||state.paperEmptyBandCompaction===false||state.paperProtectFrameTitles===true||
      state.paperLabelSpacing!==undefined||state.paperLabelGapY!==undefined||Object.keys(state.offsets||{}).length||
      g.nodes.length>512||g.edges.length>2048||b.route_failures.length||b.unplaced_port_labels.length)return baseline;
    const protectedGaps=[];
    // Keep outer margins and explicit entry/rank clearance contracts. A frame
    // body may shrink, but its title, bottom border and all concrete contents
    // keep their original size and at least the existing obstacle padding.
    for(const p of g.positions.values())if(p.expanded)protectedGaps.push({y:p.y+p.h,h:0});
    for(const r of ctx.compoundAlignments||[])if(L.entryBandGeometry(r,g.positions)){
      const y=Math.max(...r.input_band.inputs.map(id=>{const p=g.positions.get(id);return p.y+p.h;}));
      protectedGaps.push({y,h:r.input_band.gap_y});
    }
    for(const r of ctx.rankClearances||[])if(r.applied)for(const row of r.ranks){
      const kids=row.nodes.map(id=>g.positions.get(id)).filter(Boolean);
      if(kids.length&&row.gap_after)protectedGaps.push({y:Math.max(...kids.map(p=>p.y+p.h)),h:row.gap_after});
    }
    const windows=[{top:g.bounds.y+24,bottom:g.bounds.y+g.bounds.h-24}],bands=L.emptyBands(g.positions,baseline.prepared.routes,windows,[...baseline.prepared.labeling.placed,...protectedGaps],minimum);
    if(!bands.length)return baseline;
    const map=y=>y-bands.reduce((sum,r)=>sum+Math.max(0,Math.min(y,r.bottom)-r.top),0);
    const positions=new Map([...g.positions].map(([id,p])=>[id,{...p,y:map(p.y),h:map(p.y+p.h)-map(p.y)}]));
    const copy=x=>JSON.parse(JSON.stringify(x));
    positions.context={...ctx,routeCache:new Map(),reserved:[]};
    for(const key of ['consumerArguments','operandRows','declaredOperandRows'])if(ctx[key]){
      positions.context[key]=copy(ctx[key]);
      for(const row of positions.context[key])for(const n of row.nodes||[row])for(const at of ['before','after'])if(n[at])n[at].y=map(n[at].y);
    }
    const graph={...g,positions,constraint_receipts:copy(g.constraint_receipts),bounds:{...g.bounds,h:map(g.bounds.y+g.bounds.h)-map(g.bounds.y)}};
    const routes=baseline.prepared.routes.map(e=>({...e,route:{...e.route,points:e.route.points.map(p=>({...p,y:map(p.y)}))}}));
    const labeling={placed:baseline.prepared.labeling.placed.map(p=>({...p,y:map(p.y)})),suppressed:[]};
    const trial={graph,prepared:evaluateRoutes(graph,routes,b.route_strategy,labeling)},q=trial.prepared.quality;
    E.auditConstraintRoutes(graph,routes);
    const before=realizedRelations(baseline),after=realizedRelations(trial),applied=new Set(g.constraint_receipts.filter(c=>c.status==='applied').map(c=>c.id));
    const goals=Goals.build(ir,g.architecture),done=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const evaluated=Goals.evaluate(goals,graph,trial.prepared,ir),covered=new Set(evaluated.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const bandsPreserved=(ctx.compoundAlignments||[]).every(r=>!L.entryBandGeometry(r,g.positions)||L.entryBandGeometry(r,positions));
    const accepted=clearanceIdentity(g)===clearanceIdentity(graph)&&bandsPreserved&&areaMetric(q)<areaMetric(b)&&
      q.native_height_px<b.native_height_px&&q.native_width_px<=b.native_width_px&&q.wire_length<=b.wire_length&&fontMetric(q)>=fontMetric(b)&&
      q.line_geometry.crossings===b.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.issues.every(issue=>b.issues.includes(issue))&&
      graph.constraint_receipts.every(c=>!applied.has(c.id)||c.status==='applied')&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)))&&[...done].every(id=>covered.has(id));
    const chosen=accepted?trial:baseline;
    chosen.prepared.routing={...baseline.prepared.routing,[diagnostic]:{accepted,minimum_removed_px:minimum,windows,bands,protected_gaps:protectedGaps,
      before:clearanceMetrics(b),candidate:clearanceMetrics(q),realized_before:before,realized_candidate:after,
      direct_goals_before:done.size,direct_goals_candidate:covered.size,bands_preserved:bandsPreserved,
      scope:'One common monotone vertical map of globally empty bands, without rerouting or changing the semantic frontier. Concrete nodes, titles, horizontal wires, labels, terminals, frame borders and explicit clearances are protected; no execution or operation-equivalence claim.'}};
    return chosen;
  }
  function prepareResidualBands(ir,state,baseline){
    if(state.paperResidualBands===false)return baseline;
    // After route and header refinements, even a narrow free band can be
    // removed without choosing a new frontier or rerouting. The minimum is
    // removable whitespace, not node clearance: all existing 8px guards and
    // explicit rank/entry gaps remain protected by the shared compactor.
    return prepareEmptyBandCompaction(ir,state,baseline,{minimum:1,diagnostic:'residual_band_compaction'});
  }
  function prepareHeaderReflow(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality,ctx=g.positions.context;
    if(state.paperHeaderReflow===false||b.medium!=='canvas'||state.paperProtectFrameTitles===true||
      state.paperLabelSpacing!==undefined||state.paperLabelGapY!==undefined||Object.keys(state.offsets||{}).length||
      g.nodes.length>512||g.edges.length>2048||b.route_failures.length||b.unplaced_port_labels.length)return baseline;
    const nodes=new Map([...g.idx.nodes].map(([id,n])=>[id,{...n}])),positions=new Map([...g.positions].map(([id,p])=>[id,{...p}]));
    const normalized=s=>String(s||'').replace(/\s/g,''),records=[];
    const ancestors=id=>{const found=new Set();while(id&&!found.has(id)){found.add(id);id=g.idx.nodes.get(id)?.parent;}return found;};
    const active=new Map(baseline.prepared.routes.map(e=>[e.id,new Set([...ancestors(e.source),...ancestors(e.target)])]));
    const intersects=(points,box)=>points.slice(1).some((q,i)=>{const p=points[i],eps=1e-7;
      return p.x===q.x?p.x>box.x+eps&&p.x<box.x+box.w-eps&&Math.max(p.y,q.y)>box.y+eps&&Math.min(p.y,q.y)<box.y+box.h-eps:
        p.y>box.y+eps&&p.y<box.y+box.h-eps&&Math.max(p.x,q.x)>box.x+eps&&Math.min(p.x,q.x)<box.x+box.w-eps;});
    for(const [id,p]of positions){const n=nodes.get(id),a=n.paper;
      // Appended operand rows and inventory reservations have independent
      // layout contracts. A raw caption alone cannot reconstruct those facts.
      if(!p.expanded||p.protected_header_width||(ctx.fixedInputs||[]).some(r=>r.parent===id)||a.layout_caption_rows!=null||
        baseline.prepared.routes.some(e=>e.source===id||e.target===id)||
        normalized(a.lines.join(''))!==normalized(a.title)||normalized(a.captions.join(''))!==normalized(a.caption))continue;
      const width=p.w-28,lines=P.wrap(a.title,width,a.font),captions=a.caption?P.wrap(a.caption,width,13):[];
      if(lines.length>a.lines.length||captions.length>a.captions.length)continue;
      const saved=(a.lines.length-lines.length)*20+(a.captions.length-captions.length)*16;if(saved<16)continue;
      let header=Math.max(p.header-saved,(state.paperCompact?56:66)+(state.paperCompact?12:20));
      // Shrinking a pass-through title must not turn an existing legal wire
      // into an intrusion through an unrelated frame body. Keep that rail.
      const released={x:p.x,y:p.y+header-10,w:p.w,h:p.header-header};
      const blocked=header<p.header?baseline.prepared.routes.filter(e=>!active.get(e.id).has(id)&&intersects(e.route.points,released)).map(e=>e.id):[];
      if(blocked.length)header=p.header;
      const saving=p.header-header;
      n.paper={...a,lines,captions,h:a.h-saving};
      Object.assign(p,{lines,captions,header,protected_header_height:p.protected_header_height-saving});
      records.push({node:id,width,lines_before:a.lines,lines_after:lines,captions_before:a.captions,captions_after:captions,
        header_before:header+saving,header_after:header,shrink_blocked_by:blocked});
    }
    if(!records.length)return baseline;
    const idx={...g.idx,nodes};positions.context={...ctx,idx,routeCache:new Map(),reserved:[]};
    const graph={...g,idx,nodes:g.nodes.map(n=>nodes.get(n.id)),positions,constraint_receipts:JSON.parse(JSON.stringify(g.constraint_receipts))};
    let trial={graph,prepared:evaluateRoutes(graph,baseline.prepared.routes,b.route_strategy,baseline.prepared.labeling)};
    // Reuse the same guarded monotone map, never reroute after reflow. Only
    // globally empty bands can be removed; concrete nodes keep their size.
    trial=prepareEmptyBandCompaction(ir,state,trial);
    E.auditConstraintRoutes(trial.graph,trial.prepared.routes);
    const q=trial.prepared.quality,before=realizedRelations(baseline),after=realizedRelations(trial),applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
    const goals=Goals.build(ir,g.architecture),done=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const covered=new Set(Goals.evaluate(goals,trial.graph,trial.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const facts=clearanceIdentity(g)===clearanceIdentity(trial.graph),accepted=facts&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&
      q.wire_length<=b.wire_length&&fontMetric(q)>=fontMetric(b)&&q.line_geometry.crossings===b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.issues.every(issue=>b.issues.includes(issue))&&
      trial.graph.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)))&&[...done].every(id=>covered.has(id));
    const chosen=accepted?trial:baseline,compaction=trial.prepared.routing?.empty_band_compaction;
    chosen.prepared.routing={...baseline.prepared.routing,header_reflow:{accepted,records,facts_preserved:facts,
      before:clearanceMetrics(b),candidate:clearanceMetrics(q),direct_goals_before:done.size,direct_goals_candidate:covered.size,
      ...(compaction?{compaction}:{}),
      scope:'Complete existing title and caption rewrapped to the actual expanded width. Fixed argument rails, extra evidence rows and frame terminals retain their layout. Existing unrelated title passages keep their header clearance; only a guarded common empty-band map moves geometry. No semantic frontier or canonical evidence change.'}};
    return chosen;
  }
  function prepareLocalBypasses(ir,state,baseline){
    const b=baseline.prepared.quality,g=baseline.graph;
    if(state.paperLocalBypasses===false||b.medium!=='canvas'||g.edges.length>128||Object.keys(state.offsets||{}).length)return baseline;
    E.auditConstraintRoutes(g,baseline.prepared.routes);
    // A pre-existing conflict is not permission to silently substitute a new
    // channel. This refinement preserves already realized bypass relations.
    const candidates=baseline.prepared.routes.map(e=>({edge:e,scope:L.localBypassScope(g,e,{contained:state.paperContainedBypasses!==false})})).filter(c=>c.scope&&
      g.constraint_receipts.some(r=>r.type==='bypass'&&r.properties.certificate===c.scope.certificate&&r.status==='applied')).slice(0,6);
    if(!candidates.length)return baseline;
    let chosen=baseline;const record={attempts:[],selected:[],max_edges:6,max_rails_per_edge:4,before:clearanceMetrics(b)};
    const goals=Goals.build(ir,g.architecture),covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id)),relations=realizedRelations(baseline);
    for(const {edge,scope}of candidates){
      const left=Math.min(...scope.frontier.map(id=>g.positions.get(id).x));
      for(const gap of [16,28,40,52]){
        const old=chosen.prepared.quality,current=chosen.prepared.routes.find(e=>e.id===edge.id),ctx=chosen.graph.positions.context;
        const positions=new Map(chosen.graph.positions);
        positions.context={...ctx,localBypassScopes:[...(ctx.localBypassScopes||[]).filter(s=>s.edge!==edge.id),scope],
          localBypassFacts:{edges:g.architecture.edges,representatives:g.representatives},
          localBypassTrial:{edge:edge.id,scope,x:left-gap},routeCache:new Map(),reserved:[]};
        positions.context.portOrder=old.route_strategy.startsWith('neighbors')?'neighbors':'canonical';
        positions.context.ancestorPorts=old.route_strategy.includes('-header-')?'header':'boundary';
        const route=E.route(current,positions);delete positions.context.localBypassTrial;
        const attempt={edge:edge.id,gap,accepted:false};record.attempts.push(attempt);
        const same=(p,q)=>p.x===q.x&&p.y===q.y;
        if(!route.ok||!same(route.points[0],current.route.points[0])||!same(route.points.at(-1),current.route.points.at(-1))||
          route.source_side!==current.route.source_side||route.target_side!==current.route.target_side){attempt.reason='obstacle, scope or physical terminal mismatch';continue;}
        const graph={...chosen.graph,positions,constraint_receipts:JSON.parse(JSON.stringify(chosen.graph.constraint_receipts))};
        const routes=chosen.prepared.routes.map(e=>e.id===edge.id?{...e,route}:e),prepared=evaluateRoutes(graph,routes,old.route_strategy),q=prepared.quality,trial={graph,prepared};
        attempt.candidate=clearanceMetrics(q);
        if(q.wire_length>=old.wire_length||q.native_width_px>old.native_width_px||q.native_height_px>old.native_height_px||fontMetric(q)<fontMetric(old)||
          q.line_geometry.crossings>old.line_geometry.crossings||q.line_geometry.unrelated_contacts.length>old.line_geometry.unrelated_contacts.length||
          q.line_geometry.overlapping_paths.length>old.line_geometry.overlapping_paths.length||q.route_failures.length>old.route_failures.length||
          q.unplaced_port_labels.length>old.unplaced_port_labels.length||q.issues.some(issue=>!old.issues.includes(issue))){attempt.reason='no safe geometric benefit';continue;}
        E.auditConstraintRoutes(graph,routes);const after=realizedRelations(trial);
        const now=new Set(Goals.evaluate(goals,graph,prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
        if(clearanceIdentity(g)!==clearanceIdentity(graph)||graph.constraint_receipts.some(r=>applied.has(r.id)&&r.status!=='applied')||
          Object.keys(relations).some(k=>relations[k].some(id=>!after[k].includes(id)))||[...covered].some(id=>!now.has(id))){attempt.reason='lost facts, expression or applied relation';continue;}
        attempt.accepted=true;record.selected.push(scope);chosen=trial;break;
      }
    }
    if(chosen!==baseline){
      const ctx=chosen.graph.positions.context;ctx.routeCache=new Map(chosen.prepared.routes.map(e=>[e.id,e.route]));
      ctx.reserved=chosen.prepared.routes.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
    }
    record.after=clearanceMetrics(chosen.prepared.quality);
    record.scope='Certified branch paths and their visible outer enclosures define a local side lane. Exact terminals, source owner, operands, conditions and expansion remain; unproved or obstructed proposals keep their original reserved lane.';
    chosen.prepared.routing={...baseline.prepared.routing,local_bypass_refinement:record};return chosen;
  }
  function prepareSourcePortOrder(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(state.paperSourcePortOrder===false||b.medium!=='canvas'||Object.keys(state.offsets||{}).length||
      g.edges.length>128||b.route_failures.length||b.unplaced_port_labels.length||baseline.prepared.routing?.shared_fanout_refinement?.selected.length)return baseline;
    const proposals=L.sourcePortSwaps(g.positions,baseline.prepared.routes).slice(0,8);
    if(!proposals.length)return baseline;
    const goals=Goals.build(ir,g.architecture),covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id)),relations=realizedRelations(baseline),identity=clearanceIdentity(g);
    const record={max_pairs:8,attempts:[],selected:[]};let chosen=baseline;
    for(const proposal of proposals){
      if(record.selected.some(r=>r.edges.some(id=>proposal.edges.includes(id))))continue;
      const {routes:fresh,...row}=proposal,updated=new Map(fresh.map(e=>[e.id,e])),old=chosen.prepared.quality;
      const routes=chosen.prepared.routes.map(e=>updated.get(e.id)||e),positions=new Map(chosen.graph.positions);
      positions.context={...chosen.graph.positions.context,routeCache:new Map()};
      const graph={...chosen.graph,positions,constraint_receipts:JSON.parse(JSON.stringify(chosen.graph.constraint_receipts))};
      const prepared=evaluateRoutes(graph,routes,b.route_strategy,chosen.prepared.labeling),q=prepared.quality;
      const labelsClear=fresh.every(e=>e.route.points.slice(0,3).every((p,i,ps)=>!i||!L.blocked(ps[i-1],p,prepared.labeling.placed.map(l=>({x:l.x-4,y:l.y-4,w:l.w+8,h:l.h+8})))));
      const contacts=new Set(old.line_geometry.unrelated_contacts.map(c=>JSON.stringify(c.edges)));
      const geometry=labelsClear&&q.line_geometry.crossings<old.line_geometry.crossings&&q.wire_length<=old.wire_length&&
        q.native_width_px<=old.native_width_px&&q.native_height_px<=old.native_height_px&&fontMetric(q)>=fontMetric(old)&&
        q.line_geometry.unrelated_contacts.every(c=>contacts.has(JSON.stringify(c.edges)))&&
        q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&q.issues.every(issue=>old.issues.includes(issue));
      let accepted=false;
      if(geometry){
        E.auditConstraintRoutes(graph,routes);const after=realizedRelations({graph,prepared});
        const now=new Set(Goals.evaluate(goals,graph,prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
        accepted=clearanceIdentity(graph)===identity&&graph.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&
          Object.keys(relations).every(k=>relations[k].every(id=>after[k].includes(id)))&&[...covered].every(id=>now.has(id));
      }
      record.attempts.push({...row,accepted,existing_labels_clear:labelsClear,before:clearanceMetrics(old),candidate:clearanceMetrics(q)});
      if(accepted){chosen={graph,prepared};record.selected.push(row);}
    }
    record.scope='At most eight actual source-lead crossing pairs. Only two existing source terminal positions are permuted; no node moves, distant rerouting, value merging or canonical binding changes. Crossings strictly decrease and wire length cannot increase.';
    chosen.prepared.routing={...baseline.prepared.routing,source_port_order:record};return chosen;
  }
  function prepareSharedFanouts(ir,state,baseline){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(baseline.prepared.routing?.shared_fanout_refinement?.selected.length)return baseline;
    if(state.paperSharedFanouts===false||b.medium!=='canvas'||state.paperProtectFrameTitles===true||
      Object.keys(state.offsets||{}).length||g.edges.length>128||b.route_failures.length||b.unplaced_port_labels.length)return baseline;
    const proposals=L.sharedFanouts(g.positions,baseline.prepared.routes).slice(0,8);
    if(!proposals.length)return baseline;
    // Two different values feeding the same row need different fork rails.
    // Measure them together; accepting one alone can create false contacts
    // with the other value's still-independent paths.
    const batches=[],byEdge=new Map(g.edges.map(e=>[e.id,e]));let pairs=0;
    for(let i=0;i<proposals.length&&pairs<3;i++)for(let j=i+1;j<proposals.length&&pairs<3;j++){
      const a=proposals[i],b=proposals[j],targets=new Set(a.edges.map(id=>byEdge.get(id).target));
      if(b.edges.filter(id=>targets.has(byEdge.get(id).target)).length<2)continue;
      pairs++;
      for(const source of [a.source,b.source]){
        const shifted=L.sharedFanouts(g.positions,baseline.prepared.routes,{forkOffsets:new Map([[source,16]])});
        const batch=[a,b].map(p=>shifted.find(r=>r.source===p.source&&JSON.stringify(r.edges)===JSON.stringify(p.edges)));
        if(batch.every(Boolean))batches.push(batch);
      }
    }
    batches.push(...proposals.map(p=>[p]));
    const goals=Goals.build(ir,g.architecture),done=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id)),relations=realizedRelations(baseline);
    const record={max_groups:8,max_joint_pairs:3,min_group_ink_reduction:0.2,attempts:[],selected:[]};let chosen=baseline;
    for(const batch of batches){
      if(batch.some(p=>record.selected.some(r=>r.edges.some(id=>p.edges.includes(id)))))continue;
      const rows=batch.map(({routes,...row})=>row),fresh=batch.flatMap(r=>r.routes),row={groups:rows,edges:rows.flatMap(r=>r.edges),terminal_detour_budget:rows.reduce((sum,r)=>sum+r.terminal_detour_budget,0)};
      const previous=new Map(chosen.prepared.routes.map(e=>[e.id,e])),updated=new Map(fresh.map(e=>[e.id,e]));
      const routes=chosen.prepared.routes.map(e=>updated.get(e.id)||e),positions=new Map(chosen.graph.positions);
      positions.context={...chosen.graph.positions.context};
      const graph={...chosen.graph,positions,constraint_receipts:JSON.parse(JSON.stringify(chosen.graph.constraint_receipts))};
      const prepared=evaluateRoutes(graph,routes,b.route_strategy,chosen.prepared.labeling),q=prepared.quality,old=chosen.prepared.quality;
      const physical=fresh.every(e=>{const was=previous.get(e.id);return e.route.ok&&e.route.source_side===was.route.source_side&&e.route.target_side===was.route.target_side&&
        JSON.stringify([e.route.points[0],e.route.points.at(-1)])===JSON.stringify([was.route.points[0],was.route.points.at(-1)]);});
      // A junction must never turn a previously separate value into a visual
      // connection, including contacts shorter than the overlap metric floor.
      const dotClear=rows.every(r=>r.junctions.every(p=>routes.every(e=>r.edges.includes(e.id)||
        !e.route.points.some((b,i,ps)=>i&&L.blocked(ps[i-1],b,[{x:p.x-4,y:p.y-4,w:8,h:8}])))));
      const labelsClear=fresh.every(e=>e.route.points.every((b,i,ps)=>!i||!L.blocked(ps[i-1],b,chosen.prepared.labeling.placed.map(p=>({x:p.x-4,y:p.y-4,w:p.w+8,h:p.h+8})))));
      const geometry=physical&&dotClear&&labelsClear&&rows.every(r=>r.ink_candidate<=r.ink_before*(1-record.min_group_ink_reduction))&&
        q.wire_length<=old.wire_length+row.terminal_detour_budget+0.11&&q.native_width_px<=old.native_width_px&&q.native_height_px<=old.native_height_px&&fontMetric(q)>=fontMetric(old)&&
        q.line_geometry.crossings<=old.line_geometry.crossings&&q.line_geometry.unrelated_contacts.length<=old.line_geometry.unrelated_contacts.length&&
        q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=old.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&q.issues.every(issue=>old.issues.includes(issue));
      let accepted=false,after,coverage;
      if(geometry){
        E.auditConstraintRoutes(graph,routes);after=realizedRelations({graph,prepared});
        coverage=new Set(Goals.evaluate(goals,graph,prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
        accepted=graph.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&
          Object.keys(relations).every(k=>relations[k].every(id=>after[k].includes(id)))&&[...done].every(id=>coverage.has(id));
      }
      record.attempts.push({...row,accepted,physical_terminals_preserved:physical,junctions_clear:dotClear,existing_labels_clear:labelsClear,before:clearanceMetrics(old),candidate:clearanceMetrics(q)});
      if(accepted){chosen={graph,prepared};record.selected.push(...rows);}
    }
    record.scope='Shared drawing stems for exact uses of the same resolved output. All canonical edges, distinct physical terminals and consumer slots retained. At least 20% less group ink; extra summed length bounded by twice the original source-terminal distances to the shared stem. No additional crossings or geometry issues.';
    chosen.prepared.routing={...baseline.prepared.routing,shared_fanout_refinement:record};return chosen;
  }
  function prepareFinalGeometry(ir,state,chosen){
    const g=chosen.graph,b=chosen.prepared.quality;
    // Repair only an actual unresolved final overlap. Feeding extra route
    // choices into every speculative layout can change a previously valid
    // frontier's geometry. This final pass holds all node positions fixed.
    if(state.paperParallelRailRepair===true&&b.medium==='canvas'&&g.edges.length<=128&&b.line_geometry.overlapping_paths.some(p=>!p.same_value)){
      const context={...g.positions.context},receipts=JSON.parse(JSON.stringify(g.constraint_receipts)),before=realizedRelations(chosen);
      E.auditConstraintRoutes(g,chosen.prepared.routes);
      const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
      const candidate=prepare(g,{parallelRepairs:true}),q=candidate.quality,trial={graph:g,prepared:candidate},after=realizedRelations(trial);
      E.auditConstraintRoutes(g,candidate.routes);
      const accepted=q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
        q.line_geometry.unrelated_contacts.length<b.line_geometry.unrelated_contacts.length&&q.line_geometry.crossings<=b.line_geometry.crossings+1&&
        q.issues.every(issue=>b.issues.includes(issue))&&q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&
        fontMetric(q)>=fontMetric(b)&&areaMetric(q)<=areaMetric(b)&&q.wire_length<=b.wire_length*1.02&&
        g.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
      if(accepted){candidate.routing={...chosen.prepared.routing,...candidate.routing};chosen=trial;}
      else{Object.assign(g.positions.context,context);g.constraint_receipts=receipts;}
      chosen.prepared.routing.parallel_rail_repair={accepted,before:clearanceMetrics(b),candidate:clearanceMetrics(q),
        realized_before:before,realized_candidate:after,scope:'Fixed nodes and exact terminals; only a remaining final ambiguous overlap authorizes local parallel-rail trials. At most one additional crossing and 2% wire increase, no area or font regression.'};
    }
    if(state.paperSelectedRoutes!==false&&!Object.keys(state.offsets||{}).length&&chosen.graph.edges.length>64)chosen=polishRoutes(chosen);
    chosen=prepareCrossScopePorts(ir,state,chosen);
    chosen=prepareConsumerArguments(ir,state,chosen);
    chosen=prepareOperandRows(ir,state,chosen);
    chosen=prepareFinalSampleFrames(ir,state,chosen);
    chosen=prepareOperandRows(ir,state,chosen,{declared:true});
    chosen=prepareCrossScopePorts(ir,state,chosen,{final:true});
    chosen=prepareCoincidentPorts(ir,state,chosen);
    chosen=prepareLocalBypasses(ir,state,chosen);
    chosen=prepareEmptyBandCompaction(ir,state,chosen);
    chosen=prepareCoupledRoutes(ir,state,chosen);
    chosen=prepareHeaderReflow(ir,state,chosen);
    chosen=prepareResidualBands(ir,state,chosen);
    chosen=prepareSourcePortOrder(ir,state,chosen);
    chosen=prepareSharedFanouts(ir,state,chosen);
    return chosen;
  }
  function prepareRouteShortcuts(ir,state,baseline,{stages=false}={}){
    const g=baseline.graph,b=baseline.prepared.quality;
    if(state.paperRouteShortcuts===false||b.medium!=='canvas'||g.publication.granularity!==(stages?'stages':'roles')||Object.keys(state.offsets||{}).length||
      g.edges.length>128||!b.line_geometry.crossings||b.route_failures.length||b.unplaced_port_labels.length)return baseline;
    const shared=new Set((baseline.prepared.routing?.shared_fanout_refinement?.selected||[]).flatMap(r=>r.edges));
    const scored=baseline.prepared.routes.map(e=>({edge:e,score:baseline.prepared.routes.reduce((sum,f)=>sum+(e.id===f.id?0:lineGeometry([e,f]).crossings),0)}))
      .filter(r=>r.score&&!shared.has(r.edge.id)).sort((a,c)=>c.score-a.score||a.edge.id.localeCompare(c.edge.id)).slice(0,12);
    const identity=clearanceIdentity(g),goals=Goals.build(ir,g.architecture),relations=realizedRelations(baseline);
    const covered=new Set(Goals.evaluate(goals,g,baseline.prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const summaries=stages?SummaryGoals.build(ir,g.architecture):null;
    const summarized=stages?new Set(SummaryGoals.evaluate(summaries,ir,g,baseline.prepared).filter(r=>r.status==='fulfilled').map(r=>r.goal)):null;
    const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
    const record={max_edges:12,max_candidates_per_edge:64,max_path_points:24,max_generation_attempts:8192,attempts:[],selected:[],before:clearanceMetrics(b)};
    let chosen=baseline;
    for(const {edge}of scored){
      const current=chosen.prepared.routes.find(e=>e.id===edge.id),old=chosen.prepared.quality;
      const others=chosen.prepared.routes.filter(e=>e.id!==edge.id),previous=others.map(e=>lineGeometry([current,e]));
      const labels=chosen.prepared.labeling.placed.map(l=>({x:l.x-4,y:l.y-4,w:l.w+8,h:l.h+8}));
      const candidates=L.routeShortcuts(current,chosen.graph.positions,labels),promising=[];
      for(const candidate of candidates){
        const fresh={...current,route:{...current.route,points:candidate.points}},now=others.map(e=>lineGeometry([fresh,e]));
        const crossingGain=previous.reduce((n,q)=>n+q.crossings,0)-now.reduce((n,q)=>n+q.crossings,0);
        // Even same-value overlaps need an explicit junction policy; a shortcut
        // cannot silently introduce a shared stem or a new visual contact.
        if(crossingGain<=0||now.some((q,i)=>q.unrelated_contacts.length>previous[i].unrelated_contacts.length||
          q.overlapping_paths.reduce((n,r)=>n+r.length,0)>previous[i].overlapping_paths.reduce((n,r)=>n+r.length,0)))continue;
        promising.push({fresh,candidate,crossingGain});
      }
      promising.sort((a,c)=>c.crossingGain-a.crossingGain||a.candidate.wire-c.candidate.wire);
      for(const proposal of promising.slice(0,4)){
        const positions=new Map(chosen.graph.positions);positions.context={...chosen.graph.positions.context,routeCache:new Map(),reserved:[]};
        const graph={...chosen.graph,positions,constraint_receipts:JSON.parse(JSON.stringify(chosen.graph.constraint_receipts))};
        const routes=chosen.prepared.routes.map(e=>e.id===edge.id?proposal.fresh:e);
        const prepared=evaluateRoutes(graph,routes,b.route_strategy,chosen.prepared.labeling),q=prepared.quality;
        const geometry=q.line_geometry.crossings<old.line_geometry.crossings&&q.wire_length<old.wire_length&&
          q.native_width_px<=old.native_width_px&&q.native_height_px<=old.native_height_px&&fontMetric(q)>=fontMetric(old)&&
          q.route_failures.length<=old.route_failures.length&&q.unplaced_port_labels.length<=old.unplaced_port_labels.length&&q.issues.every(x=>old.issues.includes(x));
        let accepted=false,summaryEvaluation=null,lostSummaries=[];
        if(geometry){E.auditConstraintRoutes(graph,routes);const after=realizedRelations({graph,prepared});
          const coverage=new Set(Goals.evaluate(goals,graph,prepared,ir).filter(r=>r.status==='fulfilled').map(r=>r.goal));
          accepted=clearanceIdentity(graph)===identity&&graph.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&
            Object.keys(relations).every(k=>relations[k].every(id=>after[k].includes(id)))&&[...covered].every(id=>coverage.has(id));
          if(stages){summaryEvaluation=SummaryGoals.evaluate(summaries,ir,graph,prepared);
            lostSummaries=summaryEvaluation.filter(r=>summarized.has(r.goal)&&r.status!=='fulfilled');
            accepted=accepted&&!lostSummaries.length;}
        }
        const row={edge:edge.id,removed_span:proposal.candidate.removed_span,accepted,before:clearanceMetrics(old),candidate:clearanceMetrics(q),...(stages?{summary_goals_before:summarized.size,summary_goals_candidate:summaryEvaluation?.filter(r=>r.status==='fulfilled').length??null,lost_summaries:lostSummaries}:{})};
        record.attempts.push(row);
        if(accepted){chosen={graph,prepared};record.selected.push(row);break;}
      }
    }
    if(!record.attempts.length)return baseline;
    if(record.selected.length){
      chosen.graph.positions.context.routeCache=new Map(chosen.prepared.routes.map(e=>[e.id,e.route]));
      chosen.graph.positions.context.reserved=chosen.prepared.routes.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
    }
    record.after=clearanceMetrics(chosen.prepared.quality);
    record.scope='Bounded shortcuts of existing crossed polylines. Fixed nodes, sides, physical terminals, canonical slots and all distant paths. Strictly fewer crossings and shorter wire; no added shared stems, contacts, body/label intrusion or lost direct goals and realized relations. No semantic inference.';
    if(stages){record.final_stage_frontier=true;record.summary_goals_before=summarized.size;
      record.scope+=' Final stage frontier only; independently re-evaluated summary text and canonical cuts must retain every fulfilled summary.';}
    chosen.prepared.routing={...baseline.prepared.routing,route_shortcuts:record};return chosen;
  }
  function normalReturnPreference(before,after){
    const cost=areaMetric(after)/Math.max(1,areaMetric(before))*
      Math.max(1,after.wire_length)/Math.max(1,before.wire_length)*
      (after.line_geometry.crossings+4)/(before.line_geometry.crossings+4);
    return {cost_ratio:cost,footprint_preserved:after.native_width_px<=before.native_width_px*1.05&&
      after.native_height_px<=before.native_height_px*1.05&&areaMetric(after)<=areaMetric(before)*1.05,
      benefit:cost<1-1e-9,max_dimension_ratio:1.05,max_area_ratio:1.05,
      scope:'Bounded aspect/area tradeoff for an already proved source-return presentation. Fewer crossings or shorter paths must outweigh any footprint growth; no extra semantic coverage is earned.'};
  }
  function prepareUngatedFigure(ir,state={}){
    let chosen=selectFigure(ir,state);
    if(chosen.prepared.quality.medium!=='canvas')chosen=prepareFinalGeometry(ir,state,chosen);
    chosen=attachExpressionEvidence(ir,chosen);
    const normal=chosen.graph.publication.normal_returns?.rows.filter(r=>r.attached_edges.length);
    if(!normal?.length||state.paperNormalReturns===false)return chosen;
    // Source evidence licenses a summary, not its layout. Compare one complete
    // measured presentation against the ordinary source-return representation.
    // Do not let a shorter cut silently buy a different logical frontier.
    const baseline=prepareUngatedFigure(ir,{...state,paperNormalReturns:false}),bq=baseline.prepared.quality,cq=chosen.prepared.quality;
    const old=baseline.graph,newGraph=chosen.graph,unpack=g=>g.edges.flatMap(e=>e.bundle_members||[e]);
    const alternatives=new Set(normal.flatMap(r=>r.attached_edges)),previous=new Map(unpack(old).map(e=>[e.id,e])),current=new Map(unpack(newGraph).map(e=>[e.id,e]));
    const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
    const facts=same(old.publication.open,newGraph.publication.open)&&same(old.expression_goals,newGraph.expression_goals)&&
      previous.size-current.size===alternatives.size&&[...previous.keys()].every(id=>current.has(id)||alternatives.has(id))&&
      [...current].every(([id,e])=>previous.has(id)&&['canonical_source','canonical_target','resolved_source','source_port','target_port','kind','condition','originals'].every(k=>same(previous.get(id)[k],e[k])));
    const covered=new Set(newGraph.expression_coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const direct=old.expression_coverage.filter(r=>r.status==='fulfilled').every(r=>covered.has(r.goal));
    E.auditConstraintRoutes(old,baseline.prepared.routes);E.auditConstraintRoutes(newGraph,chosen.prepared.routes);
    const applied=new Set(old.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id)),relations=realizedRelations(baseline),after=realizedRelations(chosen);
    const constraints=newGraph.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&Object.keys(relations).every(k=>relations[k].every(id=>after[k].includes(id)));
    const preference=normalReturnPreference(bq,cq);
    const geometry=preference.footprint_preserved&&fontMetric(cq)>=fontMetric(bq)&&
      cq.wire_length<=bq.wire_length&&cq.line_geometry.crossings<=bq.line_geometry.crossings&&
      cq.line_geometry.unrelated_contacts.length<=bq.line_geometry.unrelated_contacts.length&&cq.line_geometry.overlapping_paths.length<=bq.line_geometry.overlapping_paths.length&&
      cq.route_failures.length<=bq.route_failures.length&&cq.unplaced_port_labels.length<=bq.unplaced_port_labels.length&&cq.issues.every(issue=>bq.issues.includes(issue));
    const benefit=preference.benefit;
    const accepted=facts&&direct&&constraints&&geometry&&benefit,selected=accepted?chosen:baseline;
    selected.prepared.routing={...selected.prepared.routing,normal_return_refinement:{accepted,groups:normal.map(r=>r.group),max_trials:1,
      facts_preserved:facts,direct_goals_preserved:direct,applied_relations_preserved:constraints,geometry_preserved:geometry,
      before:clearanceMetrics(bq),candidate:clearanceMetrics(cq),preference,
      scope:'One measured source-invocation return presentation. Source alternatives stay attached only if frontier, exact surviving uses, prior direct goals and applied relations survive, routes and labels do not regress, wire and crossings do not increase, and bounded footprint trades lower measured total cost. Otherwise keep the ordinary return representation.'}};
    return selected;
  }
  function sourceForkContextBinding(a,b){
    return !!(a?.route.ok&&b?.route.ok&&!a.bundle_members&&!b.bundle_members&&!a.design_route&&!b.design_route&&
      !a.condition&&!b.condition&&!a.iteration&&!b.iteration&&['data','alias','interface-binding'].includes(a.kind)&&
      ['id','source','target','canonical_source','canonical_target','resolved_source','source_port','target_port','kind','evidence',
        'condition','iteration','originals','semantic_bindings'].every(k=>JSON.stringify(a[k])===JSON.stringify(b[k])));
  }
  function prepareWidthFigure(ir,state={}){
    const candidate=prepareUngatedFigure(ir,state),groups=candidate.graph.positions.context.sourceForkWidths||[];
    if(!groups.length||state.paperSourceForkWidths===false)return candidate;
    // Width padding is only a proposal. Measure the complete final drawing
    // once without it as well; local symmetry cannot justify worse crossings,
    // hidden bindings, lost relations or unbounded cost elsewhere in the graph.
    const baseline=prepareUngatedFigure(ir,{...state,paperSourceForkWidths:false}),b=baseline.prepared.quality,q=candidate.prepared.quality;
    for(const r of [baseline,candidate])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const done=new Set(baseline.graph.expression_coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const coverage=new Set(candidate.graph.expression_coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const applied=new Set(baseline.graph.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
    const before=realizedRelations(baseline),after=realizedRelations(candidate);
    const lostContexts=before.contexts.filter(id=>!after.contexts.includes(id)),oldRoutes=new Map(baseline.prepared.routes.map(e=>[e.id,e])),newRoutes=new Map(candidate.prepared.routes.map(e=>[e.id,e]));
    const contextReplacements=lostContexts.map(id=>({edge:id,binding_preserved:sourceForkContextBinding(oldRoutes.get(id),newRoutes.get(id)),
      before_side:oldRoutes.get(id)?.route.target_side,candidate_side:newRoutes.get(id)?.route.target_side}));
    // A context gutter is optional geometry. It can be replaced only on the
    // same exact use, with strictly fewer crossings AND shorter total paths.
    // Explicit channel choices, semantic lanes and path columns stay binding.
    const contextSafe=!lostContexts.length||state.paperContextLanes===undefined&&state.paperContextEdges===undefined&&
      q.line_geometry.crossings<b.line_geometry.crossings&&q.wire_length<b.wire_length&&contextReplacements.every(r=>r.binding_preserved);
    const facts=clearanceIdentity(baseline.graph)===clearanceIdentity(candidate.graph)&&
      JSON.stringify(baseline.graph.expression_goals)===JSON.stringify(candidate.graph.expression_goals);
    const constraints=candidate.graph.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&
      ['entries','columns'].every(k=>before[k].every(id=>after[k].includes(id)))&&contextSafe;
    const geometry=groups.every(row=>{const ps=row.before.map(n=>candidate.graph.positions.get(n.node));
      return ps.every(p=>p&&p.w===row.width&&p.y===ps[0].y);})&&
      q.native_width_px<=b.native_width_px*1.05&&q.native_height_px<=b.native_height_px*1.05&&areaMetric(q)<=areaMetric(b)*1.05&&
      q.wire_length<=b.wire_length*1.05&&fontMetric(q)>=fontMetric(b)&&q.line_geometry.crossings<=b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.issues.every(issue=>b.issues.includes(issue));
    const direct=[...done].every(id=>coverage.has(id)),accepted=facts&&constraints&&direct&&geometry,selected=accepted?candidate:baseline;
    selected.prepared.routing={...selected.prepared.routing,source_fork_width_refinement:{accepted,groups,max_trials:1,
      facts_preserved:facts,applied_relations_preserved:constraints,direct_goals_preserved:direct,geometry_preserved:geometry,
      optional_contexts_preserved:!lostContexts.length,optional_context_replacements:contextReplacements,
      before:clearanceMetrics(b),candidate:clearanceMetrics(q),max_dimension_ratio:1.05,max_area_ratio:1.05,max_wire_ratio:1.05,
      scope:'One complete measured comparison of small equal-width padding for exact external-source consumers. No additional crossings, contacts, ambiguous overlaps, routing or label failures; existing bindings, direct goals, applied constraints, entries and path columns survive. An optional context gutter may be replaced on the same exact use only with strictly fewer crossings and shorter paths, preserving explicit channel choices. At most 5% global footprint and wire growth. No execution or operation-equivalence assertion.'}};
    return selected;
  }
  function prepareBaseFigure(ir,state={}){
    // Hold the final semantic frontier and all prior layout choices fixed.
    // Shortcuts cannot affect adaptive folding or earlier profile selection.
    return attachExpressionEvidence(ir,prepareRouteShortcuts(ir,state,prepareWidthFigure(ir,state)));
  }
  function prepareReadBindingFigure(ir,state={}){
    const baseline=prepareBaseFigure(ir,state),g=baseline.graph,b=baseline.prepared.quality;
    if(state.paperReadBindingRows!==undefined||b.medium!=='canvas'||g.publication.granularity!=='stages'||
      Object.keys(state.offsets||{}).length||g.edges.length>128||
      !g.nodes.some(n=>!g.positions.get(n.id).expanded&&n.local_pipeline?.source_reads?.length))return baseline;
    const trial=prepareBaseFigure(ir,{...state,paperReadBindingRows:true}),h=trial.graph,q=trial.prepared.quality;
    const rows=h.nodes.filter(n=>n.paper.read_binding_rows);
    if(!rows.length)return baseline;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const done=new Set(g.expression_coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const summaries=new Set(g.summary_coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const covered=new Set(h.expression_coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const summarized=new Set(h.summary_coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
    const before=realizedRelations(baseline),after=realizedRelations(trial);
    const facts=clearanceIdentity(g)===clearanceIdentity(h)&&JSON.stringify(g.publication)===JSON.stringify(h.publication)&&
      JSON.stringify(g.expression_goals)===JSON.stringify(h.expression_goals)&&JSON.stringify(g.summary_goals)===JSON.stringify(h.summary_goals);
    const direct=[...done].every(id=>covered.has(id)),summary=[...summaries].every(id=>summarized.has(id));
    const constraints=h.constraint_receipts.every(r=>!applied.has(r.id)||r.status==='applied')&&
      Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const geometry=areaMetric(q)<areaMetric(b)&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&
      q.wire_length<=b.wire_length&&fontMetric(q)>=fontMetric(b)&&q.line_geometry.crossings<=b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.issues.every(x=>b.issues.includes(x));
    const accepted=facts&&direct&&summary&&constraints&&geometry,chosen=accepted?trial:baseline;
    chosen.prepared.routing={...chosen.prepared.routing,read_binding_rows:{accepted,max_trials:1,nodes:rows.map(n=>n.id),facts_preserved:facts,
      direct_goals_preserved:direct,summary_goals_preserved:summary,applied_relations_preserved:constraints,geometry_preserved:geometry,
      before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      scope:'One measured alternate printing of the same bounded DAG uses. Each extracted source-read node and input interface has a distinct reference; canonical facts, frontier, exact uses, fulfilled goals and relations must survive. Smaller area without taller/wider bounds, longer wires or added crossings; otherwise retain the original text. No runtime read equality assertion.'}};
    return chosen;
  }
  function prepareStageExitFigure(ir,state={}){
    const baseline=prepareReadBindingFigure(ir,state),g=baseline.graph,b=baseline.prepared.quality;
    if(b.medium!=='canvas'||g.publication.granularity!=='stages'||state.paperRegionFollowers!==undefined||
      Object.keys(state.offsets||{}).length||g.edges.length>128)return baseline;
    // A coarse source region can have the same scattered outlet as a role
    // diagram. Measure the entire existing pipeline once, since local
    // alignment can also change later compaction and routing choices.
    const proposal=L.regionFollowers(g.idx,g.nodes,g.edges,g.positions);
    if(!proposal.records.length)return baseline;
    const trial=prepareReadBindingFigure(ir,{...state,paperRegionFollowers:true}),h=trial.graph,q=trial.prepared.quality;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const covered=(r,key)=>new Set(r.graph[key].filter(c=>c.status==='fulfilled').map(c=>c.goal));
    const direct=covered(baseline,'expression_coverage'),summary=covered(baseline,'summary_coverage');
    const nextDirect=covered(trial,'expression_coverage'),nextSummary=covered(trial,'summary_coverage');
    const applied=new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
    const before=realizedRelations(baseline),after=realizedRelations(trial);
    const facts=clearanceIdentity(g)===clearanceIdentity(h)&&JSON.stringify(g.publication)===JSON.stringify(h.publication)&&
      JSON.stringify(g.expression_goals)===JSON.stringify(h.expression_goals)&&JSON.stringify(g.summary_goals)===JSON.stringify(h.summary_goals);
    const goals=[...direct].every(id=>nextDirect.has(id))&&[...summary].every(id=>nextSummary.has(id));
    const nextApplied=new Set(h.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id));
    const relations=[...applied].every(id=>nextApplied.has(id))&&
      Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const geometry=q.wire_length<b.wire_length-1&&q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&
      fontMetric(q)>=fontMetric(b)&&q.line_geometry.crossings<=b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.issues.every(x=>b.issues.includes(x));
    const accepted=facts&&goals&&relations&&geometry,chosen=accepted?trial:baseline;
    chosen.prepared.routing={...chosen.prepared.routing,stage_exit_refinement:{accepted,max_trials:1,
      facts_preserved:facts,goals_preserved:goals,applied_relations_preserved:relations,geometry_preserved:geometry,
      local_accepted:trial.prepared.routing.region_follower_refinement?.accepted===true,
      proposed:proposal.records,records:trial.prepared.routing.region_follower_refinement?.records||[],
      before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      scope:'One complete measured stage-view alternative follows actual expanded-region exits. Same frontier, canonical bindings, fulfilled goals and realized relations; shorter wires with no taller/wider bounds or added conflicts. No execution or module-family assertion.'}};
    return chosen;
  }
  function prepareSourceHeadingFigure(ir,state={}){
    const baseline=prepareStageExitFigure(ir,state),g=baseline.graph,b=baseline.prepared.quality;
    if(state.paperSourceHeadings!==undefined||b.medium!=='canvas'||g.publication.granularity!=='stages'||
      Object.keys(state.offsets||{}).length||g.edges.length>128||!g.nodes.some(n=>n.paper.read_binding_rows))return baseline;
    // Keep the already selected use-row recipe fixed. Otherwise a long source
    // label could change the inner recipe selection before we compare it.
    const trial=prepareStageExitFigure(ir,{...state,paperReadBindingRows:true,paperSourceHeadings:true}),h=trial.graph,q=trial.prepared.quality;
    const headings=h.nodes.filter(n=>n.paper.source_heading);
    if(!headings.length)return baseline;
    for(const r of [baseline,trial])E.auditConstraintRoutes(r.graph,r.prepared.routes);
    const fulfilled=(r,key)=>new Set(r.graph[key].filter(c=>c.status==='fulfilled').map(c=>c.goal));
    const keep=(a,z)=>[...a].every(id=>z.has(id));
    const facts=clearanceIdentity(g)===clearanceIdentity(h)&&JSON.stringify(g.publication)===JSON.stringify(h.publication)&&
      JSON.stringify(g.expression_goals)===JSON.stringify(h.expression_goals)&&JSON.stringify(g.summary_goals)===JSON.stringify(h.summary_goals);
    const goals=keep(fulfilled(baseline,'expression_coverage'),fulfilled(trial,'expression_coverage'))&&
      keep(fulfilled(baseline,'summary_coverage'),fulfilled(trial,'summary_coverage'))&&
      headings.every(n=>h.summary_coverage.some(c=>c.node===n.id&&c.status==='fulfilled'&&c.form==='summary'));
    const before=realizedRelations(baseline),after=realizedRelations(trial);
    const relations=keep(new Set(g.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id)),
      new Set(h.constraint_receipts.filter(r=>r.status==='applied').map(r=>r.id)))&&Object.keys(before).every(k=>before[k].every(id=>after[k].includes(id)));
    const geometry=q.native_width_px<=b.native_width_px&&q.native_height_px<=b.native_height_px&&q.wire_length<=b.wire_length&&
      fontMetric(q)>=fontMetric(b)&&q.line_geometry.crossings<=b.line_geometry.crossings&&
      q.line_geometry.unrelated_contacts.length<=b.line_geometry.unrelated_contacts.length&&
      q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length<=b.line_geometry.overlapping_paths.filter(p=>!p.same_value).length&&
      q.route_failures.length<=b.route_failures.length&&q.unplaced_port_labels.length<=b.unplaced_port_labels.length&&q.issues.every(x=>b.issues.includes(x));
    const accepted=facts&&goals&&relations&&geometry,chosen=accepted?trial:baseline;
    chosen.prepared.routing={...chosen.prepared.routing,...(accepted&&baseline.prepared.routing.read_binding_rows?
      {read_binding_rows:baseline.prepared.routing.read_binding_rows}:{}),source_summary_headings:{accepted,max_trials:1,nodes:headings.map(n=>n.id),
      facts_preserved:facts,goals_preserved:goals,applied_relations_preserved:relations,geometry_preserved:geometry,
      before:clearanceMetrics(b),candidate:clearanceMetrics(q),
      scope:'Source-call labels identify folded DAGs without certifying semantics. Exact result, use rows, source reads, call identities and cuts remain printed. One complete measured alternative; no larger bounds, longer wires, smaller fonts or added conflicts.'}};
    return chosen;
  }
  function prepareFigure(ir,state={}){
    // Stages run only after all summary recipes and complete layout choices
    // settle. Keep roles on their existing path, with identical serialization.
    const baseline=prepareSourceHeadingFigure(ir,state);
    if(baseline.graph.publication.granularity!=='stages')return baseline;
    const chosen=prepareRouteShortcuts(ir,state,baseline,{stages:true});
    return chosen===baseline?baseline:attachExpressionEvidence(ir,chosen);
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
    const fanouts=prepared.routing?.shared_fanout_refinement?.selected||[];
    const junctions=fanouts.flatMap(r=>r.junctions.map(p=>`<circle class="paper-fanout-junction" data-fanout-source="${esc(r.resolved_source)}" data-source-port="${esc(r.source_port)}" data-fanout-edges="${esc(JSON.stringify(r.edges))}" cx="${p.x}" cy="${p.y}" r="2.6" fill="#617487"><title>Shared source output: ${esc(r.source_port)}; distinct uses retained</title></circle>`)).join('');
    const {notes,noteLines,totalH}=prepared;
    const dimensions=quality.medium==='canvas'?`width="${b.w}px" height="${totalH}px"`:`width="${quality.width_mm}mm" height="${quality.width_mm*totalH/b.w}mm"`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" class="publication" ${dimensions} viewBox="${b.x} ${b.y} ${b.w} ${totalH}" role="img" aria-label="${esc(ir.title)}"><title>${esc(ir.title)} · architecture</title><desc>Source-backed architecture; unresolved regions remain explicit. ${fanouts.length?'Marked junctions share one resolved source output; unmarked crossings are not junctions.':'Crossings without a node are not junctions.'} ${esc(notes.join('; '))}</desc><metadata>${esc(JSON.stringify({schema:'archcanvas-publication/1',canonical_digest:ir.ir_digest,quality}))}</metadata><style>${css}</style><defs>${defs}</defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${totalH}" fill="#fff"/><g id="frames">${frames.join('')}</g><g id="edges">${routes.map(edgeBody).join('')}${junctions}</g><g id="nodes">${nodes.join('')}</g><g id="port-labels">${labeling.placed.map(labelBody).join('')}</g>${noteLines.length?`<text x="${b.x+14}" y="${b.y+b.h+20}" class="paper-port-label">${noteLines.map((line,i)=>`<tspan x="${b.x+14}" dy="${i?17:0}">${esc(line)}</tspan>`).join('')}</text>`:''}</svg>\n`;
    return {svg,graph:g,prepared,document:{schema:'archcanvas-architecture-document/1',ir,state,architecture:g.architecture,publication:g.publication,expression_goals:expressionGoals,expression_coverage:expressionCoverage,
      summary_goals:g.summary_goals,summary_coverage:g.summary_coverage,
      layout:{...(fanouts.length?{shared_fanouts:fanouts}:{}),frame_title_routing:g.positions.context.protectFrameTitles?'avoid':'pass-through',bounds:{...b,h:totalH},nodes:[...g.positions.values()],edges:routes,edge_accounting:g.edge_accounting,node_accounting:g.node_accounting,representatives:g.representatives,...(g.frame_ownership?.length?{frame_ownership:g.frame_ownership}:{}),labels:labeling.placed,constraint_receipts:g.constraint_receipts,
        ...(g.positions.context.sourceForkWidths?.length?{source_fork_widths:g.positions.context.sourceForkWidths.map(row=>{
          const ps=row.before.map(n=>g.positions.get(n.node)),valid=ps.every(p=>p&&p.y===ps[0].y&&p.w===row.width);
          return {...row,geometry_verified:valid,status:valid?'realized':'deferred'};
        })}:{}),
        ...(g.positions.context.localBypassScopes?.length?{local_bypasses:g.positions.context.localBypassScopes.map(s=>({...s,geometry_verified:L.localBypassGeometry(s,routes.find(e=>e.id===s.edge),g.positions)}))}:{}),
        ...(g.positions.context.consumerArguments?.length?{consumer_arguments:g.positions.context.consumerArguments}:{}),
        ...(g.positions.context.operandRows?.length?{operand_rows:g.positions.context.operandRows}:{}),
        ...(g.positions.context.declaredOperandRows?.length?{declared_operand_rows:g.positions.context.declaredOperandRows}:{}),
        ...(g.positions.context.crossScopePorts?.length?{cross_scope_ports:g.positions.context.crossScopePorts}:{}),
        ...(g.positions.context.coincidentPorts?.length?{coincident_ports:g.positions.context.coincidentPorts}:{}),
        ...(g.positions.context.inputDocks.length?{input_docks:g.positions.context.inputDocks.map(record=>({...record,geometry_verified:L.inputDockGeometry(record,g.positions),
          routes_verified:record.edges.every(e=>routes.find(r=>r.id===e.edge)?.route.ok)}))}:{}),
        ...(g.positions.context.compoundAlignments.length?{compound_alignments:g.positions.context.compoundAlignments.map(record=>{
          if(record.mode!=='entries')return record;
          const geometry=L.entryGeometry(record,g.positions),valid=record.entry_bindings.every(b=>routes.find(e=>e.id===b.edge)?.route.ok&&routes.find(e=>e.id===b.independent_entry)?.route.ok);
          return {...record,status:geometry&&valid?'realized':'deferred',geometry_verified:!!geometry,routes_verified:valid,
            ...(record.input_band?{input_band_verified:!!L.entryBandGeometry(record,g.positions)}:{})};
        })}:{}),
        ...(g.positions.context.branchColumns.length?{branch_columns:g.positions.context.branchColumns.map(group=>{
          const geometry=L.branchGeometry(group,g.positions),pathIds=group.chains.flatMap(c=>c.edges),valid=pathIds.every(id=>routes.find(e=>e.id===id)?.route.ok);
          return {...group,status:geometry&&valid?'realized':'deferred',geometry_verified:geometry,routes_verified:valid,
            reason:geometry&&valid?'exact dependency paths aligned in separate columns with final routes':'final geometry or path routing did not realize column correspondence'};
        })}:{}),
        ...(g.positions.context.contextLanes.length?{context_lanes:g.positions.context.contextLanes.map(entry=>{
          const owner=g.positions.get(entry.owner),edge=routes.find(e=>e.id===entry.edge),low=entry.side==='left'?owner.x+(owner.design_gutter||0):owner.x+owner.w-owner.context_gutter;
          const high=entry.side==='left'?low+owner.context_gutter:owner.x+owner.w;
          const direct=directDockEntry({graph:g,prepared},entry.edge);
          const used=entry.selected!==false&&edge.route.ok&&edge.route.target_side===entry.side&&(direct||edge.route.points.some((p,i,ps)=>i&&p.x===ps[i-1].x&&p.y!==ps[i-1].y&&p.x>low&&p.x<high));
          return {...entry,status:used?'realized':'deferred',...(direct?{method:'direct-docked-entry'}:{}),reason:used?direct?'existing docked input directly reaches its original side terminal':'final side terminal and vertical channel verified':entry.selected===false?'unrealized baseline proposal retained without reserving a gutter':'obstacle-aware fallback did not realize a vertical channel'};
        })}:{})},
      diagnostics:{route_failures:quality.route_failures,publication:quality,routing:prepared.routing}}};
  }
  const api={prepareRouteShortcuts,sourceForkContextBinding,normalReturnPreference,prepareSourcePortOrder,prepareSharedFanouts,css,defs,nodeTitle,nodeBody,edgeBody,labelBody,prepare,evaluateRoutes,polishRoutes,prepareResidualBands,prepareHeaderReflow,prepareCoupledRoutes,prepareCrossScopePorts,prepareConsumerArguments,prepareOperandRows,prepareFinalSampleFrames,prepareCoincidentPorts,prepareLocalBypasses,prepareEmptyBandCompaction,prepareFigure,render,renderPrepared,overlap,lineGeometry};root.SemanticPublicationRenderer=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

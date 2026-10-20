/* Bounded, evidence-driven local detail selection. Names and model families
 * are deliberately absent: candidates are existing roles or relation paths. */
(function(root){
  'use strict';
  const VERSION='adaptive-frontier/2';
  const Expressions=root.SemanticLocalExpressions||(typeof require==='function'?require('./local-expressions.js'):null);
  const critical=new Set(['unknown-boundary','state-interface','selection','conditional-join','conditional-region','iteration-binding','iteration-template','same-object-calls','observed-parameter-aliases']);
  function candidates(graph,state={}){
    const plan=graph.architecture,by=new Map(plan.nodes.map(n=>[n.id,n])),owners=new Set(graph.publication.role_frontier?.modules.map(m=>m.node)||[]);
    const selectedRoles=new Set(Array.isArray(state.paperRoleDetails)?state.paperRoleDetails:[]),selectedExpressions=new Set(Array.isArray(state.paperExpressionDetails)?state.paperExpressionDetails:[]),out=[];
    const refs=value=>typeof value==='string'&&by.has(value)?[value]:value&&typeof value==='object'?Object.values(value).flatMap(refs):[];
    // Only a visible, folded nested certificate can be the next role layer.
    // The role compiler remains responsible for checking intervening guards.
    for(const c of plan.semantic_contracts||[]){
      const p=graph.positions.get(c.node);
      if(!p||p.expanded||owners.has(c.node)||selectedRoles.has(c.node)||out.some(r=>r.kind==='roles'&&r.node===c.node))continue;
      const targets=[...new Set(refs(c.roles))];
      if(targets.some(id=>id!==c.node))out.push({id:'roles:'+c.node,kind:'roles',node:c.node,priority:2,targets,scope:c.scope});
    }
    const relations=(plan.relation_graph?.relations||[]).filter(r=>!selectedExpressions.has(r.id)&&
      (graph.positions.has(r.node)||graph.positions.has(graph.representatives[r.node])));
    const frontier=Expressions.compile({plan,focus:graph.publication.focus,details:relations.map(r=>r.id)}),dedup=new Set();
    for(const r of frontier.requests.filter(r=>r.requested).sort((a,b)=>Number(critical.has(b.type))-Number(critical.has(a.type))||a.relation.localeCompare(b.relation))){
      const internal=r.targets.filter(t=>t.location==='internal');
      // Unknown/control leaves can be shown as boundaries. Their interiors,
      // unselected certificates and repeat/observation scopes cannot be crossed.
      if(!internal.length||internal.some(t=>t.stop&&t.frontier_node!==t.node))continue;
      const hidden=internal.filter(t=>!graph.positions.has(t.node));
      if(!hidden.length)continue;
      const path=new Set();
      for(const t of hidden){let at=by.get(t.node)?.parent;while(at&&!graph.positions.get(at)?.expanded){path.add(at);at=by.get(at)?.parent;}}
      const signature=JSON.stringify([...path].sort());
      if(!path.size||dedup.has(signature))continue;dedup.add(signature);
      out.push({id:'relation:'+r.relation,kind:'relation',relation:r.relation,type:r.type,priority:critical.has(r.type)?3:2,
        targets:internal.map(t=>t.node),required_open:[...path],scope:r.evidence_scope});
    }
    return out.sort((a,b)=>b.priority-a.priority||a.targets.length-b.targets.length||a.id.localeCompare(b.id));
  }
  function apply(state,candidate){
    const key=candidate.kind==='roles'?'paperRoleDetails':'paperExpressionDetails',id=candidate.kind==='roles'?candidate.node:candidate.relation;
    return {...state,[key]:[...new Set([...(Array.isArray(state[key])?state[key]:[]),id])]};
  }
  function metrics(result){
    const g=result.graph,q=result.prepared.quality;
    return {nodes:g.nodes.length,edges:g.edges.length,width:q.native_width_px,height:q.native_height_px,area:q.native_width_px*q.native_height_px,
      crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,
      overlaps:q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length,route_failures:q.route_failures.length,
      unplaced_labels:q.unplaced_port_labels.length,font:q.min_canvas_font_px,issues:q.issues};
  }
  function evidence(ir,result){
    const g=result.graph,coverage=new Map(g.expression_coverage.map(r=>[r.goal,r])),physical=new Set();
    for(const edge of result.prepared.routes)if(edge.route.ok)for(const member of edge.bundle_members||[edge])for(const id of [member.id,...member.originals||[]])physical.add(id);
    const goals=new Map(),by=new Map(ir.nodes.map(n=>[n.id,n]));
    for(const goal of g.expression_goals.goals){
      if(coverage.get(goal.id)?.status!=='fulfilled')continue;
      if(goal.kind==='computation'){
        // Visibility alone earns nothing. Plain computations must retain all
        // incoming canonical flow bindings on successfully routed paths.
        const incoming=ir.edges.filter(e=>e.target===goal.focus_node&&['data','alias','interface-binding'].includes(e.kind));
        if(!incoming.length||incoming.some(e=>!physical.has(e.id)))continue;
      }
      goals.set(goal.id,{id:goal.id,kind:goal.kind,priority:goal.priority,node:goal.focus_node});
    }
    const roles=new Set((g.publication.role_frontier?.roles||[]).filter(r=>r.status==='exposed').map(r=>JSON.stringify([r.certificate,r.role,r.node])));
    const boundaries=new Set(g.nodes.filter(n=>by.has(n.id)&&(n.kind==='opaque'||n.kind==='control'||n.condition||n.mutable||n.identity_display||n.evidence_status==='runtime-only')).map(n=>n.id));
    const conflicts=new Set((g.constraint_receipts||[]).filter(r=>r.status==='conflict').map(r=>r.id));
    const summaries=new Set((g.summary_coverage||[]).filter(r=>r.status==='fulfilled').map(r=>r.goal));
    return {goals,roles,boundaries,conflicts,summaries};
  }
  function assess(ir,baseline,trial){
    const b=metrics(baseline),q=metrics(trial),before=evidence(ir,baseline),after=evidence(ir,trial),reasons=[];
    const gained=[...after.goals.values()].filter(g=>!before.goals.has(g.id)),lost=[...before.goals.keys()].filter(id=>!after.goals.has(id));
    const gain=gained.reduce((s,g)=>s+g.priority,0);
    if(!gain)reasons.push('no-verified-relationship-gain');
    if(lost.length)reasons.push('previous-expression-lost');
    const lostSummaries=[...before.summaries].filter(id=>!after.summaries.has(id));
    if(lostSummaries.length)reasons.push('previous-dependency-structure-lost');
    if([...before.roles].some(id=>!after.roles.has(id)))reasons.push('previous-role-lost');
    if([...before.boundaries].some(id=>!after.boundaries.has(id)))reasons.push('visible-boundary-lost');
    if([...after.conflicts].some(id=>!before.conflicts.has(id)))reasons.push('new-constraint-conflict');
    for(const [key,objects]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
      const ids=Object.values(trial.graph[key]).flat(),expected=new Set(objects.map(o=>o.id));
      if(ids.length!==expected.size||new Set(ids).size!==ids.length||ids.some(id=>!expected.has(id)))reasons.push('incomplete-'+key);
    }
    const cuts=g=>JSON.stringify(g.publication.boundary.map(({visible_node,...r})=>r));
    if(cuts(baseline.graph)!==cuts(trial.graph))reasons.push('changed-focus-boundary');
    if(q.issues.some(issue=>!b.issues.includes(issue)))reasons.push('new-quality-issue');
    for(const key of ['route_failures','unplaced_labels','contacts','overlaps'])if(q[key]>b[key])reasons.push('increased-'+key);
    if(q.font<b.font||q.font<12)reasons.push('smaller-font');
    const limits=trial.graph.publication.canvas_limits;
    if(q.width>Math.max(limits.width_px,b.width)||q.height>Math.max(limits.height_px,b.height)||q.area>Math.max(limits.area_px2,b.area)||
      q.nodes>Math.max(limits.nodes,b.nodes)||q.edges>Math.max(limits.edges,b.edges))reasons.push('resource-budget');
    if(q.area>b.area*2.5)reasons.push('disproportionate-area-cost');
    // Detail adds real paths; allow only a bounded, explicit crossing cost.
    // Contacts and distinct-value overlaps never receive this allowance.
    const crossingAllowance=Math.floor(gain/2);
    if(q.crossings>b.crossings+crossingAllowance)reasons.push('crossing-cost');
    return {accepted:!reasons.length,reasons,gain,gained_goals:gained,lost_goals:lost,lost_summary_goals:lostSummaries,
      preserved_summary_goals:[...before.summaries].filter(id=>after.summaries.has(id)),new_exposed_roles:after.roles.size-before.roles.size,
      before:b,candidate:q,crossing_allowance:crossingAllowance};
  }
  const api={VERSION,candidates,apply,metrics,evidence,assess};root.SemanticAdaptiveFrontier=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

/* A fold and its recovery figures are one transaction. Summary labels never
 * discharge direct computation obligations, even when a main figure shrinks. */
(function(root){
  'use strict';
  const VERSION='compact-diagrams/1',copy=x=>JSON.parse(JSON.stringify(x));
  const A=root.SemanticAdaptiveFrontier||(typeof require==='function'?require('./adaptive-frontier.js'):null);
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const rows=g=>g.publication.role_path_stages?.rows||[];
  function metrics(result){
    const m=A.metrics(result);
    m.wire_length=result.prepared.routes.reduce((s,e)=>s+e.route.points.slice(1).reduce((v,p,i)=>{
      const q=e.route.points[i];return v+Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
    },0),0);return m;
  }
  const fulfilled=coverage=>new Set(coverage.filter(r=>r.status==='fulfilled').map(r=>r.goal));
  function preserve(ir,before,after,D){
    const collect=panels=>{
      const out={roles:new Set(),summaries:new Set(),paths:new Map()};
      for(const p of panels)if(D.acceptable(p.result)){
        const e=A.evidence(ir,p.result);
        for(const k of ['roles','summaries'])for(const id of e[k])out[k].add(id);
        for(const [id,valid]of e.paths)if(valid)out.paths.set(id,true);
      }return out;
    };
    const b=collect(before),a=collect(after),lost={};
    for(const k of ['roles','summaries'])lost[k]=[...b[k]].filter(id=>!a[k].has(id));
    lost.paths=[...b.paths.keys()].filter(id=>!a.paths.has(id));
    return lost;
  }
  function solve(ir,state,renderer,{maxPanels=3,maxTrials=8,main:provided,diagrams:D}={}){
    const main=provided||renderer.render(ir,state),planned=D.plan(ir,main,state),baseline=[{id:'main',anchor:null,state:copy(state),result:main}];
    const initial=D.coverage(ir,planned,baseline),done=fulfilled(initial),attempts=[],deferred=[];
    const limit=Number.isFinite(maxPanels)?Math.max(1,Math.floor(maxPanels)):3;
    const budget=Number.isFinite(maxTrials)?Math.max(0,Math.floor(maxTrials)):8;
    // Reserve half of the actual render budget for ordinary inline/detail
    // choices. A recovery transaction needs up to two of the remaining trials.
    const foldBudget=Math.floor(budget/2),raw=new Map(ir.nodes.map(n=>[n.id,n]));
    const automatic=main.graph.publication.adaptive_frontier;
    const effective=automatic?{...state,paperRoleDetails:automatic.selected_role_details,paperRolePaths:automatic.selected_role_paths,
      paperExpressionDetails:automatic.selected_expression_details,paperAdaptive:false}:{...state,paperAdaptive:false};
    const within=(id,parent)=>{const seen=new Set();while(id&&!seen.has(id)){if(id===parent)return true;seen.add(id);id=raw.get(id)?.parent;}return false;};
    const candidates=[];let projected=0,renders=0;
    if(state.paperMedium==='canvas'&&state.paperGranularity==='roles'&&state.paperAuto!==false&&!state.paperRelation&&!Object.keys(state.offsets||{}).length&&foldBudget){
      const probe=E.project(ir,{...effective,view:'publication',paperRolePathStages:true,paperRolePathStageOwners:undefined});projected++;
      const existing=new Set(rows(main.graph).filter(r=>r.status==='summary').map(r=>r.node));
      const groups=new Map();
      for(const r of rows(probe).filter(r=>r.status==='summary'&&!existing.has(r.node))){
        const owners=[...new Set(r.roles.map(role=>role.owner))];
        // One exact certified canonical owner per transaction. A different
        // repeat instance, even with identical structure, is never recovery.
        if(owners.length!==1)continue;const owner=owners[0],n=raw.get(owner);
        if(!n||!main.graph.positions.get(owner)?.expanded||!within(owner,planned.focus))continue;
        let at=owner,blocked=false;
        while(at){const x=raw.get(at);if(x&&(x.kind==='opaque'||x.kind==='control'||x.condition||x.mutable||x.identity_display||x.observed_calls||
          x.evidence_status==='runtime-only'||x.runtime_evidence?.length||x.iteration)){blocked=true;break;}if(at===planned.focus)break;at=x?.parent;}
        if(blocked)continue;
        if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(r);
      }
      for(const [owner,stages]of groups)candidates.push({owner,stages});
      // Size of the source pattern schedules trials only; no coverage or
      // geometric savings are granted until both actual figures are routed.
      candidates.sort((a,b)=>b.stages.reduce((s,r)=>s+r.operations.length,0)-a.stages.reduce((s,r)=>s+r.operations.length,0)||a.owner.localeCompare(b.owner));
    }
    const trials=[];
    for(const request of candidates){
      if(renders+2>foldBudget){deferred.push({owner:request.owner,reason:'recovery-trial-budget'});continue;}
      const owner=request.owner,existingOwners=state.paperRolePathStages===true?
        (Array.isArray(state.paperRolePathStageOwners)?state.paperRolePathStageOwners:rows(main.graph).flatMap(r=>r.roles.map(r=>r.owner))):[];
      const foldedState={...effective,paperRolePathStages:true,paperRolePathStageOwners:[...new Set([...existingOwners,owner])]};
      const folded=renderer.render(ir,foldedState);renders++;
      let next=[{id:'main',anchor:null,state:foldedState,result:folded}],coverage=D.coverage(ir,planned,next);
      const lostMain=[...done].filter(id=>!fulfilled(coverage).has(id)),lostBefore=preserve(ir,baseline,next,D);
      let detail=null,detailState=null;
      if(lostMain.length||Object.values(lostBefore).some(a=>a.length)){
        if(limit>1){
          // Keep the original concrete owner and open only its already proved
          // helper paths. Other certified, conditional or unknown scopes keep
          // their independent boundaries and normal role policy.
          detailState={mode:state.mode||'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,
            paperFocus:owner,paperAuto:false,offsets:{},open:[owner,...main.graph.publication.open.filter(id=>within(id,owner)),...request.stages.map(r=>r.helper)]};
          for(const key of ['paperCanvasLimits','paperFrameView','paperSequenceView'])if(state[key]!==undefined)detailState[key]=copy(state[key]);
          detail=renderer.render(ir,detailState);renders++;
          next.push({id:'recovery:'+owner,anchor:owner,label:raw.get(owner).label,state:detailState,result:detail});
          coverage=D.coverage(ir,planned,next);
        }
      }
      const before=metrics(main),after=metrics(folded),expressed=fulfilled(coverage),lost=[...done].filter(id=>!expressed.has(id));
      const gained=[...expressed].filter(id=>!done.has(id)),missing=preserve(ir,baseline,next,D),reasons=[];
      const applied=rows(folded.graph).filter(r=>r.status==='summary'&&request.stages.some(s=>s.node===r.node));
      if(applied.length!==request.stages.length)reasons.push('summary-not-applied');
      if(next.some(p=>!D.acceptable(p.result)))reasons.push('figure-quality');
      if(detail&&detail.graph.publication.focus!==owner)reasons.push('different-recovery-instance');
      if(lost.length)reasons.push('previous-direct-goals-lost');
      for(const key of ['roles','summaries','paths'])if(missing[key].length)reasons.push('previous-'+key+'-lost');
      const b=A.evidence(ir,main),a=A.evidence(ir,folded);
      if([...b.boundaries].some(id=>!a.boundaries.has(id)))reasons.push('visible-boundary-lost');
      if([...a.conflicts].some(id=>!b.conflicts.has(id)))reasons.push('new-constraint-conflict');
      const cuts=g=>JSON.stringify(g.publication.boundary.map(({visible_node,...r})=>r));
      if(cuts(main.graph)!==cuts(folded.graph)||folded.graph.publication.focus!==main.graph.publication.focus)reasons.push('changed-focus-boundary');
      for(const p of next)for(const [key,objects]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
        const ids=Object.values(p.result.graph[key]).flat();
        if(ids.length!==objects.length||new Set(ids).size!==objects.length||objects.some(o=>!ids.includes(o.id)))reasons.push('incomplete-'+key);
      }
      if(after.area>=before.area||after.nodes>=before.nodes)reasons.push('no-main-compaction');
      if(after.font<before.font)reasons.push('smaller-font');
      const totalArea=next.reduce((s,p)=>s+metrics(p.result).area,0),totalWire=next.reduce((s,p)=>s+metrics(p.result).wire_length,0);
      // Savings on the main and costs across the whole set remain separate.
      // A duplicate recovery figure with no new direct evidence cannot win.
      const cost=Math.max(1,totalArea/before.area)*Math.max(1,totalWire/Math.max(1,before.wire_length))*next.length;
      const mainCost=after.area/before.area*Math.max(1,after.wire_length/Math.max(1,before.wire_length))*
        Math.max(1,(after.crossings+4)/(before.crossings+4));
      if(mainCost>=1)reasons.push('main-routing-cost');
      if(totalArea>before.area*2.5)reasons.push('total-area-cost');
      if(!gained.length&&(totalArea>=before.area||totalWire>=before.wire_length))reasons.push('no-new-evidence-or-total-saving');
      const definitions=new Map(planned.goals.map(g=>[g.id,g]));
      const gain=gained.reduce((s,id)=>s+(definitions.get(id)?.priority||0),0);
      const receipt={request:'summary:'+owner,form:'summary-set',anchor:owner,state:copy(foldedState),detail_state:detailState?copy(detailState):null,
        rendered:true,eligible:!reasons.length,accepted:false,reasons:[...new Set(reasons)],gained_goals:gained,lost_goals:lost,
        main_lost_goals:lostMain,recovery:missing,stages:applied.map(r=>r.node),before,metrics:after,
        total_area:totalArea,total_wire_length:totalWire,main_cost:mainCost,selection_benefit:{score:gain/cost,cost},
        quality:copy(folded.prepared.quality),detail_quality:detail?copy(detail.prepared.quality):null};
      attempts.push(receipt);trials.push({next,coverage,receipt});
    }
    const best=trials.filter(t=>t.receipt.eligible).sort((a,b)=>b.receipt.selection_benefit.score-a.receipt.selection_benefit.score||a.receipt.main_cost-b.receipt.main_cost||a.receipt.request.localeCompare(b.receipt.request))[0];
    for(const t of trials)if(t===best)t.receipt.accepted=true;else if(t.receipt.eligible)t.receipt.reasons.push('lower-measured-benefit');
    const panels=best?best.next:baseline;
    const remainder=D.joint(ir,panels[0].state,renderer,{main:panels[0].result,initialPanels:panels,frozenPlan:planned,preserveStages:!!best,maxPanels:limit,maxTrials:budget-renders});
    return {...remainder,schema:VERSION,policy:'compact',attempts:[...attempts,...remainder.attempts],baseline_coverage:initial,
      main_unchanged:remainder.panels[0].result.svg===main.svg,rendered_trials:renders+remainder.rendered_trials,
      summary_projected_trials:projected,summary_deferred:deferred,summary_trial_limit:foldBudget,
      limits:{...remainder.limits,max_trials:budget},
      scope:'Bounded certified stage choice with exact-instance recovery, then joint inline/detail planning. Direct goals are frozen before folding; a summary earns no atomic coverage. Main compaction and total figure costs are measured separately. No global optimality or reference similarity is asserted.'};
  }
  const api={VERSION,metrics,preserve,solve};root.SemanticCompactDiagrams=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

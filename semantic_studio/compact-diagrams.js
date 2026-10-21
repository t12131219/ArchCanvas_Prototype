/* A fold and its recovery figures are one transaction. Summary labels never
 * discharge direct computation obligations, even when a main figure shrinks. */
(function(root){
  'use strict';
  const VERSION='compact-diagrams/2',copy=x=>JSON.parse(JSON.stringify(x));
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
  const protectedScope=n=>!n||['opaque','control'].includes(n.kind)||n.condition||n.mutable||n.identity_display||n.observed_calls||
    n.evidence_status==='runtime-only'||n.runtime_evidence?.length||n.repeat_contract||n.iteration||
    ['conditional-region','conditional-collection','loop-template','iteration-region','serial-repeat','repeat-instance','serial-remainder','observed-variant'].includes(n.semantic_type);
  function requests(ir,main,groups,focus){
    const raw=new Map(ir.nodes.map(n=>[n.id,n])),certified=new Set((ir.semantic_contracts||[]).map(c=>c.node));
    const within=id=>{const seen=new Set();while(id&&!seen.has(id)){if(id===focus)return true;seen.add(id);id=raw.get(id)?.parent;}return false;};
    const entries=[...groups].map(([owner,stages])=>({owner,stages})),siblings=new Map();
    for(const e of entries){
      const p=raw.get(e.owner)?.parent,n=raw.get(p);
      // Only immediate canonical siblings can share a recovery scope. A
      // repeated instance, enclosing certificate or control boundary cannot
      // be jumped merely to fit more details in a panel budget.
      // Frame ownership may attach this ordinary source container to another
      // visible frame. Its canonical sibling scope remains a valid detail
      // focus; requiring its own rectangle would defeat that frame merging.
      if(protectedScope(n)||certified.has(p)||!['source-module','source-function'].includes(n.semantic_type)||!within(p))continue;
      if(!siblings.has(p))siblings.set(p,[]);siblings.get(p).push(e);
    }
    const packed=selected=>{
      const owners=new Set(selected.map(e=>e.owner)),scopes=[],used=new Set();
      for(const [scope,es]of siblings){const local=es.filter(e=>owners.has(e.owner));if(local.length<2)continue;
        scopes.push({scope,owners:local.map(e=>e.owner).sort(),stages:local.flatMap(e=>e.stages)});local.forEach(e=>used.add(e.owner));}
      for(const e of selected)if(!used.has(e.owner))scopes.push({scope:e.owner,owners:[e.owner],stages:e.stages});
      return scopes.sort((a,b)=>a.scope.localeCompare(b.scope));
    };
    const choices=[entries,...[...siblings.values()].filter(es=>es.length>1),...entries.map(e=>[e])],seen=new Set(),out=[];
    for(const selected of choices){
      if(!selected.length)continue;const owners=selected.map(e=>e.owner).sort(),key=JSON.stringify(owners);if(seen.has(key))continue;seen.add(key);
      const scopes=packed(selected),stages=selected.flatMap(e=>e.stages);
      out.push({owner:owners[0],owners,stages,scopes,focus,estimated_benefit:stages.reduce((s,r)=>s+r.operations.length,0)/(1+scopes.length)});
    }
    return out.sort((a,b)=>b.estimated_benefit-a.estimated_benefit||b.owners.length-a.owners.length||a.owner.localeCompare(b.owner));
  }
  function recoveryState(ir,main,state,request){
    const raw=new Map(ir.nodes.map(n=>[n.id,n])),display=new Map(main.graph.architecture.nodes.map(n=>[n.id,n]));
    const within=(id,parent,by)=>{const seen=new Set();while(id&&!seen.has(id)){if(id===parent)return true;seen.add(id);id=by.get(id)?.parent;}return false;};
    const open=new Set([request.scope,...main.graph.publication.open.filter(id=>within(id,request.scope,display)||within(id,request.scope,raw))]);
    const owners=new Set(request.owners),certified=new Set((ir.semantic_contracts||[]).map(c=>c.node));
    if(protectedScope(raw.get(request.scope))||certified.has(request.scope)&&!owners.has(request.scope))return null;
    for(const id of [...request.owners,...request.stages.map(r=>r.helper)]){
      if(!within(id,request.scope,raw))return null;
      let at=id;const seen=new Set();
      while(at&&at!==request.scope&&!seen.has(at)){
        seen.add(at);const n=display.get(at),original=raw.get(at);
        if(protectedScope(n)||original&&protectedScope(original)||certified.has(at)&&!owners.has(at))return null;
        open.add(at);at=n?.parent;
      }
      if(at!==request.scope)return null;
    }
    const next={mode:state.mode||'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperParallelRailRepair:true,
      paperFocus:request.scope,paperAuto:false,offsets:{},open:[...open]};
    for(const key of ['paperCanvasLimits','paperFrameView','paperSequenceView'])if(state[key]!==undefined)next[key]=copy(state[key]);
    return next;
  }
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
    // Speculative folds must not consume nearly every trial when their
    // recovery fails. Reserve half for ordinary exact detail planning; a
    // six-render budget still admits a main plus two recovery scopes.
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
        // Each stage belongs to one exact certified canonical owner. Several
        // owners may be chosen together, but none substitutes another instance.
        if(owners.length!==1)continue;const owner=owners[0],n=raw.get(owner);
        if(!n||!main.graph.positions.get(owner)?.expanded||!within(owner,planned.focus))continue;
        let at=owner,blocked=false;
        while(at){const x=raw.get(at);if(x&&(x.kind==='opaque'||x.kind==='control'||x.condition||x.mutable||x.identity_display||x.observed_calls||
          x.evidence_status==='runtime-only'||x.runtime_evidence?.length||x.iteration)){blocked=true;break;}if(at===planned.focus)break;at=x?.parent;}
        if(blocked)continue;
        if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(r);
      }
      candidates.push(...requests(ir,main,groups,planned.focus));
      // Size of the source pattern schedules trials only; no coverage or
      // geometric savings are granted until both actual figures are routed.
    }
    const trials=[];
    for(const request of candidates){
      if(request.scopes.length+1>limit){deferred.push({owners:request.owners,reason:'recovery-panel-budget'});continue;}
      if(renders+1+request.scopes.length>foldBudget){deferred.push({owners:request.owners,reason:'recovery-trial-budget'});continue;}
      const recoveryRequests=request.scopes.map(r=>({...r,state:recoveryState(ir,main,state,r)}));
      if(recoveryRequests.some(r=>!r.state)){deferred.push({owners:request.owners,reason:'protected-recovery-path'});continue;}
      const owner=request.owner,existingOwners=state.paperRolePathStages===true?
        (Array.isArray(state.paperRolePathStageOwners)?state.paperRolePathStageOwners:rows(main.graph).flatMap(r=>r.roles.map(r=>r.owner))):[];
      const foldedState={...effective,paperRolePathStages:true,paperRolePathStageOwners:[...new Set([...existingOwners,...request.owners])]};
      const folded=renderer.render(ir,foldedState);renders++;
      let next=[{id:'main',anchor:null,state:foldedState,result:folded}],coverage=D.coverage(ir,planned,next);
      const lostMain=[...done].filter(id=>!fulfilled(coverage).has(id)),lostBefore=preserve(ir,baseline,next,D);
      const recoveries=[];
      if(lostMain.length||Object.values(lostBefore).some(a=>a.length)){
        for(const recovery of recoveryRequests){
          // Open the exact selected owners and their proved helper paths,
          // including intervening display frames. Unselected certificates
          // and protected scopes retain their independent boundaries.
          const detail=renderer.render(ir,recovery.state);renders++;
          recoveries.push({...recovery,result:detail});
          next.push({id:'recovery:'+recovery.scope,anchor:recovery.scope,label:raw.get(recovery.scope).label,state:recovery.state,result:detail,refinable:true});
        }
        coverage=D.coverage(ir,planned,next);
      }
      const before=metrics(main),after=metrics(folded),expressed=fulfilled(coverage),lost=[...done].filter(id=>!expressed.has(id));
      const gained=[...expressed].filter(id=>!done.has(id)),missing=preserve(ir,baseline,next,D),reasons=[];
      const applied=rows(folded.graph).filter(r=>r.status==='summary'&&request.stages.some(s=>s.node===r.node));
      if(applied.length!==request.stages.length)reasons.push('summary-not-applied');
      if(next.some(p=>!D.acceptable(p.result)))reasons.push('figure-quality');
      if(recoveries.some(r=>r.result.graph.publication.focus!==r.scope))reasons.push('different-recovery-instance');
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
      const receipt={request:'summary:'+JSON.stringify(request.owners),form:'summary-set',owners:request.owners,
        anchor:request.scopes.length===1?request.scopes[0].scope:owner,state:copy(foldedState),detail_state:recoveries.length===1?copy(recoveries[0].state):null,
        recoveries:recoveries.map(r=>({scope:r.scope,owners:r.owners,state:copy(r.state),quality:copy(r.result.prepared.quality)})),
        rendered:true,eligible:!reasons.length,accepted:false,reasons:[...new Set(reasons)],gained_goals:gained,lost_goals:lost,
        main_lost_goals:lostMain,recovery:missing,stages:applied.map(r=>r.node),before,metrics:after,
        total_area:totalArea,total_wire_length:totalWire,main_cost:mainCost,selection_benefit:{score:gain/cost,cost},
        quality:copy(folded.prepared.quality),detail_quality:recoveries.length===1?copy(recoveries[0].result.prepared.quality):null};
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
  const api={VERSION,metrics,preserve,requests,recoveryState,solve};root.SemanticCompactDiagrams=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

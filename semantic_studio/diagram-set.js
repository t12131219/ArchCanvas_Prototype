/* A semantic main figure and independently measured detail figures share
 * explicit expression obligations. Planning intent never counts as coverage. */
(function(root){
  'use strict';
  const VERSION='diagram-set/3',clone=x=>JSON.parse(JSON.stringify(x));
  const Goals=root.SemanticExpressionGoals||(typeof require==='function'?require('./expression-goals.js'):null);
  const protectedScope=n=>!n||['opaque','control'].includes(n.kind)||n.condition||n.mutable||n.identity_display||n.observed_calls||
    n.evidence_status==='runtime-only'||n.runtime_evidence?.length||n.repeat_contract||n.iteration||
    ['conditional-region','conditional-collection','loop-template','iteration-region','serial-repeat','repeat-instance','serial-remainder','observed-variant'].includes(n.semantic_type);
  function plan(ir,main,state={}){
    const g=main.graph,by=new Map([...g.architecture.nodes,...g.nodes].map(n=>[n.id,n])),raw=new Map(ir.nodes.map(n=>[n.id,n])),focus=g.publication.focus;
    const chain=id=>{const out=[],seen=new Set();while(id&&!seen.has(id)){out.push(id);seen.add(id);id=by.get(id)?.parent;}return out;};
    const originalPath=id=>{const out=[],seen=new Set();while(id&&!seen.has(id)){out.push(id);seen.add(id);if(id===focus)break;id=raw.get(id)?.parent;}return out;};
    const within=(id,scope)=>chain(id).includes(scope),runtime=id=>chain(id).some(id=>id==='runtime-observations'||id.startsWith('runtime:'));
    const mode=state.mode||'source',allowed=id=>mode==='merged'||(mode==='runtime')===runtime(id);
    const goals=g.expression_goals.goals.filter(goal=>allowed(goal.focus_node)&&within(goal.focus_node,focus));
    const coverage=new Map(g.expression_coverage.map(c=>[c.goal,c])),pending=goals.filter(goal=>coverage.get(goal.id)?.status!=='fulfilled');
    const candidates=[],deferred=[],assigned=new Set();
    const panelState=()=>{
      // A new detail focus owns its own geometry and budget. Main user open,
      // positions, relation focus and representative selections stay intact.
      const s={mode,view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAuto:true,paperAdaptive:false,offsets:{}};
      for(const key of ['paperCanvasLimits','paperFrameView','paperSequenceView'])if(state[key]!==undefined)s[key]=clone(state[key]);
      return s;
    };
    const hiddenScopes=g.architecture.nodes.filter(n=>!g.positions.has(n.id)&&raw.has(n.id)&&n.kind==='composite'&&
      ['source-function','source-module'].includes(n.semantic_type));
    for(const n of [...g.nodes,...hiddenScopes]){
      const p=g.positions.get(n.id),hidden=!p;if(p?.expanded||!allowed(n.id)||!within(n.id,focus))continue;
      const path=chain(n.id),end=path.indexOf(focus),anchor=hidden?path.find(id=>g.positions.has(id)):n.id;
      if(hidden&&(!anchor||end<0||path.slice(0,end+1).some(id=>protectedScope(by.get(id)))||
        originalPath(n.id).some(id=>protectedScope(raw.get(id)))))continue;
      const local=pending.filter(goal=>goal.core.every(id=>within(id,n.id)));
      if(!local.length)continue;
      if(n.kind!=='composite'||protectedScope(n)){
        for(const goal of local)deferred.push({goal:goal.id,node:n.id,reason:'A protected or noncompound boundary does not authorize automatic interior expansion.'});
        continue;
      }
      const certs=(n.semantic_contracts||[]).filter(id=>g.architecture.semantic_contracts?.some(c=>c.id===id&&c.node===n.id));
      const next={...panelState(),paperFocus:n.id};let selected=local;
      if(!certs.length){
        const open=new Set([n.id]);selected=local.filter(goal=>goal.core.every(id=>{
          const path=chain(id),end=path.indexOf(n.id);return end>=0&&path.slice(1,end).every(at=>!protectedScope(by.get(at))&&!by.get(at)?.semantic_contracts?.length);
        }));
        if(!selected.length)continue;
        for(const request of Goals.panelRequests({goals:selected},g.architecture))for(const id of request.required_open)if(within(id,n.id))open.add(id);
        next.paperGranularity='detailed';next.paperAuto=false;next.open=[...open];
      }
      const ids=selected.map(goal=>goal.id);if(!hidden)ids.forEach(id=>assigned.add(id));
      candidates.push({id:'focus:'+n.id,kind:certs.length?'certified-roles':'computation-paths',anchor,label:n.label,state:next,goals:ids,
        ...(hidden?{endpoint:n.id,alternative_for:candidates.filter(c=>c.goals.some(id=>ids.includes(id))).map(c=>c.id)}:{}),
        priority:Math.max(...selected.map(goal=>goal.priority)),scope:'One actual visible boundary; no representative substitution or model-family inference.'});
    }
    // Cross-boundary and unfamiliar relationships use their own exact local
    // panel rather than pretending a containing module exposes their paths.
    for(const goal of pending){
      const boundary=['unknown-boundary','state-interface','selection'].includes(goal.kind),anchor=g.positions.has(goal.focus_node)?goal.focus_node:g.representatives[goal.focus_node];
      if(assigned.has(goal.id)||!goal.relation||!g.positions.has(anchor)||!boundary&&!g.positions.has(goal.focus_node))continue;
      const relation=g.architecture.relation_graph?.relations.find(r=>r.id===goal.relation);
      if(!relation||protectedScope(by.get(goal.focus_node))&&goal.kind!=='unknown-boundary'&&goal.kind!=='state-interface'&&goal.kind!=='selection')continue;
      candidates.push({id:'relation:'+goal.relation,kind:'local-relationship',anchor,endpoint:goal.focus_node,label:by.get(goal.focus_node)?.label||goal.kind,
        state:{...panelState(),paperRelation:goal.relation,paperGranularity:'detailed'},goals:[goal.id],priority:goal.priority,scope:relation.evidence_scope});
    }
    // An enclosure is one possible detail figure, not an exclusive assignment
    // of its goals. It may be too large, or expose only some roles. Keep exact
    // local alternatives available after that trial, without opening across a
    // protected ancestor or substituting a similar/repeated instance.
    const existing=new Set(candidates.map(c=>c.state.paperRelation).filter(Boolean));
    for(const goal of pending){
      const relation=goal.relation&&g.architecture.relation_graph?.relations.find(r=>r.id===goal.relation);
      const node=raw.get(goal.focus_node),key=relation?.id||(!goal.relation&&goal.kind==='computation'&&node?.kind==='compute'?'node:'+node.id:null);
      if(!key||existing.has(key))continue;
      const anchor=chain(goal.focus_node).find(id=>g.positions.has(id));if(!anchor)continue;
      const members=relation?.members||[goal.focus_node];
      const boundaryLeaf=id=>id===goal.focus_node&&['unknown-boundary','state-interface','selection'].includes(goal.kind)&&by.get(id)?.kind!=='composite';
      const safe=id=>{
        if(!allowed(id)||!within(id,focus))return false;
        const path=chain(id),end=path.indexOf(focus);if(end<0)return false;
        return path.slice(0,end+1).every((at,i)=>!protectedScope(by.get(at))||i===0&&boundaryLeaf(at))&&
          originalPath(id).every((at,i)=>!protectedScope(raw.get(at))||i===0&&boundaryLeaf(at));
      };
      // Binding aliases may live outside the direct members. They carry real
      // conditions, result slots and ownership too; inspect them before the
      // relation renderer projects the original cuts.
      const endpoints=[...members,...goal.core,...(relation?.bindings||[]).flatMap(b=>[b.source,b.target,b.producer,...(b.via||[]).flatMap(id=>{
        const e=ir.edges.find(e=>e.id===id);return e?[e.source,e.target]:[];
      })])];
      if(!endpoints.every(safe)){
        deferred.push({goal:goal.id,node:anchor,reason:'Local detail would cross the current focus, evidence scope or a protected ancestor.'});continue;
      }
      existing.add(key);
      const source=node?.source?.find(s=>s.line),name=by.get(goal.focus_node)?.label||goal.kind;
      candidates.push({id:(relation?'relation:':'operation:')+key,kind:relation?'local-relationship':'local-operation',anchor,endpoint:goal.focus_node,
        label:name+' · '+(relation?goal.kind.replaceAll('-',' '):'调用细节')+(source?' · L'+source.line:''),
        state:{...panelState(),paperRelation:key,paperGranularity:'detailed'},goals:[goal.id],priority:goal.priority,
        alternative_for:candidates.filter(c=>c.goals.includes(goal.id)&&!c.alternative_for).map(c=>c.id),
        scope:relation?.evidence_scope||'One original operation and its exact canonical boundary; no behavior or family inference.'});
    }
    // At equal priority, try enclosing figures first. A successful figure may
    // discharge many local alternatives; rejected/partial figures cannot
    // suppress the remaining exact goals.
    candidates.sort((a,b)=>b.priority-a.priority||Number(!!a.alternative_for)-Number(!!b.alternative_for)||a.id.localeCompare(b.id));
    return {schema:VERSION,focus,goals:clone(goals),candidates,deferred,
      scope:'Current focus and evidence mode; every original instance remains a distinct obligation. Protected interiors and unplanned goals remain deferred.'};
  }
  function acceptable(result){
    const q=result.prepared.quality;
    return !q.issues.length&&!q.route_failures.length&&!q.unplaced_port_labels.length&&!q.line_geometry.unrelated_contacts.length&&
      !q.line_geometry.overlapping_paths.some(p=>!p.same_value)&&q.min_canvas_font_px>=12;
  }
  function coverage(ir,plan,panels){
    const by=new Map(ir.nodes.map(n=>[n.id,n])),edges=new Map(ir.edges.map(e=>[e.id,e])),incoming=new Map(),outgoing=new Map();
    const flow=e=>['data','alias','interface-binding'].includes(e.kind),transparent=n=>n&&['interface','value-alias'].includes(n.kind)&&!n.operator;
    for(const e of ir.edges){if(!incoming.has(e.target))incoming.set(e.target,[]);incoming.get(e.target).push(e);
      if(!outgoing.has(e.source))outgoing.set(e.source,[]);outgoing.get(e.source).push(e);}
    const resolve=(id,port='out')=>{const seen=new Set();while(!seen.has(id)){
      seen.add(id);const n=by.get(id),es=incoming.get(id)||[];if(!transparent(n)||es.length!==1||!flow(es[0])||es[0].condition)break;
      const e=es[0],outer=n.kind==='value-alias'?n.slot??e.source_port??'out':e.source_port??'out';
      port=outer==='out'?port:port==='out'?outer:outer+'.'+port;id=e.source;
    }return [id,port];};
    const reaches=(first,last)=>{const todo=[first],seen=new Set();for(let i=0;i<todo.length;i++){
      const at=todo[i];if(at===last)return true;if(seen.has(at)||!transparent(by.get(at)))continue;seen.add(at);
      for(const e of outgoing.get(at)||[])if(flow(e)&&!e.condition)todo.push(e.target);
    }return false;};
    const checks=panels.map(panel=>{
      const paths=new Map();for(const path of panel.result.prepared.routes)for(const member of path.bundle_members||[path])for(const id of [member.id,...member.originals||[]]){
        if(!paths.has(id))paths.set(id,[]);paths.get(id).push({path,member});}
      const exact=id=>{const e=edges.get(id);return e&&(paths.get(id)||[]).some(({path,member})=>{
        const terminal=edges.get(member.id);
        return terminal&&path.route.ok&&
        member.canonical_source===terminal.source&&member.canonical_target===terminal.target&&member.target_port===terminal.target_port&&member.kind===terminal.kind&&
        member.evidence===terminal.evidence&&JSON.stringify(member.condition)===JSON.stringify(terminal.condition)&&
        JSON.stringify(resolve(terminal.source,terminal.source_port))===JSON.stringify(resolve(member.resolved_source??member.canonical_source,member.source_port))&&
        JSON.stringify(resolve(e.source,e.source_port))===JSON.stringify(resolve(member.resolved_source??member.canonical_source,member.source_port))&&
        reaches(e.target,member.canonical_target??member.target)&&
        (member.id!==e.id||member.target_port===e.target_port&&member.kind===e.kind&&JSON.stringify(member.condition)===JSON.stringify(e.condition));
      });};
      const rows=Goals.evaluate({goals:plan.goals},panel.result.graph,panel.result.prepared).map(row=>{
        const goal=plan.goals.find(goal=>goal.id===row.goal),required=[...goal.edges,...(goal.kind==='computation'?(incoming.get(goal.focus_node)||[]).filter(flow).map(e=>e.id):[])];
        const missing=required.filter(id=>!exact(id));return {...row,...(missing.length?{status:'unfulfilled'}:{}),missing_exact_bindings:missing};});
      return {panel:panel.id,qualified:acceptable(panel.result),rows:new Map(rows.map(row=>[row.goal,row]))};
    });
    return plan.goals.map(goal=>{const expressed=checks.filter(check=>check.qualified&&check.rows.get(goal.id)?.status==='fulfilled');
      return {goal:goal.id,kind:goal.kind,status:expressed.length?'fulfilled':'deferred',panels:expressed.map(check=>check.panel),
        method:expressed.length?'direct-canonical-paths':null};});
  }
  function joint(ir,state,renderer,{maxPanels=3,maxTrials=6,main:provided}={}){
    const A=root.SemanticAdaptiveFrontier||(typeof require==='function'?require('./adaptive-frontier.js'):null);
    const main=provided||renderer.render(ir,state),planned=plan(ir,main,state),definitions=new Map(planned.goals.map(g=>[g.id,g]));
    const critical=new Set(['unknown-boundary','state-interface','selection','conditional-join','conditional-region','iteration-binding','iteration-template','same-object-calls','observed-parameter-aliases']);
    const limit=Number.isFinite(maxPanels)?Math.max(1,Math.floor(maxPanels)):3,trialLimit=Number.isFinite(maxTrials)?Math.max(0,Math.floor(maxTrials)):6;
    let panels=[{id:'main',anchor:null,state:clone(state),result:main}],assignments=coverage(ir,planned,panels);
    const initial=clone(assignments),attempts=[],seen=new Set(),cache=new Map();let renders=0;
    const fulfilled=rows=>new Set(rows.filter(r=>r.status==='fulfilled').map(r=>r.goal));
    const area=p=>p.result.prepared.quality.native_width_px*p.result.prepared.quality.native_height_px;
    const weight=ids=>ids.reduce((v,id)=>{const g=definitions.get(id);if(g)v[critical.has(g.kind)?0:g.kind==='computation'?2:1]+=g.priority;return v;},[0,0,0]);
    const compare=(a,b)=>{for(let i=0;i<3;i++)if(Math.abs(a.score[i]-b.score[i])>1e-9)return b.score[i]-a.score[i];return a.cost-b.cost;};
    while(renders<trialLimit){
      const current=panels[0],done=fulfilled(assignments),pending=planned.goals.filter(g=>!done.has(g.id)),requests=[];
      const by=new Map(current.result.graph.architecture.nodes.map(n=>[n.id,n]));
      const within=(id,parent)=>{const visited=new Set();while(id&&!visited.has(id)){if(id===parent)return true;visited.add(id);id=by.get(id)?.parent;}return false;};
      // Compare local inline expansion with an independently focused figure.
      // Candidate claims only rank work; physically routed coverage decides it.
      const automatic=current.result.graph.publication.adaptive_frontier;
      const effective=automatic?{...current.state,paperRoleDetails:automatic.selected_role_details,paperRolePaths:automatic.selected_role_paths,
        paperExpressionDetails:automatic.selected_expression_details,paperAdaptive:false}:current.state;
      if(state.paperAuto!==false&&!state.paperRelation&&!Object.keys(state.offsets||{}).length)
        for(const c of A.candidates(current.result.graph,{...effective,paperAdaptivePolicy:'structure'})){
          const goals=pending.filter(g=>g.core.every(id=>within(id,c.node)||c.targets.includes(id))).map(g=>g.id);
          if(!goals.length)continue;
          requests.push({id:'inline:'+c.id,form:'inline',anchor:c.node||current.result.graph.representatives[c.targets[0]],label:by.get(c.node)?.label||c.type,
            state:{...A.apply(effective,c),paperAdaptive:false},goals,opportunity:c});
        }
      if(panels.length<limit)for(const c of plan(ir,current.result,current.state).candidates){
        const goals=c.goals.filter(id=>definitions.has(id)&&!done.has(id));if(!goals.length)continue;
        requests.push({...c,form:'detail',goals});
      }
      for(const r of requests){r.key=JSON.stringify([r.form,r.state]);r.priority_vector=weight(r.goals);}
      const available=requests.filter(r=>!seen.has(r.key)).sort((a,b)=>compare({score:a.priority_vector,cost:1},{score:b.priority_vector,cost:1})||a.goals.length-b.goals.length||a.id.localeCompare(b.id));
      if(!available.length)break;
      const batch=[available[0]],alternative=available.find(r=>r.form!==batch[0].form&&r.goals.some(id=>batch[0].goals.includes(id)));
      if(alternative)batch.push(alternative);else if(available[1])batch.push(available[1]);
      const trials=[];
      for(const request of batch.slice(0,trialLimit-renders)){
        seen.add(request.key);
        let result=cache.get(request.key);
        if(!result){result=renderer.render(ir,request.state);cache.set(request.key,result);renders++;}
        const candidate={id:request.form==='inline'?'main':request.id,anchor:request.form==='inline'?null:request.anchor,state:clone(request.state),result,label:request.label};
        const next=request.form==='inline'?[candidate,...panels.slice(1)]:[...panels,candidate],rows=coverage(ir,planned,next),expressed=fulfilled(rows);
        const gained=[...expressed].filter(id=>!done.has(id)),lost=[...done].filter(id=>!expressed.has(id));
        const assessment=request.form==='inline'?A.assess(ir,current.result,result):null,reasons=[];
        if(!acceptable(result))reasons.push('figure-quality');
        if(assessment&&!assessment.accepted)reasons.push(...assessment.reasons);
        if(!gained.length)reasons.push('no-new-direct-goals');
        if(lost.length)reasons.push('previous-direct-goals-lost');
        const beforeArea=panels.reduce((s,p)=>s+area(p),0),afterArea=next.reduce((s,p)=>s+area(p),0);
        const cost=Math.max(1,afterArea/Math.max(1,beforeArea))*(next.length/panels.length);
        const benefit={score:weight(gained).map(n=>n/cost),cost};
        const receipt={request:request.id,form:request.form,anchor:request.anchor,label:request.label,state:clone(request.state),
          before_panels:panels.map(p=>p.id),comparison_round:attempts.length,eligible:!reasons.length,accepted:false,reasons,
          gained_goals:gained,lost_goals:lost,quality:clone(result.prepared.quality),metrics:A.metrics(result),
          selection_benefit:{...benefit,before_area:beforeArea,after_area:afterArea,before_panels:panels.length,after_panels:next.length},
          ...(assessment?{inline_assessment:assessment}:{})};
        trials.push({request,next,rows,receipt});
      }
      const best=trials.filter(t=>t.receipt.eligible).sort((a,b)=>compare(a.receipt.selection_benefit,b.receipt.selection_benefit)||a.request.id.localeCompare(b.request.id))[0];
      for(const t of trials){if(t===best)t.receipt.accepted=true;else if(t.receipt.eligible){t.receipt.reasons.push('lower-measured-benefit');seen.delete(t.request.key);}attempts.push(t.receipt);}
      if(best){panels=best.next;assignments=best.rows;}
      // Reused alternatives need no new render, but each decision must either
      // add a goal or exhaust a candidate; empty batches cannot spin forever.
    }
    const deferred=assignments.filter(r=>r.status!=='fulfilled').map(r=>r.goal);
    return {schema:VERSION,policy:'joint',plan:planned,panels,attempts,coverage:assignments,deferred_goals:deferred,
      complete:!deferred.length,main_unchanged:panels[0].result.svg===main.svg,rendered_trials:renders,
      baseline_coverage:initial,limits:{max_panels:limit,max_trials:trialLimit},
      scope:'Bounded joint choice of inline detail versus independent detail figures. Original main dependencies, roles and summaries are protected; direct goals count only on actual qualified canonical paths. Total area and figure count are measured. This is a local search, not a global optimum.'};
  }
  function render(ir,state,renderer,{maxPanels=6,maxTrials=8,main:provided,policy=state.paperDiagramPolicy}={}){
    if(policy==='joint')return joint(ir,state,renderer,{maxPanels,maxTrials,main:provided});
    const main=provided||renderer.render(ir,state),planned=plan(ir,main,state),panels=[{id:'main',anchor:null,state:clone(state),result:main}],attempts=[];
    const limit=Number.isFinite(maxPanels)?Math.max(1,Math.floor(maxPanels)):6,trialLimit=Number.isFinite(maxTrials)?Math.max(0,Math.floor(maxTrials)):8;
    let assignments=coverage(ir,planned,panels);
    for(const request of planned.candidates){
      if(panels.length>=limit||attempts.length>=trialLimit)break;
      if(request.goals.every(id=>assignments.some(row=>row.goal===id&&row.status==='fulfilled')))continue;
      const result=renderer.render(ir,request.state),trial={id:request.id,anchor:request.anchor,state:request.state,result};
      const next=coverage(ir,planned,[...panels,trial]),gained=next.filter(row=>row.status==='fulfilled'&&assignments.find(old=>old.goal===row.goal)?.status!=='fulfilled').map(row=>row.goal);
      // Invalid figures stay inspectable audit attempts, never coverage pages.
      const accepted=acceptable(result)&&gained.length>0;
      attempts.push({request:request.id,anchor:request.anchor,accepted,gained_goals:accepted?gained:[],quality:clone(result.prepared.quality),
        reason:accepted?'Measured detail adds directly expressed canonical goals.':acceptable(result)?'No additional goal was physically expressed.':'Figure quality prevents goal assignment.'});
      if(accepted){panels.push(trial);assignments=next;}
    }
    const deferred=assignments.filter(row=>row.status!=='fulfilled').map(row=>row.goal);
    return {schema:VERSION,plan:planned,panels,attempts,coverage:assignments,deferred_goals:deferred,
      complete:!deferred.length,main_unchanged:true,scope:planned.scope};
  }
  const api={VERSION,plan,acceptable,coverage,joint,render};root.SemanticDiagramSet=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

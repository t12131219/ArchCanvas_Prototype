/* A semantic main figure and independently measured detail figures share
 * explicit expression obligations. Planning intent never counts as coverage. */
(function(root){
  'use strict';
  const VERSION='diagram-set/1',clone=x=>JSON.parse(JSON.stringify(x));
  const Goals=root.SemanticExpressionGoals||(typeof require==='function'?require('./expression-goals.js'):null);
  const protectedScope=n=>!n||['opaque','control'].includes(n.kind)||n.condition||n.mutable||n.identity_display||n.observed_calls||
    n.evidence_status==='runtime-only'||n.runtime_evidence?.length||n.repeat_contract||n.iteration||
    ['conditional-region','conditional-collection','loop-template','iteration-region','serial-repeat','repeat-instance','serial-remainder','observed-variant'].includes(n.semantic_type);
  function plan(ir,main,state={}){
    const g=main.graph,by=new Map(g.architecture.nodes.map(n=>[n.id,n])),raw=new Map(ir.nodes.map(n=>[n.id,n])),focus=g.publication.focus;
    const chain=id=>{const out=[],seen=new Set();while(id&&!seen.has(id)){out.push(id);seen.add(id);id=by.get(id)?.parent;}return out;};
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
    for(const n of g.nodes){
      const p=g.positions.get(n.id);if(p.expanded||!allowed(n.id)||!within(n.id,focus))continue;
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
      const ids=selected.map(goal=>goal.id);ids.forEach(id=>assigned.add(id));
      candidates.push({id:'focus:'+n.id,kind:certs.length?'certified-roles':'computation-paths',anchor:n.id,label:n.label,state:next,goals:ids,
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
    candidates.sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
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
  function render(ir,state,renderer,{maxPanels=6,maxTrials=8,main:provided}={}){
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
  const api={VERSION,plan,acceptable,coverage,render};root.SemanticDiagramSet=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

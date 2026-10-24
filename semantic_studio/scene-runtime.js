/* The same task runtime runs in a worker and in the explicit browser fallback.
 * IR and derived plans stay resident; requests carry only view state or deltas. */
(function(root){
  'use strict';
  const E=root.SemanticEngine||(typeof require==='function'?require('./semantic-engine.js'):null);
  const R=root.SemanticPublicationRenderer||(typeof require==='function'?require('./publication-renderer.js'):null);
  const I=root.SemanticCanvasInteraction||(typeof require==='function'?require('./canvas-interaction.js'):null);
  const C=root.SemanticCompositionLayout||(typeof require==='function'?require('./composition-layout.js'):null);
  const P=root.SemanticPublication||(typeof require==='function'?require('./publication.js'):null);
  const D=root.SemanticDiagramSet||(typeof require==='function'?require('./diagram-set.js'):null);
  // Map custom properties are NOT preserved by structured clone. Always send
  // the routing context as an explicit sidecar and reattach it at the receiver.
  const pack=figure=>({figure,context:figure.graph.positions.context});
  const unpack=payload=>{payload.figure.graph.positions.context=payload.context;return payload.figure;};
  function create(){
    let ir=null,epoch=null,serial=0;const cache=new Map(),keys=new Map();
    function remember(state,figure,planned,focus){
      const key=++serial,entry={key,state:E.clone(state),figure,planned,focus};cache.set(key,entry);keys.set(JSON.stringify(state),key);
      if(cache.size>6){const first=cache.keys().next().value;keys.delete(JSON.stringify(cache.get(first).state));cache.delete(first);}return entry;
    }
    function focusOptions(state){const plan=P.plan(ir),idx=E.index(plan),source=id=>{while(id){if(id==='runtime-observations'||id.startsWith('runtime:'))return false;id=idx.nodes.get(id)?.parent;}return true;};
      return plan.nodes.filter(n=>n.parent&&(idx.children.get(n.id)||[]).length&&(state.mode==='source'?source(n.id):state.mode==='runtime'?!source(n.id):true)).map(n=>({id:n.id,label:(n.module_path||n.label)+(n.paper.unknown_count?' · '+n.paper.unknown_count+' 未知边界':'')}));}
    function response(entry,metrics){return {ok:true,epoch,key:entry.key,state:E.clone(entry.state),...pack(entry.figure),planned:entry.planned,focus:entry.focus,metrics};}
    function render(state){
      const cached=cache.get(keys.get(JSON.stringify(state)));if(cached)return response(cached,{cached:true,compute_ms:0});
      const start=Date.now();let figure=state.view==='publication'?R.prepareFigure(ir,{...state,canvasPlacement:undefined}):{graph:E.project(ir,state),prepared:null};
      if(state.canvasPlacement){
        let restored;try{restored=I.restore(figure,state.canvasPlacement,ir);}catch(_){}
        if(restored)figure=restored;else delete state.canvasPlacement;
      }
      if(!figure.prepared){const positions=figure.graph.positions;positions.context.routeCache=new Map();for(const e of figure.graph.edges)positions.context.routeCache.set(e.id,E.route(e,positions));}
      const planned=state.view==='publication'&&state.paperMedium==='canvas'&&state.paperGranularity==='roles'?D.plan(ir,figure,state):null;
      return response(remember(state,figure,planned,focusOptions(state)),{cached:false,compute_ms:Date.now()-start});
    }
    function run(task){
      try{
        if(task.task==='init'){E.validate(task.ir);ir=task.ir;epoch=task.epoch;cache.clear();keys.clear();return {ok:true,epoch};}
        if(!ir||task.epoch!==epoch)return {ok:false,stale:true,error:'画布任务已过期'};
        const state=E.clone(task.state||{});
        if(task.task==='render'){
          if(task.certify)Object.assign(state,C.certifiedDetails(ir,state));
          if(task.diagramPlan){
            const entry=cache.get(task.baseKey);if(!entry)throw Error('主图已过期，请重新规划');
            const requested=E.clone(state);delete requested.paperDiagramPlan;
            const main=R.renderPrepared(ir,requested,entry.figure),set=D.render(ir,requested,R,{main,maxPanels:3,maxTrials:6,policy:'compact'}),mainState=E.clone(set.panels[0].state);
            Object.assign(state,mainState,{paperDiagramPlan:{schema:'joint-diagram-plan/1',main_state:E.clone(mainState),requested_state:requested,
              details:set.panels.slice(1).map(p=>({id:p.id,anchor:p.anchor,label:p.label,state:p.state})),coverage:set.coverage,baseline_coverage:set.baseline_coverage,
              policy:set.policy,summary_deferred:set.summary_deferred,attempts:set.attempts,preflights:set.preflights,preflight_deferred:set.preflight_deferred,
              projected_trials:set.projected_trials,limits:set.limits,complete:set.complete}});
          }
          return render(state);
        }
        if(task.task==='move'){
          const entry=cache.get(task.baseKey);if(!entry)throw Error('移动基准已过期');
          const start=Date.now(),moved=I.move(entry.figure,task.id,task.dx,task.dy,ir),next=E.clone(entry.state);
          if(!moved.moved)return response(entry,{cached:true,compute_ms:0,moved:false});
          next.canvasPlacement=I.placement(moved.figure);
          return response(remember(next,moved.figure,entry.planned,entry.focus),{cached:false,compute_ms:Date.now()-start,moved:true,dx:moved.dx,dy:moved.dy});
        }
        throw Error('未知画布任务');
      }catch(error){return {ok:false,epoch,error:error.message};}
    }
    return {run};
  }
  const api={create,pack,unpack};root.SemanticSceneRuntime=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

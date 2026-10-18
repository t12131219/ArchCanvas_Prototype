importScripts('router.js','physical-ports.js','junction-markers.js','route-labels.js','source-contracts.js','semantic-constraints.js','graph-engine.js','runtime-layout.js','recursive-graph.js');
const validateView=graph=>SummaryEngine.validateView(graph);
self.onmessage = event => {
  const {requestId,task,graph,ids,options,id,dx,dy,operation}=event.data;
  try{
    if(task==='frontier'){const candidate=operation?.kind==='all'?SummaryRecursive.all(graph,!!operation.open):SummaryRecursive.toggle(graph,operation?.id,operation?.force);if(!candidate)throw new Error('该模块不可展开或收起');const result=SummaryRecursive.route(candidate,options),validation=validateView(candidate);if(result.failed||!validation.source.ok||!validation.layout.ok||validation.edges.some(([,v])=>!v.ok))throw new Error([...validation.source.violations,...validation.layout.violations,...validation.edges.filter(([,v])=>!v.ok).map(([id,v])=>id+': '+v.violations.join(', '))].slice(0,4).join('; '));self.postMessage({requestId,ok:true,graph:candidate,...result,validation});}
    else if(task==='move'){
      SummaryEngine.move(graph,id,dx,dy,options);
      const validation=validateView(graph),invalid=validation.edges.filter(([,check])=>!check.ok).map(([id])=>id);
      if(!validation.source.ok||!validation.layout.ok||invalid.length)throw new Error('移动后的图未通过完整校验: '+[...validation.source.violations,...validation.layout.violations,...invalid].join('; '));
      self.postMessage({requestId,ok:true,graph,validation});
    }else {const result=SummaryEngine.routeBatch(graph,ids,options);self.postMessage({requestId,ok:true,...result,validation:validateView(graph)});}
  }catch(error){self.postMessage({requestId,ok:false,error:error.message});}
};

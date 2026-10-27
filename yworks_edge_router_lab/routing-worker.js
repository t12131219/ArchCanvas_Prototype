importScripts('router.js','physical-ports.js','junction-markers.js','route-labels.js','source-contracts.js','semantic-constraints.js','graph-engine.js','runtime-layout.js','recursive-graph.js');
importScripts('../semantic_studio/symbolic-values.js?v=native-host-3','../semantic_studio/structural-representatives.js?v=native-host-3','../semantic_studio/role-path-stages.js?v=native-host-3','../semantic_studio/role-operation-stages.js?v=native-host-3','../semantic_studio/contract-stages.js?v=native-host-3','../semantic_studio/dimension-paths.js?v=native-host-3','../semantic_studio/local-pipelines.js?v=native-host-3','../semantic_studio/local-expressions.js?v=native-host-3','../semantic_studio/role-frontier.js?v=native-host-3','../semantic_studio/frame-ownership.js?v=native-host-3','../semantic_studio/sequence-frontier.js?v=native-host-3','../semantic_studio/local-relations.js?v=native-host-3','../semantic_studio/relation-constraints.js?v=native-host-3','../semantic_studio/expression-goals.js?v=native-host-3','../semantic_studio/architecture.js?v=native-host-3','../semantic_studio/geometry-index.js?v=native-host-3','../semantic_studio/architecture-layout.js?v=native-host-3','../semantic_studio/semantic-engine.js?v=native-host-3','../semantic_studio/branch-regions.js?v=native-host-3','../semantic_studio/presentation-regions.js?v=native-host-3','../semantic_studio/invocation-inputs.js?v=native-host-3','../semantic_studio/module-arguments.js?v=native-host-3','../semantic_studio/transform-configurations.js?v=native-host-3','../semantic_studio/publication.js?v=native-host-3','../semantic_studio/composition-layout.js?v=native-host-3','../semantic_studio/authoring-model.js?v=native-host-3','../semantic_studio/summary-goals.js?v=native-host-3','../semantic_studio/adaptive-frontier.js?v=native-host-3','../semantic_studio/semantic-evidence.js?v=native-vertical-8','flow-optimizer.js?v=native-flow-14','source-runtime.js?v=source-runtime-1','generic-semantic.js?v=source-runtime-1');
const geometryTransport=SummaryNativeSemantic.transport('worker');
const send=value=>{if(value.graph?.generic)value.graph=geometryTransport.pack(value.graph);self.postMessage(value);};
const validateView=graph=>SummaryEngine.validateView(graph);
self.onmessage = event => {
  const {requestId,task,ids,options,id,dx,dy,operation}=event.data;
  try{
    const graph=geometryTransport.unpack(event.data.graph);event.data.graph=graph;
    if(task==='generic-build'||task==='generic-route'||task==='frontier'&&graph.generic){
      send({requestId,...SummaryNativeSemantic.prepare(event.data)});
    }else if(task==='frontier'){const candidate=operation?.kind==='all'?SummaryRecursive.all(graph,!!operation.open):SummaryRecursive.toggle(graph,operation?.id,operation?.force);if(!candidate)throw new Error('该模块不可展开或收起');const result=SummaryRecursive.route(candidate,options),validation=validateView(candidate);if(result.failed||!validation.source.ok||!validation.layout.ok||validation.edges.some(([,v])=>!v.ok))throw new Error([...validation.source.violations,...validation.layout.violations,...validation.edges.filter(([,v])=>!v.ok).map(([id,v])=>id+': '+v.violations.join(', '))].slice(0,4).join('; '));send({requestId,ok:true,graph:candidate,...result,validation});}
    else if(task==='move'){
      SummaryEngine.move(graph,id,dx,dy,options);
      const validation=validateView(graph),invalid=validation.edges.filter(([,check])=>!check.ok).map(([id])=>id);
      if(!validation.source.ok||!validation.layout.ok||invalid.length)throw new Error('移动后的图未通过完整校验: '+[...validation.source.violations,...validation.layout.violations,...invalid].join('; '));
      send({requestId,ok:true,graph,validation});
    }else {const result=SummaryEngine.routeBatch(graph,ids,options);send({requestId,ok:true,...result,validation:validateView(graph)});}
  }catch(error){send({requestId,ok:false,error:error.message});}
};

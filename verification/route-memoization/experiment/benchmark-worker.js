'use strict';
const scripts=['summary-goals','symbolic-values','structural-representatives','sequence-frontier','frame-ownership','role-frontier','contract-stages','dimension-paths',
 'local-pipelines','local-expressions','local-relations','relation-constraints','expression-goals','architecture','architecture-layout','semantic-engine',
 'branch-regions','presentation-regions','publication','adaptive-frontier','publication-renderer'];
onmessage=async event=>{
 try{
  const {variant,ir,state}=event.data;
  if(!['before','candidate'].includes(variant))throw Error('Invalid variant');
  for(const name of scripts)importScripts(name==='architecture-layout'?'architecture-layout-'+variant+'.js':'../../../semantic_studio/'+name+'.js');
  const original=JSON.stringify(ir),times=[],svgs=[],routeDigests=[];
  const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
  for(let round=0;round<4;round++){
   const graph=SemanticEngine.project(ir,{...state,view:'publication'}),start=performance.now(),prepared=SemanticPublicationRenderer.prepare(graph);
   times.push(performance.now()-start);
   SemanticEngine.auditConstraintRoutes(graph,prepared.routes);
   const result=SemanticPublicationRenderer.renderPrepared(ir,state,{graph,prepared});
   svgs.push(await digest(result.svg));routeDigests.push(await digest(JSON.stringify(prepared.routes)));
   if(JSON.stringify(ir)!==original)throw Error('Canonical IR changed');
   if(round===3)postMessage({variant,timings_ms:times,warmup_ms:times[0],measured_ms:times.slice(1),svg_sha256:svgs,
    routes_sha256:routeDigests,nodes:graph.nodes.length,edges:graph.edges.length,quality:prepared.quality,
    canonical_ir_unchanged:true,svg:result.svg});
  }
 }catch(error){postMessage({error:String(error.stack||error)});}
};

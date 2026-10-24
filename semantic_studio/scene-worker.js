/* Keep expensive frontier projection, composition and routing off the UI thread. */
'use strict';
importScripts(...['symbolic-values.js','structural-representatives.js','role-path-stages.js','role-operation-stages.js','contract-stages.js','dimension-paths.js',
  'local-pipelines.js','local-expressions.js','role-frontier.js','frame-ownership.js','sequence-frontier.js','local-relations.js','relation-constraints.js',
  'expression-goals.js','geometry-index.js','architecture.js','architecture-layout.js','semantic-engine.js','branch-regions.js','presentation-regions.js','invocation-inputs.js',
  'module-arguments.js','transform-configurations.js','publication.js','summary-goals.js','adaptive-frontier.js','composition-layout.js',
  'publication-renderer.js','compact-diagrams.js','diagram-set.js','canvas-interaction.js','scene-runtime.js'].map(name=>name+'?v=interaction-performance-2'));
const runtime=SemanticSceneRuntime.create();
self.onmessage=event=>{const {requestId,...task}=event.data;try{self.postMessage({requestId,...runtime.run(task)});}catch(error){self.postMessage({requestId,ok:false,error:error.message});}};

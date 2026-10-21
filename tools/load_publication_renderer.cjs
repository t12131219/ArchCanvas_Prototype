/* Load only our renderer scripts in a fresh browser-like global. Comparing
 * archived versions with CommonJS require shares their globalThis registries
 * and can accidentally mix an old layout engine with the current renderer. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=function loadRenderer(directory,{engine=false}={}){
  const context=vm.createContext({});
  for(const name of ['summary-goals.js','symbolic-values.js','structural-representatives.js','sequence-frontier.js','frame-ownership.js','role-frontier.js','contract-stages.js','dimension-paths.js','local-pipelines.js','local-expressions.js','local-relations.js','relation-constraints.js','expression-goals.js','architecture.js','architecture-layout.js','semantic-engine.js','branch-regions.js','presentation-regions.js','invocation-inputs.js','publication.js','adaptive-frontier.js','publication-renderer.js']){
    if(name==='invocation-inputs.js'&&!fs.existsSync(path.join(directory,name)))continue;
    if(name==='summary-goals.js'&&!fs.existsSync(path.join(directory,name)))continue;
    const file=path.join(directory,name);if(['adaptive-frontier.js','symbolic-values.js','structural-representatives.js','sequence-frontier.js','frame-ownership.js','role-frontier.js','contract-stages.js','dimension-paths.js','local-pipelines.js','local-expressions.js','local-relations.js','relation-constraints.js','expression-goals.js','presentation-regions.js'].includes(name)&&!fs.existsSync(file))continue;vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  return engine?context.SemanticEngine:context.SemanticPublicationRenderer;
};

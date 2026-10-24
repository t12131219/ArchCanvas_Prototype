/* Load only our renderer scripts in a fresh browser-like global. Comparing
 * archived versions with CommonJS require shares their globalThis registries
 * and can accidentally mix an old layout engine with the current renderer. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=function loadRenderer(directory,{engine=false,diagramSet=false}={}){
  const context=vm.createContext({});
  const geometry=path.join(directory,'geometry-index.js');if(fs.existsSync(geometry))vm.runInContext(fs.readFileSync(geometry,'utf8'),context,{filename:geometry});
  for(const name of ['summary-goals.js','symbolic-values.js','structural-representatives.js','sequence-frontier.js','frame-ownership.js','role-frontier.js','contract-stages.js','role-path-stages.js','role-operation-stages.js','dimension-paths.js','local-pipelines.js','local-expressions.js','local-relations.js','relation-constraints.js','expression-goals.js','architecture.js','architecture-layout.js','semantic-engine.js','branch-regions.js','presentation-regions.js','invocation-inputs.js','publication.js','adaptive-frontier.js','publication-renderer.js']){
    if(name==='invocation-inputs.js'&&!fs.existsSync(path.join(directory,name)))continue;
    if(name==='summary-goals.js'&&!fs.existsSync(path.join(directory,name)))continue;
    const file=path.join(directory,name);if(['adaptive-frontier.js','symbolic-values.js','structural-representatives.js','sequence-frontier.js','frame-ownership.js','role-frontier.js','contract-stages.js','role-path-stages.js','role-operation-stages.js','dimension-paths.js','local-pipelines.js','local-expressions.js','local-relations.js','relation-constraints.js','expression-goals.js','presentation-regions.js'].includes(name)&&!fs.existsSync(file))continue;vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  // Older frozen renderers have no module-argument policy. Current
  // publication resolves this optional registry only when projecting.
  for(const extra of ['module-arguments.js','transform-configurations.js']){const modules=path.join(directory,extra);if(fs.existsSync(modules))vm.runInContext(fs.readFileSync(modules,'utf8'),context,{filename:modules});}
  const composition=path.join(directory,'composition-layout.js');if(fs.existsSync(composition))vm.runInContext(fs.readFileSync(composition,'utf8'),context,{filename:composition});
  if(diagramSet){
    if(fs.existsSync(path.join(directory,'compact-diagrams.js')))vm.runInContext(fs.readFileSync(path.join(directory,'compact-diagrams.js'),'utf8'),context,{filename:path.join(directory,'compact-diagrams.js')});
    vm.runInContext(fs.readFileSync(path.join(directory,'diagram-set.js'),'utf8'),context,{filename:path.join(directory,'diagram-set.js')});
    return {renderer:context.SemanticPublicationRenderer,diagrams:context.SemanticDiagramSet};}
  return engine?context.SemanticEngine:context.SemanticPublicationRenderer;
};

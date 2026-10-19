/* Load only our renderer scripts in a fresh browser-like global. Comparing
 * archived versions with CommonJS require shares their globalThis registries
 * and can accidentally mix an old layout engine with the current renderer. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=function loadRenderer(directory){
  const context=vm.createContext({});
  for(const name of ['local-relations.js','relation-constraints.js','expression-goals.js','architecture.js','architecture-layout.js','semantic-engine.js','branch-regions.js','presentation-regions.js','publication.js','publication-renderer.js']){
    const file=path.join(directory,name);if(['local-relations.js','relation-constraints.js','expression-goals.js','presentation-regions.js'].includes(name)&&!fs.existsSync(file))continue;vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  return context.SemanticPublicationRenderer;
};

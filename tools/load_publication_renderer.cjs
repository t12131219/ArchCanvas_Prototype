/* Load only our renderer scripts in a fresh browser-like global. Comparing
 * archived versions with CommonJS require shares their globalThis registries
 * and can accidentally mix an old layout engine with the current renderer. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=function loadRenderer(directory){
  const context=vm.createContext({});
  for(const name of ['architecture.js','architecture-layout.js','semantic-engine.js','branch-regions.js','publication.js','publication-renderer.js']){
    const file=path.join(directory,name);vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  return context.SemanticPublicationRenderer;
};

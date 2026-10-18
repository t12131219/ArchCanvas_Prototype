const fs=require('fs'),vm=require('vm'),root=require('path').resolve(__dirname,'..')+'/';
const ctx=vm.createContext({});for(const file of ['architecture.js','architecture-layout.js','semantic-engine.js','branch-regions.js','publication.js','publication-renderer.js']){
 let s=fs.readFileSync(root+'semantic_studio/'+file,'utf8');
 if(file==='architecture-layout.js')s=s.replace('const i=siblings.findIndex(x=>x.edge.id===e.id&&x.source===isSource),fraction=(Math.max(0,i)+1)/(siblings.length+1);',`const key=item=>item.source&&item.edge.kind==='data'&&!item.edge.condition&&item.edge.resolved_source?JSON.stringify([item.edge.resolved_source,item.edge.source_port,item.edge.evidence]):item.edge.id+':'+item.source;
      const groups=[...new Set(siblings.map(key))],i=groups.indexOf(key({edge:e,source:isSource})),fraction=(Math.max(0,i)+1)/(groups.length+1);`);
 vm.runInContext(s,ctx,{filename:file});
}
const d=JSON.parse(fs.readFileSync(root+'DenseBlock-overview.layout.json')),r=ctx.SemanticPublicationRenderer.render(d.ir,d.state);
console.log(JSON.stringify({quality:r.prepared.quality,routing:r.prepared.routing,routes:r.prepared.routes.map(e=>({id:e.id,points:e.route.points}))},null,2));fs.writeFileSync(__dirname+'/shared-source.svg',r.svg);

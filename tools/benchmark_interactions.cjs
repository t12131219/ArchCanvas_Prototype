/* Paired source benchmarks; no browser or model execution. */
const fs=require('fs'),path=require('path'),vm=require('vm'),{performance}=require('perf_hooks');
const root=path.resolve(__dirname,'..'),base=root+'/verification/performance',catalog=JSON.parse(fs.readFileSync(root+'/data/catalog.json'));
function runtime(before){const context=vm.createContext({});for(const file of ['router.js','physical-ports.js','junction-markers.js','route-labels.js','source-contracts.js','semantic-constraints.js','graph-engine.js']){
  const saved=base+'/before/'+file,filename=before&&fs.existsSync(saved)?saved:root+'/yworks_edge_router_lab/'+file;vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename});
}return context;}
const old=runtime(true),next=runtime(false),clone=g=>JSON.parse(JSON.stringify(g));
const operations={
  validation:(r,g)=>{const C=r.SummaryConstraints,ctx=C.validationContext?.(g);C.validateSource(g);for(const e of g.edges)C.validate(g,e,e.route,ctx);},
  captions:(r,g)=>r.SummaryEngine.routeLabelPlacements(g),
  authoritativeMove:(r,g)=>{const copy=clone(g),n=copy.nodes.find(n=>!n.expanded&&!n.junction);r.SummaryEngine.move(copy,n.id,4,0);},
};
function time(fn){fn();const values=[];for(let i=0;i<9;i++){const t=performance.now();fn();values.push(performance.now()-t);}values.sort((a,b)=>a-b);return +values[4].toFixed(3);}
const report={schema:'summary-merge-performance/1',method:'9 warm paired samples; median wall-clock ms, Node source benchmark',model_executed:false,views:[]};
for(const [title,collection] of [['Transformer','transformer_programmatic_guide'],['timemixer','timeseries_programmatic_guide'],['timemixer','arrow_semantic_audit'],['densenet','model_zoo_programmatic_guide'],['highway','module_programmatic_guide']]){
  const c=catalog.cases.find(c=>c.title===title&&c.collection===collection&&!c.historical),v=c.views.find(v=>v.key==='detailed')||c.views[0],data=JSON.parse(fs.readFileSync(root+'/'+v.json));
  const a=old.SummaryConstraints.initialize(clone(data)),b=next.SummaryConstraints.initialize(clone(data)),entry={title,collection,view:v.key,nodes:b.nodes.length,edges:b.edges.length,operations:{}};
  for(const [name,op] of Object.entries(operations)){const before_ms=time(()=>op(old,a)),after_ms=time(()=>op(next,b));entry.operations[name]={before_ms,after_ms,speedup:+(before_ms/after_ms).toFixed(2)};}
  entry.operations.previewMove={after_ms:time(()=>{const n=b.nodes.find(n=>!n.expanded&&!n.junction);next.SummaryEngine.movePreview(b,n.id,.1,0);})};
  entry.operations.previewCaptions={after_ms:time(()=>next.SummaryEngine.routeLabelPlacements(b,true))};report.views.push(entry);
}
fs.writeFileSync(base+'/benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

/* Pre-route common inspection paths. These are internal layout snapshots, not
 * selectable levels; arbitrary mixed frontiers still use the checked router. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),id='01093cc06a87b35c';
require('../yworks_edge_router_lab/router.js');
const E=require('../yworks_edge_router_lab/graph-engine.js'),F=require('../yworks_edge_router_lab/recursive-graph.js'),C=globalThis.SummaryConstraints;
const read=v=>C.initialize(JSON.parse(fs.readFileSync(`${root}/data/cases/${id}-${v}.json`)));
const sources=Object.fromEntries(['source-atomic','overview','compact-templates'].map(v=>[v,read(v)]));
const paths=[
 ['runtime:call9','runtime:call10','runtime:call11','runtime:call12','helper:call11:scaled_dot_product_attention:1'],
 ['runtime:call51','runtime:call52','runtime:call69','runtime:call72'],
 ['runtime:call1','runtime:call2'],['runtime:call43','runtime:call44'],
 ['runtime:call5'],['runtime:call47']
];
const index={schema:'trace-frontiers/1',authoritySha256:crypto.createHash('sha256').update(fs.readFileSync(`${root}/data/cases/${id}-source-atomic.json`)).digest('hex'),views:[]};
const seen=new Set();
for(const steps of paths){let g=F.build(F.create(sources));for(const target of steps){
 const started=Date.now();g=F.toggle(g,target,true);const key=F.signature(g.recursive);
 if(seen.has(key))continue;
 const result=F.route(g),checked=E.validateView(g);
 if(result.failed||!checked.source.ok||!checked.layout.ok||checked.edges.some(([,v])=>!v.ok))throw Error('Invalid precomputed frontier '+target);
 const v=E.clone(g);delete v.recursive;delete v.recursiveReceipt;delete v.semanticBaseline;
 const view='frontier-'+String(index.views.length+1).padStart(2,'0');v.viewKey=view;
 const stem=`${root}/data/cases/${id}-${view}`;
 fs.writeFileSync(stem+'.json',JSON.stringify(v,null,2)+'\n');
 fs.writeFileSync(stem+'.js','window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+JSON.stringify(id+':'+view)+']='+JSON.stringify(v)+';\n');
 index.views.push({key:view,asset:`data/cases/${id}-${view}.js`,json:`data/cases/${id}-${view}.json`,nodes:v.nodes.length,edges:v.edges.length});seen.add(key);
 console.log(view,target,v.nodes.length,Date.now()-started+'ms');
}}
fs.writeFileSync(`${root}/data/cases/${id}-frontiers.json`,JSON.stringify(index,null,2)+'\n');

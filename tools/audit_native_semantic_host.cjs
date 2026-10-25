/* Native-host acceptance capture. Run frozen; no production files are written. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||'verification/native-host/current');
if(process.argv[3]==='--one'){
 global.EdgeRouterLabRouting=require('../yworks_edge_router_lab/router');
 for(const f of ['physical-ports','junction-markers','route-labels','source-contracts','semantic-constraints','graph-engine','runtime-layout','recursive-graph'])require('../yworks_edge_router_lab/'+f);
 const G=require('../yworks_edge_router_lab/generic-semantic'),catalog=JSON.parse(fs.readFileSync(root+'/data/semantic/catalog.json')),m=catalog.models.find(v=>v.id===process.argv[4]),mode=process.argv[5],ir=JSON.parse(fs.readFileSync(root+'/data/semantic/'+m.ir));
 let state=mode==='F0'?SemanticCompositionLayout.frontier({mode:'source'},'overview'):m.presentation?JSON.parse(fs.readFileSync(root+'/data/semantic/'+m.presentation)).default_state:G.initial(ir);
 const started=performance.now(),graph=G.build(ir,state),build_ms=performance.now()-started,start=performance.now(),r=G.route(graph),route_ms=performance.now()-start,c=SummaryEngine.validateView(graph);
 const evidence=graph.nodes.map(n=>G.nodeEvidence(graph,n.id));
 console.log(JSON.stringify({evidence_nodes:evidence.filter(Boolean).length,model:m.id,title:m.title,mode,nodes:graph.nodes.length,edges:graph.edges.length,canvas:graph.canvas,build_ms,route_ms,routed:r.routed,failed:r.failed,source:c.source.violations,layout:c.layout.violations,edges_invalid:c.edges.filter(([,v])=>!v.ok),stats:EdgeRouterLabRouting.stats(graph.edges)}));
 process.exit(c.source.ok?0:1);
}
const files=['index.html',...['yworks_edge_router_lab','semantic_studio'].flatMap(dir=>fs.readdirSync(root+'/'+dir).filter(f=>/\.(js|html|css)$/.test(f)).map(f=>dir+'/'+f)),'tests/native-semantic-host.test.cjs','tools/audit_native_semantic_host.cjs'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(root+'/'+f)).digest('hex')]));
const before=hashes(),catalog=JSON.parse(fs.readFileSync(root+'/data/semantic/catalog.json')),rows=[];fs.mkdirSync(out,{recursive:true});
for(const m of catalog.models)for(const mode of ['F0','F1']){
 const result=cp.spawnSync(process.execPath,[__filename,out,'--one',m.id,mode],{cwd:root,timeout:60000,maxBuffer:2000000,encoding:'utf8'});let row;
 try{row=JSON.parse(result.stdout.trim());}catch(_){row={model:m.id,title:m.title,mode,error:result.error?.message||result.stderr||'No completed capture',exit_code:result.status};}
 rows.push(row);console.log(m.title,mode,row.nodes||'',row.failed??row.error);fs.writeFileSync(out+'/route-audit.json',JSON.stringify({complete:false,rows,hashes:before},null,2));
}
const after=hashes();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Frozen source changed during capture');
fs.writeFileSync(out+'/route-audit.json',JSON.stringify({complete:true,states:rows.length,valid:rows.filter(r=>!r.error&&!r.source.length&&!r.layout.length&&!r.edges_invalid.length).length,rows,hashes:before,frozen:true},null,2));

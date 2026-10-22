'use strict';
// Evaluation only. No reference/model selector is used in production.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/source-summary-headings/current';
const load=require('./load_publication_renderer.cjs'),frozen='/tmp/archcanvas-source-headings-before-6884dc1/semantic_studio',B=load(frozen),R=load(root+'/semantic_studio');
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html',
 'tests/source-summary-headings.test.cjs','tests/semantic_fixtures/source_summary_headings.py','tools/audit_source_summary_headings.cjs','tools/load_publication_renderer.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)]));
const only=process.argv.find(s=>s.startsWith('--case='))?.slice(7),requests=[];
const common={view:'publication',mode:'source',paperMedium:'canvas',paperCompact:true,paperAdaptive:false};
if(only==='Transformer-F0')requests.push({name:only,input:'verification/helper-contracts/current/Transformer-current.json',state:{...common,paperGranularity:'stages'}});
else if(only?.startsWith('Transformer-F1-')){
 const old=read('verification/stage-exit-paths/current/'+only+'-report.json').rows[0];
 requests.push({name:only,input:old.input,state:old.results.find(r=>r.suffix==='current').state,reuse:old});
}else{
 for(const row of read('verification/source-summary-headings/current/extraction.json').rows)requests.push({name:row.entry,input:row.input,state:{...common,paperGranularity:'stages'}});
 requests.push({name:'UnnamedWork-open',input:'verification/source-summary-headings/current/UnnamedWork.json',state:{...common,paperGranularity:'stages'},open:true});
 requests.push({name:'UnnamedWork-roles',input:'verification/source-summary-headings/current/UnnamedWork.json',state:{...common,paperGranularity:'roles'}});
}
const rows=[];
for(const request of requests){
 const ir=read(request.input),raw=JSON.stringify(ir),results=[];let first;
 for(const suffix of ['before','current']){
  const state=request.open&&suffix==='current'?{...request.state,paperAuto:false,
   open:[...first.graph.publication.open,...first.graph.nodes.filter(n=>n.paper.source_heading).flatMap(n=>[n.id,...(n.local_pipeline.display_partitions||[]).map(p=>p.node)])]}:request.state;
  const svg=request.name+'-'+suffix+'.svg',document=request.name+'-'+suffix+'.layout.json';
  if(request.reuse&&suffix==='before'){
   const old=request.reuse.results.find(r=>r.suffix==='current'),report=read('verification/stage-exit-paths/current/'+only+'-report.json');
   for(const [file,h]of Object.entries(report.implementation_sha256))if(file.startsWith('semantic_studio/')&&file.endsWith('.js'))assert.equal(sha(frozen+'/'+path.basename(file)),h);
   assert.equal(sha(root+'/'+request.input),request.reuse.input_sha256);
   for(const [key,dst]of [['svg',svg],['document',document]]){assert.equal(sha(root+'/verification/stage-exit-paths/current/'+old[key]),old[key+'_sha256']);fs.copyFileSync(root+'/verification/stage-exit-paths/current/'+old[key],out+'/'+dst);}
   results.push({...old,svg,document,suffix,state,reuse:'6884dc1 actual SVG/document, all renderer and input hashes verified'});continue;
  }
  console.log('START '+request.name+' '+suffix);const t=Date.now();
  const r=(request.open||suffix==='current'?R:B).render(ir,state);if(suffix==='before')first=r;
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
   quality:JSON.parse(JSON.stringify(r.prepared.quality)),elapsed_ms:Date.now()-t});assert.equal(JSON.stringify(ir),raw);
 }
 if(request.reuse||request.name.endsWith('-roles'))assert.equal(results[0].svg_sha256,results[1].svg_sha256);
 rows.push({name:request.name,input:request.input,input_sha256:sha(root+'/'+request.input),comparison:request.open?'coarse-vs-operations':'same-frontier',results});
 console.log(JSON.stringify({name:request.name,results:results.map(r=>({suffix:r.suffix,nodes:r.nodes,quality:r.quality}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'implementation changed '+f);
fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'source-summary-headings/1',baseline:'6884dc1',implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

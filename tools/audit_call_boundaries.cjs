'use strict';
// Evaluation inputs only. No model name or reference chooses production rules.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/call-boundaries/current',frozen='/tmp/archcanvas-call-boundaries-before-015fd95/semantic_studio';
const load=require('./load_publication_renderer.cjs'),B=load(frozen),R=load(root+'/semantic_studio');
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','tests/call-boundaries.test.cjs','tests/semantic_fixtures/source_read_paths.py','tools/audit_call_boundaries.cjs','tools/load_publication_renderer.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)]));
const only=process.argv.find(s=>s.startsWith('--case='))?.slice(7),requests=[],common={view:'publication',mode:'source',paperMedium:'canvas',paperCompact:true,paperAdaptive:false};
if(only?.startsWith('Transformer-')){
 const name=only==='Transformer-F0-boundary'?'Transformer-F0':only,report=read('verification/stage-routes/current/'+name+'-report.json'),old=report.rows[0];
 for(const [file,h]of Object.entries(report.implementation_sha256))if(file.startsWith('semantic_studio/')&&file.endsWith('.js'))assert.equal(sha(frozen+'/'+path.basename(file)),h);
 requests.push({name:only,input:old.input,state:old.results.find(c=>c.suffix==='current').state,reuse:old,boundary:only.endsWith('-boundary')});
}else{
 for(const row of read('verification/call-boundaries/current/extraction.json').rows)requests.push({name:row.entry,input:row.input,state:{...common,paperGranularity:'stages'},boundary:true});
 for(const name of ['ReadWorkshop','SharedReadWorkshop','PairReads']){
  requests.push({name:name+'-open',input:'verification/call-boundaries/current/'+name+'.json',state:{...common,paperGranularity:'stages',paperReadSummary:'boundary'},open:true});
  requests.push({name:name+'-roles',input:'verification/call-boundaries/current/'+name+'.json',state:{...common,paperGranularity:'roles'}});
 }
}
const rows=[];
for(const request of requests){
 const ir=read(request.input),raw=JSON.stringify(ir),results=[];let first;
 for(const suffix of ['before','current']){
  const state=request.open&&suffix==='current'?{...request.state,paperAuto:false,open:[...first.graph.publication.open,...first.graph.nodes.filter(n=>n.paper.call_boundary).flatMap(n=>[n.id,...(n.local_pipeline.display_partitions||[]).map(p=>p.node)])]}:
   {...request.state,...(request.boundary&&suffix==='current'?{paperReadSummary:'boundary'}:{})};
  const svg=request.name+'-'+suffix+'.svg',document=request.name+'-'+suffix+'.layout.json';
  if(request.reuse&&suffix==='before'){
   const old=request.reuse.results.find(r=>r.suffix==='current');assert.equal(sha(root+'/'+request.input),request.reuse.input_sha256);
   for(const [key,dst]of [['svg',svg],['document',document]]){const src=root+'/verification/stage-routes/current/'+old[key];assert.equal(sha(src),old[key+'_sha256']);fs.copyFileSync(src,out+'/'+dst);}
   results.push({...old,svg,document,suffix,state,reuse:'Verified actual 015fd95 SVG/document and all frozen renderer hashes'});continue;
  }
  console.log('START '+request.name+' '+suffix);const t=Date.now(),r=(suffix==='current'||request.open?R:B).render(ir,state);if(suffix==='before')first=r;
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
   boundary_summaries:r.graph.nodes.filter(n=>n.paper.call_boundary).map(n=>n.id),quality:JSON.parse(JSON.stringify(r.prepared.quality)),elapsed_ms:Date.now()-t});
  assert.equal(JSON.stringify(ir),raw);
 }
 if(!request.boundary&&!request.open)assert.equal(results[0].svg_sha256,results[1].svg_sha256);
 rows.push({name:request.name,input:request.input,input_sha256:sha(root+'/'+request.input),comparison:request.open?'boundary-vs-open':request.boundary?'evidence-vs-boundary':'same-state-regression',results});
 console.log(JSON.stringify({name:request.name,results:results.map(c=>({suffix:c.suffix,nodes:c.nodes,width:c.quality.native_width_px,height:c.quality.native_height_px,wire:c.quality.wire_length,crossings:c.quality.line_geometry.crossings}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'implementation changed during capture '+f);
fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'call-boundaries/1',baseline:'015fd95',implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

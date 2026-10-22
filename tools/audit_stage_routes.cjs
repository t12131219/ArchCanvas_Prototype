'use strict';
// Evaluation identifiers select inputs only; production uses no model selectors.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/stage-routes/current',frozen='/tmp/archcanvas-stage-routes-before-38a2d66/semantic_studio';
const load=require('./load_publication_renderer.cjs'),B=load(frozen),R=load(root+'/semantic_studio');
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','tests/stage-routes.test.cjs','tests/semantic_fixtures/stage_route_shortcuts.py','tools/audit_stage_routes.cjs','tools/load_publication_renderer.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)]));
const only=process.argv.find(s=>s.startsWith('--case='))?.slice(7),requests=[],common={view:'publication',mode:'source',paperMedium:'canvas',paperCompact:true,paperAdaptive:false};
if(only?.startsWith('Transformer-')){
 const report=read('verification/source-summary-headings/current/'+only+'-report.json'),old=report.rows[0];
 for(const [file,h]of Object.entries(report.implementation_sha256))if(file.startsWith('semantic_studio/')&&file.endsWith('.js'))assert.equal(sha(frozen+'/'+path.basename(file)),h);
 requests.push({name:only,input:old.input,state:old.results.find(c=>c.suffix==='current').state,reuse:old});
}else{
 for(const row of read('verification/stage-routes/current/extraction.json').rows)requests.push({name:row.entry,input:row.input,state:{...common,paperGranularity:'stages'}});
 const old=read('verification/unconsumed-dimensions/current/small-report.json').rows.find(r=>r.name==='MutableShape');
 requests.push({name:'MutableShape',input:old.input,state:{...common,paperGranularity:'stages'}});
 requests.push({name:'SummarizedPatch-open',input:'verification/stage-routes/current/SummarizedPatch.json',state:{...common,paperGranularity:'stages'},open:true});
 requests.push({name:'LayeredPatch-roles',input:'verification/stage-routes/current/LayeredPatch.json',state:{...common,paperGranularity:'roles'}});
 requests.push({name:'UnnamedWork',input:'verification/source-summary-headings/current/UnnamedWork.json',state:{...common,paperGranularity:'stages'}});
}
const rows=[];
for(const request of requests){
 const ir=read(request.input),raw=JSON.stringify(ir),results=[];let first;
 for(const suffix of ['before','current']){
  const state=request.open&&suffix==='current'?{...request.state,paperAuto:false,open:[...first.graph.publication.open,...first.graph.nodes.filter(n=>n.local_pipeline&&!first.graph.positions.get(n.id).expanded).flatMap(n=>[n.id,...(n.local_pipeline.display_partitions||[]).map(p=>p.node)])]}:request.state;
  const svg=request.name+'-'+suffix+'.svg',document=request.name+'-'+suffix+'.layout.json';
  if(request.reuse&&suffix==='before'){
   const old=request.reuse.results.find(r=>r.suffix==='current');assert.equal(sha(root+'/'+request.input),request.reuse.input_sha256);
   for(const [key,file]of [['svg',svg],['document',document]]){const src=root+'/verification/source-summary-headings/current/'+old[key];assert.equal(sha(src),old[key+'_sha256']);fs.copyFileSync(src,out+'/'+file);}
   results.push({...old,svg,document,suffix,state,reuse:'verified actual ecee8d4 SVG and document; all renderer hashes equal 38a2d66 frozen baseline'});continue;
  }
  console.log('START '+request.name+' '+suffix);const time=Date.now(),r=(suffix==='current'||request.open?R:B).render(ir,state);if(suffix==='before')first=r;
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:JSON.parse(JSON.stringify(r.prepared.quality)),elapsed_ms:Date.now()-time});
  assert.equal(JSON.stringify(ir),raw);
 }
 if(request.name.endsWith('-roles')||request.name.startsWith('Transformer-'))assert.equal(results[0].svg_sha256,results[1].svg_sha256);
 rows.push({name:request.name,input:request.input,input_sha256:sha(root+'/'+request.input),comparison:request.open?'coarse-vs-open':'same-frontier',results});
 console.log(JSON.stringify({name:request.name,results:results.map(c=>({suffix:c.suffix,nodes:c.nodes,wire:c.quality.wire_length,crossings:c.quality.line_geometry.crossings}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'implementation changed during capture '+f);
fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'stage-routes/1',baseline:'38a2d66',implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

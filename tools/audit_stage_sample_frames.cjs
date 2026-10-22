'use strict';
// Evaluation only: reference/model identifiers never select production rules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/stage-sample-frames/current',frozen='/tmp/archcanvas-stage-sample-before-53ac2a7/semantic_studio';
const load=require('./load_publication_renderer.cjs'),B=load(frozen),R=load(root+'/semantic_studio');
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','tests/stage-sample-frames.test.cjs','tests/semantic_fixtures/stage_sample_frames.py',
 'tools/audit_stage_sample_frames.cjs','tools/load_publication_renderer.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)]));
const only=process.argv.find(s=>s.startsWith('--case='))?.slice(7),requests=[];
const common={view:'publication',mode:'source',paperMedium:'canvas',paperCompact:true,paperAdaptive:false};
if(only==='Transformer-F0')requests.push({name:only,input:'verification/helper-contracts/current/Transformer-current.json',
 state_before:{...common,paperGranularity:'stages'},state_current:{...common,paperGranularity:'stages'},comparison:'same-frontier-comparison'});
else if(only?.startsWith('Transformer-F1-')){
 const index=Number(only.at(-1)),previous=read('verification/source-read-paths/current/Transformer-F1-'+index+'-report.json').rows[0];
 const state=previous.results.find(r=>r.suffix==='current').state;
 requests.push({name:only,input:previous.input,state_before:state,state_current:state,comparison:'same-frontier-comparison',reuse:previous});
}else{
 for(const row of read('verification/stage-sample-frames/current/extraction.json').rows){
  requests.push({name:row.entry,input:row.input,state_before:{...common,paperGranularity:'stages'},
   state_current:{...common,paperGranularity:'stages'},comparison:'same-frontier-comparison'});
  if(!['SharedStack','MixedStack'].includes(row.entry))requests.push({name:row.entry+'-open',input:row.input,state_before:{...common,paperGranularity:'stages'},
   state_current:null,comparison:row.entry==='ConditionalStack'?'no-proved-suffix':'coarse-vs-suffix-detail',before_current:true});
 }
 for(const name of ['SignalStack','TwinStacks','SharedStack'])requests.push({name:name+'-legacy',
  input:'verification/stage-sample-frames/current/'+name+'.json',state_before:{...common,paperGranularity:'semantic'},
  state_current:{...common,paperGranularity:'semantic'},comparison:'same-state-regression'});
}
if(!only)requests.push({name:'SignalStack-map',input:'verification/stage-sample-frames/current/SignalStack.json',
 state_before:{...common,paperGranularity:'stages',paperHeaderReflow:false,paperResidualBands:false,paperEmptyBandCompaction:false},
 state_current:{...common,paperGranularity:'stages',paperHeaderReflow:false,paperResidualBands:false,paperEmptyBandCompaction:false},comparison:'isolated-frame-map'});
const rows=[];
for(const request of requests){
 const ir=read(request.input),raw=JSON.stringify(ir),results=[];let first;
 for(const suffix of ['before','current']){
  const state=suffix==='before'?request.state_before:request.state_current||{...request.state_before,paperAuto:false,
   open:[...first.graph.publication.open,...first.graph.publication.inline_sequences.sequences.flatMap(s=>s.remainders.map(r=>r.node))]};
  const svg=request.name+'-'+suffix+'.svg',document=request.name+'-'+suffix+'.layout.json';
  if(request.reuse&&suffix==='before'){
   const old=request.reuse.results.find(r=>r.suffix==='current');
   const report=read('verification/source-read-paths/current/Transformer-F1-'+only.at(-1)+'-report.json');
   for(const [file,h]of Object.entries(report.implementation_sha256))if(file.startsWith('semantic_studio/')&&file.endsWith('.js'))assert.equal(sha(frozen+'/'+path.basename(file)),h);
   assert.equal(sha(root+'/'+request.input),request.reuse.input_sha256);
   for(const [key,dst]of [['svg',svg],['document',document]]){assert.equal(sha(root+'/verification/source-read-paths/current/'+old[key]),old[key+'_sha256']);fs.copyFileSync(root+'/verification/source-read-paths/current/'+old[key],out+'/'+dst);}
   results.push({...old,svg,document,suffix,state,reuse:'53ac2a7 checked actual SVG/document'});continue;
  }
  console.log('START '+request.name+' '+suffix);const t=Date.now();
  const r=(suffix==='before'&&!request.before_current?B:R).render(ir,state);if(suffix==='before')first=r;
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),
   nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:JSON.parse(JSON.stringify(r.prepared.quality)),elapsed_ms:Date.now()-t});
  assert.equal(JSON.stringify(ir),raw);
 }
 if(request.comparison==='same-state-regression')assert.equal(results[0].svg_sha256,results[1].svg_sha256);
 rows.push({name:request.name,input:request.input,input_sha256:sha(root+'/'+request.input),comparison:request.comparison,results});
 console.log(JSON.stringify({name:request.name,results:results.map(r=>({suffix:r.suffix,nodes:r.nodes,crossings:r.quality.line_geometry.crossings,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'implementation changed '+f);
fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'stage-sample-frames/1',baseline:'53ac2a7',implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

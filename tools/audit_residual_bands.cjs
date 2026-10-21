'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/residual-bands/current',cache='/tmp/archcanvas-residual-bands-before-0dcab92';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const snapshot=read('verification/residual-bands/current/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(cache+'/'+path.basename(f)),h);
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const large=process.argv.includes('--large'),only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
let cases=[];
if(large)cases=read('verification/coincident-ports/current/requests.json').cases.filter(r=>r.large&&(!only||r.name===only));
else{
 cases=read('verification/header-reflow/current/small-report.json').rows.map(({name,input,state,kind})=>({name,input,state,kind}));
 for(const row of read('verification/residual-bands/current/extraction.json').rows){
  const ir=read(row.input);cases.push({name:row.entry,input:row.input,kind:'fresh-extracted-source',state:{mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)}});
 }
}
assert.ok(cases.length);
const files=[...Object.keys(snapshot.files),'tests/residual-bands.test.cjs','tests/semantic_fixtures/residual_bands.py','tools/audit_residual_bands.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[];
assert.equal(sha(cache+'/large-report.json'),snapshot.large_report.sha256);
const prior=JSON.parse(fs.readFileSync(cache+'/large-report.json'));
for(const [f,h]of Object.entries(prior.implementation_sha256))if(f.startsWith('semantic_studio/'))assert.equal(snapshot.files[f],h);
for(const request of cases){
 const {name,input,state}=request,ir=read(input),original=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  const svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';
  if(large&&suffix==='before'){
   const row=prior.rows.find(r=>r.name===name);assert.ok(row);assert.equal(row.input_sha256,sha(root+'/'+input));assert.deepEqual(row.state,state);
   const capture=row.results.find(r=>r.suffix==='current'),folder=root+'/verification/header-reflow/current/';
   for(const key of ['svg','document']){assert.equal(sha(folder+capture[key]),capture[key+'_sha256']);fs.copyFileSync(folder+capture[key],out+'/'+(key==='svg'?svg:document));}
   results.push({...capture,suffix,svg,document,reuse:{commit:snapshot.commit,report:snapshot.large_report.path}});
   console.log('REUSE verified '+name);continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),original);
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,results:results.map(r=>({suffix:r.suffix,dimensions:[r.quality.native_width_px,r.quality.native_height_px],crossings:r.quality.line_geometry.crossings,wire:r.quality.wire_length,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(only?only:large?'large':'small')+'-report.json',JSON.stringify({schema:'residual-bands/1',snapshot,implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

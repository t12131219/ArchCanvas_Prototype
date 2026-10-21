'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/coupled-routes/current',cache='/tmp/archcanvas-coupled-routes-before-568b56e';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const snapshot=read('verification/coupled-routes/current/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(cache+'/'+path.basename(f)),h);
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const {fixture,state:syntheticState}=require('../tests/cross-scope-fixtures.cjs'),large=process.argv.includes('--large');
const cases=[];
if(large)cases.push(...read('verification/coincident-ports/current/requests.json').cases.filter(r=>r.large));
else{
 for(const [name,options]of [['Reconvergence',{right:6,branches:3}],['LongReconvergence',{left:8,right:6,branches:3}],
  ['UnknownReconvergence',{right:6,branches:3,unknown:true}],['ConditionalReconvergence',{right:6,branches:3,guarded:true}]]){
  const input='verification/coupled-routes/current/'+name+'.json';fs.writeFileSync(root+'/'+input,JSON.stringify(fixture(options),null,2)+'\n');
  cases.push({name,input,state:syntheticState,kind:'synthetic-topology'});
 }
 for(const name of ['ForeignColumns','ForeignDeclaration','FragmentColumns','GuardedColumns','SharedColumns','MutableColumns','MixedColumns']){
  const input='verification/operand-order/current/'+name+'.json',ir=read(input),helpers=new Set(ir.nodes.filter(n=>n.semantic_type==='source-function').map(n=>n.id));
  cases.push({name,input,state:{mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,
   open:ir.nodes.filter(n=>n.kind==='composite'&&!helpers.has(n.id)).map(n=>n.id)},kind:'extracted-source'});
 }
 for(const row of read('verification/value-lineage/current/extraction.json').rows){
  const ir=read(row.input),state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperAuto:false};
  state.open=[...E.viewIndex(ir,state).children.keys()].filter(Boolean);cases.push({name:row.entry,input:row.input,state,kind:'extracted-source'});
 }
}
const files=[...Object.keys(snapshot.files),'tests/coupled-routes.test.cjs','tools/audit_coupled_routes.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[];
// Large baselines are exact captures recorded in the frozen commit. Check
// producer, request and both byte hashes before reusing them; never recompute
// the old result using the current global renderer registry.
assert.equal(sha(cache+'/large-report.json'),snapshot.large_report.sha256);
const prior=large?JSON.parse(fs.readFileSync(cache+'/large-report.json')):null;
if(prior)for(const [f,h]of Object.entries(snapshot.files))assert.equal(prior.implementation_sha256[f],h);
for(const request of cases){
 const {name,input,state}=request,ir=read(input),original=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  const svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';
  if(prior&&suffix==='before'){
   const row=prior.rows.find(r=>r.name===name);assert.ok(row);assert.equal(row.input_sha256,sha(root+'/'+input));assert.deepEqual(row.state,state);
   const capture=row.results.find(r=>r.suffix==='current'),folder=root+'/verification/value-lineage/current/';
   for(const key of ['svg','document']){assert.equal(sha(folder+capture[key]),capture[key+'_sha256']);fs.copyFileSync(folder+capture[key],out+'/'+(key==='svg'?svg:document));}
   results.push({...capture,suffix,svg,document,reuse:{commit:snapshot.commit,report:'verification/value-lineage/current/large-report.json'}});
   console.log('REUSE verified '+name);continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),original);
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,results:results.map(r=>({suffix:r.suffix,crossings:r.quality.line_geometry.crossings,wire:r.quality.wire_length,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'coupled-routes/1',snapshot,implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

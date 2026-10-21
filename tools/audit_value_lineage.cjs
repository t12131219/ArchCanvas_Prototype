'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/value-lineage/current',cache='/tmp/archcanvas-value-lineage-before-15d39ee';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const snapshot=read('verification/value-lineage/current/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(cache+'/'+path.basename(f)),h);
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const local=read('verification/value-lineage/current/extraction.json').rows.map(row=>{
 const ir=read(row.input),state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperAuto:false};
 state.open=[...E.viewIndex(ir,state).children.keys()].filter(Boolean);
 return {name:row.entry,input:row.input,state};
});
const large=process.argv.includes('--large'),cases=large?read('verification/coincident-ports/current/requests.json').cases.filter(r=>r.large):local;
const priorFile=out+'/'+(large?'large':'small')+'-report.json';
const prior=process.argv.includes('--reuse-before')?JSON.parse(fs.readFileSync(priorFile)):null;
if(prior)assert.deepEqual(prior.snapshot,snapshot);
const files=[...Object.keys(snapshot.files),...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 'tests/value-lineage.test.cjs','tests/test_value_lineage.py','tests/semantic_fixtures/value_lineage.py','tools/audit_value_lineage.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[];
for(const request of cases){
 const {name,input,state}=request,ir=read(input),original=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  if(suffix==='before'&&prior){
   const row=prior.rows.find(r=>r.name===name);assert.ok(row);assert.equal(row.input_sha256,sha(root+'/'+input));
   assert.deepEqual(row.state,state);const before=row.results.find(r=>r.suffix==='before');
   for(const key of ['svg','document'])assert.equal(sha(out+'/'+before[key]),before[key+'_sha256']);
   results.push(before);console.log('REUSE verified frozen SVG '+name);continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state),svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';
  assert.equal(JSON.stringify(ir),original);fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,quality:results.map(r=>({nodes:r.quality.nodes,wire:r.quality.wire_length,crossings:r.quality.line_geometry.crossings,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'value-lineage/1',snapshot,implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

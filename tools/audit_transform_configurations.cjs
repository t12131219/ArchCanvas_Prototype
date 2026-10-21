'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/transform-configurations/current',cache='/tmp/archcanvas-transform-config-before-79f905f';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f);
const hashes=Object.fromEntries([...files,'semantic_studio/index.html','tests/transform-configurations.test.cjs','tests/semantic_fixtures/transform_configurations.py','tools/audit_transform_configurations.cjs','tools/load_publication_renderer.cjs'].map(f=>[f,sha(root+'/'+f)]));
const frozen=Object.fromEntries(files.filter(f=>fs.existsSync(cache+'/'+path.basename(f))).map(f=>[f,sha(cache+'/'+path.basename(f))]));
let cases=only?read('verification/coincident-ports/current/requests.json').cases.filter(r=>r.name===only):
 read('verification/shared-fanouts/current/small-report.json').rows.map(({name,input,state,kind})=>({name,input,state:{...state,paperAdaptive:false},kind}));
if(!only)for(const row of read('verification/transform-configurations/current/extraction.json').rows){
 const ir=read(row.input),base={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
 cases.push({name:row.entry,input:row.input,kind:'fresh-source',state:base});
 cases.push({name:row.entry+'-open',input:row.input,kind:'fresh-source-open',state:{...base,paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)}});
}
assert.ok(cases.length);const rows=[];
for(const request of cases){
 const {name,input,state}=request,ir=read(input),raw=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  const svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';
  if(only&&suffix==='before'){
   const prior=read('verification/shared-fanouts/current/'+name+'-report.json');
   for(const [f,h]of Object.entries(prior.implementation_sha256))if(f.startsWith('semantic_studio/'))assert.equal(h,frozen[f]);
   const row=prior.rows.find(r=>r.name===name);assert.equal(row.input_sha256,sha(root+'/'+input));assert.deepEqual(row.state,state);
   const capture=row.results.find(r=>r.suffix==='current'),folder=root+'/verification/shared-fanouts/current/';
   for(const key of ['svg','document']){assert.equal(sha(folder+capture[key]),capture[key+'_sha256']);fs.copyFileSync(folder+capture[key],out+'/'+(key==='svg'?svg:document));}
   results.push({...capture,suffix,svg,document,reuse:{commit:'79f905f',report:'verification/shared-fanouts/current/'+name+'-report.json'}});continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),raw);
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
  if(!only&&suffix==='before')assert.equal(R.render(ir,{...state,paperTransformConfigurations:false}).svg,r.svg,'opt-out matches committed renderer');
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 const doc=JSON.parse(fs.readFileSync(out+'/'+results[1].document));
 console.log(JSON.stringify({name,annotations:doc.publication.transform_configurations?.rows.reduce((s,r)=>s+r.operations.length,0)||0,results:results.map(r=>({suffix:r.suffix,width:r.quality.native_width_px,height:r.quality.native_height_px,wire:r.quality.wire_length,crossings:r.quality.line_geometry.crossings,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'transform-configurations/1',baseline:{commit:'79f905f',files:frozen},implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

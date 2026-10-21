'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/shared-fanouts/current',cache='/tmp/archcanvas-fanout-before-ea77524';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7),large=!!only;
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f);
const hashes=Object.fromEntries([...files,'tests/shared-fanouts.test.cjs','tests/semantic_fixtures/shared_fanouts.py','tools/audit_shared_fanouts.cjs'].map(f=>[f,sha(root+'/'+f)]));
const frozen=Object.fromEntries(files.map(f=>[f,sha(cache+'/'+path.basename(f))]));
let cases=large?read('verification/coincident-ports/current/requests.json').cases.filter(r=>r.name===only):
 read('verification/residual-bands/current/small-report.json').rows.map(({name,input,state,kind})=>({name,input,state:{...state,paperAdaptive:false},kind}));
if(!large)for(const row of read('verification/shared-fanouts/current/extraction.json').rows){
 const ir=read(row.input);cases.push({name:row.entry,input:row.input,kind:'fresh-source',state:{mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)}});
}
assert.ok(cases.length);const rows=[];
for(const request of cases){
 const {name,input,state}=request,ir=read(input),raw=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  const svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';
  if(large&&suffix==='before'){
   const prior=read('verification/residual-bands/current/'+name+'-report.json');
   for(const [f,h]of Object.entries(prior.implementation_sha256))if(f.startsWith('semantic_studio/'))assert.equal(h,frozen[f]);
   const row=prior.rows.find(r=>r.name===name);assert.equal(row.input_sha256,sha(root+'/'+input));assert.deepEqual(row.state,state);
   const capture=row.results.find(r=>r.suffix==='current'),folder=root+'/verification/residual-bands/current/';
   for(const key of ['svg','document']){assert.equal(sha(folder+capture[key]),capture[key+'_sha256']);fs.copyFileSync(folder+capture[key],out+'/'+(key==='svg'?svg:document));}
   results.push({...capture,suffix,svg,document,reuse:{commit:'ea77524',report:'verification/residual-bands/current/'+name+'-report.json'}});continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),raw);
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
  if(!large&&suffix==='before')assert.equal(R.render(ir,{...state,paperSharedFanouts:false}).svg,r.svg,'opt-out matches frozen renderer');
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 const doc=JSON.parse(fs.readFileSync(out+'/'+results[1].document));
 console.log(JSON.stringify({name,selected:doc.layout.shared_fanouts?.length||0,results:results.map(r=>({suffix:r.suffix,wire:r.quality.wire_length,crossings:r.quality.line_geometry.crossings,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'shared-fanouts/1',baseline:{commit:'ea77524',files:frozen},implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

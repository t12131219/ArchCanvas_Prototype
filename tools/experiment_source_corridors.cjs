'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/source-corridors/current',cache=process.argv[2];
if(!cache)throw Error('Use python3 tools/experiment_source_corridors.py');
const load=require('./load_publication_renderer.cjs'),B=load(cache+'/before/semantic_studio'),R=load(cache+'/candidate/semantic_studio');
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const request=read(root+'/verification/coincident-ports/current/requests.json').cases.find(c=>c.name==='Transformer-panel-0');
const ir=read(root+'/'+request.input),original=JSON.stringify(ir);console.log('START formal source-corridor experiment');
const a=B.render(ir,request.state),b=R.render(ir,request.state);assert.equal(JSON.stringify(ir),original);
assert.equal(a.svg,fs.readFileSync(root+'/verification/source-navigation/current/ui-main.svg','utf8'));
for(const [suffix,r]of [['before',a],['candidate',b]]){
 fs.writeFileSync(out+'/main-'+suffix+'.svg',r.svg);fs.writeFileSync(out+'/main-'+suffix+'.layout.json',JSON.stringify(r.document));
}
const files=['tools/experiment_source_corridors.py','tools/experiment_source_corridors.cjs','tools/experiments/source-corridors.test.cjs','verification/source-corridors/current/prototype.patch'];
const report={schema:'source-corridor-experiment/1',input:request.input,input_sha256:sha(root+'/'+request.input),state:request.state,
 baseline:'8476c9b',before:a.prepared.quality,candidate:b.prepared.quality,receipt:b.prepared.routing.source_corridor_refinement,ir_unchanged:true,
 prototype_sha256:Object.fromEntries(['architecture-layout.js','publication-renderer.js'].map(f=>[f,sha(cache+'/candidate/semantic_studio/'+f)])),
 producer_sha256:Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),goal_complete:false,
 decision:'not-adopted',reason:'Fixed-node routing does not materially close the reference gap. Review module boundaries and local relation geometry next.'};
fs.writeFileSync(out+'/experiment-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({before:report.before.wire_length,candidate:report.candidate.wire_length,crossings:[report.before.line_geometry.crossings,report.candidate.line_geometry.crossings],decision:report.decision}));

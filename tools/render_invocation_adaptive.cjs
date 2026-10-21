'use strict';
// Reuse only the previously completed run whose exact production bytes match
// this stage's frozen baseline. Measure the new default separately.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/invocation-inputs/current'),old=path.join(root,'verification/adaptive-comparison/current');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
const snapshot=read(out+'/snapshot.json'),previous=read(old+'/render-report.json'),baseline=previous.rows.find(r=>r.name==='transformer-current');
for(const [f,h]of Object.entries(snapshot.files)){assert.equal(previous.implementation_sha256[f],h);assert.equal(sha(out+'/before/'+path.basename(f)),h);}
assert.equal(sha(old+'/'+baseline.svg),baseline.svg_sha256);assert.equal(sha(old+'/'+baseline.document),baseline.document_sha256);
const input=path.join(root,baseline.input),ir=read(input),original=JSON.stringify(ir);assert.equal(sha(input),baseline.input_sha256);
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f),...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f)];
const hashes=Object.fromEntries(files.map(f=>[f,sha(path.join(root,f))]));
fs.writeFileSync(out+'/adaptive-start.json',JSON.stringify({implementation_sha256:hashes,input:baseline.input,input_sha256:sha(input),state:baseline.state,baseline_report_sha256:sha(old+'/render-report.json'),terminal:false},null,2)+'\n');
console.log('START current full adaptive');const R=require('./load_publication_renderer.cjs')(root+'/semantic_studio'),started=performance.now(),r=R.render(ir,baseline.state),elapsed_ms=performance.now()-started;
assert.equal(JSON.stringify(ir),original);assert.equal(JSON.stringify(r.document.ir),original);
const svg='Transformer-adaptive-current.svg',document='Transformer-adaptive-current.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
for(const [f,h]of Object.entries(hashes))assert.equal(sha(path.join(root,f)),h);
const row={name:'Transformer-adaptive-current',input:baseline.input,input_sha256:sha(input),state:baseline.state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),elapsed_ms,
 nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,invocation_inputs:r.document.publication.invocation_inputs,adaptive:r.document.publication.adaptive_frontier};
fs.writeFileSync(out+'/adaptive-report.json',JSON.stringify({schema:'invocation-adaptive/1',terminal:true,implementation_sha256:hashes,baseline:{directory:'verification/adaptive-comparison/current',report_sha256:sha(old+'/render-report.json'),row:baseline},current:row,goal_complete:false},null,2)+'\n');
console.log(JSON.stringify({elapsed_ms,nodes:row.nodes,edges:row.edges,quality:row.quality.issues}));

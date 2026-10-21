/* Reproduce a missing full frozen run; verify and reuse a completed run. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),directory='/tmp/archcanvas-joint-baseline',frozenDirectory='/tmp/archcanvas-joint-frontiers-before';
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const frozen=read(frozenDirectory+'/snapshot.json'),input='verification/helper-contracts/current/Transformer-current.json';
const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
for(const [f,h]of Object.entries(frozen.files))assert.equal(sha(frozenDirectory+'/'+path.basename(f)),h);
if(fs.existsSync(directory+'/report.json')){
 const report=read(directory+'/report.json');assert.ok(report.terminal);assert.deepEqual(report.frozen,frozen);
 assert.equal(report.input,input);assert.equal(report.input_sha256,sha(root+'/'+input));assert.deepEqual(report.state,state);
 assert.equal(report.svg_sha256,sha(directory+'/Transformer-before.svg'));
 assert.equal(report.document_sha256,sha(directory+'/Transformer-before.layout.json'));
 console.log('Verified completed frozen automatic run; not restarted.');
}else{
 fs.mkdirSync(directory,{recursive:true});
 // An unfinished start record is not evidence that its process stopped.
 assert.ok(!fs.existsSync(directory+'/start.json'),'Inspect the original process handle before starting another run.');
 const initial={input,input_sha256:sha(root+'/'+input),state,frozen};
 fs.writeFileSync(directory+'/start.json',JSON.stringify({...initial,terminal:false}));
 const ir=read(root+'/'+input),R=require('./load_publication_renderer.cjs')(frozenDirectory),started=performance.now();
 const result=R.render(ir,state),elapsed_ms=performance.now()-started;
 assert.deepEqual(JSON.parse(JSON.stringify(result.document.ir)),ir);
 for(const [f,h]of Object.entries(frozen.files))assert.equal(sha(frozenDirectory+'/'+path.basename(f)),h);
 fs.writeFileSync(directory+'/Transformer-before.svg',result.svg);
 fs.writeFileSync(directory+'/Transformer-before.layout.json',JSON.stringify(result.document));
 fs.writeFileSync(directory+'/report.json',JSON.stringify({...initial,terminal:true,elapsed_ms,
  svg_sha256:sha(directory+'/Transformer-before.svg'),document_sha256:sha(directory+'/Transformer-before.layout.json'),
  nodes:result.graph.nodes.length,edges:result.graph.edges.length,quality:result.prepared.quality,adaptive:result.document.publication.adaptive_frontier},null,2));
 console.log('Completed frozen automatic run.');
}

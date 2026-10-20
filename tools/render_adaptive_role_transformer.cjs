'use strict';
// Reproduce the full measured comparison. It can take a long time: the
// synchronous router's trial count cap is not a wall-clock time limit.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const load=require('./load_publication_renderer.cjs'),root=path.resolve(__dirname,'..'),folder=path.join(root,'verification/adaptive-role-paths/current');
const checkpoint=path.join(root,'verification/local-relations/iteration-41-before-adaptive-role-paths'),snapshot=JSON.parse(fs.readFileSync(checkpoint+'/snapshot.json'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),implementation=Object.fromEntries(Object.keys(snapshot.files).map(f=>[f,sha(path.join(root,f))]));
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(path.join(checkpoint,'implementation',f)),h);
const input='verification/helper-contracts/current/Transformer-current.json',inputHash=sha(path.join(root,input)),ir=JSON.parse(fs.readFileSync(path.join(root,input)));
const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'},rows=[];
for(const [name,directory]of [['before',checkpoint+'/implementation/semantic_studio'],['current',path.join(root,'semantic_studio')]]){
 console.log('START '+name);const started=Date.now(),R=load(directory),r=R.render(ir,state);
 fs.writeFileSync(folder+'/transformer-'+name+'.svg',r.svg);fs.writeFileSync(folder+'/transformer-'+name+'.layout.json',JSON.stringify(r.document));
 rows.push({name,elapsed_ms:Date.now()-started,nodes:r.graph.nodes.length,edges:r.graph.edges.length,svg_sha256:sha(folder+'/transformer-'+name+'.svg')});
 console.log(JSON.stringify(rows.at(-1)));
}
for(const [f,h]of Object.entries(implementation))assert.equal(sha(path.join(root,f)),h,'producer changed during rendering');
assert.equal(sha(path.join(root,input)),inputHash);
fs.writeFileSync(folder+'/transformer-timing.json',JSON.stringify({schema:'adaptive-role-paths-timing/1',implementation_sha256:implementation,input,input_sha256:inputHash,rows},null,2)+'\n');

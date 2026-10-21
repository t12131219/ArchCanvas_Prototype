/* Resume only the missing current render after authoritative terminal exit.
 * Preserve the frozen before outputs from original session 51885. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/adaptive-role-paths/current'),load=require('./load_publication_renderer.cjs');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-41-before-adaptive-role-paths',snapshot=JSON.parse(fs.readFileSync(path.join(root,checkpoint,'snapshot.json')));
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const input='verification/helper-contracts/current/Transformer-current.json',inputHash=sha(input),ir=JSON.parse(fs.readFileSync(path.join(root,input)));
const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
const beforeDoc=JSON.parse(fs.readFileSync(out+'/transformer-before.layout.json'));
assert.deepEqual(beforeDoc.ir,ir);assert.deepEqual(beforeDoc.state,{...state,view:'publication'});
const saved=['transformer-before.svg','transformer-before.layout.json'],baseline=Object.fromEntries(saved.map(f=>[f,sha('verification/adaptive-role-paths/current/'+f)]));
const implementation=Object.fromEntries(Object.keys(snapshot.files).map(f=>[f,sha(f)]));
const launch={schema:'adaptive-transformer-resume/1',started_at_utc:new Date().toISOString(),pid:process.pid,
 previous_session:51885,previous_exit_code:143,previous_pid:681657,previous_process_terminal_verified:true,
 baseline_sha256:baseline,baseline_checkpoint:checkpoint+'/snapshot.json',baseline_checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 baseline_provenance:'Original session completed and saved the frozen before renderer, then printed START current and returned exit143. Read-only host ps confirmed PID681657 absent. Current output was absent. Before elapsed time was not recorded.',
 implementation_sha256:implementation,input,input_sha256:inputHash,state,scope:'Only the missing current full default adaptive render; no restart of the completed before calculation.'};
assert.ok(!fs.existsSync(out+'/transformer-current.svg')&&!fs.existsSync(out+'/transformer-current.layout.json'),'current output already exists; inspect provenance instead of restarting');
fs.writeFileSync(out+'/resume-launch.json',JSON.stringify(launch,null,2)+'\n');
console.log('START current-only '+JSON.stringify({pid:process.pid,baseline}));
const started=Date.now(),R=load(path.join(root,'semantic_studio')),r=R.render(ir,state),elapsed=Date.now()-started;
for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h,'producer changed during current rendering');
assert.equal(sha(input),inputHash);assert.deepEqual(r.document.ir,ir);
for(const [f,h]of Object.entries(baseline))assert.equal(sha('verification/adaptive-role-paths/current/'+f),h,'baseline changed');
fs.writeFileSync(out+'/transformer-current.svg',r.svg);fs.writeFileSync(out+'/transformer-current.layout.json',JSON.stringify(r.document));
const row={name:'current',elapsed_ms:elapsed,nodes:r.graph.nodes.length,edges:r.graph.edges.length,svg_sha256:sha('verification/adaptive-role-paths/current/transformer-current.svg')};
fs.writeFileSync(out+'/transformer-timing.json',JSON.stringify({schema:'adaptive-role-paths-timing/2',implementation_sha256:implementation,input,input_sha256:inputHash,
 resume_launch_sha256:sha('verification/adaptive-role-paths/current/resume-launch.json'),baseline_sha256:baseline,
 rows:[{name:'before',elapsed_ms:null,nodes:beforeDoc.layout.nodes.length,edges:beforeDoc.layout.edges.length,svg_sha256:baseline['transformer-before.svg'],timing_scope:'not recorded by original session'},row]},null,2)+'\n');
console.log(JSON.stringify(row));

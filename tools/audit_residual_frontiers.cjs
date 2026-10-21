'use strict';
// Replay actual automatic candidates using the entire production renderer.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=root+'/verification/residual-bands/current',load=require('./load_publication_renderer.cjs'),R=load(root+'/semantic_studio');
const plain=x=>JSON.parse(JSON.stringify(x));
const equal=(a,b,key)=>assert.deepEqual(plain(a),plain(b),key);
const A=require('../semantic_studio/adaptive-frontier.js'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f);
const hashes=Object.fromEntries([...files,'tools/audit_residual_frontiers.cjs'].map(f=>[f,sha(root+'/'+f)])),rows=[],selections=[];
const cache='/tmp/archcanvas-residual-bands-before-0dcab92',B=load(cache),snapshot=JSON.parse(fs.readFileSync(out+'/snapshot.json'));
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(cache+'/'+path.basename(f)),h);
const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
for(const name of ['MixedWeave','InterruptedWeave','UncertifiedWeave','MixedBoundary']){
 const input='verification/'+(name==='MixedBoundary'?'adaptive-role-paths':'coverage-selection')+'/current/'+name+'.json',ir=JSON.parse(fs.readFileSync(root+'/'+input)),raw=JSON.stringify(ir);
 console.log('START '+name);const selected=R.render(ir,state),receipt=selected.document.publication.adaptive_frontier;
 equal(receipt.selected,A.metrics(selected));
 const captures=[];
 function save(r,label,s){
  assert.equal(JSON.stringify(ir),raw);const svg=name+'-'+label+'.svg',document=name+'-'+label+'.layout.json';
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  const row={name:name+'-'+label,input,input_sha256:sha(root+'/'+input),state:s,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality};rows.push(row);captures.push(row.name);return row.name;
 }
 save(selected,'selected',state);
 if(name==='MixedBoundary')save(B.render(ir,state),'old-selected',state);
 let previous=R.render(ir,{...state,paperAdaptive:false}),round=-1,next=null;
 equal(receipt.baseline,A.metrics(previous));save(previous,'baseline',{...state,paperAdaptive:false});
 const attempts=[];
 for(const [i,t]of receipt.attempts.entries()){
  if(t.comparison_round!==round){if(next)previous=next;next=null;round=t.comparison_round;}
  equal(t.before,A.metrics(previous));
  const s={...state,...t.requested_state,paperAdaptive:false},candidate=R.render(ir,s);
  equal(t.candidate,A.metrics(candidate));const actual=A.assess(ir,previous,candidate);
  for(const key of ['gain','lost_goals','lost_summary_goals','before','candidate'])equal(actual[key],t[key],key);
  const capture=save(candidate,'trial-'+i,s);attempts.push({index:i,capture,accepted:t.accepted,eligible:t.eligible,metrics:A.metrics(candidate)});if(t.accepted)next=candidate;
 }
 assert.equal(R.render(selected.document.ir,selected.document.state).svg,selected.svg);
 selections.push({name,captures,attempts,selected:A.metrics(selected),receipt});console.log(JSON.stringify({name,attempts:attempts.length,selected:A.metrics(selected)}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/adaptive-report.json',JSON.stringify({schema:'residual-frontiers/1',snapshot,implementation_sha256:hashes,rows,selections,passed:true},null,2)+'\n');

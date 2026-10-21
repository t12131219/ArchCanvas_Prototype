/* Compare local physical expression with the same canonical binding contract
 * used for diagram planning. Historical figures remain immutable evidence. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/exact-expression/current',out=root+'/'+folder,cache='/tmp/archcanvas-exact-before-d2b43b8';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const snapshot=read(folder+'/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(cache+'/'+path.basename(f)),h);
const load=require('./load_publication_renderer.cjs'),{renderer:R,diagrams:D}=load(root+'/semantic_studio',{diagramSet:true}),{renderer:B}=load(cache,{diagramSet:true});
const files=[...Object.keys(snapshot.files),'tools/audit_exact_expression.cjs','tools/freeze_exact_expression.py','tests/exact-expression.test.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,result){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),state:result.document.state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),
  nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,quality:result.document.diagnostics.publication});return name;
}
const large=process.argv.includes('--large');let joint=null;
if(!large){
 for(const [name,input]of [['MixedWeave','verification/coverage-selection/current/MixedWeave.json'],['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json'],
  ['SameSource','verification/semantic-design/current/after/SameSource.json']]){
  const ir=read(input),original=JSON.stringify(ir),s={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true};
  console.log('START '+name);const before=save(name+'-before',input,B.render(ir,s)),after=save(name+'-current',input,R.render(ir,s));
  assert.equal(JSON.stringify(ir),original);comparisons.push({name,before,after,kind:'automatic'});
 }
 for(const name of ['InterleavedPaths-current-trial-3','GuardedEnvelope-current-trial-3']){
  const source='verification/cohort-folds/current',r=read(source+'/small-render-report.json').rows.find(r=>r.name===name),doc=read(source+'/'+r.document);
  assert.equal(sha(root+'/'+source+'/'+r.document),r.document_sha256);assert.equal(sha(root+'/'+source+'/'+r.svg),r.svg_sha256);
  const before=save(name+'-before',r.input,{document:doc,svg:fs.readFileSync(root+'/'+source+'/'+r.svg,'utf8')});
  console.log('START '+name);const after=save(name+'-current',r.input,R.render(doc.ir,doc.state));
  comparisons.push({name,before,after,kind:'conditional-history',historical:{report:source+'/small-render-report.json',capture:name}});
 }
}else{
 const source='verification/boundary-inputs/current',previous=read(source+'/large-report.json'),initial=[];
 for(const [i,p]of previous.joint.panels.entries()){
  const row=previous.rows.find(r=>r.name===p.capture),doc=read(source+'/'+row.document);
  assert.equal(sha(root+'/'+source+'/'+row.document),row.document_sha256);assert.equal(sha(root+'/'+source+'/'+row.svg),row.svg_sha256);
  const before=save('Transformer-panel-'+i+'-before',row.input,{document:doc,svg:fs.readFileSync(root+'/'+source+'/'+row.svg,'utf8')});
  console.log('START panel '+i);const result=R.render(doc.ir,p.state),after=save('Transformer-panel-'+i+'-current',row.input,result);
  initial.push({...p,result});comparisons.push({name:'Transformer-panel-'+i,before,after,kind:'same-state',historical:{report:source+'/large-report.json',capture:p.capture}});
 }
 let seq=0;const captures=new Map(initial.map((p,i)=>[p.result,comparisons[i].after]));
 const renderer={render:(ir,s)=>{console.log('START trial '+(++seq));const r=R.render(ir,s);captures.set(r,save('Transformer-trial-'+seq,rows[0].input,r));return r;}};
 const main=initial[0].result,set=D.joint(main.document.ir,initial[0].state,renderer,{main,initialPanels:initial,maxPanels:3,maxTrials:2});
 joint={plan:set.plan,initial:initial.map(p=>({id:p.id,capture:captures.get(p.result)})),panels:set.panels.map(({result,...p})=>({...p,capture:captures.get(result)})),
  attempts:set.attempts,baseline_coverage:set.baseline_coverage,coverage:set.coverage,limits:set.limits};
 console.log(JSON.stringify({before:set.baseline_coverage.filter(r=>r.status==='fulfilled').length,after:set.coverage.filter(r=>r.status==='fulfilled').length,attempts:set.attempts.map(t=>({accepted:t.accepted,reasons:t.reasons}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'exact-expression/1',implementation_sha256:hashes,baseline:snapshot,rows,comparisons,joint,goal_complete:false},null,2)+'\n');

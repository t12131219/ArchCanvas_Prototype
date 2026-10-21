'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/selected-routes/current',out=root+'/'+folder;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),{renderer:R,diagrams:D}=load(root+'/semantic_studio',{diagramSet:true});
const snapshot=read(folder+'/snapshot.json'),files=[...Object.keys(snapshot.files),'tools/audit_selected_routes.cjs','tests/selected-routes.test.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,result){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),
  nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,quality:result.document.diagnostics.publication});return name;
}
let joint=null;
if(process.argv.includes('--large')){
 const source='verification/exact-expression/current',previous=read(source+'/large-report.json'),initial=[],captures=new Map();
 for(const [i,p]of previous.joint.panels.entries()){
  const row=previous.rows.find(r=>r.name===p.capture),doc=read(source+'/'+row.document);
  assert.equal(sha(root+'/'+source+'/'+row.svg),row.svg_sha256);assert.equal(sha(root+'/'+source+'/'+row.document),row.document_sha256);
  const before=save('Transformer-panel-'+i+'-before',row.input,{document:doc,svg:fs.readFileSync(root+'/'+source+'/'+row.svg,'utf8')});
  console.log('START panel '+i);const result=R.render(doc.ir,p.state),after=save('Transformer-panel-'+i+'-current',row.input,result);
  initial.push({...p,result});captures.set(result,after);comparisons.push({name:'Transformer-panel-'+i,before,after});
 }
 let seq=0;
 const renderer={render:(ir,s)=>{console.log('START trial '+(++seq));const r=R.render(ir,s);captures.set(r,save('Transformer-trial-'+seq,rows[0].input,r));return r;}};
 const main=initial[0].result,set=D.joint(main.document.ir,initial[0].state,renderer,{main,initialPanels:initial,maxPanels:3,maxTrials:2});
 joint={plan:set.plan,initial:initial.map(p=>({id:p.id,capture:captures.get(p.result)})),panels:set.panels.map(({result,...p})=>({...p,capture:captures.get(result)})),
  attempts:set.attempts,baseline_coverage:set.baseline_coverage,coverage:set.coverage,limits:set.limits};
 for(const [i,row]of previous.rows.filter(r=>r.name.startsWith('Transformer-trial-')).entries()){
  const before=save('Transformer-trial-'+(i+1)+'-before',row.input,{document:read(source+'/'+row.document),svg:fs.readFileSync(root+'/'+source+'/'+row.svg,'utf8')});
  if(rows.some(r=>r.name==='Transformer-trial-'+(i+1)))comparisons.push({name:'Transformer-trial-'+(i+1),before,after:'Transformer-trial-'+(i+1)});
 }
 console.log(JSON.stringify({before:set.baseline_coverage.filter(r=>r.status==='fulfilled').length,after:set.coverage.filter(r=>r.status==='fulfilled').length,attempts:set.attempts.map(t=>({accepted:t.accepted,reasons:t.reasons}))}));
}else{
 const B=load('/tmp/archcanvas-selected-before-21e346c');
 for(const [name,input,state]of [
 ['MixedWeave','verification/coverage-selection/current/MixedWeave.json',{paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true}],
 ['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json',{paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true}],
 ['WovenInputs','verification/branch-columns/current/WovenInputs.json',{paperMedium:'canvas',paperGranularity:'roles'}],
 ['InterruptedPaths','verification/branch-columns/current/InterruptedPaths.json',{paperMedium:'canvas',paperGranularity:'roles'}]]){
  const ir=read(input),original=JSON.stringify(ir);console.log('START '+name);
  const before=save(name+'-before',input,B.render(ir,state)),after=save(name+'-current',input,R.render(ir,state));
  assert.equal(JSON.stringify(ir),original);comparisons.push({name,before,after});
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(joint?'large':'small')+'-report.json',JSON.stringify({schema:'selected-routes/1',implementation_sha256:hashes,baseline:snapshot,rows,comparisons,joint,goal_complete:false},null,2)+'\n');

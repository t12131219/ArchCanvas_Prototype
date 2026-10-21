'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/prefix-role-paths/current',out=root+'/'+folder;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),{renderer:R,diagrams:D}=load(root+'/semantic_studio',{diagramSet:true}),B=load('/tmp/archcanvas-prefix-role-paths-before-ef94501');
const snapshot=read(folder+'/snapshot.json'),files=[...Object.keys(snapshot.files),'semantic_studio/index.html','semantic_studio/style.css','tools/audit_prefix_role_paths.cjs','tests/prefix-role-paths.test.cjs','tests/semantic_fixtures/prefix_role_paths.py','tools/extract_prefix_role_paths.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,result){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),
  nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,quality:result.document.diagnostics.publication});
 console.log(JSON.stringify({name,nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,height:result.prepared.quality.native_height_px,crossings:result.prepared.quality.line_geometry.crossings,wire:result.prepared.quality.wire_length,issues:result.prepared.quality.issues}));return name;
}
let joint=null;
if(process.argv.includes('--large')){
 const source='verification/final-sample-frames/current',previous=read(source+'/large-report.json'),initial=[],captures=new Map();
 for(const [i,p]of previous.joint.panels.entries()){
  const row=previous.rows.find(r=>r.name===p.capture),ir=read(row.input);
  console.log('START baseline panel '+i);
  const cached=out+'/Transformer-panel-'+i+'-before',valid=fs.existsSync(cached+'.svg')&&fs.existsSync(cached+'.layout.json')&&sha(cached+'.svg')===row.svg_sha256&&sha(cached+'.layout.json')===row.document_sha256;
  const doc=valid?JSON.parse(fs.readFileSync(cached+'.layout.json')):null;
  const old=valid?{svg:fs.readFileSync(cached+'.svg','utf8'),document:doc,prepared:{quality:doc.diagnostics.publication}}:B.render(ir,p.state);
  assert.equal(crypto.createHash('sha256').update(old.svg).digest('hex'),row.svg_sha256,'reproduce baseline selected SVG');
  const before=save('Transformer-panel-'+i+'-before',row.input,old);
  console.log('START current panel '+i);const result=R.render(ir,p.state),after=save('Transformer-panel-'+i+'-current',row.input,result);
  initial.push({...p,result});captures.set(result,after);comparisons.push({name:'Transformer-panel-'+i,before,after});
 }
 let seq=0;
 const renderer={render:(ir,s)=>{console.log('START trial '+(++seq));const r=R.render(ir,s);captures.set(r,save('Transformer-trial-'+seq,rows[0].input,r));return r;}};
 const main=initial[0].result,set=D.joint(main.document.ir,initial[0].state,renderer,{main,initialPanels:initial,maxPanels:3,maxTrials:1,frozenPlan:previous.joint.plan});
 joint={plan:set.plan,initial:initial.map(p=>({id:p.id,capture:captures.get(p.result)})),panels:set.panels.map(({result,...p})=>({...p,capture:captures.get(result)})),
  attempts:set.attempts,baseline_coverage:set.baseline_coverage,coverage:set.coverage,limits:set.limits};
}else{
 for(const [name,input]of [
  ...read(folder+'/extraction.json').rows.map(r=>[r.name,r.input]),
  ['PrismPath','verification/role-path-stages/current/PrismPath.json'],
  ['ConditionalNeighborRuns','verification/final-sample-frames/current/ConditionalNeighborRuns.json'],
  ['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json']]){
  const ir=read(input),original=JSON.stringify(ir),state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperRolePathStages:true};
  console.log('START '+name);const old=B.render(ir,state),result=R.render(ir,state);
  const before=save(name+'-before',input,old),after=save(name+'-current',input,result);comparisons.push({name,before,after});
  const stage=result.graph.publication.role_path_stages?.rows.find(r=>r.direction==='helper-before-role');
  if(stage){
   const open=[...result.graph.publication.open,stage.node],s={...state,paperAuto:false,open};
   save(name+'-opened',input,R.render(ir,s));save(name+'-deep',input,R.render(ir,{...s,open:[...open,stage.helper]}));
  }
  assert.equal(JSON.stringify(ir),original);
  assert.equal(B.render(ir,{...state,paperRolePathStages:false}).svg,R.render(ir,{...state,paperRolePathStages:false}).svg,'unchanged opt-out');
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(joint?'large':'small')+'-report.json',JSON.stringify({schema:'prefix-role-paths/1',implementation_sha256:hashes,baseline:snapshot,rows,comparisons,joint,goal_complete:false},null,2)+'\n');

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/module-arguments/current',out=root+'/'+folder;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),R=load(root+'/semantic_studio'),B=load('/tmp/archcanvas-module-arguments-before-2213a19');
const snapshot=read(folder+'/snapshot.json'),files=[...Object.keys(snapshot.files),'semantic_studio/module-arguments.js','semantic_studio/index.html','tools/load_publication_renderer.cjs','tools/audit_module_arguments.cjs','tests/module-arguments.test.cjs','tests/semantic_fixtures/module_arguments.py','tools/extract_module_arguments.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,result){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,quality:result.document.diagnostics.publication});
 console.log(JSON.stringify({name,nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,height:result.prepared.quality.native_height_px,crossings:result.prepared.quality.line_geometry.crossings,wire:result.prepared.quality.wire_length,issues:result.prepared.quality.issues}));return name;
}
const large=process.argv.includes('--large');
if(large){
 const previous=read('verification/prefix-role-paths/current/large-report.json');
 for(const [i,p]of previous.joint.panels.entries()){
  const row=previous.rows.find(r=>r.name===p.capture),ir=read(row.input),oldfile=root+'/verification/prefix-role-paths/current/'+row.document;
  console.log('START baseline panel '+i);
  const valid=fs.existsSync(oldfile)&&sha(oldfile)===row.document_sha256&&sha(root+'/verification/prefix-role-paths/current/'+row.svg)===row.svg_sha256;
  const doc=valid?JSON.parse(fs.readFileSync(oldfile)):null;
  const old=valid?{svg:fs.readFileSync(root+'/verification/prefix-role-paths/current/'+row.svg,'utf8'),document:doc,prepared:{quality:doc.diagnostics.publication}}:B.render(ir,p.state);
  assert.equal(crypto.createHash('sha256').update(old.svg).digest('hex'),row.svg_sha256);
  const before=save('Transformer-panel-'+i+'-before',row.input,old);
  console.log('START current panel '+i);const result=R.render(ir,p.state),after=save('Transformer-panel-'+i+'-current',row.input,result);
  comparisons.push({name:'Transformer-panel-'+i,before,after});
 }
}else{
 for(const item of read(folder+'/extraction.json').rows){
  const {name,input}=item,ir=read(input),original=JSON.stringify(ir),helpers=new Set(ir.nodes.filter(n=>n.semantic_type==='source-function').map(n=>n.id));
  const open=new Set(ir.nodes.filter(n=>n.kind==='composite'&&!helpers.has(n.id)).map(n=>n.id)),by=new Map(ir.nodes.map(n=>[n.id,n]));
  for(const n of ir.nodes.filter(n=>n.kind==='opaque')){let at=n.parent;while(at){open.add(at);at=by.get(at)?.parent;}}
  const state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,paperAuto:false,open:[...open]};
  console.log('START '+name);const old=B.render(ir,state),result=R.render(ir,state);
  const before=save(name+'-before',input,old),after=save(name+'-current',input,result);comparisons.push({name,before,after});
  const attached=result.graph.publication.module_arguments?.rows.filter(r=>r.status==='attached')||[];
  if(attached.length){
   const opened=R.render(ir,{...state,open:[...open,...attached.map(r=>r.consumer)]});save(name+'-opened',input,opened);
   assert.equal(R.render(opened.document.ir,opened.document.state).svg,opened.svg);
   assert.equal(R.render(ir,state).svg,result.svg);
  }
  assert.equal(JSON.stringify(ir),original);
  assert.equal(R.render(ir,{...state,paperModuleArguments:false}).svg,old.svg,'exact opt-out');
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'module-arguments/1',implementation_sha256:hashes,baseline:snapshot,rows,comparisons,goal_complete:false},null,2)+'\n');

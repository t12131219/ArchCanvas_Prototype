'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/transform-operands/current',cache='/tmp/archcanvas-transform-operands-before-68d4a32';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);fs.mkdirSync(out,{recursive:true});
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f);
const hashes=Object.fromEntries([...files,'semantic_studio/index.html','tests/transform-operands.test.cjs','tests/semantic_fixtures/transform_operands.py','tools/audit_transform_operands.cjs','tools/load_publication_renderer.cjs'].map(f=>[f,sha(root+'/'+f)]));
const frozen=Object.fromEntries(files.map(f=>[f,sha(cache+'/'+path.basename(f))]));
const oldDir='verification/source-port-order/current/';
const chosen=new Set(['Reconvergence','UnknownReconvergence','ConditionalReconvergence','SharedColumns','MutableColumns','MixedColumns','AxisPatch','AxisPatch-open','DynamicPatch','InterruptedPatch','ConditionalPatch','StatefulPatch']);
const previous=only?[read(oldDir+only+'-report.json').rows[0]]:read(oldDir+'small-report.json').rows.filter(r=>chosen.has(r.name));
const cases=previous.map(({name,input,state,kind})=>({name,input,state,kind}));
if(!only)for(const row of read('verification/transform-operands/current/extraction.json').rows){
 cases.push({name:row.entry,input:row.input,kind:'fresh-source',state:{mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false}});
 if(['ConfiguredShape','BoundAxes','ArithmeticShape'].includes(row.entry)){
  const ir=read(row.input),r=B.render(ir,cases.at(-1).state),n=r.graph.nodes.find(n=>n.local_pipeline&&!n.local_pipeline_expanded);
  if(n)cases.push({name:row.entry+'-open',input:row.input,kind:'fresh-source-open',state:{...cases.at(-1).state,paperAuto:false,open:[...r.graph.publication.open,n.id]}});
 }
}
const rows=[];
for(const request of cases){
 const {name,input,state}=request,ir=read(input),raw=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  if(only&&suffix==='before'){
   const prior=read(oldDir+name+'-report.json');for(const [f,h]of Object.entries(prior.implementation_sha256))if(f.startsWith('semantic_studio/')&&f.endsWith('.js'))assert.equal(h,frozen[f]);
   const row=prior.rows[0];assert.equal(row.input_sha256,sha(root+'/'+input));assert.deepEqual(row.state,state);
   const old=row.results.find(r=>r.suffix==='current'),svg=name+'-before.svg',document=name+'-before.layout.json';
   for(const key of ['svg','document']){assert.equal(sha(root+'/'+oldDir+old[key]),old[key+'_sha256']);fs.copyFileSync(root+'/'+oldDir+old[key],out+'/'+(key==='svg'?svg:document));}
   results.push({...old,suffix,svg,document,reuse:{commit:'68d4a32',report:oldDir+name+'-report.json'}});continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),raw);
  const svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
  if(!only&&suffix==='before')assert.equal(R.render(ir,{...state,paperTransformOperands:false}).svg,r.svg);
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,results:results.map(r=>({suffix:r.suffix,crossings:r.quality.line_geometry.crossings,wire:r.quality.wire_length,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
assert.ok(rows.length);fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'transform-operands/1',baseline:{commit:'68d4a32',files:frozen},implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

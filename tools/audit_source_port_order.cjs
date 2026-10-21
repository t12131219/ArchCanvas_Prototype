'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/source-port-order/current',cache='/tmp/archcanvas-source-port-before-5827b36';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);
fs.mkdirSync(out,{recursive:true});
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f);
const hashes=Object.fromEntries([...files,'semantic_studio/index.html','tests/source-port-order.test.cjs','tests/source-port-fixtures.cjs','tools/audit_source_port_order.cjs','tools/load_publication_renderer.cjs'].map(f=>[f,sha(root+'/'+f)]));
const frozen=Object.fromEntries(files.map(f=>[f,sha(cache+'/'+path.basename(f))]));
const previous=only?['Transformer-panel-0','Transformer-panel-1','Transformer-panel-2'].filter(n=>n===only).map(n=>read('verification/transform-configurations/current/'+n+'-report.json').rows[0]):read('verification/transform-configurations/current/small-report.json').rows;
const cases=previous.map(({name,input,state,kind})=>({name,input,state,kind})),rows=[];
function capture(name,suffix,r){
 const svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';
 fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 return {suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality};
}
for(const request of cases){
 const {name,input,state}=request,ir=read(input),raw=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  if(only&&suffix==='before'){
   const prior=read('verification/transform-configurations/current/'+name+'-report.json');
   for(const [f,h]of Object.entries(prior.implementation_sha256))if(f.startsWith('semantic_studio/')&&f.endsWith('.js'))assert.equal(h,frozen[f]);
   const row=prior.rows[0];assert.equal(row.input_sha256,sha(root+'/'+input));assert.deepEqual(row.state,state);
   const old=row.results.find(r=>r.suffix==='current'),dir=root+'/verification/transform-configurations/current/';
   const svg=name+'-before.svg',document=name+'-before.layout.json';
   for(const key of ['svg','document']){assert.equal(sha(dir+old[key]),old[key+'_sha256']);fs.copyFileSync(dir+old[key],out+'/'+(key==='svg'?svg:document));}
   results.push({...old,suffix,svg,document,reuse:{commit:'5827b36',report:'verification/transform-configurations/current/'+name+'-report.json'}});continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),raw);
  results.push(capture(name,suffix,r));
  if(!only&&suffix==='before')assert.equal(R.render(ir,{...state,paperSourcePortOrder:false}).svg,r.svg);
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,results:results.map(r=>({suffix:r.suffix,crossings:r.quality.line_geometry.crossings,wire:r.quality.wire_length,issues:r.quality.issues}))}));
}
if(!only){
 const {fixture}=require('../tests/source-port-fixtures.cjs');
 for(const side of ['top','bottom','left','right']){
  const name='NestedLeads-'+side,{ir,state,baseline}=fixture(side),input='verification/source-port-order/current/'+name+'.json';
  fs.writeFileSync(root+'/'+input,JSON.stringify(ir,null,2)+'\n');
  const before={...baseline,prepared:B.evaluateRoutes(baseline.graph,baseline.prepared.routes,'canonical-short')};
  const after=R.prepareSourcePortOrder(ir,state,baseline);
  rows.push({name,input,state,kind:'controlled-geometry',input_sha256:sha(root+'/'+input),results:[capture(name,'before',B.renderPrepared(ir,state,before)),capture(name,'current',R.renderPrepared(ir,state,after))]});
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
assert.ok(rows.length);fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'source-port-order/1',baseline:{commit:'5827b36',files:frozen},implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

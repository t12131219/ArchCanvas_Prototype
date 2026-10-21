'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/normal-returns/current',base='445a201',cache='/tmp/archcanvas-normal-returns-before-'+base;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const frozen=read('verification/normal-returns/current/snapshot.json').files;
for(const [f,h]of Object.entries(frozen))assert.equal(sha(cache+'/'+path.basename(f)),h,'freeze_normal_returns.py');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const large=process.argv.includes('--large'),requests=read('verification/coincident-ports/current/requests.json').cases;
const cases=large?requests.filter(c=>c.large):[
 ...requests.filter(c=>!c.large),
 ...read('verification/normal-returns/current/extraction.json').rows.map(r=>{
  const ir=read(r.input),state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles'},g=E.project(ir,{...state,paperNormalReturns:false});
  return {name:'Invocation-'+r.entry,input:r.input,state:{...state,paperAuto:false,open:g.publication.open.filter(id=>!g.publication.return_regions?.rows.some(r=>r.group===id))}};
 })];
const files=[...Object.keys(frozen),'tools/audit_normal_returns.cjs','tests/normal-returns.test.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[];
for(const request of cases){
 const {name,input,state}=request,ir=read(input),original=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state),svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';
  assert.equal(JSON.stringify(ir),original);fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,quality:results.map(r=>({nodes:r.quality.nodes,wire:r.quality.wire_length,crossings:r.quality.line_geometry.crossings,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'normal-returns/1',base,baseline_sha256:frozen,implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

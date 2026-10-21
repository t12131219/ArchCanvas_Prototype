'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/contained-bypasses/current',base='daaa217',cache='/tmp/archcanvas-contained-bypasses-before-'+base;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const frozen=read('verification/contained-bypasses/current/snapshot.json').files;
for(const [f,h]of Object.entries(frozen))assert.equal(sha(cache+'/'+path.basename(f)),h,'freeze_contained_bypasses.py');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const large=process.argv.includes('--large'),requests=read('verification/coincident-ports/current/requests.json').cases;
const local=read('verification/contained-bypasses/current/extraction.json').rows.flatMap(row=>{
 const ir=read(row.input),baseState={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles'},g=E.project(ir,baseState);
 const state={...baseState,paperAuto:false,paperAdaptive:false,open:g.publication.open.filter(id=>g.idx.nodes.get(id)?.source_class!=='Choice')};
 return [{name:row.entry+'-closed',input:row.input,state},{name:row.entry+'-open',input:row.input,state:{...baseState,paperAuto:false,paperAdaptive:false,open:g.publication.open}}];
});
const cases=large?requests.filter(c=>c.large):[...requests.filter(c=>!c.large),...local];
const files=[...Object.keys(frozen),'tools/audit_contained_bypasses.cjs','tests/contained-bypasses.test.cjs'];
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
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'contained-bypasses/1',base,baseline_sha256:frozen,implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

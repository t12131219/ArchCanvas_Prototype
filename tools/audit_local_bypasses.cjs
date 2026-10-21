'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/local-bypasses/current',base='58124c7',cache='/tmp/archcanvas-local-bypasses-before-'+base;
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(cache,{recursive:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(root+'/'+f));
const frozen=read('verification/local-bypasses/current/snapshot.json').files,files=Object.keys(frozen);
for(const f of files)assert.equal(sha(cache+'/'+path.basename(f)),frozen[f],'run freeze_local_bypasses.py first');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const large=process.argv.includes('--large'),rows=[],cases=large?read('verification/coincident-ports/current/requests.json').cases.filter(c=>c.large):[
 ...read('verification/coincident-ports/current/requests.json').cases.filter(c=>!c.large),
 ...['TailMosaic','EscapingTail','InterruptedTail','ConditionalTail'].map(name=>({name,input:'verification/contract-stages/current/'+name+'.json',state:{mode:'source',paperMedium:'canvas',paperGranularity:'roles'}}))];
const producers=[...files,'tools/audit_local_bypasses.cjs'];const hashes=Object.fromEntries(producers.map(f=>[f,sha(root+'/'+f)]));
for(const request of cases){
 const {name,input,state}=request,ir=read(input),original=JSON.stringify(ir);console.log('START '+name);
 const a=B.render(ir,state),b=R.render(ir,state);assert.equal(JSON.stringify(ir),original);
 if(name==='Transformer-panel-0')assert.equal(a.svg,fs.readFileSync(root+'/verification/source-navigation/current/ui-main.svg','utf8'));
 const results=[];
 for(const [suffix,r]of [['before',a],['current',b]]){
  const prefix=name+'-'+suffix,svg=prefix+'.svg',document=prefix+'.layout.json';
  fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality});
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,nodes:b.graph.nodes.length,edges:b.graph.edges.length,wire:[a.prepared.quality.wire_length,b.prepared.quality.wire_length],crossings:[a.prepared.quality.line_geometry.crossings,b.prepared.quality.line_geometry.crossings],local:b.document.layout.local_bypasses?.length||0}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'local-bypasses/1',base,baseline_sha256:frozen,implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

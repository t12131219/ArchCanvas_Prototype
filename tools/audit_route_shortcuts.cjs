'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/route-shortcuts/current',cache='/tmp/archcanvas-route-shortcuts-before-b3eb8b1';
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7);fs.mkdirSync(out,{recursive:true});
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f);
const hashes=Object.fromEntries([...files,'semantic_studio/index.html','tests/route-shortcuts.test.cjs','tests/semantic_fixtures/route_shortcuts.py','tools/audit_route_shortcuts.cjs','tools/load_publication_renderer.cjs'].map(f=>[f,sha(root+'/'+f)]));
const frozen=Object.fromEntries(files.map(f=>[f,sha(cache+'/'+path.basename(f))]));
const oldDir='verification/unconsumed-dimensions/current/';
const previous=only?[read(oldDir+only+'-report.json').rows[0]]:read(oldDir+'small-report.json').rows;
const cases=previous.map(({name,input,state,kind})=>({name,input,state,kind}));
if(!only)for(const row of read('verification/route-shortcuts/current/extraction.json').rows){
 const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperCompact:true,paperAdaptive:false};
 cases.push({name:row.entry,input:row.input,kind:'fresh-source',state});
 cases.push({name:row.entry+'-open',input:row.input,kind:'fresh-source-open',
  state:{...state,paperAuto:false,open:read(row.input).nodes.filter(n=>n.kind==='composite').map(n=>n.id)}});
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
   results.push({...old,suffix,svg,document,reuse:{commit:'b3eb8b1',report:oldDir+name+'-report.json'}});continue;
  }
  console.log('START '+name+' '+suffix);const r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),raw);
  const svg=name+'-'+suffix+'.svg',document=name+'-'+suffix+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:r.prepared.quality,shortcuts:r.prepared.routing?.route_shortcuts||null});
  if(!only&&suffix==='before')assert.equal(R.render(ir,{...state,paperRouteShortcuts:false}).svg,r.svg);
 }
 rows.push({...request,input_sha256:sha(root+'/'+input),results});
 console.log(JSON.stringify({name,results:results.map(r=>({suffix:r.suffix,crossings:r.quality.line_geometry.crossings,wire:r.quality.wire_length,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
assert.ok(rows.length);fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'route-shortcuts/1',baseline:{commit:'b3eb8b1',files:frozen},implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

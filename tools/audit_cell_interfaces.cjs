'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/cell-interfaces/current',cache='/tmp/archcanvas-cell-interfaces-before-e098d10/semantic_studio';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(root+'/'+f));
const load=require('./load_publication_renderer.cjs'),B=load(cache),R=load(root+'/semantic_studio');
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 'semantic_studio/index.html','tests/cell-interfaces.test.cjs','tests/test_cell_interfaces.py','tests/semantic_fixtures/cell_interfaces.py',
 'tools/audit_cell_interfaces.cjs','tools/load_publication_renderer.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)]));
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7),cases=[];
if(only){
 const old=read('verification/route-shortcuts/current/'+only+'-report.json').rows[0];cases.push({name:only,input:old.input,state:old.state});
}else for(const row of read('verification/cell-interfaces/current/extraction.json').rows){
 const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false},ir=read(row.input);
 cases.push({name:row.entry,input:row.input,state},
  {name:row.entry+'-open',input:row.input,state:{...state,paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)}});
 const relations=R.render?require('../semantic_studio/architecture.js').build(ir).relation_graph.relations:[];
 for(const r of relations.filter(r=>r.type==='state-interface'&&r.properties.interface_kind==='single-step'))
  cases.push({name:row.entry+'-detail',input:row.input,state:{...state,paperRelation:'node:'+r.node},relation:r.id});
}
const rows=[];
for(const request of cases){
 const ir=read(request.input),raw=JSON.stringify(ir),results=[];
 for(const [suffix,renderer]of [['before',B],['current',R]]){
  if(only&&suffix==='before'){
   const previous=read('verification/route-shortcuts/current/'+only+'-report.json'),old=previous.rows[0].results.find(r=>r.suffix==='current');
   for(const [f,h]of Object.entries(previous.implementation_sha256))if(f.startsWith('semantic_studio/')&&f.endsWith('.js'))assert.equal(sha(cache+'/'+path.basename(f)),h);
   assert.equal(sha(root+'/'+request.input),previous.rows[0].input_sha256);assert.deepEqual(request.state,previous.rows[0].state);
   for(const key of ['svg','document']){assert.equal(sha(root+'/verification/route-shortcuts/current/'+old[key]),old[key+'_sha256']);fs.copyFileSync(root+'/verification/route-shortcuts/current/'+old[key],out+'/'+request.name+'-before.'+(key==='svg'?'svg':'layout.json'));}
   results.push({...old,suffix,svg:request.name+'-before.svg',document:request.name+'-before.layout.json',reuse:{commit:'e098d10',report:'verification/route-shortcuts/current/'+only+'-report.json'}});continue;
  }
  console.log('START '+request.name+' '+suffix);
  const start=Date.now(),r=renderer.render(ir,request.state),svg=request.name+'-'+suffix+'.svg',document=request.name+'-'+suffix+'.layout.json';
  assert.equal(JSON.stringify(ir),raw);fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
  results.push({suffix,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),quality:JSON.parse(JSON.stringify(r.prepared.quality)),elapsed_ms:Date.now()-start});
 }
 rows.push({...request,input_sha256:sha(root+'/'+request.input),results});
 console.log(JSON.stringify({name:request.name,results:results.map(r=>({suffix:r.suffix,nodes:r.quality.visible_nodes,crossings:r.quality.line_geometry.crossings,issues:r.quality.issues}))}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'producer changed '+f);
fs.writeFileSync(out+'/'+(only||'small')+'-report.json',JSON.stringify({schema:'cell-interfaces/1',baseline:'e098d10',implementation_sha256:hashes,rows,goal_complete:false},null,2)+'\n');

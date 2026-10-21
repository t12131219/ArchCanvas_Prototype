'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/empty-bands/current',out=root+'/'+folder;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),R=load(root+'/semantic_studio'),B=load('/tmp/archcanvas-empty-bands-before-b37c74e');
const snapshot=read(folder+'/snapshot.json'),files=[...Object.keys(snapshot.files),'semantic_studio/index.html','tools/audit_empty_bands.cjs','tests/empty-bands.test.cjs','tests/empty-band-fixtures.cjs',folder+'/requests.json'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,result){const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:result.graph.nodes.length,edges:result.graph.edges.length,quality:result.prepared.quality});
 const q=result.prepared.quality;console.log(JSON.stringify({name,nodes:result.graph.nodes.length,edges:result.graph.edges.length,height:q.native_height_px,crossings:q.line_geometry.crossings,wire:q.wire_length,compacted:!!result.prepared.routing.empty_band_compaction?.accepted}));return name;}
const large=process.argv.includes('--large'),cases=[];
if(!large){
 const {fixture,state}=require('../tests/empty-band-fixtures.cjs');
 for(const [name,guard]of [['ForeignPassage',{}],['UnknownPassage',{kind:'opaque'}],['StatePassage',{kind:'state'}],['SharedPassage',{identity_display:{kind:'same-object-calls',label:'shared',invocation:1,count:2}}]]){
  const ir=fixture();Object.assign(ir.nodes[2],guard);const input=folder+'/'+name+'.json';fs.writeFileSync(root+'/'+input,JSON.stringify(ir,null,2)+'\n');cases.push({name,input,state});}
}
cases.push(...read(folder+'/requests.json').cases.filter(c=>c.large===large));
for(const {name,input,state}of cases){const ir=read(input),original=JSON.stringify(ir);console.log('START '+name);
 const a=B.render(ir,state),b=R.render(ir,state);assert.equal(JSON.stringify(ir),original);assert.equal(R.render(ir,{...state,paperEmptyBandCompaction:false}).svg,a.svg,'exact new-policy opt-out');
 comparisons.push({name,before:save(name+'-before',input,a),after:save(name+'-current',input,b)});
 if(name==='ForeignPassage'){
  const folded=R.render(ir,{...state,open:[]});save(name+'-folded',input,folded);assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);assert.equal(R.render(folded.document.ir,folded.document.state).svg,folded.svg);
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'empty-bands/1',implementation_sha256:hashes,baseline:snapshot,synthetic_inputs:['ForeignPassage','UnknownPassage','StatePassage','SharedPassage'],rows,comparisons,goal_complete:false},null,2)+'\n');

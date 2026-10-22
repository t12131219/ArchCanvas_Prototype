'use strict';
// Replay the committed frontier states; never synthesize a "before" SVG.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const load=require('./load_publication_renderer.cjs'),R=load('./semantic_studio');
const out='verification/stream-alignment/current/',baseline='verification/composition-rounds/current/';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const implementation=Object.fromEntries(fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')||f==='index.html').map(f=>['semantic_studio/'+f,sha('semantic_studio/'+f)]));
const previous=JSON.parse(fs.readFileSync(baseline+'suite-report.json')),rows=[];
const normalized=value=>JSON.parse(JSON.stringify(value));
const bindings=doc=>doc.layout.edges.map(({route,...e})=>e);
function capture(name,input,state,before,beforeSvg){
 const ir=JSON.parse(fs.readFileSync(input)),raw=JSON.stringify(ir),r=R.render(ir,state),doc=normalized(r.document);
 assert.equal(JSON.stringify(ir),raw);assert.deepEqual(doc.ir,ir);
 assert.deepEqual(doc.layout.nodes.map(n=>n.id),before.layout.nodes.map(n=>n.id));
 assert.deepEqual(bindings(doc),bindings(before));
 for(const key of ['node_accounting','edge_accounting'])assert.deepEqual(doc.layout[key],before.layout[key]);
 fs.writeFileSync(out+name+'.svg',r.svg);fs.writeFileSync(out+name+'.layout.json',JSON.stringify(doc));
 const row={name,input,input_sha256:sha(input),state,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(out+name+'.svg'),
  document_sha256:sha(out+name+'.layout.json'),before_svg:beforeSvg,before_sha256:sha(path.resolve(out,beforeSvg)),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,before_quality:before.diagnostics.publication,
  stream_alignments:r.graph.publication.composition.stream_alignments||[],composition_status:r.graph.publication.composition.status||'composed',
  same_frontier_bindings_accounting:true};rows.push(row);
 console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,alignments:row.stream_alignments.length,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,issues:row.quality.issues}));
}
for(const row of previous.rows){
 assert.equal(sha(baseline+row.svg),row.svg_sha256);assert.equal(sha(baseline+row.document),row.document_sha256);
 capture(row.name,row.input,row.state,JSON.parse(fs.readFileSync(baseline+row.document)),'../../composition-rounds/current/'+row.svg);
}
// This directory must be an actual frozen checkout supplied by the caller.
const frozen=process.argv[2];assert.ok(frozen,'Pass a frozen renderer directory for new generic before captures');
const B=load(frozen),input=out+'SensorFusion.json',ir=JSON.parse(fs.readFileSync(input));
for(const direction of ['up','down']){
 const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'all',paperComposition:'architecture',paperDirection:direction,
  paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};
 const name='SensorFusion-'+direction,b=B.render(ir,state);
 fs.writeFileSync(out+name+'-before.svg',b.svg);fs.writeFileSync(out+name+'-before.layout.json',JSON.stringify(b.document));
 capture(name,input,state,normalized(b.document),name+'-before.svg');
}
for(const [p,h]of Object.entries(implementation))assert.equal(sha(p),h,'Producer changed during capture');
fs.writeFileSync(out+'suite-report.json',JSON.stringify({schema:'stream-alignment-suite/1',baseline_commit:'1426e9c114559ddabfb3372e9ac15fc0e37eeda5',implementation_sha256:implementation,rows,goal_complete:false},null,2)+'\n');

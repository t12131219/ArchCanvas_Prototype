'use strict';
// Fixture selection is audit policy. Production layout never reads these names.
const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict');
const load=require('./load_publication_renderer.cjs'),R=load('./semantic_studio'),B=load('/tmp/archcanvas-path-rows-67039ef/semantic_studio');
const out='verification/path-rows/current/',read=p=>JSON.parse(fs.readFileSync(p));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),plain=x=>JSON.parse(JSON.stringify(x));
const files=[...fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')||f==='index.html').map(f=>'semantic_studio/'+f),
 'tools/capture_path_rows.cjs','tools/load_publication_renderer.cjs','tests/semantic_fixtures/path_rows.py'];
const hashes=Object.fromEntries(files.map(p=>[p,sha(p)])),rows=[];
const partition=b=>Object.fromEntries(Object.entries(b).map(([k,ids])=>[k,ids.slice().sort()]));
function capture(name,input,state,historical){
 const ir=read(input),raw=JSON.stringify(ir),r=R.render(ir,state),before=B.render(ir,state);
 assert.equal(JSON.stringify(ir),raw);assert.deepEqual(plain(r.document.ir),ir);
 assert.deepEqual(plain(r.graph.edges),plain(before.graph.edges));
 assert.deepEqual(r.graph.nodes.map(n=>n.id).sort(),before.graph.nodes.map(n=>n.id).sort());
 for(const key of ['node_accounting','edge_accounting'])assert.deepEqual(plain(partition(r.graph[key])),plain(partition(before.graph[key])));
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg,'save/reopen '+name);
 let beforeSvg=name+'.before.svg',beforeDoc=name+'.before.layout.json';
 if(historical){
  assert.equal(sha(historical.dir+historical.svg),historical.svg_sha256);
  assert.equal(before.svg,fs.readFileSync(historical.dir+historical.svg,'utf8'),'authoritative old SVG '+name);
  beforeSvg='../../'+historical.dir.split('/')[1]+'/current/'+historical.svg;
  // Prior rounds may have identical physical SVGs but older recoverable
  // heading annotations. Audit facts against the actual frozen HEAD, too.
  fs.writeFileSync(out+beforeDoc,JSON.stringify(before.document));
 }else{
  fs.writeFileSync(out+beforeSvg,before.svg);fs.writeFileSync(out+beforeDoc,JSON.stringify(before.document));
 }
 fs.writeFileSync(out+name+'.svg',r.svg);fs.writeFileSync(out+name+'.layout.json',JSON.stringify(r.document));
 rows.push({name,input,input_sha256:sha(input),state,svg:name+'.svg',document:name+'.layout.json',
  before_svg:beforeSvg,before_document:beforeDoc,svg_sha256:sha(out+name+'.svg'),document_sha256:sha(out+name+'.layout.json'),
  before_sha256:sha(out+beforeSvg),before_document_sha256:sha(out+beforeDoc),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  quality:r.prepared.quality,before_quality:before.prepared.quality,changed:r.svg!==before.svg,
  columns:r.graph.publication.composition?.module_columns||[],path_rows:r.graph.publication.composition?.path_rows||[],path_selection:r.prepared.routing.architecture_path_rows||null,same_frontier_bindings_partition:true,save_reopen_exact:true});
 if(r.prepared.routing.architecture_path_rows){
  const vertical=R.render(ir,{...state,paperArchitecturePathRows:false});
  fs.writeFileSync(out+name+'.vertical.svg',vertical.svg);fs.writeFileSync(out+name+'.vertical.layout.json',JSON.stringify(vertical.document));
  Object.assign(rows.at(-1),{vertical_svg:name+'.vertical.svg',vertical_document:name+'.vertical.layout.json',vertical_svg_sha256:sha(out+name+'.vertical.svg'),vertical_document_sha256:sha(out+name+'.vertical.layout.json'),vertical_quality:vertical.prepared.quality});
 }
 const q=r.prepared.quality,b=before.prepared.quality;
 console.log(JSON.stringify({name,changed:r.svg!==before.svg,columns:rows.at(-1).columns.length,issues:q.issues,
  crossings:[b.line_geometry.crossings,q.line_geometry.crossings],bounds:[q.native_width_px,q.native_height_px]}));
}
for(const directory of ['architecture-columns']){
 const dir='verification/'+directory+'/current/';
 for(const row of read(dir+'suite-report.json').rows){
  assert.equal(sha(row.input),row.input_sha256);capture(row.name,row.input,row.state,{...row,dir});
 }
}
for(const name of ['SpatialPipeline','BranchedPipeline'])for(const direction of ['up','down']){
 const input=out+name+'.json',ir=read(input),s={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperComposition:'architecture',paperDirection:direction,paperAdaptive:false,paperCompact:true};
 capture(name+'-'+direction+'-F0',input,s);
 capture(name+'-'+direction+'-F1',input,{...s,paperGranularity:'all',paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
}
for(const [p,h]of Object.entries(hashes))assert.equal(sha(p),h,'producer changed during capture');
fs.writeFileSync(out+'suite-report.json',JSON.stringify({schema:'path-rows-suite/1',baseline_commit:'67039efbb524454825d9be2953024ee1df800d65',
 implementation_sha256:hashes,rows,goal_complete:false,scope:'Finite cross-family evidence for measured short serial computation paths; all canonical facts and further expansion retained. No universal layout guarantee.'},null,2)+'\n');

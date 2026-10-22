'use strict';
// Compare the same 44 cuts against actual committed captures from 3d56335.
const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict');
const R=require('./load_publication_renderer.cjs')('./semantic_studio');
const out='verification/architecture-proportions/current/',base='verification/stream-alignment/current/';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const implementation=Object.fromEntries(fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')||f==='index.html').map(f=>['semantic_studio/'+f,sha('semantic_studio/'+f)]));
const suite=JSON.parse(fs.readFileSync(base+'suite-report.json')),rows=[],norm=x=>JSON.parse(JSON.stringify(x));
const bindings=d=>d.layout.edges.map(({route,...e})=>e);
for(const row of suite.rows){
 assert.equal(sha(base+row.svg),row.svg_sha256);assert.equal(sha(base+row.document),row.document_sha256);
 const before=JSON.parse(fs.readFileSync(base+row.document)),ir=JSON.parse(fs.readFileSync(row.input)),raw=JSON.stringify(ir),r=R.render(ir,row.state),doc=norm(r.document);
 assert.equal(JSON.stringify(ir),raw);assert.deepEqual(doc.ir,ir);
 // A measured dependency fallback may enumerate the same nodes in another
 // paint order. Identity sets and full edge records, not paint order, prove
 // that this is still the same semantic cut.
 assert.deepEqual(doc.layout.nodes.map(n=>n.id).sort(),before.layout.nodes.map(n=>n.id).sort());assert.deepEqual(bindings(doc),bindings(before));
 for(const key of ['node_accounting','edge_accounting'])assert.deepEqual(doc.layout[key],before.layout[key]);
 for(const key of ['expression_coverage','summary_coverage']){
  const fulfilled=d=>d[key].filter(x=>x.status==='fulfilled').map(x=>x.goal).sort();assert.deepEqual(fulfilled(doc),fulfilled(before),key);
 }
 fs.writeFileSync(out+row.svg,r.svg);fs.writeFileSync(out+row.document,JSON.stringify(doc));
 const entry={...row,svg_sha256:sha(out+row.svg),document_sha256:sha(out+row.document),
  before_svg:'../../stream-alignment/current/'+row.svg,before_sha256:row.svg_sha256,before_quality:row.quality,
  quality:r.prepared.quality,stream_alignments:r.graph.publication.composition.stream_alignments||[],
  source_kind_notes:r.graph.publication.composition.source_kind_notes||[],composition_status:r.graph.publication.composition.status||'composed',
  same_frontier_bindings_accounting:true,fulfilled_goals_preserved:true};rows.push(entry);
 console.log(JSON.stringify({name:row.name,nodes:row.nodes,edges:row.edges,width:entry.quality.native_width_px,height:entry.quality.native_height_px,
  crossings:entry.quality.line_geometry.crossings,issues:entry.quality.issues,status:entry.composition_status}));
}
fs.copyFileSync(base+'SensorFusion.json',out+'SensorFusion.json');
for(const [p,h]of Object.entries(implementation))assert.equal(sha(p),h,'Producer changed during capture');
fs.writeFileSync(out+'suite-report.json',JSON.stringify({schema:'architecture-proportions-suite/1',baseline_commit:'3d563357d44bfe959239d339d3a6671079e2a507',implementation_sha256:implementation,rows,goal_complete:false},null,2)+'\n');

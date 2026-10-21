'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const folder='verification/local-bypasses/current',file=folder+'/MixedWeave-current.layout.json',d=JSON.parse(fs.readFileSync(file)),original=JSON.stringify(d.ir);
const saved=R.render(d.ir,d.state);assert.equal(saved.svg,fs.readFileSync(folder+'/MixedWeave-current.svg','utf8'));
assert.equal(R.render(d.ir,{...d.state,paperLocalBypasses:false}).svg,fs.readFileSync(folder+'/MixedWeave-before.svg','utf8'));
const folded=R.render(d.ir,{...d.state,paperAuto:false,paperAdaptive:false,open:[]});assert.ok(folded.graph.nodes.length<saved.graph.nodes.length);
assert.equal(R.render(d.ir,d.state).svg,saved.svg);
const raw=E.project(d.ir,{view:'source',mode:'source',details:true,open:d.ir.nodes.map(n=>n.id)});
assert.deepEqual(raw.nodes.map(n=>n.id).sort(),d.ir.nodes.map(n=>n.id).sort());assert.deepEqual(raw.edges.map(e=>e.id).sort(),d.ir.edges.map(e=>e.id).sort());
assert.equal(JSON.stringify(d.ir),original);
const report={schema:'local-bypass-roundtrip/1',input:file,document_sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
 saved_svg_identical:true,opt_out_matches_frozen_renderer:true,collapse_restore_identical:true,canonical_ir_unchanged:true,
 semantic_nodes:saved.graph.nodes.length,collapsed_nodes:folded.graph.nodes.length,all_source_nodes:raw.nodes.length,all_source_edges:raw.edges.length,
 scope:'Actual renderer serialization and raw source projection on one unfamiliar composition; no full-source SVG or browser performance claim'};
fs.writeFileSync(folder+'/roundtrip-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

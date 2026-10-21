/* Serialize the actual rejected geometry, without bypassing production selection. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),out=root+'/verification/region-followers/current';
const load=require('./load_publication_renderer.cjs'),R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true}),L=require('../semantic_studio/architecture-layout.js');
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const report=read('render-report.json'),row=report.rows.find(x=>x.name==='GuardedInputs-current'),doc=read(row.document);
assert.equal(row.receipt.accepted,false);
const baseline=R.prepareFigure(doc.ir,{...doc.state,paperRegionFollowers:false});
const proposal=L.regionFollowers(baseline.graph.idx,baseline.graph.nodes,baseline.graph.edges,baseline.graph.positions);
assert.deepEqual(JSON.parse(JSON.stringify(proposal.records)),row.receipt.records);
const graph={...baseline.graph,positions:proposal.positions,constraint_receipts:JSON.parse(JSON.stringify(baseline.graph.constraint_receipts))};
const prepared=R.prepare(graph);E.auditConstraintRoutes(graph,prepared.routes);
const candidate=R.renderPrepared(doc.ir,doc.state,{graph,prepared});
const original=R.renderPrepared(doc.ir,doc.state,baseline);
assert.equal(original.svg,fs.readFileSync(out+'/'+row.svg,'utf8'));
assert.equal(prepared.quality.wire_length,row.receipt.candidate.wire_length);
assert.equal(prepared.quality.line_geometry.crossings,row.receipt.candidate.crossings);
assert.ok(prepared.quality.wire_length>baseline.prepared.quality.wire_length);
fs.writeFileSync(out+'/GuardedInputs-rejected.svg',candidate.svg);
fs.writeFileSync(out+'/GuardedInputs-rejected.layout.json',JSON.stringify(candidate.document));
const files=['GuardedInputs-rejected.svg','GuardedInputs-rejected.layout.json'];
fs.writeFileSync(out+'/rejection-report.json',JSON.stringify({schema:'region-follower-rejection/1',
 render_report_sha256:sha(out+'/render-report.json'),producer_sha256:sha(__filename),
 files_sha256:Object.fromEntries(files.map(f=>[f,sha(out+'/'+f)])),baseline_svg:row.svg,
 before_wire:baseline.prepared.quality.wire_length,candidate_wire:prepared.quality.wire_length,
 before_crossings:baseline.prepared.quality.line_geometry.crossings,candidate_crossings:prepared.quality.line_geometry.crossings,
 baseline_preserved:true,records:row.receipt.records,passed:true},null,2)+'\n');
console.log('Actual rejected SVG serialized; production SVG retained');

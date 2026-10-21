'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const R=require('../semantic_studio/publication-renderer.js'),out='verification/serial-paths/experiment/';
const read=f=>fs.readFileSync(out+f,'utf8'),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const report=JSON.parse(read('ui-report.json')),input=JSON.parse(read('LongCurve.json')),rows=[];
for(const name of ['folded','frame','operations']){
 const doc=JSON.parse(read('ui-'+name+'.json')),svg=read('ui-'+name+'.svg'),r=R.render(doc.ir,doc.state);
 assert.deepEqual(doc.ir,input);assert.equal(svg,r.svg);assert.deepEqual(r.prepared.quality.issues,[]);
 rows.push({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,svg_sha256:sha(svg),document_sha256:sha(read('ui-'+name+'.json')),cli_svg_equal:true});
}
assert.equal(read('ui-reopen.svg'),read('ui-frame.svg'));assert.equal(read('ui-refold.svg'),read('ui-folded.svg'));assert.equal(read('ui-returned.svg'),read('ui-folded.svg'));
const raw=JSON.parse(read('ui-source.json'));assert.deepEqual(raw.ir,input);assert.equal(raw.state.view,'source');
const visible=[...read('ui-source.svg').matchAll(/<g[^>]*class="node[^\"]*"[^>]*data-id="([^\"]+)"/g)].map(m=>m[1]);
assert.equal(visible.length,input.nodes.length);assert.deepEqual(visible.sort(),input.nodes.map(n=>n.id).sort());
assert.deepEqual(report.sequence,[5,12,12,19,5,34,5]);assert.ok(report.reopen_svg_equal&&report.refold_svg_equal&&report.returned_svg_equal&&report.raw_ir_unchanged);
fs.writeFileSync(out+'ui-validation.json',JSON.stringify({schema:'serial-paths-ui-validation/1',rows,sequence:report.sequence,
 raw_source_nodes:visible.length,all_original_ids_visible:true,canonical_ir_unchanged:true,byte_identical_reopen_refold_return:true,
 scope:'Actual editor exports compared to CLI; raw-source node identities restored. No thousands-node routing claim.'},null,2)+'\n');
console.log(JSON.stringify({states:rows.length,raw_nodes:visible.length,passed:true}));

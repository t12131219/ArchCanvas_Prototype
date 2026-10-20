'use strict';
// Re-render the documents exported through the real editor's export dialog.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../verification/dimension-paths/current'),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const keys=['saved','expanded','reopened','refolded'],docs=keys.map(k=>read('dimension-ui-'+k+'.json'));
const results=docs.map(d=>R.render(d.ir,d.state)),observed=read('ui-observations.json');
assert.deepEqual(results.map(r=>r.graph.nodes.length),[9,12,12,9]);
assert.deepEqual([observed.initial_nodes,observed.expanded_nodes,observed.reopened_nodes,observed.refolded_nodes],[9,12,12,9]);
assert.ok(observed.summary_inspected&&observed.source_binding_inspected&&observed.dimension_proof_inspected);
for(const [i,d]of docs.entries()){
 assert.deepEqual(d.ir,docs[0].ir);assert.deepEqual(results[i].prepared.quality.issues,[]);
 for(const [key,items]of [['node_accounting',d.ir.nodes],['edge_accounting',d.ir.edges]]){
  const ids=Object.values(results[i].graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());
 }
}
assert.equal(results[0].svg,fs.readFileSync(path.join(out,'dimension-ui.svg'),'utf8'));
assert.equal(results[0].svg,results[3].svg);assert.equal(results[1].svg,results[2].svg);
const closed=results[0].graph.publication.local_pipelines.rows,opened=results[1].graph.publication.local_pipelines.rows;
assert.equal(closed.length,1);assert.ok(closed.every(r=>r.status==='summary'&&!r.detailed_operations_exposed));
const smooth=closed.find(r=>r.operations.length===3);assert.ok(smooth);
assert.deepEqual(opened.find(r=>r.node===smooth.node).bindings,smooth.bindings);
assert.ok(opened.find(r=>r.node===smooth.node).detailed_operations_exposed);
const proof=results[1].graph.publication.configuration_arithmetic.find(r=>r.expression==='h * d');assert.ok(proof?.configuration_only);
assert.ok(results[1].graph.node_accounting.attached.includes(proof.node));
const view=results[1].graph.nodes.find(n=>n.operator==='reshape');assert.ok(results[1].graph.annotations.get(view.id).some(n=>n.configuration_proof?.some(p=>p.node===proof.node)));
const artifacts=['dimension-ui.svg','dimension-ui.png','dimension-ui-expanded.png','ui-observations.json',...keys.map(k=>'dimension-ui-'+k+'.json')];
const report={schema:'dimension-paths-ui/1',render_report_sha256:sha('render-report.json'),browser:observed.browser,
 node_counts:[9,12,12,9],svg_matches_cli:true,canonical_unchanged:true,reopened:true,save_reopen_deterministic:true,
 refold_same_svg:true,summary_inspected:true,bindings_preserved:true,dimension_proof_inspected:true,quality_issues:results.map(r=>r.prepared.quality.issues),
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

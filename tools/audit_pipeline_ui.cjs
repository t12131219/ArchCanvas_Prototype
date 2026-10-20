'use strict';
// Re-render the documents exported through the real editor's export dialog.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../verification/local-pipelines/current'),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const keys=['saved','expanded','reopened','refolded'],docs=keys.map(k=>read('pipeline-ui-'+k+'.json'));
const results=docs.map(d=>R.render(d.ir,d.state)),observed=read('ui-observations.json');
assert.deepEqual(results.map(r=>r.graph.nodes.length),[7,10,10,7]);
assert.deepEqual([observed.initial_nodes,observed.expanded_nodes,observed.reopened_nodes,observed.refolded_nodes],[7,10,10,7]);
assert.ok(observed.summary_inspected&&observed.source_binding_inspected);
for(const [i,d]of docs.entries()){
 assert.deepEqual(d.ir,docs[0].ir);assert.deepEqual(results[i].prepared.quality.issues,[]);
 for(const [key,items]of [['node_accounting',d.ir.nodes],['edge_accounting',d.ir.edges]]){
  const ids=Object.values(results[i].graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());
 }
}
assert.equal(results[0].svg,fs.readFileSync(path.join(out,'pipeline-ui.svg'),'utf8'));
assert.equal(results[0].svg,results[3].svg);assert.equal(results[1].svg,results[2].svg);
const closed=results[0].graph.publication.local_pipelines.rows,opened=results[1].graph.publication.local_pipelines.rows;
assert.equal(closed.length,2);assert.ok(closed.every(r=>r.status==='summary'&&!r.detailed_operations_exposed));
const smooth=closed.find(r=>r.operations.length===3);assert.ok(smooth);
assert.deepEqual(opened.find(r=>r.node===smooth.node).bindings,smooth.bindings);
assert.ok(opened.find(r=>r.node===smooth.node).detailed_operations_exposed);
const artifacts=['pipeline-ui.svg','pipeline-ui.png','pipeline-ui-expanded.png','ui-observations.json',...keys.map(k=>'pipeline-ui-'+k+'.json')];
const report={schema:'local-pipelines-ui/1',render_report_sha256:sha('render-report.json'),browser:observed.browser,
 node_counts:[7,10,10,7],svg_matches_cli:true,canonical_unchanged:true,reopened:true,save_reopen_deterministic:true,
 refold_same_svg:true,summary_inspected:true,bindings_preserved:true,quality_issues:results.map(r=>r.prepared.quality.issues),
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

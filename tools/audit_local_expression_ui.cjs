'use strict';
// Independently render the exact documents exported by the actual browser UI.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/local-expressions/current'),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const observed=read('ui-observations.json'),docs=['saved','expanded','refolded'].map(key=>read('mixed-ui-'+key+'.json'));
assert.equal(observed.initial_nodes,29);assert.match(observed.expanded_status,/33 个图元/);assert.match(observed.refolded_status,/29 个图元/);assert.equal(observed.reopened_nodes,33);assert.ok(observed.local_expression_inspected);
for(const doc of docs)assert.deepEqual(doc.ir,docs[0].ir);
const results=docs.map(d=>R.render(d.ir,d.state));
assert.deepEqual(results.map(r=>r.graph.nodes.length),[29,33,29]);
assert.equal(results[0].svg,fs.readFileSync(path.join(out,'mixed-ui.svg'),'utf8'));
assert.deepEqual(results[0].graph.nodes.map(n=>n.id).sort(),results[2].graph.nodes.map(n=>n.id).sort());
for(const [i,r]of results.entries()){
 assert.equal(R.render(docs[i].ir,docs[i].state).svg,r.svg);
 for(const [key,items]of [['node_accounting',docs[i].ir.nodes],['edge_accounting',docs[i].ir.edges]]){
  const all=Object.values(r.graph[key]).flat();assert.equal(all.length,new Set(all).size);assert.deepEqual(all.sort(),items.map(n=>n.id).sort());
 }
 assert.equal(r.graph.publication.local_expressions.requests.find(r=>r.type==='gated-product').status,'fulfilled');
}
assert.deepEqual(results[1].prepared.quality.issues,['port-label-requires-note']);
const report={schema:'local-expression-ui/1',render_report_sha256:sha('render-report.json'),observations_sha256:sha('ui-observations.json'),
 browser:observed.browser,node_counts:[29,33,29],reopened:true,local_expression_inspected:true,canonical_unchanged:true,refolded_same_frontier:true,
 svg_matches_cli:true,save_reopen_deterministic:true,automatic_to_manual_svg_identical:results[0].svg===results[2].svg,
 deeper_manual_quality:results[1].prepared.quality,
 scope:'Actual UI role inspection, save/reopen/expand/refold. Independent rendering verifies the exported states. Auto/manual layout refinement can differ; the deeper manual view still has one role label in a note.'};
for(const [key,file]of [['saved','mixed-ui-saved.json'],['expanded','mixed-ui-expanded.json'],['refolded','mixed-ui-refolded.json'],['svg','mixed-ui.svg'],['screenshot','mixed-ui.png']])report[key+'_sha256']=sha(file);
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({node_counts:report.node_counts,svg_matches_cli:true,manual_deeper_issues:report.deeper_manual_quality.issues}));

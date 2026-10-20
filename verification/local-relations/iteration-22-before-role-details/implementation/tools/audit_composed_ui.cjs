'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../verification/composed-paths/current'),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const keys=['saved','opened','detail','reopened','refolded'],docs=keys.map(k=>read('composed-ui-'+k+'.json'));
const results=docs.map(d=>R.render(d.ir,d.state)),observed=read('ui-observations.json');
assert.deepEqual(results.map(r=>r.graph.nodes.length),[7,9,13,13,7]);assert.deepEqual(observed.node_counts,[7,9,13,13,7]);
assert.ok(observed.summary_inspected&&observed.source_boundaries_inspected&&observed.binding_inspected);
for(const [i,d]of docs.entries()){
 assert.deepEqual(d.ir,docs[0].ir);assert.deepEqual(results[i].prepared.quality.issues,[]);
 for(const [key,items]of [['node_accounting',d.ir.nodes],['edge_accounting',d.ir.edges]]){
  const ids=Object.values(results[i].graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());
 }
}
assert.equal(results[0].svg,fs.readFileSync(path.join(out,'composed-ui.svg'),'utf8'));
assert.equal(results[0].svg,results[4].svg);assert.equal(results[2].svg,results[3].svg);
const composed=r=>r.graph.publication.local_pipelines.rows.find(p=>p.source_boundaries.length>1);
const summary=composed(results[0]);assert.equal(summary.status,'summary');assert.equal(summary.source_boundaries.length,3);
assert.equal(composed(results[1]).detailed_operations_exposed,false);assert.equal(composed(results[2]).detailed_operations_exposed,true);
for(const r of results){const p=composed(r);assert.deepEqual(p.bindings,summary.bindings);assert.deepEqual(p.source_boundaries,summary.source_boundaries);}
const artifacts=['composed-ui.svg','composed-ui.png','composed-ui-detail.png','ui-observations.json',...keys.map(k=>'composed-ui-'+k+'.json')];
const report={schema:'composed-paths-ui/1',render_report_sha256:sha('render-report.json'),browser:observed.browser,
 node_counts:[7,9,13,13,7],svg_matches_cli:true,canonical_unchanged:true,reopened:true,save_reopen_deterministic:true,
 refold_same_svg:true,summary_inspected:true,source_boundaries_inspected:true,bindings_preserved:true,quality_issues:results.map(r=>r.prepared.quality.issues),
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

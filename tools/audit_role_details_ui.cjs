'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../verification/role-details/current'),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const keys=['base','selected','detail','reopened','refolded'],docs=keys.map(k=>read('ui-'+k+'.json')),results=docs.map(d=>R.render(d.ir,d.state));
const observed=read('ui-observations.json'),counts=results.map(r=>r.graph.nodes.length);
assert.deepEqual(counts,[11,17,36,17,11]);assert.deepEqual(counts,observed.node_counts);
assert.ok(observed.local_button_used&&observed.receipt_inspected&&observed.reopened_selected&&observed.source_detail_available);
for(const [i,r]of results.entries()){
 assert.deepEqual(docs[i].ir,docs[0].ir);assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(r.graph.publication.role_frontier.rule_version,'role-frontier/2');
 for(const [key,objects]of [['node_accounting',docs[i].ir.nodes],['edge_accounting',docs[i].ir.edges]]){
  const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),objects.map(n=>n.id).sort());
 }
}
assert.equal(results[0].svg,results[4].svg);assert.equal(results[1].svg,results[3].svg);
assert.equal(results[1].svg,fs.readFileSync(path.join(out,'SameSource-selected.svg'),'utf8'));
assert.equal(results[1].svg,fs.readFileSync(path.join(out,'ui-selected.svg'),'utf8'));
assert.deepEqual(docs[1].state.paperRoleDetails,docs[3].state.paperRoleDetails);
const artifacts=['ui-selected.svg','ui-selected.png','ui-observations.json',...keys.map(k=>'ui-'+k+'.json')];
const report={schema:'role-details-ui/1',render_report_sha256:sha('render-report.json'),node_counts:counts,browser:observed.browser,
 canonical_unchanged:true,svg_matches_cli:true,reopened_same_svg:true,refold_same_svg:true,quality_issues:results.map(r=>r.prepared.quality.issues),
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({counts,passed:true}));

'use strict';
// Verify the actual editor's exported documents; no hidden UI state is read.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,process.argv.includes('--stability')?'../verification/stage-stability/current':'../verification/contract-stages/current'),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const keys=['saved','expanded','reopened','refolded','all-expanded'],docs=keys.map(k=>read('stage-ui-'+k+'.json'));
const results=docs.map(d=>R.render(d.ir,d.state)),observed=read('ui-observations.json'),counts=[11,13,13,11,15];
assert.deepEqual(results.map(r=>r.graph.nodes.length),counts);
assert.deepEqual([observed.initial_nodes,observed.expanded_nodes,observed.reopened_nodes,observed.refolded_nodes,observed.all_expanded_nodes],counts);
assert.ok(observed.stage_inspected&&observed.source_binding_inspected&&observed.all_stages_expanded);
for(const [i,d]of docs.entries()){
 assert.deepEqual(d.ir,docs[0].ir);assert.deepEqual(results[i].prepared.quality.issues,[]);
 for(const [key,items]of [['node_accounting',d.ir.nodes],['edge_accounting',d.ir.edges]]){
  const ids=Object.values(results[i].graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());
 }
 const before=results[0].graph.publication.contract_stages.rows,after=results[i].graph.publication.contract_stages.rows;
 assert.deepEqual(after.map(r=>r.operands),before.map(r=>r.operands));assert.deepEqual(after.map(r=>r.cuts),before.map(r=>r.cuts));
}
assert.equal(results[0].svg,fs.readFileSync(path.join(out,'stage-ui.svg'),'utf8'));
assert.equal(results[0].svg,results[3].svg);assert.equal(results[1].svg,results[2].svg);
const rows=i=>results[i].graph.publication.contract_stages.rows;
assert.ok(rows(0).every(r=>r.status==='summary'&&!r.detailed_operations_exposed));assert.equal(rows(1).filter(r=>r.status==='expanded').length,1);
assert.ok(rows(4).every(r=>r.status==='expanded'&&r.detailed_operations_exposed));
const artifacts=['stage-ui.svg','stage-ui.png','stage-ui-expanded.png','ui-observations.json',...keys.map(k=>'stage-ui-'+k+'.json')];
const report={schema:'contract-stages-ui/1',render_report_sha256:sha('render-report.json'),browser:observed.browser,node_counts:counts,
 svg_matches_cli:true,canonical_unchanged:true,reopened:true,save_reopen_deterministic:true,refold_same_svg:true,
 stage_inspected:true,bindings_preserved:true,all_stages_expanded:true,quality_issues:results.map(r=>r.prepared.quality.issues),
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

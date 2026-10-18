#!/usr/bin/env node
/* Compare the archived before-state with the current corpus, without model execution. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir='verification/publication/',base=dir+'shared-output-baseline/';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file))),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const baseline=read(base+'baseline.json'),before=read(base+'corpus-report.json'),after=read(dir+'corpus-report.json');
for(const [file,hash]of Object.entries(baseline.implementation_sha256))assert.equal(sha(base+file),hash,'archived '+file);
for(const [file,hash]of Object.entries(after.implementation_sha256))assert.equal(sha(file),hash,'current '+file);
assert.equal(before.audit_digest,baseline.corpus_digest);assert.deepEqual(before.extraction_implementation_sha256,after.extraction_implementation_sha256);
const key=r=>JSON.stringify([r.id,r.focus]),old=new Map(before.results.map(r=>[key(r),r]));
assert.equal(old.size,before.results.length);assert.equal(after.results.length,before.results.length);
const changed=[],regressions=[],crossingIncreases=[];
const routing=read(dir+'routing-comparison.json');assert.equal(routing.current_digest,after.audit_digest);
for(const row of after.results){
  const prior=old.get(key(row));assert.ok(prior);assert.equal(row.canonical_digest,prior.canonical_digest);
  const b=prior.line_geometry.crossings,a=row.line_geometry.crossings;
  if(a!==b)changed.push({id:row.id,entry:row.entry,focus:row.focus,before:b,after:a});
  if(a>b){const evidence=routing.crossing_increases.find(r=>r.id===row.id&&r.focus===row.focus);const increase={id:row.id,focus:row.focus,crossings:[b,a],restored_visible_dependencies:evidence?.restored_visible_dependencies||[]};crossingIncreases.push(increase);if(!increase.restored_visible_dependencies.length)regressions.push(increase);}
  if(row.issues.length>prior.issues.length)regressions.push({id:row.id,focus:row.focus,issues:row.issues});
}
const R=require('../semantic_studio/publication-renderer.js'),P=require('../semantic_studio/publication.js'),ir=read('data/semantic/architecture/WovenFusion.json');
const details=P.plan(ir).findings.filter(f=>f.rule==='dependency-band').map(f=>{
 const out=R.render(ir,{paperFocus:f.id}),q=out.prepared.quality,prior=baseline.results.find(r=>r.label==='WovenFusion'&&r.focus===f.id);
 assert.ok(prior);return {focus:f.id,depth:f.roles.dependency_depth,before:prior,after:{nodes:out.graph.nodes.length,edges:out.graph.edges.length,crossings:q.line_geometry.crossings,font:q.min_print_font_pt,height_mm:q.height_mm},cuts:out.graph.publication.boundary.length};
});
const report={schema:'shared-output-comparison/1',baseline_digest:before.audit_digest,current_digest:after.audit_digest,panels:after.panels,
 before_crossings:before.results.reduce((s,r)=>s+r.line_geometry.crossings,0),after_crossings:after.results.reduce((s,r)=>s+r.line_geometry.crossings,0),
 shared_result_terminals:after.shared_result_terminals,shared_result_uses:after.shared_result_uses,changed,regressions,crossing_increases:crossingIncreases,original_details:details,
 implementation_sha256:{...after.implementation_sha256,'tools/compare_shared_outputs.cjs':sha('tools/compare_shared_outputs.cjs')},
 limits:['Crossings are segment intersections across all panels, not unique model dependencies.','Crossing increases after restoring missing boundary dependencies are retained explicitly.','Fewer crossings and passing geometry do not establish arbitrary-model semantics or publication quality.']};
fs.writeFileSync(path.join(root,dir+'shared-output-comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,changed:changed.length,original_details:undefined,implementation_sha256:undefined,limits:undefined}));
if(regressions.length)process.exitCode=1;

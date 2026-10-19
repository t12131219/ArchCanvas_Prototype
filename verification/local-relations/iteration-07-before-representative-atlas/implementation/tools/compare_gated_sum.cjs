#!/usr/bin/env node
/* External models remain JSON input. Compare isolated renderer versions and
 * report the absence of corpus positives for this algebraic composition. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out='verification/publication/',snapshot=out+'gated-sum-baseline/';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file))),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const baseline=read(snapshot+'baseline.json'),before=read(snapshot+'corpus-report.json'),after=read(out+'corpus-report.json');
for(const [file,digest]of Object.entries(baseline.implementation_sha256))assert.equal(sha(snapshot+file),digest);
for(const [file,digest]of Object.entries(after.implementation_sha256))assert.equal(sha(file),digest);
assert.equal(before.audit_digest,baseline.audit_digest);assert.deepEqual(before.extraction_implementation_sha256,after.extraction_implementation_sha256);
assert.equal(before.panels,after.panels);
const load=require('./load_publication_renderer.cjs'),B=load(path.join(root,snapshot,'semantic_studio')),R=load(path.join(root,'semantic_studio'));
const extraction=read('verification/architecture/corpus/extraction.json'),irs=new Map(),old=new Map(before.results.map(r=>[JSON.stringify([r.id,r.focus]),r]));
let externalFindings=0,externalLayoutRetries=0;
for(const row of after.results){
  const prior=old.get(JSON.stringify([row.id,row.focus]));assert.ok(prior);assert.equal(prior.canonical_digest,row.canonical_digest);
  if(!irs.has(row.id)){
    const item=extraction.results.find(i=>i.id===row.id),ir=read('verification/architecture/corpus/'+item.ir);irs.set(row.id,ir);
    externalFindings+=R.render(ir,{}).graph.architecture.findings.filter(f=>f.rule==='gated-sum').length;
  }
  const ir=irs.get(row.id),canonical=JSON.stringify(ir),a=B.render(ir,{paperFocus:row.focus}),b=R.render(ir,{paperFocus:row.focus});
  assert.equal(a.svg,b.svg,'external diagram changed');
  for(const field of ['node_accounting','edge_accounting','representatives'])assert.equal(JSON.stringify(a.graph[field]),JSON.stringify(b.graph[field]));
  assert.equal(JSON.stringify(a.graph.publication.boundary),JSON.stringify(b.graph.publication.boundary));
  assert.equal(JSON.stringify(a.prepared.quality),JSON.stringify(b.prepared.quality));
  assert.equal(JSON.stringify(b.prepared.quality),JSON.stringify(Object.fromEntries(Object.keys(b.prepared.quality).map(k=>[k,row[k]]))));
  assert.equal(JSON.stringify(ir),canonical);
  externalLayoutRetries+=!!b.prepared.routing.layout_refinement;
}
const ir=read('data/semantic/architecture/GatedMixture.json'),a=B.render(ir,{}),b=R.render(ir,{}),f=b.graph.architecture.findings.find(f=>f.rule==='gated-sum');
assert.ok(f&&f.presentation==='group');assert.equal(f.roles.state_update,'not-asserted');
assert.equal(b.graph.publication.unknowns,1);assert.deepEqual(JSON.parse(JSON.stringify(b.prepared.quality.issues)),[]);
assert.equal(b.prepared.quality.line_geometry.crossings,a.prepared.quality.line_geometry.crossings);
const report={schema:'publication-gated-sum-comparison/1',baseline_digest:before.audit_digest,current_digest:after.audit_digest,
  external_panels:after.panels,external_svg_identical:true,external_accounting_identical:true,external_cuts_identical:true,
  external_gated_sum_findings:externalFindings,external_layout_retries:externalLayoutRetries,
  original:{entry:'GatedMixture',nodes:ir.nodes.length,edges:ir.edges.length,unknowns:1,terms:f.roles.terms,
    before:{issues:a.prepared.quality.issues,visible_nodes:a.graph.nodes.length,crossings:a.prepared.quality.line_geometry.crossings},
    after:{issues:b.prepared.quality.issues,visible_nodes:b.graph.nodes.length,crossings:b.prepared.quality.line_geometry.crossings,
      min_print_font_pt:b.prepared.quality.min_print_font_pt},label_retry:b.prepared.routing.layout_refinement},regressions:[],
  implementation_sha256:{...after.implementation_sha256,'semantic_studio/app.js':sha('semantic_studio/app.js'),'tools/compare_gated_sum.cjs':sha('tools/compare_gated_sum.cjs')},
  limits:['No external corpus model exercises gated-sum recognition; positive evidence comes from original source and adversarial graph cases.',
    'This proves two sigmoid-gated products feeding addition, not an LSTM state update, normalized mixture, MoE or independent experts.',
    'Label retries are bounded to three row gaps; manual layouts and offsets are preserved. Remaining failures stay explicit.']};
fs.writeFileSync(path.join(root,out+'gated-sum-comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,implementation_sha256:undefined}));

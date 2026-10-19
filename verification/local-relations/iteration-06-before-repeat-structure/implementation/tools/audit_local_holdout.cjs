#!/usr/bin/env node
/* Regression after a held-out failure. Its original frozen artifacts remain
 * reviewable; these inputs are now development cases, not a fresh holdout. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'verification/local-relations/current');
const A=require('../semantic_studio/architecture.js'),R=require('../semantic_studio/publication-renderer.js');
const {exportAtlas}=require('./export_publication.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=file=>JSON.parse(fs.readFileSync(path.join(dir,file)));
const freeze=read('heldout-freeze.json');
const historical=path.join(dir,'../iteration-02'),baseline=JSON.parse(fs.readFileSync(path.join(historical,'holdout-report.json')));
assert.equal(baseline.freeze_sha256,sha(fs.readFileSync(path.join(dir,'heldout-freeze.json'))));
const implementation=Object.fromEntries(Object.keys(freeze.implementation_sha256).map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));
const rows=[],cards=[],extraction=read('extraction.json');
for(const name of ['ConditionalCarry','SharedMismatch','EarlyBoundary']){
  const ir=read(name+'.json'),before=JSON.stringify(ir),rs=A.build(ir).relation_graph.relations,has=type=>rs.some(r=>r.type===type),counts={};
  rs.forEach(r=>counts[r.type]=(counts[r.type]||0)+1);
  assert.ok(has('unknown-boundary'));assert.ok(!rs.some(r=>['expert-routing','dispatch','time-recurrence','state-update'].includes(r.type)));
  assert.ok(!(ir.semantic_contracts||[]).some(c=>c.rule==='multihead-attention'));
  if(name==='ConditionalCarry'){assert.ok(has('gated-product'));assert.ok(has('state-interface'));assert.ok(has('conditional-join'));}
  if(name==='SharedMismatch'){
    assert.ok(has('selection'));assert.ok(has('state-interface'));
    const calls=ir.nodes.filter(n=>n.kind==='compute'&&n.module_path==='shared');assert.equal(calls.length,2);assert.notEqual(calls[0].id,calls[1].id);
    const sources=calls.map(n=>ir.edges.find(e=>e.kind==='data'&&e.target===n.id).source);assert.notEqual(sources[0],sources[1]);
    assert.ok(ir.nodes.filter(n=>n.kind==='parameter'&&n.parameter_scope==='shared').every(n=>n.identity_status.includes('sharing-unresolved')));
  }
  if(name==='EarlyBoundary'){assert.ok(has('iteration-template'));assert.ok(!has('state-interface'));}
  const out=R.render(ir,{paperGranularity:'modules'}),svg=name+'-holdout.svg',document=name+'-holdout.layout.json';
  const prior=baseline.rows.find(r=>r.name===name);
  for(const kind of ['svg','document'])assert.equal(sha(fs.readFileSync(path.join(historical,prior[kind]))),prior[kind+'_sha256']);
  const old=JSON.parse(fs.readFileSync(path.join(historical,prior.document)));
  const computation=ir=>{const result=structuredClone(ir);delete result.ir_digest;delete result.semantic_contract_basis;
    for(const n of result.nodes){delete n.module_binding;delete n.module_identity;}return result;};
  // Preserve the original failed SVG. Extraction now adds selection evidence;
  // the computation and source/configuration must still agree exactly.
  assert.deepEqual(computation(out.document.ir),computation(old.ir));assert.deepEqual(out.document.state,old.state);
  fs.writeFileSync(path.join(dir,svg),out.svg);fs.writeFileSync(path.join(dir,document),JSON.stringify(out.document,null,2)+'\n');
  assert.equal(JSON.stringify(ir),before);
  const atlas=exportAtlas(ir,path.join(dir,'heldout',name),{textQA:true}),q=out.prepared.quality;
  rows.push({name,svg,document,svg_sha256:sha(out.svg),document_sha256:sha(fs.readFileSync(path.join(dir,document))),nodes:out.graph.nodes.length,edges:out.graph.edges.length,
    quality:q,relation_counts:counts,semantic_checks_pass:true,source:extraction.cases.find(c=>c.name===name),
    before:{directory:'../iteration-02',svg:prior.svg,document:prior.document,quality:prior.quality,
      comparison_scope:'Same source/configuration and computation; canonical identity evidence changed. Not an identical-IR comparison.'},
    atlas:{directory:'heldout/'+name,panels:atlas.panels.length,complete:atlas.complete,quality_pass:atlas.quality_pass,unfulfilled_goals:atlas.unfulfilled_goals}});
  cards.push(`<article data-case="${name}"><h2>${name}</h2><p>${q.min_print_font_pt} pt · ${q.line_geometry.crossings} crossings · ${q.issues.join(', ')||'current checks passed'}</p>${out.svg}</article>`);
}
const report={schema:'local-holdout-regression/1',freeze_sha256:sha(fs.readFileSync(path.join(dir,'heldout-freeze.json'))),implementation_sha256:implementation,
  auditor_sha256:sha(fs.readFileSync(__filename)),baseline_report_sha256:sha(fs.readFileSync(path.join(historical,'holdout-report.json'))),
  runtime_executed:false,scope:'Regression after the first held-out evaluation. Original failures are retained in iteration-02; these inputs are now development cases. A fresh held-out evaluation remains required.',rows,
  quality_pass:rows.every(r=>!r.quality.issues.length&&r.atlas.quality_pass&&r.atlas.complete),unresolved_panels:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues}))};
fs.writeFileSync(path.join(dir,'holdout-report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(dir,'holdout-review.html'),`<!doctype html><html><meta charset="utf-8"><meta name="local-render-report-sha256" content="${sha(fs.readFileSync(path.join(dir,'holdout-report.json')))}"><title>Composition regression review</title><style>body{font:14px Arial;margin:16px}main{display:flex;gap:16px}article{width:32%}svg{display:block;width:100%;height:auto}h2{font-size:17px}</style><h1>Composition regression · earlier failure retained</h1><main>${cards.join('')}</main></html>`);
console.log(JSON.stringify({semantic_checks_pass:true,quality_pass:report.quality_pass,rows:rows.map(r=>({name:r.name,font:r.quality.min_print_font_pt,issues:r.quality.issues,atlas:r.atlas}))}));

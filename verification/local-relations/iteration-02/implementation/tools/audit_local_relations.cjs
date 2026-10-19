#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'verification/local-relations'),out=path.join(stage,'current');
const R=require('../semantic_studio/publication-renderer.js'),P=require('../semantic_studio/publication.js'),loadRenderer=require('./load_publication_renderer.cjs');
const baseline=loadRenderer(path.join(stage,'baseline/semantic_studio'));
const manifest=JSON.parse(fs.readFileSync(path.join(stage,'baseline/manifest.json')));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
for(const [file,digest]of Object.entries(manifest.files))if(sha(fs.readFileSync(path.join(stage,'baseline',file)))!==digest)throw Error('changed baseline: '+file);
const files=['semantic_studio/presentation-regions.js','semantic_studio/local-relations.js','semantic_studio/relation-constraints.js','semantic_studio/expression-goals.js','semantic_studio/architecture.js','semantic_studio/semantic-engine.js','semantic_studio/architecture-layout.js','semantic_studio/publication.js','semantic_studio/publication-renderer.js','semantic_studio/app.js','semantic_studio/index.html','tools/export_publication.cjs','tools/audit_local_relations.cjs'];
const rows=[],cards=[],escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const previous=process.argv.includes('--reuse-baseline')?JSON.parse(fs.readFileSync(path.join(out,'render-report.json'))):null;
if(previous&&previous.baseline_commit!==manifest.commit)throw Error('baseline commit mismatch');
function record(name,renderer,ir,state){
  const cached=name.endsWith('-before')&&previous?.rows.find(r=>r.name===name);
  if(cached){
    if(sha(fs.readFileSync(path.join(out,cached.svg)))!==cached.svg_sha256||sha(fs.readFileSync(path.join(out,cached.document)))!==cached.document_sha256)throw Error('baseline artifact changed');
    const doc=JSON.parse(fs.readFileSync(path.join(out,cached.document)));
    if(JSON.stringify(doc.ir)!==JSON.stringify(ir)||JSON.stringify(cached.state)!==JSON.stringify(state))throw Error('baseline input changed');
    rows.push(cached);cards.push(`<article data-case="${escape(name)}"><h2>${escape(name)}</h2><p>Frozen renderer · same source/configuration</p>${fs.readFileSync(path.join(out,cached.svg),'utf8')}</article>`);return;
  }
  const figure=renderer.render(ir,state),svg=name+'.svg',document=name+'.layout.json';
  fs.writeFileSync(path.join(out,svg),figure.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(figure.document,null,2)+'\n');
  const q=figure.prepared.quality,coverage=figure.graph.expression_coverage||[];
  rows.push({name,svg,document,svg_sha256:sha(figure.svg),document_sha256:sha(fs.readFileSync(path.join(out,document))),state,nodes:figure.graph.nodes.length,edges:figure.graph.edges.length,
    quality:q,goals:coverage.length,fulfilled:coverage.filter(c=>c.status==='fulfilled').length,
    constraints:figure.graph.constraint_receipts?.map(c=>({id:c.id,type:c.type,status:c.status,reason:c.reason,route_verified:c.route_verified}))||[]});
  cards.push(`<article data-case="${escape(name)}"><h2>${escape(name)}</h2><p>${q.min_print_font_pt} pt · ${q.line_geometry.crossings} crossings · ${escape(q.issues.join(', ')||'current geometry checks passed')}</p>${figure.svg}</article>`);
  process.stdout.write(JSON.stringify({name,nodes:figure.graph.nodes.length,issues:q.issues})+'\n');
}
for(const name of ['MixedCircuit','InterruptedMixer','BrokenCell','ForeignComposition']){
  const ir=JSON.parse(fs.readFileSync(path.join(out,name+'.json'))),before=JSON.stringify(ir);
  record(name+'-before',baseline,ir,{paperGranularity:'modules'});
  record(name+'-after',R,ir,{paperGranularity:'modules'});
  if(JSON.stringify(ir)!==before)throw Error('mutated canonical IR');
}
const mixed=JSON.parse(fs.readFileSync(path.join(out,'MixedCircuit.json')));
for(const type of ['gated-product','state-interface','unknown-boundary','conditional-join']){
  const relation=P.plan(mixed).relation_graph.relations.find(r=>r.type===type);
  record('MixedCircuit-'+type,R,mixed,{paperRelation:relation.id,paperGranularity:'detailed'});
}
const extractionChanged=Object.entries(manifest.files).filter(([file])=>file.startsWith('semantic_adapter/')).some(([file,digest])=>sha(fs.readFileSync(path.join(root,file)))!==digest);
const report={schema:'local-relations-audit/1',baseline_commit:manifest.commit,extraction_changed:extractionChanged,runtime_executed:false,
  implementation_sha256:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))])),
  rows,unresolved_panels:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues})),
  scope:'Matched source/configuration. This report does not certify the complete 13-item objective.'};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(out,'comparison.html'),`<!doctype html><html><meta charset="utf-8"><meta name="local-render-report-sha256" content="${sha(fs.readFileSync(path.join(out,'render-report.json')))}"><title>Local relation comparison</title><style>body{font:16px Arial;margin:24px}article{border:1px solid #bbb;padding:20px;margin-bottom:24px;max-width:1200px}svg{display:block;max-width:100%;height:auto}</style><h1>Local relation comparison</h1>${cards.join('')}</html>`);

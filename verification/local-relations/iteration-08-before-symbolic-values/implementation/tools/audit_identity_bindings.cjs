#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/local-relations/current');
const frozen=path.join(root,'verification/local-relations/iteration-05-before-identities');
const R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/architecture.js');
const baseline=require('./load_publication_renderer.cjs')(path.join(frozen,'implementation/semantic_studio'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
  ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'tools/audit_identity_bindings.cjs'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const snapshot=JSON.parse(fs.readFileSync(path.join(frozen,'snapshot.json')));
for(const [file,hash]of Object.entries(snapshot.files))if(sha(fs.readFileSync(path.join(frozen,'implementation',file)))!==hash)throw Error('changed frozen implementation: '+file);
const source=path.join(root,'tests/semantic_fixtures/identity_bindings.py');
const extraction=JSON.parse(fs.readFileSync(path.join(out,'identity-bindings/baseline-extraction.json')));
if(extraction.source_sha256!==sha(fs.readFileSync(source))||extraction.frozen_snapshot_sha256!==sha(fs.readFileSync(path.join(frozen,'snapshot.json')))||
  extraction.ir_sha256!==sha(fs.readFileSync(path.join(out,'identity-bindings/AliasCalls-before.json'))))throw Error('stale frozen identity extraction');
const before=JSON.parse(fs.readFileSync(path.join(out,'identity-bindings/AliasCalls-before.json')));
const rows=[];
function save(name,renderer,ir,state,scope){
  const input=JSON.stringify(ir),figure=renderer.render(ir,state),svg='identity-bindings/'+name+'.svg',document='identity-bindings/'+name+'.layout.json';
  if(input!==JSON.stringify(ir))throw Error('mutated canonical IR');
  fs.writeFileSync(path.join(out,svg),figure.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(figure.document,null,2)+'\n');
  const row={name,svg,document,state,scope,nodes:figure.graph.nodes.length,edges:figure.graph.edges.length,
    svg_sha256:sha(figure.svg),document_sha256:sha(fs.readFileSync(path.join(out,document))),quality:figure.prepared.quality,
    identities:figure.graph.nodes.filter(n=>n.identity_display).map(n=>({node:n.id,...n.identity_display})),
    identity_goals:figure.graph.expression_coverage?.filter(g=>['same-object-calls','observed-parameter-aliases'].includes(g.kind))||[]};
  rows.push(row);process.stdout.write(JSON.stringify({name,font:row.quality.min_print_font_pt,issues:row.quality.issues})+'\n');return row;
}
const alias=JSON.parse(fs.readFileSync(path.join(out,'identity-bindings/AliasCalls.json')));
save('alias-source-before',baseline,before,{paperGranularity:'modules'},'Same source; frozen extraction and renderer. Canonical IR differs.');
save('alias-renderer-before',baseline,alias,{paperGranularity:'modules'},'Same canonical IR as alias-current; frozen renderer.');
save('alias-current',R,alias,{paperGranularity:'modules'},'Same canonical IR as alias-renderer-before; current renderer.');
for(const name of ['AliasCalls','NestedAliasCalls','ConditionalCalls','InterruptedCalls','HelperCalls']){
  const ir=JSON.parse(fs.readFileSync(path.join(out,'identity-bindings',name+'.json')));
  const rs=A.build(ir).relation_graph.relations.filter(r=>r.type==='same-object-calls');
  for(const [i,r]of rs.entries())save(name+'-'+(i+1),R,ir,{paperRelation:r.id,paperGranularity:'detailed'},'Source call sites selecting a shared constructor binding; parameter stability and runtime count unproved.');
}
const runtime=JSON.parse(fs.readFileSync(path.join(out,'identity-bindings/TiedParameters-runtime.json')));
if(runtime.runtime.status!=='passed'||!runtime.runtime.runs.every(r=>r.status==='passed'&&r.replay.matched))throw Error('CPU evidence incomplete');
for(const r of A.build(runtime).relation_graph.relations.filter(r=>r.type==='observed-parameter-aliases'))
  save('parameter-run-'+r.properties.run,R,runtime,{mode:'runtime',paperRelation:r.id,paperGranularity:'detailed'},r.properties.scope);
for(const [file,digest]of Object.entries(implementation))if(sha(fs.readFileSync(path.join(root,file)))!==digest)throw Error('implementation changed during rendering: '+file);
const report={schema:'identity-binding-audit/1',implementation_sha256:implementation,frozen_snapshot_sha256:sha(fs.readFileSync(path.join(frozen,'snapshot.json'))),
  source_sha256:sha(fs.readFileSync(source)),runtime_ir:'identity-bindings/TiedParameters-runtime.json',runtime_ir_sha256:sha(fs.readFileSync(path.join(out,'identity-bindings/TiedParameters-runtime.json'))),
  runtime_scope:'Two explicit CPU eval/no_grad forward cases; run-start parameter enumeration only. No training or all-input claim.',
  rows,unresolved_panels:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues}))};
fs.writeFileSync(path.join(out,'identity-report.json'),JSON.stringify(report,null,2)+'\n');
const digest=sha(fs.readFileSync(path.join(out,'identity-report.json')));
const card=row=>`<article data-case="${escape(row.name)}"><h2>${escape(row.name)}</h2><p>${row.quality.min_print_font_pt} pt · ${row.quality.line_geometry.crossings} crossings · ${escape(row.quality.issues.join(', ')||'current geometry checks passed')}</p><p>${escape(row.scope)}</p>${fs.readFileSync(path.join(out,row.svg),'utf8')}</article>`;
fs.writeFileSync(path.join(out,'identity-review.html'),`<!doctype html><html><meta charset="utf-8"><meta name="identity-render-report-sha256" content="${digest}"><title>Object and parameter identity</title><style>body{font:16px Arial;margin:24px}article{border:1px solid #bbb;padding:16px;margin-bottom:24px;max-width:1100px}svg{display:block;max-width:100%;height:auto}</style><h1>Object calls and measured parameter aliases</h1>${rows.map(card).join('')}</html>`);
fs.writeFileSync(path.join(out,'identity-overview-review.html'),`<!doctype html><html><meta charset="utf-8"><title>Identity review</title><style>body{font:15px Arial;margin:16px}.pair{display:flex;gap:16px}article{flex:1;min-width:0;border:1px solid #bbb;padding:12px}svg{display:block;width:100%;height:620px}h2{font-size:17px}</style><h1>Same constructor binding, distinct call sites</h1><p>Same canonical IR and display configuration. Object identity does not assert parameter stability or equal outputs.</p><div class="pair">${[rows[1],rows[2]].map(card).join('')}</div></html>`);

#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/local-relations/current');
const frozen=path.join(root,'verification/local-relations/iteration-04-first-bindings');
const R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/architecture.js');
const load=require('./load_publication_renderer.cjs'),baseline=load(path.join(frozen,'implementation/semantic_studio'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),rows=[],comparisons=[];
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
  ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
  'tools/audit_iteration_bindings.cjs','tools/build_local_acceptance.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const snapshot=JSON.parse(fs.readFileSync(path.join(frozen,'snapshot.json')));
for(const [file,hash]of Object.entries(snapshot.files))if(sha(fs.readFileSync(path.join(frozen,'implementation',file)))!==hash)throw Error('changed frozen iteration implementation: '+file);
function save(name,ir,state){
  const before=JSON.stringify(ir),figure=R.render(ir,state),svg='iteration-bindings/'+name+'.svg',document='iteration-bindings/'+name+'.layout.json';
  if(JSON.stringify(ir)!==before)throw Error('mutated canonical IR');
  fs.writeFileSync(path.join(out,svg),figure.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(figure.document,null,2)+'\n');
  const r={name,svg,document,state,nodes:figure.graph.nodes.length,edges:figure.graph.edges.length,
    svg_sha256:sha(figure.svg),document_sha256:sha(fs.readFileSync(path.join(out,document))),quality:figure.prepared.quality,
    iteration_goals:figure.graph.expression_coverage.filter(g=>g.kind==='iteration-binding'),
    constraints:figure.graph.constraint_receipts.filter(c=>c.type==='iteration-ports').map(c=>({id:c.id,status:c.status,reason:c.reason,route_verified:c.route_verified,reading_order:c.reading_order}))};
  rows.push(r);process.stdout.write(JSON.stringify({name,font:r.quality.min_print_font_pt,issues:r.quality.issues})+'\n');return r;
}
const fixtures=['accumulate','conditional','coupled','guarded','item_input','temporary'];
for(const name of fixtures){
  const ir=JSON.parse(fs.readFileSync(path.join(out,'iteration-bindings',name+'.json'))),relation=A.build(ir).relation_graph.relations.find(r=>r.type==='iteration-binding');
  const after=save(name,ir,{paperRelation:relation.id,paperGranularity:'detailed'});
  if(name==='temporary')continue;
  const doc=JSON.parse(fs.readFileSync(path.join(frozen,name+'.layout.json'))),old=baseline.render(doc.ir,doc.state);
  if(sha(old.svg)!==sha(fs.readFileSync(path.join(frozen,name+'.svg'))))throw Error('first rendering is not reproducible: '+name);
  const oldSources=doc.ir.sources.map(s=>[s.path,s.sha256]),newSources=ir.sources.map(s=>[s.path,s.sha256]);
  if(JSON.stringify(oldSources)!==JSON.stringify(newSources))throw Error('comparison source changed');
  comparisons.push({name,before_svg:path.relative(out,path.join(frozen,name+'.svg')),before_svg_sha256:sha(old.svg),
    before_document:path.relative(out,path.join(frozen,name+'.layout.json')),before_document_sha256:sha(fs.readFileSync(path.join(frozen,name+'.layout.json'))),
    before_quality:old.prepared.quality,after:after.svg,same_source:true,canonical_ir_changed:true,
    scope:'Same source and relationship intent. Entry/body hierarchy and completion gating were corrected; this is not an identical-IR layout comparison.'});
}
const conditional=JSON.parse(fs.readFileSync(path.join(out,'iteration-bindings/conditional.json')));
const join=A.build(conditional).relation_graph.relations.find(r=>r.type==='conditional-join');
save('conditional-update',conditional,{paperRelation:join.id,paperGranularity:'detailed'});
for(const [file,digest]of Object.entries(implementation))if(sha(fs.readFileSync(path.join(root,file)))!==digest)throw Error('implementation changed during rendering: '+file);
const report={schema:'iteration-binding-audit/1',runtime_executed:false,scope:'Bounded source name bindings on normal loop completion. No time axis, purity, termination or fixed iteration count is asserted.',
  implementation_sha256:implementation,
  frozen_snapshot_sha256:sha(fs.readFileSync(path.join(frozen,'snapshot.json'))),rows,comparisons,
  unresolved_panels:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues}))};
fs.writeFileSync(path.join(out,'iteration-report.json'),JSON.stringify(report,null,2)+'\n');
const digest=sha(fs.readFileSync(path.join(out,'iteration-report.json'))),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cards=rows.map(r=>`<article data-case="${escape(r.name)}"><h2>${escape(r.name)}</h2><p>${r.quality.min_print_font_pt} pt · ${r.quality.line_geometry.crossings} crossings · ${escape(r.quality.issues.join(', ')||'current geometry checks passed')}</p>${fs.readFileSync(path.join(out,r.svg),'utf8')}</article>`).join('');
fs.writeFileSync(path.join(out,'iteration-review.html'),`<!doctype html><html><meta charset="utf-8"><meta name="iteration-render-report-sha256" content="${digest}"><title>Generic iteration bindings</title><style>body{font:16px Arial;margin:24px}article{border:1px solid #bbb;padding:16px;margin-bottom:24px;max-width:1100px}svg{display:block;max-width:100%;height:auto}</style><h1>Generic iteration bindings</h1><p>Source name bindings on normal loop completion. A time axis and fixed count remain unproved.</p>${cards}</html>`);
const c=comparisons.find(c=>c.name==='conditional'),after=rows.find(r=>r.name==='conditional');
const pair=[['First implementation',c.before_quality,fs.readFileSync(path.resolve(out,c.before_svg),'utf8')],['Current implementation',after.quality,fs.readFileSync(path.join(out,after.svg),'utf8')]];
fs.writeFileSync(path.join(out,'iteration-overview-review.html'),`<!doctype html><html><meta charset="utf-8"><title>Generic loop binding review</title><style>body{font:15px Arial;margin:16px}.pair{display:flex;gap:16px}article{flex:1;min-width:0;border:1px solid #bbb;padding:12px}svg{display:block;width:100%;height:620px}h2{font-size:17px}</style><h1>Conditional loop: bindings and feedback</h1><p>Same source. Corrected entry/body hierarchy and completion gating; branch computations have a separate detail panel.</p><div class="pair">${pair.map(([name,q,svg])=>`<article><h2>${name}</h2><p>${q.min_print_font_pt} pt · ${q.line_geometry.crossings} crossings · ${escape(q.issues.join(', ')||'current checks passed')}</p>${svg}</article>`).join('')}</div></html>`);

#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/local-relations/current'),folder=path.join(out,'structural-repeats');
const frozen=path.join(root,'verification/local-relations/iteration-06-before-repeat-structure');
const current=require('../semantic_studio/publication-renderer.js'),baseline=require('./load_publication_renderer.cjs')(path.join(frozen,'implementation/semantic_studio'));
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p)),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
  ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
  'tools/audit_structural_repeats.cjs','tools/build_repeat_baseline.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(fs.readFileSync(path.join(root,f)))]));
const snapshot=read(path.join(frozen,'snapshot.json')),extraction=read(path.join(folder,'baseline-extraction.json'));
for(const [file,hash]of Object.entries(snapshot.files))assert.equal(sha(fs.readFileSync(path.join(frozen,'implementation',file))),hash);
assert.equal(extraction.frozen_snapshot_sha256,sha(fs.readFileSync(path.join(frozen,'snapshot.json'))));
assert.equal(extraction.source_sha256,sha(fs.readFileSync(path.join(root,'tests/semantic_fixtures/structural_repeats.py'))));
const cases=Object.fromEntries(extraction.cases.map(row=>{
  assert.equal(sha(fs.readFileSync(path.join(out,row.ir))),row.ir_sha256);
  return [row.name,{before:read(path.join(out,row.ir)),after:read(path.join(folder,row.name+'.json'))}];
}));
const sequence=ir=>ir.nodes.find(n=>n.repeat_contract),rows=[];
function save(name,renderer,ir,state,scope){
  const original=JSON.stringify(ir),result=renderer.render(ir,state),svg='structural-repeats/'+name+'.svg',document='structural-repeats/'+name+'.layout.json';
  assert.equal(JSON.stringify(ir),original);fs.writeFileSync(path.join(out,svg),result.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(result.document,null,2)+'\n');
  const row={name,svg,document,state,scope,svg_sha256:sha(result.svg),document_sha256:sha(fs.readFileSync(path.join(out,document))),
    nodes:result.graph.nodes.length,edges:result.graph.edges.length,quality:result.prepared.quality,
    representative:result.graph.publication.representative,contract:sequence(ir).repeat_contract};
  if(row.representative?.structural_group){
    const rep=row.representative,group=sequence(ir).repeat_contract.structure.groups[rep.structural_group.group];
    assert.equal(rep.instance,group.representative);assert.deepEqual(rep.structural_group.indices,group.indices);
    const node=result.graph.nodes.find(n=>n.id===rep.instance),caption=node.paper.captions.join(' ');
    assert.ok(caption.includes('source positions'));assert.ok(caption.includes('structure only'));
  }
  rows.push(row);process.stdout.write(JSON.stringify({name,font:row.quality.min_print_font_pt,issues:row.quality.issues})+'\n');return row;
}
const equivalent=cases.EquivalentSteps;
save('equivalent-source-before',baseline,equivalent.before,{paperFocus:sequence(equivalent.before).id,paperRepresentative:true,paperGranularity:'modules'},'Same source/configuration; frozen extraction and renderer. Different canonical IR.');
save('equivalent-renderer-before',baseline,equivalent.after,{paperFocus:sequence(equivalent.after).id,paperRepresentative:true,paperGranularity:'modules'},'Same canonical IR and state as equivalent-current; frozen renderer.');
save('equivalent-current',current,equivalent.after,{paperFocus:sequence(equivalent.after).id,paperRepresentative:true,paperGranularity:'modules'},'Same canonical IR and state as equivalent-renderer-before; exact source positions printed.');
const mixed=cases.MixedSteps.after;
save('mixed-overview',current,mixed,{paperFocus:sequence(mixed).id,paperGranularity:'modules'},'All four source positions retained; two structural groups.');
for(const group of [0,1])save('mixed-group-'+group,current,mixed,{paperFocus:sequence(mixed).id,paperRepresentative:true,paperRepresentativeGroup:group,paperGranularity:'modules'},'One concrete representative with its exact boundary and represented source positions; no output or parameter equality.');
for(const name of ['LiteralSteps','UnknownSteps','ConditionalSteps','AliasPartitionSteps','MutableSteps'])
  save(name,current,cases[name].after,{paperFocus:sequence(cases[name].after).id,paperGranularity:'modules'},'Current source structure; unknown/mutable elements stay distinct.');
save('mutable-source-before',baseline,cases.MutableSteps.before,{paperFocus:sequence(cases.MutableSteps.before).id,paperGranularity:'modules'},'Frozen constructor-only homogeneous claim; historical behavior retained for review.');
for(const [file,hash]of Object.entries(implementation))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash);
const report={schema:'structural-repeat-audit/1',implementation_sha256:implementation,frozen_snapshot_sha256:extraction.frozen_snapshot_sha256,
  source_sha256:extraction.source_sha256,baseline_extraction_sha256:sha(fs.readFileSync(path.join(folder,'baseline-extraction.json'))),
  scope:'Ordered modeled source graphs, operands, configuration, condition and boundary correspondence; not numerical or arbitrary-program equivalence. Development inputs, not held-out.',
  runtime_executed:false,rows,unresolved_panels:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues}))};
fs.writeFileSync(path.join(out,'repeat-report.json'),JSON.stringify(report,null,2)+'\n');
const digest=sha(fs.readFileSync(path.join(out,'repeat-report.json'))),card=r=>`<article data-case="${esc(r.name)}"><h2>${esc(r.name)}</h2><p>${r.quality.min_print_font_pt} pt · ${r.quality.line_geometry.crossings} crossings · ${esc(r.quality.issues.join(', ')||'current geometry checks passed')}</p><p>${esc(r.scope)}</p>${fs.readFileSync(path.join(out,r.svg),'utf8')}</article>`;
fs.writeFileSync(path.join(out,'repeat-review.html'),`<!doctype html><html><meta charset="utf-8"><meta name="repeat-render-report-sha256" content="${digest}"><title>Structural correspondence review</title><style>body{font:16px Arial;margin:24px}article{border:1px solid #bbb;padding:16px;margin-bottom:24px;max-width:1100px}svg{display:block;max-width:100%;height:auto}</style><h1>Class-independent structural correspondence</h1>${rows.map(card).join('')}</html>`);
fs.writeFileSync(path.join(out,'repeat-overview-review.html'),`<!doctype html><html><meta charset="utf-8"><meta name="repeat-render-report-sha256" content="${digest}"><title>Distinct structural representatives</title><style>body{font:15px Arial;margin:16px}.pair{display:flex;gap:16px}article{flex:1;min-width:0;border:1px solid #bbb;padding:12px}svg{display:block;width:100%;height:620px}h2{font-size:17px}</style><h1>One sequence, two distinct structural groups</h1><p>All four positions remain in the source IR. Parameters and outputs are not asserted equal.</p><div class="pair">${rows.filter(r=>['mixed-group-0','mixed-group-1'].includes(r.name)).map(card).join('')}</div></html>`);

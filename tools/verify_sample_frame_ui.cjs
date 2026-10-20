'use strict';
// Compare real editor exports with independent rerenders, retaining full saved
// raw IR for the small repeat and explicit provenance for the larger UI state.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js');
const dir='verification/sample-frames/current',read=f=>JSON.parse(fs.readFileSync(dir+'/'+f)),
  sha=f=>crypto.createHash('sha256').update(fs.readFileSync(dir+'/'+f)).digest('hex'),
  text=f=>fs.readFileSync(dir+'/'+f,'utf8');
const report=read('render-report.json'),actions=read('ui-observations.json');
assert.deepEqual(actions.repeat_sequence,[9,12,12,9]);
assert.equal(actions.source_frame_count,11);
assert.ok(actions.final_code_reload_verified);
const row=report.rows.find(r=>r.name==='EquivalentSteps-current'),
  ir=JSON.parse(fs.readFileSync(row.input)),saved=read('ui-saved.layout.json'),returned=read('ui-returned.layout.json');
assert.deepEqual(saved.ir,ir);assert.deepEqual(returned.ir,ir);
const opened=R.render(ir,saved.state),main=R.render(ir,returned.state),source=R.render(ir,{...returned.state,paperFrameView:'source'});
assert.equal(opened.graph.nodes.length,12);assert.equal(main.graph.nodes.length,9);assert.equal(source.graph.nodes.length,11);
assert.equal(text('ui-opened.svg'),opened.svg);assert.equal(text('ui-reopened.svg'),opened.svg);
assert.equal(text('ui-main.svg'),main.svg);assert.equal(text('ui-restored.svg'),main.svg);assert.equal(text(row.svg),main.svg);
assert.equal(text('ui-source.svg'),source.svg);
const sample=main.graph.frame_ownership.find(f=>f.kind==='sequence-sample');
assert.ok(sample&&sample.sequence_sample.module_identity);
assert.ok(opened.graph.nodes.some(n=>n.id===sample.node));
assert.ok(main.svg.includes('Detail: source call 1'));
const transformerRow=report.rows.find(r=>r.name==='transformer-current'),
  canonical=JSON.parse(fs.readFileSync(transformerRow.input)),imported=read('transformer-current-import.layout.json'),
  full=read(transformerRow.document),stateReceipt=read('ui-transformer-expanded-state.json');
assert.deepEqual(Object.keys(imported).sort(),['ir','schema','state']);
assert.deepEqual(imported.ir,canonical);assert.deepEqual(imported.state,full.state);
assert.equal(stateReceipt.input_sha256,transformerRow.input_sha256);
assert.equal(stateReceipt.provenance,'Imported effective open frontier plus observed editor toggle; no Transformer saved-reopen claim.');
const detail=R.render(canonical,stateReceipt.state);
assert.equal(detail.graph.nodes.length,actions.transformer_sequence[1]);
assert.equal(text('ui-transformer-expanded.svg'),detail.svg);
assert.equal(text('ui-transformer.svg'),text(transformerRow.svg));
assert.equal(text('ui-transformer-restored.svg'),text(transformerRow.svg));
assert.deepEqual(actions.transformer_sequence,[87,92,87]);
const artifacts=['ui-observations.json','ui-main.svg','ui-opened.svg','ui-reopened.svg','ui-restored.svg',
  'ui-source.svg','ui-saved.layout.json','ui-returned.layout.json','ui-repeat.png',
  'ui-transformer.svg','ui-transformer-expanded.svg','ui-transformer-restored.svg',
  'ui-transformer-expanded-state.json','ui-refinement-check.json','ui-transformer.png'];
const result={schema:'sample-frame-ui-audit/1',render_report_sha256:sha('render-report.json'),
  repeat_sequence:actions.repeat_sequence,source_frame_count:11,transformer_sequence:actions.transformer_sequence,
  canonical_ir_unchanged:true,cli_svg_identical:true,main_svg_restored:true,
  saved_detail_reopened:true,final_code_reload_verified:true,
  transformer_import:{bytes:fs.statSync(dir+'/transformer-current-import.layout.json').size,canonical_nodes:canonical.nodes.length},
  artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)])),
  implementation_sha256:report.implementation_sha256,
  verifier_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  scope:'Actual editor imports/exports and local expansion/refolding; full saved-reopen is verified on EquivalentSteps. Raw thousands-node routed performance is not verified.'};
fs.writeFileSync(dir+'/ui-report.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({repeat:result.repeat_sequence,transformer:result.transformer_sequence,cli_svg_identical:true}));

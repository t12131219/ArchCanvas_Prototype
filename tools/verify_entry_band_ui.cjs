'use strict';
// Verify artifacts exported through the real editor, including saved raw IR.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js');
const dir='verification/entry-bands/current',read=f=>JSON.parse(fs.readFileSync(dir+'/'+f)),
  sha=f=>crypto.createHash('sha256').update(fs.readFileSync(dir+'/'+f)).digest('hex'),
  digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),
  text=f=>fs.readFileSync(dir+'/'+f,'utf8');
const report=read('render-report.json'),actions=read('ui-observations.json');
assert.deepEqual(actions.many_sequence,[21,15,15,21]);
assert.deepEqual(actions.transformer_sequence,[89,92,92,89]);
assert.ok(actions.final_code_reload_verified);
const many=read('ManyInputs.json'),saved=read('ui-saved.layout.json');
assert.deepEqual(saved.ir,many);
const mainRow=report.rows.find(r=>r.name==='ManyInputs-current');
for(const f of ['ui-main.svg','ui-restored.svg','ui-final-restored.svg'])assert.equal(text(f),text(mainRow.svg));
const folded=R.render(many,saved.state);
assert.equal(folded.document.layout.nodes.length,15);
assert.equal(text('ui-many-folded.svg'),folded.svg);
const transformerRow=report.rows.find(r=>r.name==='transformer-current'),
  canonical=JSON.parse(fs.readFileSync(transformerRow.input)),
  opened=read('ui-transformer-expanded.layout.json');
assert.deepEqual(opened.ir,canonical);
const imported=read('transformer-import.layout.json'),full=read(transformerRow.document);
assert.deepEqual(Object.keys(imported).sort(),['ir','schema','state']);
assert.deepEqual(imported.ir,canonical);assert.deepEqual(imported.state,full.state);
const openedRender=R.render(canonical,opened.state);
assert.equal(openedRender.document.layout.nodes.length,92);
assert.equal(text('ui-transformer-expanded.svg'),openedRender.svg);
assert.equal(text('ui-transformer-reopened.svg'),openedRender.svg);
assert.equal(text('ui-transformer.svg'),text(transformerRow.svg));
assert.equal(text('ui-transformer-restored.svg'),text(transformerRow.svg));
// Retain a small, independently rerenderable state receipt instead of another
// fourteen-megabyte copy of the same source IR in version control.
const savedState={schema:'entry-band-ui-state/1',input:transformerRow.input,
  input_sha256:transformerRow.input_sha256,canonical_ir_sha256:digest(canonical),
  saved_document_sha256:sha('ui-transformer-expanded.layout.json'),state:opened.state};
fs.writeFileSync(dir+'/ui-transformer-expanded-state.json',JSON.stringify(savedState,null,2)+'\n');
const artifacts=['ui-observations.json','ui-main.svg','ui-restored.svg','ui-final-restored.svg',
  'ui-many-folded.svg','ui-saved.layout.json','ui-many.png','ui-transformer.svg',
  'ui-transformer-expanded.svg','ui-transformer-reopened.svg','ui-transformer-restored.svg',
  'ui-transformer-expanded-state.json','ui-transformer.png'];
const result={schema:'entry-band-ui-audit/1',render_report_sha256:sha('render-report.json'),
  many_sequence:actions.many_sequence,transformer_sequence:actions.transformer_sequence,
  canonical_ir_unchanged:true,cli_svg_identical:true,main_svg_restored:true,
  saved_detail_reopened:true,final_code_reload_verified:true,
  transformer_import:{bytes:fs.statSync(dir+'/transformer-import.layout.json').size,
    canonical_nodes:canonical.nodes.length,scope:'Only schema/ir/state serialized; no canonical nodes removed.'},
  artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)])),
  implementation_sha256:report.implementation_sha256,
  verifier_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  scope:'Actual editor imports, exports, local fold/expand and saved-state reopen. This does not test thousands-node routed UI performance.'};
fs.writeFileSync(dir+'/ui-report.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({many:result.many_sequence,transformer:result.transformer_sequence,cli_svg_identical:true}));

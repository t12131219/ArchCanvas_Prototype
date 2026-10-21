'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js');
const out=path.resolve(__dirname,'../verification/detail-alternatives/experiment'),read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(out+'/'+f)).digest('hex');
const input=read('ui-import.json'),saved=read('ui-saved.layout.json'),returned=read('ui-returned.layout.json'),report=read('render-report.json');
const importedState={offsets:{},...input.state};
assert.deepEqual(saved.ir,input.ir);assert.deepEqual(returned.ir,input.ir);assert.deepEqual(saved.state.paperDiagramReturn,importedState);assert.deepEqual(returned.state,importedState);
assert.equal(sha('ui-main.svg'),sha('ui-returned.svg'));assert.equal(sha('ui-detail.svg'),sha('ui-reopened.svg'));
const main=R.render(input.ir,input.state),detail=R.render(saved.ir,saved.state);
assert.equal(main.svg,fs.readFileSync(out+'/ui-main.svg','utf8'));assert.equal(detail.svg,fs.readFileSync(out+'/ui-detail.svg','utf8'));
const request=D.plan(input.ir,main,input.state).candidates.find(c=>c.state.paperRelation===saved.state.paperRelation);assert.ok(request);assert.ok(request.alternative_for.length);
for(const [key,value]of Object.entries(request.state))assert.deepEqual(saved.state[key],value);
assert.equal(sha('ui-main.svg'),sha('NestedWorkshop-current/0.svg'));assert.equal(sha('ui-detail.svg'),sha('NestedWorkshop-current/4.svg'));
const nested=read('ui-nested.json'),observed=read('ui-interaction-observation.json');
assert.deepEqual(nested.ir,input.ir);assert.deepEqual(nested.state.paperDiagramReturn,importedState);assert.equal(R.render(nested.ir,nested.state).svg,fs.readFileSync(out+'/ui-nested.svg','utf8'));
const nestedRequest=D.plan(input.ir,main,input.state).candidates.find(c=>c.state.paperFocus===nested.state.paperFocus);assert.ok(nestedRequest?.alternative_for);
for(const [key,value]of Object.entries(nestedRequest.state))assert.deepEqual(nested.state[key],value);
assert.deepEqual(observed.nested_sequence,[6,15,6]);assert.equal(observed.pagination_before,'更多详图（19）');assert.equal(observed.pagination_after,'更多详图（13）');
const artifacts=['ui-nested.svg','ui-nested.json','ui-interaction-observation.json','ui-main.svg','ui-detail.svg','ui-reopened.svg','ui-returned.svg','ui-saved.layout.json','ui-returned.layout.json','ui-detail.png','ui-returned.png'];
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({schema:'detail-alternatives-ui/1',render_report_sha256:sha('render-report.json'),
 sequence:[6,7,7,6],nested_sequence:[6,15,6],pagination_observed:true,auditor_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),canonical_ir_unchanged:true,main_state_restored:true,main_svg_restored:true,detail_svg_restored:true,cli_svg_identical:true,
 request:request.id,actions:['Import folded source model','Export main','Open exact gated-product alternative','Export detail and save document','Reload final editor','Import saved detail','Export reopened detail','Return to main','Export main and document'],
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)])),implementation_sha256:report.implementation_sha256},null,2)+'\n');
console.log(JSON.stringify({sequence:[6,7,7,6],cli_svg_identical:true,main_svg_restored:true}));

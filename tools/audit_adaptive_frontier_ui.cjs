'use strict';
const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict'),R=require('../semantic_studio/publication-renderer.js');
const out='verification/adaptive-frontier/current',read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(out+'/'+f)).digest('hex');
const selected=read('ui-selected.json'),disabled=read('ui-disabled.json'),reopened=read('ui-reopened.json'),fold=read('ui-manual-fold.json'),detail=read('ui-manual-detail.json'),observed=read('ui-observations.json'),report=read('render-report.json');
for(const d of [disabled,reopened,fold,detail])assert.deepEqual(d.ir,selected.ir);
assert.deepEqual(selected.state,reopened.state);assert.equal(fold.state.paperAdaptive,false);assert.equal(detail.state.paperAdaptive,false);
const a=R.render(selected.ir,selected.state),b=R.render(disabled.ir,disabled.state),c=R.render(reopened.ir,reopened.state),d=R.render(fold.ir,fold.state),e=R.render(detail.ir,detail.state);
assert.equal(a.svg,fs.readFileSync(out+'/ui-selected.svg','utf8'));assert.equal(a.svg,fs.readFileSync(out+'/SameSource-adaptive.svg','utf8'));
assert.equal(a.svg,c.svg);assert.equal(a.svg,e.svg);assert.equal(b.svg,d.svg);
assert.deepEqual(observed.node_counts,[11,17,11,17,11,17]);assert.ok(observed.adaptive_disabled_by_manual_choice);
const files=['ui-input.json','ui-selected.json','ui-selected.svg','ui-selected.png','ui-disabled.json','ui-reopened.json','ui-manual-fold.json','ui-manual-detail.json','ui-observations.json'];
const result={schema:'adaptive-frontier-ui/1',render_report_sha256:sha('render-report.json'),node_counts:observed.node_counts,exact_ui_cli_svg:true,canonical_ir_unchanged:true,
 deterministic_reopen:true,manual_selection_preserved:true,artifacts_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),passed:true};
fs.writeFileSync(out+'/ui-report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,node_counts:observed.node_counts}));

'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js');
const root='verification/diagram-set/current',read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(root+'/'+f)).digest('hex');
const ir=read('FiberBlend.json'),saved=read('ui-saved.layout.json'),returned=read('ui-returned-state.json'),report=read('render-report.json');
assert.deepEqual(saved.ir,ir);assert.deepEqual(returned.ir,ir);assert.ok(saved.state.paperDiagramReturn);
assert.deepEqual(returned.state,saved.state.paperDiagramReturn);assert.equal(returned.state.paperDiagramReturn,undefined);
assert.equal(sha('ui-detail.svg'),sha('ui-reopened.svg'));assert.equal(sha('ui-main.svg'),sha('ui-returned.svg'));
assert.equal(sha('ui-detail.svg'),sha('ui-final-reopened.svg'));assert.equal(sha('ui-main.svg'),sha('ui-final-returned.svg'));
const main=R.render(ir,returned.state),detail=R.render(ir,saved.state);
assert.equal(main.svg,fs.readFileSync(root+'/ui-main.svg','utf8'));assert.equal(detail.svg,fs.readFileSync(root+'/ui-detail.svg','utf8'));
const planned=D.plan(ir,main,returned.state),request=planned.candidates.find(c=>c.anchor===saved.state.paperFocus);
assert.ok(request);for(const [key,value]of Object.entries(request.state))assert.deepEqual(saved.state[key],value);
assert.equal(sha('ui-main.svg'),sha('FiberBlend/000-main.svg'));assert.equal(sha('ui-detail.svg'),sha('FiberBlend/001-detail.svg'));
const artifacts=['ui-main.svg','ui-detail.svg','ui-reopened.svg','ui-returned.svg','ui-final-reopened.svg','ui-final-returned.svg','ui-saved.layout.json','ui-returned-state.json','ui-detail.png','ui-returned.png'];
const result={schema:'diagram-set-ui-audit/1',render_report_sha256:sha('render-report.json'),
 sequence:[20,7,7,20],canonical_ir_unchanged:true,main_state_restored:true,main_svg_restored:true,
 saved_detail_reopened:true,shared_planner_matches:true,cli_svg_identical:true,
 final_code_reload_verified:true,
 actions:['Import FiberBlend IR','Select canvas / role relationships','Export main SVG','Open self.weave suggestion','Export detail SVG',
 'Save detail with main return state','Reload editor','Import saved detail document','Confirm return button and export reopened detail',
 'Return to main','Export returned SVG and document'],
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)])),
 implementation_sha256:report.implementation_sha256};
fs.writeFileSync(root+'/ui-report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({sequence:result.sequence,main_svg_restored:true,cli_svg_identical:true}));

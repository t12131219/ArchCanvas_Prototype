'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),R=require('../semantic_studio/publication-renderer.js');
const out='verification/rank-clearance/current',read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(out+'/'+f)).digest('hex');
const selected=read('ui-selected.json'),folded=read('ui-folded.json'),reopened=read('ui-reopened.json'),ir=read('ChannelChain.json'),report=read('render-report.json');
assert.deepEqual(selected.ir,ir);assert.deepEqual(folded.ir,ir);assert.deepEqual(reopened.ir,ir);assert.deepEqual(reopened.state,selected.state);
const a=R.render(ir,selected.state),b=R.render(ir,folded.state),c=R.render(ir,reopened.state);
assert.equal(fs.readFileSync(out+'/ui-selected.svg','utf8'),a.svg);assert.equal(a.svg,c.svg);assert.equal(a.svg,fs.readFileSync(out+'/ChannelChain-auto.svg','utf8'));
assert.deepEqual([a.graph.nodes.length,b.graph.nodes.length,c.graph.nodes.length],[6,1,6]);assert.ok(a.prepared.routing.rank_clearance_refinement.accepted);
assert.ok(a.graph.positions.has('unknown'));assert.ok(b.graph.nodes.some(n=>n.paper.unknown_count));
assert.deepEqual(read('ui-observations.json').node_counts,[6,1,6]);
const files=['ui-selected.json','ui-selected.svg','ui-folded.json','ui-reopened.json','ui-selected.png','ui-observations.json'];
const result={schema:'rank-clearance-ui/1',render_report_sha256:sha('render-report.json'),node_counts:[6,1,6],exact_ui_cli_svg:true,canonical_ir_unchanged:true,
 deterministic_reopen:true,artifacts_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),passed:true};
fs.writeFileSync(out+'/ui-report.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

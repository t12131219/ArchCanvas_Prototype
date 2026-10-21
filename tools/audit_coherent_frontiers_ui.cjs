/* Compare exports obtained through actual editor controls with independent CLI
 * rendering. This tool neither drives nor reads hidden browser application state. */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),R=require('../semantic_studio/publication-renderer.js');
const out='verification/coherent-frontiers/current/',read=f=>JSON.parse(fs.readFileSync(out+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const input=read('ui-import.json'),saved=read('ui-open-document.json'),main=R.render(input.ir,input.state),opened=R.render(saved.ir,saved.state);
const equal=(f,text)=>assert.equal(fs.readFileSync(out+f,'utf8'),text,f);
equal('ui-main.svg',main.svg);equal('ui-returned.svg',main.svg);equal('ui-open.svg',opened.svg);equal('ui-reopened.svg',opened.svg);
assert.deepEqual(saved.ir,input.ir);assert.equal(main.graph.nodes.length,7);assert.equal(opened.graph.nodes.length,10);
const peers=main.graph.publication.coherent_frontier.choices[0].nodes;
assert.equal(peers.filter(id=>opened.graph.positions.get(id).expanded).length,1);
const files=['ui-import.json','ui-open-document.json','ui-main.svg','ui-open.svg','ui-reopened.svg','ui-returned.svg','ui-open.png'];
const report={schema:'coherent-frontiers-ui/1',render_report_sha256:sha(out+'render-report.json'),auditor_sha256:sha(__filename),
 sequence:[7,10,10,7],canonical_ir_unchanged:true,cli_svg_identical:true,main_svg_restored:true,detail_svg_restored:true,
 observation:'CUA actual editor import → double-click one residual → SVG export → save document → file chooser reopen → SVG export → automatic selection → SVG export. Export text read from visible modal only.',
 artifacts_sha256:Object.fromEntries(files.map(f=>[f,sha(out+f)]))};
fs.writeFileSync(out+'ui-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

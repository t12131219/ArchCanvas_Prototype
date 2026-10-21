'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const out='verification/contained-bypasses/current',report=JSON.parse(fs.readFileSync(out+'/small-report.json'));
const rows=[];
for(const entry of ['ContainedChoice','ConditionalMosaic']){
 const request=report.rows.find(r=>r.name===entry+'-closed'),ir=JSON.parse(fs.readFileSync(request.input)),raw=JSON.stringify(ir);
 const a=R.render(ir,request.state),saved=JSON.parse(JSON.stringify(a.document)),again=R.render(saved.ir,saved.state);
 assert.equal(a.svg,again.svg);
 const open=report.rows.find(r=>r.name===entry+'-open'),detail=R.render(ir,open.state),refold=R.render(detail.document.ir,request.state);
 assert.equal(a.svg,refold.svg);assert.ok(detail.graph.nodes.length>a.graph.nodes.length);
 assert.equal(JSON.stringify(ir),raw);
 const plain=R.render(ir,{...request.state,paperContainedBypasses:false});
 assert.equal(plain.svg,fs.readFileSync(out+'/'+entry+'-closed-before.svg','utf8'));
 const projected=E.project(ir,{view:'source',mode:'source',open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
 assert.equal(projected.nodes.length,ir.nodes.length);assert.equal(projected.edges.length,ir.edges.length);
 rows.push({entry,closed:a.graph.nodes.length,open:detail.graph.nodes.length,raw:ir.nodes.length,raw_edges:ir.edges.length,
  saved_svg_equal:true,refold_svg_equal:true,opt_out_equals_frozen:true,ir_unchanged:true});
}
fs.writeFileSync(out+'/roundtrip.json',JSON.stringify({passed:true,rows,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),scope:'Deterministic saved-document rendering and source projection; no editor UI or large-SVG performance claim.'},null,2)+'\n');
console.log(JSON.stringify(rows));

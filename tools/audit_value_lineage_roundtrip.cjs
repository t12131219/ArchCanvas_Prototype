'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const out='verification/value-lineage/current',report=JSON.parse(fs.readFileSync(out+'/small-report.json')),rows=[];
for(const entry of ['ConfigurationOnly','ExemplarOnly','TrueValue','MixedValues']){
 const request=report.rows.find(r=>r.name===entry),ir=JSON.parse(fs.readFileSync(request.input)),raw=JSON.stringify(ir);
 const a=R.render(ir,request.state),saved=JSON.parse(JSON.stringify(a.document)),again=R.render(saved.ir,saved.state);
 assert.equal(a.svg,again.svg);
 const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'overview',paperAuto:false,paperAdaptive:false,open:[ir.nodes.find(n=>n.parent===null).id]};
 const closed=R.render(ir,state),reopen=R.render(closed.document.ir,request.state);
 assert.equal(a.svg,reopen.svg);assert.equal(JSON.stringify(ir),raw);
 const projected=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
 assert.equal(projected.nodes.length,ir.nodes.length);assert.equal(projected.edges.length,ir.edges.length);
 rows.push({entry,detail:a.graph.nodes.length,closed:closed.graph.nodes.length,raw:ir.nodes.length,raw_edges:ir.edges.length,
  saved_svg_equal:true,reopen_svg_equal:true,all_source_facts_recoverable:true,ir_unchanged:true});
}
fs.writeFileSync(out+'/roundtrip.json',JSON.stringify({passed:true,rows,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
 scope:'Saved-document re-render and close/reopen through renderer; no new editor UI or full-graph SVG performance claim.'},null,2)+'\n');
console.log(JSON.stringify(rows));

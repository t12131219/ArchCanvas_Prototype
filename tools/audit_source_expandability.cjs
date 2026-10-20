'use strict';
// Raw projection completeness only. This deliberately does not route the SVG.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),E=require('../semantic_studio/semantic-engine.js');
const input=process.argv[2],output=process.argv[3];assert.ok(input&&output,'Usage: node tools/audit_source_expandability.cjs INPUT OUTPUT');
const bytes=fs.readFileSync(input),ir=JSON.parse(bytes),before=JSON.stringify(ir);
const graph=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
assert.equal(JSON.stringify(ir),before);assert.deepEqual(graph.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());
assert.deepEqual(graph.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
const result={schema:'raw-source-expandability/1',input,input_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
 source_nodes:ir.nodes.length,source_edges:ir.edges.length,visible_nodes:graph.nodes.length,visible_edges:graph.edges.length,
 all_canonical_ids_visible:true,canonical_ir_unchanged:true,
 scope:'actual raw source projection; full-graph SVG routing and browser performance are not verified by this check'};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

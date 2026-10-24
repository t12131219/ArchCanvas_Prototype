#!/usr/bin/env node
/* Recheck actual CUA exports against current routes and immutable source facts.
 * Pass the complete saved UI document, kept outside Git to avoid another IR copy. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer'),I=require('../semantic_studio/canvas-interaction');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/canvas-interaction/current');
const read=p=>JSON.parse(fs.readFileSync(path.resolve(root,p))),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const saved=read(process.argv[2]||'/tmp/semantic-transformer-moved.json'),profile=read('data/semantic/presentations/transformer.json'),ir=read('data/semantic/0216717d966327f4.json');
const tests=read('verification/canvas-interaction/current/test-report.json');
for(const [name,digest]of Object.entries(tests.implementation_sha256))assert.equal(sha(path.join(root,name)),digest,'changed since full tests: '+name);
const frozen=Object.fromEntries([...Object.keys(tests.implementation_sha256),path.relative(root,__filename)].map(p=>[p,sha(path.join(root,p))]));
const audit=read(profile.audit.report),pairs=[['overview-ui.svg',profile.audit.overview],['detail-ui.svg',profile.audit.detail],['finer-ui.svg',profile.audit.finer]];
const svgChecks=pairs.map(([file,name])=>{const row=audit.rows.find(r=>r.name===name),accepted=path.join(root,path.dirname(profile.audit.report),row.svg),actual=path.join(out,file);assert.equal(fs.readFileSync(actual,'utf8'),fs.readFileSync(accepted,'utf8'),name);return {state:name,file,sha256:sha(actual),accepted_sha256:sha(accepted),identical:true};});
assert.deepEqual(saved.ir,ir,'saved canonical IR changed');
const baseline=R.prepareFigure(ir,profile.default_state),restored=I.restore(baseline,saved.state.canvasPlacement,ir);assert.ok(restored,'saved manual placement rejected');
const expected=R.renderPrepared(ir,saved.state,restored).svg,actual=fs.readFileSync(path.join(out,'moved-ui.svg'),'utf8');assert.equal(actual,expected,'saved moved SVG differs on reopen');
assert.deepEqual(restored.graph.nodes,baseline.graph.nodes);assert.deepEqual(restored.graph.edges,baseline.graph.edges);assert.deepEqual(restored.prepared.quality.issues,[]);
for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(restored.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());}
assert.ok(restored.prepared.routes.every(e=>I.physical(e,restored.graph.positions)),'actual SVG path violates an obstacle or orthogonality');
const changes=[...restored.graph.positions].filter(([id,p])=>{const b=baseline.graph.positions.get(id);return p.x!==b.x||p.y!==b.y;}).map(([id,p])=>{const b=baseline.graph.positions.get(id);return {id,dx:p.x-b.x,dy:p.y-b.y};});assert.ok(changes.length>1,'parent movement must carry descendants');
const reopened=path.join(out,'reopened-ui.svg');if(fs.existsSync(reopened))assert.equal(fs.readFileSync(reopened,'utf8'),actual,'actual UI reopen differs');
for(const [name,digest]of Object.entries(frozen))assert.equal(sha(path.join(root,name)),digest,'changed during audit: '+name);
const report={schema:'semantic-canvas-interaction-audit/1',tests:{groups:tests.commands.length,tests:Object.values(tests.counts).reduce((a,b)=>a+b,0),passed:tests.commands.every(c=>c.exit_code===0)},svg_checks:svgChecks,
  canonical:{nodes:ir.nodes.length,edges:ir.edges.length,contracts:ir.semantic_contracts.length,saved_ir_equal:true,nodes_and_edges_unchanged:true,complete_accounting:true},
  moved:{svg_sha256:sha(path.join(out,'moved-ui.svg')),exact_save_reopen:true,actual_ui_reopen:fs.existsSync(reopened),physical_routes:restored.prepared.routes.length,all_physical_routes_valid:true,quality:restored.prepared.quality,changes},
  implementation_sha256:frozen};
fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({tests:report.tests,svg_checks:svgChecks.length,moved:changes.length,actual_ui_reopen:report.moved.actual_ui_reopen}));

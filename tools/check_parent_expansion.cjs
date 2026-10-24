/* Independently recheck frozen tests, actual UI exports and saved geometry. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer'),I=require('../semantic_studio/canvas-interaction');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/parent-expansion/current');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const tests=read(path.join(out,'test-report.json')),report=read(path.join(out,'report.json'));
assert.equal(report.complete,true);assert.ok(tests.commands.every(c=>c.exit_code===0));
for(const [p,h]of Object.entries(tests.implementation_sha256))assert.equal(sha(path.join(root,p)),h,'changed since tests: '+p);
for(const [p,h]of Object.entries(report.implementation_sha256))assert.equal(sha(p),h,'changed since capture: '+p);
const before=read(path.join(root,'verification/parent-expansion/before/report.json'));
for(const row of report.rows){
 const old=before.rows.find(r=>r.name===row.name);assert.equal(row.svg_sha256,old.svg_sha256);assert.equal(row.facts_sha256,old.facts_sha256);
 assert.equal(sha(path.join(out,row.name+'.svg')),row.svg_sha256);
}
const profile=read(path.join(root,'data/semantic/presentations/transformer.json')),accepted=read(path.join(root,profile.audit.report));
const defaults=[['Transformer-F0',profile.audit.overview],['Transformer-F1',profile.audit.detail],['Transformer-finer',profile.audit.finer]].map(([name,id])=>{
 const row=accepted.rows.find(r=>r.name===id),actual=path.join(out,name+'.svg'),reference=path.join(root,path.dirname(profile.audit.report),row.svg);
 assert.equal(sha(actual),sha(reference));return {name,sha256:sha(actual),identical:true};
});
const ui=[['detail-ui.svg','Transformer-F1.svg'],['closed-ui.svg','incremental-closed.svg'],['opened-ui.svg','incremental-open.svg']].map(([actual,expected])=>{
 assert.equal(sha(path.join(out,actual)),sha(path.join(out,expected)),'actual UI export: '+actual);return {file:actual,sha256:sha(path.join(out,actual)),identical:true};
});
const doc=read(process.argv[2]||'/tmp/parent-incremental-document.json'),ir=read(path.join(root,'data/semantic/0216717d966327f4.json'));
assert.deepEqual(doc.ir,ir);assert.deepEqual(doc.state,report.incremental.closed_state);
const raw=JSON.stringify(ir),closed=R.prepareFigure(ir,doc.state),opened=R.prepareFrontier(ir,profile.default_state,closed,report.parent);assert.ok(opened);
for(const [figure,file,state]of [[closed,'closed-ui.svg',doc.state],[opened,'opened-ui.svg',profile.default_state]]){
 assert.equal(R.renderPrepared(ir,state,figure).svg,fs.readFileSync(path.join(out,file),'utf8'));
 assert.deepEqual(figure.prepared.quality.issues,[]);assert.ok(figure.prepared.routes.every(e=>I.physical(e,figure.graph.positions)));
 assert.ok(!figure.graph.constraint_receipts.some(c=>c.status==='conflict'));
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
  const ids=Object.values(figure.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());
 }
}
assert.equal(JSON.stringify(ir),raw);
const result={schema:'parent-expansion-acceptance/1',tests:{groups:tests.commands.length,tests:Object.values(tests.counts).reduce((a,b)=>a+b,0),passed:true},
 complete_layouts_unchanged:report.rows.length,default_frontiers:defaults,actual_ui:ui,
 canonical:{nodes:ir.nodes.length,edges:ir.edges.length,contracts:ir.semantic_contracts.length,unchanged:true,complete_accounting:true},
 incremental:{exact_save_reopen:true,all_routes_physical:true,closed_crossings:closed.prepared.quality.line_geometry.crossings,opened_crossings:opened.prepared.quality.line_geometry.crossings},
 checker_sha256:sha(__filename)};
fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

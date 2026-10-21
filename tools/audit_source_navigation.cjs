'use strict';
// Measure and retain every raw-source route. No publication frontier or
// inferred execution behavior substitutes for the full source projection.
const fs=require('node:fs'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const E=require('../semantic_studio/semantic-engine.js');
const folder='verification/source-navigation/current/',input='verification/helper-contracts/current/Transformer-current.json';
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ir=JSON.parse(fs.readFileSync(input)),saved=JSON.parse(zlib.gunzipSync(fs.readFileSync(folder+'source-saved.json.gz')));
assert.deepEqual(saved.ir,ir);const original=JSON.stringify(ir),runs=[];let last;
for(let i=0;i<3;i++){
 const start=performance.now(),g=E.project(ir,saved.state),projected=performance.now();
 assert.deepEqual(g.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());
 assert.deepEqual(g.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
 const routes=g.edges.map(e=>({...e,route:E.route(e,g.positions)}));
 const ms=performance.now()-projected,failures=routes.filter(e=>!e.route.ok).map(e=>({id:e.id,reason:e.route.reason}));
 last={state:saved.state,bounds:g.bounds,nodes:[...g.positions.values()],edges:routes};
 runs.push({project_ms:projected-start,route_ms:ms,nodes:g.nodes.length,edges:g.edges.length,failures,geometry_sha256:digest(last)});
 assert.equal(JSON.stringify(ir),original);assert.equal(runs[i].geometry_sha256,runs[0].geometry_sha256);
 console.log(JSON.stringify(runs[i]));
}
fs.writeFileSync(folder+'source-routing.layout.json',JSON.stringify(last));
const files=['semantic_studio/app.js','semantic_studio/index.html','semantic_studio/style.css','semantic_studio/architecture-layout.js','semantic_studio/semantic-engine.js','semantic_studio/relation-constraints.js','tools/audit_source_navigation.cjs'];
const report={schema:'source-navigation/1',input,input_sha256:sha(input),runs,goal_complete:false,
 implementation_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),layout_sha256:sha(folder+'source-routing.layout.json'),
 saved_sha256:sha(folder+'source-saved.json.gz'),scope:'CLI full source projection and route measurements. CPU executions, browser event latency, all-pair crossings and global readability are not certified.'};
fs.writeFileSync(folder+'source-routing-report.json',JSON.stringify(report,null,2)+'\n');

'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),v8=require('node:v8'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../semantic_studio/semantic-engine'),P=require('../semantic_studio/publication'),C=require('../semantic_studio/composition-layout');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const ir=read('data/semantic/0216717d966327f4.json'),state=P.fullyExpanded(ir,read('data/semantic/presentations/transformer.json').default_state,E),raw=JSON.stringify(ir);
const start=performance.now(),graph=C.compose(E.project(ir,state),state),projectMs=performance.now()-start;
fs.writeFileSync('/tmp/full-source-scene.v8',v8.serialize({graph,context:graph.positions.context}));
const source=process.argv[2]||'/tmp/archcanvas-full-before/semantic_studio',results=[];
for(const dir of [source,path.resolve('semantic_studio')]){
 const r=cp.spawnSync(process.execPath,['tools/audit_full_source.cjs','--routes'],{env:{...process.env,FULL_SOURCE:dir},encoding:'utf8',timeout:120000,maxBuffer:1e6});assert.equal(r.status,0,r.stderr+' '+(r.error||''));results.push(JSON.parse(r.stdout));
}
assert.equal(results[0].routes_sha256,results[1].routes_sha256,'exact route changes');assert.equal(results[0].quality_sha256,results[1].quality_sha256,'quality changes');assert.equal(JSON.stringify(ir),raw);
const result={schema:'full-source-routing-benchmark/1',nodes:graph.nodes.length,edges:graph.edges.length,projection_and_composition_ms:projectMs,
 state,positions_sha256:sha(JSON.stringify([...graph.positions])),before:results[0],current:results[1],reduction:1-results[1].routing_ms/results[0].routing_ms,
 scope:'Single canonical-short trial of the identical fully visible graph; original 342-unit summary expansion is not a timing baseline. Complete routes and measured quality must match exactly.'};
fs.mkdirSync('verification/full-source/current',{recursive:true});fs.writeFileSync('verification/full-source/current/benchmark.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

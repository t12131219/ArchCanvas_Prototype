/* Independent frozen-run, actual document/SVG, canonical and route checks. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const R=require('../semantic_studio/publication-renderer'),I=require('../semantic_studio/canvas-interaction');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/interaction-performance/current'),read=p=>JSON.parse(fs.readFileSync(p)),hash=x=>crypto.createHash('sha256').update(x).digest('hex'),sha=p=>hash(fs.readFileSync(p));
const tests=read(path.join(out,'test-report.json')),current=read(path.join(out,'report.json')),before=read(path.join(root,'verification/interaction-performance/before/report.json')),catalog=read(path.join(out,'catalog/catalog-report.json')),oldCatalog=read(path.join(root,'verification/full-source/current/catalog-report.json'));
assert.ok(tests.commands.every(r=>r.exit_code===0));assert.equal(current.complete,true);assert.equal(before.complete,true);assert.equal(catalog.complete,true);assert.equal(catalog.models.length,43);
for(const report of [tests,current,catalog])for(const [p,h]of Object.entries(report.implementation_sha256))assert.equal(sha(path.resolve(root,p)),h,'changed since frozen run: '+p);
for(const p of Object.keys(before.implementation_sha256).filter(p=>p.startsWith('/tmp/archcanvas-interaction-before/'))){const rel=path.relative('/tmp/archcanvas-interaction-before',p);assert.equal(sha(p),hash(cp.execFileSync('git',['show','57d79f3:'+rel],{cwd:root,maxBuffer:5e6})));}
for(const command of tests.commands)assert.ok(fs.statSync(path.join(out,command.log)).size);
for(const row of current.rows){const old=before.rows.find(r=>r.name===row.name);for(const key of ['svg_sha256','facts_sha256','result_sha256','accepted','quality'])if(Object.hasOwn(old,key))assert.deepEqual(row[key],old[key],row.name+' '+key);}
let states=0;for(const model of catalog.models){const old=oldCatalog.models.find(m=>m.id===model.id);assert.equal(model.input_sha256,old.input_sha256);for(const row of model.rows){const prior=old.rows.find(r=>r.name===row.name);assert.equal(row.svg_sha256,prior.svg_sha256);assert.equal(row.facts_sha256,prior.facts_sha256);states++;}}
const ir=read(path.join(root,'data/semantic/0216717d966327f4.json')),raw=JSON.stringify(ir),ui=[];
for(const name of ['closed','opened']){
 const state=read(path.join(out,'ui-'+name+'-state.json')),figure=R.prepareFigure(ir,state),actual=path.join(out,'ui-'+name+'.svg'),expected=R.renderPrepared(ir,state,figure).svg;assert.equal(fs.readFileSync(actual,'utf8'),expected);
 assert.ok(figure.prepared.routes.every(e=>I.physical(e,figure.graph.positions)));assert.deepEqual(figure.prepared.quality.issues,[]);assert.ok(!figure.graph.constraint_receipts.some(c=>c.status==='conflict'));
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(figure.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());}
 if(name==='opened'){
  assert.equal(fs.readFileSync(path.join(out,'ui-opened-reopened.svg'),'utf8'),expected);
  const check=cp.spawnSync('python3',[path.join(root,'tools/check_interaction_dom.py'),path.join(out,'ui-opened-dom.json'),actual],{encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);fs.writeFileSync(path.join(out,'dom-acceptance.json'),check.stdout);
 }
 ui.push({name,nodes:figure.graph.nodes.length,edges:figure.graph.edges.length,svg_sha256:sha(actual),physical:true,issues:[],exact_save_reopen:true});
}
assert.equal(JSON.stringify(ir),raw);const metrics=read(path.join(out,'ui-metrics.json'));
assert.equal(metrics.samples.find(s=>s.action==='full-cache').allNodesRetained,true);
const fullCache=metrics.samples.find(s=>s.action==='full-cache-v2');
assert.equal(fullCache.nodes,3371);assert.equal(fullCache.edges,3663);assert.equal(fullCache.allNodesRetained,true);assert.equal(fullCache.allEdgesRetained,true);
assert.equal(fullCache.metrics.domCreatedNodes,'0');assert.equal(fullCache.metrics.domCreatedEdges,'0');
const firstOpen=metrics.samples.find(s=>s.action==='parent-first-open-after-reopen');assert.equal(firstOpen.metrics.cached,'false');assert.equal(firstOpen.metrics.incremental,'true');assert.equal(firstOpen.nodes,80);
const ordinary=metrics.samples.find(s=>s.action==='ordinary-move-undo-redo-v2');assert.equal(ordinary.undoExact,true);assert.equal(ordinary.redoExact,true);
assert.equal(metrics.samples.find(s=>s.action==='opened-document-reopen-v2').exactSVG,true);
const result={schema:'interaction-performance-acceptance/1',tests:{groups:tests.commands.length,tests:Object.values(tests.counts).reduce((a,b)=>a+b,0),passed:true},
 catalog:{models:43,states,SVG_and_facts_unchanged:true},baseline_commit:'57d79f3',exact_comparison_rows:current.rows.length,actual_ui:ui,
 canonical:{nodes:ir.nodes.length,edges:ir.edges.length,unchanged:true,complete_accounting:true},
 retained_DOM:{nodes:fullCache.nodes,edges:fullCache.edges,all_instances_retained:true},
 limitations:{encoder_incremental_accepted:false,complete_source_routing_failures:8,UI_concurrent_samples_not_timing_baselines:true},
 checker_sha256:sha(__filename)};
fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

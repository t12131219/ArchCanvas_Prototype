/* Independent receipts for frozen runs and complete, actual browser exports. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const R=require('../semantic_studio/publication-renderer'),L=require('../semantic_studio/architecture-layout');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/full-source/current');
const read=p=>JSON.parse(fs.readFileSync(p)),hash=s=>crypto.createHash('sha256').update(s).digest('hex'),sha=p=>hash(fs.readFileSync(p));
const tests=read(path.join(out,'test-report.json')),catalog=read(path.join(out,'catalog-report.json')),before=read(path.join(root,'verification/full-source/before/catalog-report.json'));
assert.equal(catalog.complete,true);assert.equal(before.complete,true);assert.equal(catalog.models.length,43);assert.ok(tests.commands.every(c=>c.exit_code===0));
for(const run of [tests,catalog])for(const [p,h]of Object.entries(run.implementation_sha256))assert.equal(sha(path.join(root,p)),h,'changed since frozen run: '+p);
for(const item of tests.commands)assert.ok(fs.statSync(path.join(out,item.log)).size>0);
let unchanged=0;
for(const model of catalog.models){const old=before.models.find(x=>x.id===model.id);assert.equal(model.input_sha256,old.input_sha256);assert.equal(model.rows.length,3);
 for(const row of model.rows.filter(x=>x.name!=='full')){const prior=old.rows.find(x=>x.name===row.name);assert.equal(row.svg_sha256,prior.svg_sha256);assert.equal(row.facts_sha256,prior.facts_sha256);unchanged++;}
}
const baseline={commit:'ebb39ec',files:{}};
for(const n of fs.readdirSync('/tmp/archcanvas-full-before/semantic_studio').filter(x=>x.endsWith('.js')||x==='index.html')){
 const p='semantic_studio/'+n,actual=sha('/tmp/archcanvas-full-before/'+p),expected=hash(cp.execFileSync('git',['show',baseline.commit+':'+p],{cwd:root,maxBuffer:5e6}));assert.equal(actual,expected,p);baseline.files[p]=actual;
}
const benchmark=read(path.join(out,'benchmark.json'));assert.equal(benchmark.before.routes_sha256,benchmark.current.routes_sha256);assert.equal(benchmark.before.quality_sha256,benchmark.current.quality_sha256);
const docPath=process.argv[2]||'/tmp/full-source-ui-document.json',svgPath=process.argv[3]||'/tmp/full-source-ui.svg',reopenPath=process.argv[4]||'/tmp/full-source-ui-reopened.svg';
const doc=read(docPath),ir=read(path.join(root,'data/semantic/0216717d966327f4.json')),raw=JSON.stringify(ir);assert.deepEqual(doc.ir,ir);assert.equal(doc.state.paperCanonical,true);
const figure=R.prepareFigure(ir,doc.state),graph=figure.graph,svg=fs.readFileSync(svgPath,'utf8');assert.equal(R.renderPrepared(ir,doc.state,figure).svg,svg);assert.equal(sha(svgPath),sha(reopenPath));assert.equal(JSON.stringify(ir),raw);
assert.equal(graph.nodes.length,ir.nodes.length);assert.equal(graph.edges.length,ir.edges.length);
for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());}
const idx=new Map(ir.nodes.map(n=>[n.id,n])),edges=new Map(ir.edges.map(e=>[e.id,e]));for(const n of graph.nodes)assert.equal(Object.hasOwn(n,'source_parent')?n.source_parent:n.parent,idx.get(n.id).parent);
// Inspect the exported physical path data, without using renderer path helpers.
const unescape=s=>s.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const paths=new Map([...svg.matchAll(/<path\s+([^>]*data-edge-id="[^"]+"[^>]*)>/g)].map(m=>{const a=Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(x=>[x[1],unescape(x[2])]));return [a['data-edge-id'],a];}));assert.equal(paths.size,ir.edges.length);
const failed=[],nonphysical=[];let checkedSegments=0;
for(const edge of figure.prepared.routes){const source=edges.get(edge.id),a=paths.get(edge.id),pts=[...a.d.matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g)].map(m=>({x:Number(m[1]),y:Number(m[2])}));assert.deepEqual(pts,edge.route.points);
 assert.equal(a['data-source-port'],source.source_port);assert.equal(a['data-target-port'],source.target_port);assert.equal(a['data-canonical-source'],source.source);assert.equal(a['data-canonical-target'],source.target);
 if(!edge.route.ok){failed.push(edge.id);continue;}
 const boxes=L.routeObstacles(edge,graph.positions);let physical=pts.length>=2;
 for(let i=1;i<pts.length;i++){const p=pts[i-1],q=pts[i];physical=physical&&(p.x===q.x||p.y===q.y)&&!L.blocked(p,q,boxes);checkedSegments++;}
 if(!physical)nonphysical.push(edge.id);
}
assert.equal(nonphysical.length,0);assert.equal(failed.length,figure.prepared.quality.route_failures.length);
const q=figure.prepared.quality;
const result={schema:'full-source-acceptance/1',tests:{groups:tests.commands.length,tests:Object.values(tests.counts).reduce((a,b)=>a+b,0),passed:true},
 catalog:{models:43,states:129,F0_F1_unchanged:unchanged,full_accounting_verified:true},baseline,
 benchmark:{same_routes:true,same_measured_quality:true,before_ms:benchmark.before.routing_ms,current_ms:benchmark.current.routing_ms,reduction:benchmark.reduction},
 canonical:{nodes:ir.nodes.length,edges:ir.edges.length,unchanged:true,source_ownership:true,complete_accounting:true},
 actual_ui:[docPath,svgPath,reopenPath].map(p=>({file:path.basename(p),bytes:fs.statSync(p).size,sha256:sha(p)})),
 exact_save_reopen:true,successful_routes:{count:figure.prepared.routes.length-failed.length,orthogonal_and_obstacle_clear:true,checked_segments:checkedSegments},
 quality:{passed:false,issues:q.issues,failed_routes:failed,crossings:q.line_geometry.crossings,unrelated_contacts:q.line_geometry.unrelated_contacts.length,overlapping_paths:q.line_geometry.overlapping_paths.length,unplaced_port_labels:q.unplaced_port_labels.length,bounds:figure.prepared.bounds},
 checker_sha256:sha(__filename)};
fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,baseline:{commit:baseline.commit,files:Object.keys(baseline.files).length}}));

/* Sequential cold-frontier benchmark. Freeze producers for the entire run.
 * The optional second directory supplies pre-change SVG/fact receipts. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=process.env.PARENT_AUDIT_SOURCE||path.resolve(__dirname,'../semantic_studio');
const R=require(path.join(source,'publication-renderer')),I=require(path.join(source,'canvas-interaction'));
const out=process.argv[2],before=process.argv[3];assert.ok(out,'output directory required');fs.mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p)),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const files=[...fs.readdirSync(source).filter(p=>p.endsWith('.js')).map(p=>path.join(source,p)),path.resolve(__filename)];
const frozen=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(p))]));
const rows=read('verification/input-placement/current/suite-report.json').rows;
const ir=read('data/semantic/0216717d966327f4.json'),detail=read('data/semantic/presentations/transformer.json').default_state;
const cases=['Transformer-F1','Transformer-F0','Transformer-finer'].map(name=>({name,ir,state:rows.find(r=>r.name===name).state}));
// A real parent with the full detailed subtree retained in the open set.
const parent=ir.nodes.find(n=>n.label==='self.decode'&&n.parent===detail.open[0]).id;
cases.push({name:'parent-closed',ir,state:{...detail,open:detail.open.filter(id=>id!==parent)}});
const ordinary=read('verification/input-placement/current/SharedInputPaths.json');
cases.push({name:'ordinary-open',ir:ordinary,state:{view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperComposition:'architecture',paperDirection:'down',paperAuto:false,open:ordinary.nodes.filter(n=>n.kind==='composite').map(n=>n.id)}});
const results=[],figures=new Map();let incremental=null;
const report=()=>({schema:'parent-expansion-performance/1',parent,implementation_sha256:frozen,rows:results,incremental});
for(const c of cases){
 const raw=JSON.stringify(c.ir),start=performance.now(),figure=R.prepareFigure(c.ir,c.state),compute=performance.now()-start;
 const rendered=R.renderPrepared(c.ir,c.state,figure),g=figure.graph;
 figures.set(c.name,figure);
 assert.equal(JSON.stringify(c.ir),raw,'canonical IR changed');
 for(const [key,items]of [['node_accounting',c.ir.nodes],['edge_accounting',c.ir.edges]]){
  const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());
 }
 assert.ok(figure.prepared.routes.every(e=>I.physical(e,g.positions)),'route obstacle/orthogonality');
 const facts=hash(JSON.stringify({nodes:g.nodes,edges:g.edges,nodes_accounted:g.node_accounting,edges_accounted:g.edge_accounting}));
 const row={name:c.name,compute_ms:compute,nodes:g.nodes.length,edges:g.edges.length,svg_sha256:hash(rendered.svg),facts_sha256:facts,issues:figure.prepared.quality.issues};
 if(before){const old=read(path.join(before,'report.json')).rows.find(r=>r.name===c.name);assert.equal(row.svg_sha256,old.svg_sha256,'SVG changed '+c.name);assert.equal(facts,old.facts_sha256,'facts changed '+c.name);row.before_ms=old.compute_ms;row.reduction=1-compute/old.compute_ms;}
 fs.writeFileSync(path.join(out,c.name+'.svg'),rendered.svg);results.push(row);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report(),null,2)+'\n');console.log(JSON.stringify(row));
}
if(R.prepareFrontier){
 const raw=JSON.stringify(ir),closed=cases.find(c=>c.name==='parent-closed').state,base=figures.get('Transformer-F1');
 let start=performance.now(),folded=R.prepareFrontier(ir,closed,base,parent),closeMs=performance.now()-start;assert.ok(folded,'decoder incremental collapse rejected');
 const saved={...closed,canvasPlacement:I.placement(folded)},svg=R.renderPrepared(ir,saved,folded).svg;
 assert.deepEqual(folded.graph.edges,figures.get('parent-closed').graph.edges);assert.deepEqual(folded.graph.node_accounting,figures.get('parent-closed').graph.node_accounting);
 assert.deepEqual(folded.graph.edge_accounting,figures.get('parent-closed').graph.edge_accounting);assert.ok(folded.prepared.routes.every(e=>I.physical(e,folded.graph.positions)));
 start=performance.now();const reopened=R.render(ir,JSON.parse(JSON.stringify(saved))),reopenMs=performance.now()-start;assert.equal(reopened.svg,svg,'incremental save/reopen');
 start=performance.now();const expanded=R.prepareFrontier(ir,detail,folded,parent),expandMs=performance.now()-start;assert.ok(expanded,'first incremental parent expansion rejected');
 assert.deepEqual(expanded.graph.edges,base.graph.edges);assert.deepEqual(expanded.graph.node_accounting,base.graph.node_accounting);
 assert.deepEqual(expanded.graph.edge_accounting,base.graph.edge_accounting);assert.ok(expanded.prepared.routes.every(e=>I.physical(e,expanded.graph.positions)));assert.equal(JSON.stringify(ir),raw);
 const expandedSvg=R.renderPrepared(ir,detail,expanded).svg;
 fs.writeFileSync(path.join(out,'incremental-closed.svg'),svg);fs.writeFileSync(path.join(out,'incremental-open.svg'),expandedSvg);
 fs.writeFileSync('/tmp/parent-incremental-document.json',JSON.stringify({schema:'semantic-canvas/1',ir,state:saved}));
 incremental={close_ms:closeMs,first_expand_ms:expandMs,reopen_ms:reopenMs,closed_receipt:folded.prepared.routing.parent_frontier,
  expanded_receipt:expanded.prepared.routing.parent_frontier,closed_quality:folded.prepared.quality,expanded_quality:expanded.prepared.quality,
  closed_state:saved,closed_svg_sha256:hash(svg),expanded_svg_sha256:hash(expandedSvg),exact_reopen:true,canonical_unchanged:true,complete_accounting:true};
 console.log(JSON.stringify({incremental:true,close_ms:closeMs,expand_ms:expandMs,reopen_ms:reopenMs}));
}
for(const [p,h]of Object.entries(frozen))assert.equal(hash(fs.readFileSync(p)),h,'producer changed during capture');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...report(),complete:true},null,2)+'\n');

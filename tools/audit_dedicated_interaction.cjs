/* Sequential capture; producers and this capture stay frozen throughout. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const out=path.resolve(process.argv[2]||'verification/dedicated-interaction/current'),beforeDir=path.resolve(process.argv[3]||'/tmp/semantic-interaction-before');fs.mkdirSync(out,{recursive:true});
const dir=path.resolve('semantic_studio'),sha=s=>crypto.createHash('sha256').update(s).digest('hex'),files=[...fs.readdirSync(dir).filter(p=>p.endsWith('.js')||p.endsWith('.html')).map(p=>path.join(dir,p)),__filename],frozen=Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p))]));
const old={R:require(path.join(beforeDir,'publication-renderer')),I:require(path.join(beforeDir,'canvas-interaction')),A:require(path.join(beforeDir,'authoring-model'))},now={R:require(path.join(dir,'publication-renderer')),I:require(path.join(dir,'canvas-interaction')),A:require(path.join(dir,'authoring-model'))},P=require(path.join(dir,'publication')),E=require(path.join(dir,'semantic-engine'));
const read=p=>JSON.parse(fs.readFileSync(p)),ir=read('data/semantic/0216717d966327f4.json'),state=read('data/semantic/presentations/transformer.json').default_state,C=require(path.join(dir,'composition-layout'));
const measure=fn=>{const start=performance.now(),value=fn();return {value,ms:performance.now()-start};},rows=[];
let full;
for(const [name,s]of [['F0',C.frontier(state,'overview')],['F1',state],['full-source',P.fullyExpanded(ir,state,E)]]){
 const a=measure(()=>old.R.prepareFigure(ir,s)),b=measure(()=>now.R.prepareFigure(ir,s));
 for(const key of ['nodes','edges','node_accounting','edge_accounting'])assert.deepEqual(b.value.graph[key],a.value.graph[key],name+' '+key);
 assert.deepEqual([...b.value.graph.positions],[...a.value.graph.positions],name+' positions');assert.deepEqual(b.value.prepared.routes,a.value.prepared.routes,name+' routes');assert.deepEqual(b.value.prepared.quality,a.value.prepared.quality,name+' quality');
 rows.push({name,before_ms:a.ms,after_ms:b.ms,nodes:b.value.graph.nodes.length,edges:b.value.graph.edges.length,geometry_unchanged:true,quality:b.value.prepared.quality});
 if(name==='full-source')full=b.value;
}
const parent=full.graph.nodes.filter(n=>full.graph.positions.get(n.id)?.expanded).map(n=>({id:n.id,size:now.I.session(full,n.id)?.ids.size||0})).sort((a,b)=>b.size-a.size).find(n=>full.graph.idx.nodes.get(n.id)?.parent)||{id:full.graph.nodes[0].id};
const s=now.I.session(full,parent.id),normalized={...s,parent:s.parent&&{...s.parent,header:0}},inputs=Array.from({length:120},(_,i)=>[(i%21-10)*2,(i%17-8)*3]);
const a=measure(()=>inputs.map(([dx,dy])=>old.I.constrain(normalized,dx,dy))),b=measure(()=>inputs.map(([dx,dy])=>now.I.constrain(s,dx,dy)));assert.deepEqual(b.value,a.value);
rows.push({name:'full-parent-120-constraints',moving:s.ids.size,obstacles:s.obstacles.length,enclosed:s.enclosed,before_ms:a.ms,after_ms:b.ms,results_identical:true,note:'baseline parent header normalized to 0 for the intentional title-row policy change'});
const doc=now.A.fromIR(ir),ids=doc.nodes.map(n=>n.id),pa=measure(()=>ids.map(id=>old.A.ports(doc,id))),pb=measure(()=>{const idx=now.A.portIndex(doc);return ids.map(id=>now.A.ports(doc,id,idx));});assert.deepEqual(pb.value,pa.value);
rows.push({name:'all-editor-ports',nodes:ids.length,before_ms:pa.ms,after_ms:pb.ms,results_identical:true});
const small=read('verification/input-placement/current/SharedInputPaths.json'),smallState={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperComposition:'architecture',paperDirection:'down'};
for(const [name,value,s]of [['ordinary',small,smallState],['renamed',({...small,title:'UnrelatedGraph',nodes:small.nodes.map(n=>({...n,label:n.kind+' '+n.id}))}),smallState]]){
 const f=now.R.prepareFigure(value,s),candidates=f.graph.nodes.filter(n=>n.parent);let moved;
 for(const n of candidates){try{moved=now.I.move(f,n.id,2,0,value);if(moved.moved)break;}catch(_){}}
 assert.ok(moved?.moved,name+' move');assert.deepEqual(moved.figure.graph.nodes,f.graph.nodes);assert.deepEqual(moved.figure.graph.edges,f.graph.edges);assert.ok(now.I.restore(f,JSON.parse(JSON.stringify(now.I.placement(moved.figure))),value));
 rows.push({name:name+'-move',nodes:f.graph.nodes.length,edges:f.graph.edges.length,restored:true,facts_unchanged:true});
}
// Editor expansion uses the same route reuse/quality gate as the architecture
// frontier. Compare it to the previous full recomputation at this exact cut.
const editState={view:'publication',mode:'source',paperCanonical:true,paperMedium:'canvas',paperComposition:'dependency',paperAuto:false,paperGranularity:'detailed',details:true,open:ir.nodes.filter(n=>!n.parent&&n.kind==='composite').map(n=>n.id)};
const editBefore=now.R.prepareFigure(ir,editState),editParent=ir.nodes.find(n=>n.parent&&n.kind==='composite'&&editBefore.graph.positions.has(n.id)),editNext={...editState,open:[...editState.open,editParent.id]};
const ea=measure(()=>old.R.prepareFigure(ir,editNext)),eb=measure(()=>now.R.prepareFrontier(ir,editNext,editBefore,editParent.id));assert.ok(eb.value);
assert.deepEqual(eb.value.graph.nodes,ea.value.graph.nodes);assert.deepEqual(eb.value.graph.edges,ea.value.graph.edges);assert.ok(eb.value.prepared.routes.every(e=>now.I.physical(e,eb.value.graph.positions)));
rows.push({name:'canonical-editor-parent-open',before_ms:ea.ms,after_ms:eb.ms,nodes:eb.value.graph.nodes.length,edges:eb.value.graph.edges.length,facts_unchanged:true,quality:eb.value.prepared.quality,reuse:eb.value.prepared.routing.parent_frontier});
for(const [p,h]of Object.entries(frozen))assert.equal(sha(fs.readFileSync(p)),h,'changed during capture '+p);
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({schema:'dedicated-interaction-transfer/1',complete:true,implementation_sha256:frozen,baseline_sha256:Object.fromEntries(fs.readdirSync(beforeDir).filter(p=>p.endsWith('.js')).map(p=>[p,sha(fs.readFileSync(path.join(beforeDir,p)))])),rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(({quality,...row})=>row)));

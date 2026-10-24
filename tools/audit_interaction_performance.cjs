/* Run sequentially with producers/tests/capture frozen. Exact geometry oracle. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const source=process.env.INTERACTION_SOURCE||path.resolve('semantic_studio'),R=require(path.join(source,'publication-renderer')),I=require(path.join(source,'canvas-interaction')),E=require(path.join(source,'semantic-engine')),P=require(path.join(source,'publication'));
const out=process.argv[2];assert.ok(out);fs.mkdirSync(out,{recursive:true});const read=p=>JSON.parse(fs.readFileSync(p)),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const files=[...fs.readdirSync(source).filter(n=>n.endsWith('.js')||n==='index.html').map(n=>path.join(source,n)),__filename],frozen=Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p))]));
const ir=read('data/semantic/0216717d966327f4.json'),state=read('data/semantic/presentations/transformer.json').default_state,raw=JSON.stringify(ir),rows=[];
const timed=(name,fn)=>{const start=performance.now(),value=fn();rows.push({name,ms:performance.now()-start});return value;};
const facts=g=>sha(JSON.stringify({nodes:g.nodes,edges:g.edges,node_accounting:g.node_accounting,edge_accounting:g.edge_accounting}));
const receipt=(row,figure,s)=>Object.assign(row,figure?{accepted:true,nodes:figure.graph.nodes.length,edges:figure.graph.edges.length,svg_sha256:sha(R.renderPrepared(ir,s,figure).svg),facts_sha256:facts(figure.graph),quality:figure.prepared.quality}:{accepted:false});
const base=timed('F1',()=>R.prepareFigure(ir,state));receipt(rows.at(-1),base,state);
const parent=ir.nodes.find(n=>n.label==='self.decode'&&n.parent===state.open[0]).id,closed={...state,open:state.open.filter(id=>id!==parent)};
const folded=timed('close-parent',()=>R.prepareFrontier(ir,closed,base,parent));assert.ok(folded);receipt(rows.at(-1),folded,closed);
const expanded=timed('first-open-parent',()=>R.prepareFrontier(ir,state,folded,parent));assert.ok(expanded);receipt(rows.at(-1),expanded,state);
const saved=I.placement(folded),restored=timed('restore-geometry',()=>I.restore(folded,JSON.parse(JSON.stringify(saved)),ir));assert.ok(restored);receipt(rows.at(-1),restored,closed);
const encoder=ir.nodes.find(n=>n.label==='self.encode'&&n.parent===state.open[0]).id,encState={...state,open:state.open.filter(id=>id!==encoder)},enc=timed('encoder-candidate',()=>R.prepareFrontier(ir,encState,base,encoder));receipt(rows.at(-1),enc,encState);
const ordinary=read('verification/input-placement/current/SharedInputPaths.json'),s={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperComposition:'architecture',paperDirection:'down',paperAuto:false,open:ordinary.nodes.filter(n=>n.kind==='composite').map(n=>n.id)},f=R.prepareFigure(ordinary,s);
const moved=timed('ordinary-move',()=>I.move(f,f.graph.nodes.find(n=>!n.parent).id,2,0,ordinary));Object.assign(rows.at(-1),{svg_sha256:sha(R.renderPrepared(ordinary,s,moved.figure).svg),facts_sha256:facts(moved.figure.graph)});
const fullState=P.fullyExpanded(ir,state,E),full=timed('full-source',()=>R.prepareFigure(ir,fullState));receipt(rows.at(-1),full,fullState);
const session=timed('large-parent-session',()=>I.session(full,parent));Object.assign(rows.at(-1),{moving:session.ids.size,obstacles:session.obstacles.length});
const samples=timed('large-parent-120-preview-checks',()=>Array.from({length:120},(_,i)=>I.constrain(session,(i%21-10)*2,(i%17-8)*3)));Object.assign(rows.at(-1),{checks:samples.length,result_sha256:sha(JSON.stringify(samples))});
const smallSession=I.session(f,f.graph.nodes.find(n=>n.parent).id),ordinarySamples=timed('ordinary-120-preview-checks',()=>Array.from({length:120},(_,i)=>I.constrain(smallSession,i%13-6,i%9-4)));Object.assign(rows.at(-1),{result_sha256:sha(JSON.stringify(ordinarySamples))});
assert.equal(JSON.stringify(ir),raw);for(const [p,h]of Object.entries(frozen))assert.equal(sha(fs.readFileSync(p)),h,'changed during capture');
if(process.argv[3]){const before=read(path.join(process.argv[3],'report.json'));for(const row of rows){const old=before.rows.find(x=>x.name===row.name);for(const key of ['svg_sha256','facts_sha256','result_sha256','accepted'])if(Object.hasOwn(old,key))assert.deepEqual(row[key],old[key],row.name+' '+key);row.before_ms=old.ms;row.reduction=1-row.ms/old.ms;}}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({schema:'interaction-performance/1',complete:true,implementation_sha256:frozen,parent,rows},null,2)+'\n');console.log(JSON.stringify(rows.map(({quality,...row})=>row)));

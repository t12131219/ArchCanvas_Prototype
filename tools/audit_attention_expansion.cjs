/* Sequential before/after capture; freeze producers, tests and this file. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process'),v8=require('node:v8');
const source=process.env.ATTENTION_SOURCE||path.resolve('semantic_studio'),R=require(path.join(source,'publication-renderer')),I=require(path.join(source,'canvas-interaction'));
const read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>crypto.createHash('sha256').update(x).digest('hex'),out=process.argv[2];assert.ok(out);fs.mkdirSync(out,{recursive:true});
const files=[...fs.readdirSync(source).filter(n=>n.endsWith('.js')||n==='index.html').map(n=>path.join(source,n)),__filename,...fs.readdirSync('tests').filter(n=>n.endsWith('.cjs')||n.endsWith('.py')).map(n=>path.resolve('tests',n))],frozen=Object.fromEntries(files.map(p=>[p,sha(fs.readFileSync(p))]));
const ir=read('data/semantic/0216717d966327f4.json'),raw=JSON.stringify(ir),initial=read('data/semantic/presentations/transformer.json').default_state,interaction=read('verification/attention-expansion/current/interaction-state.json'),rows=[];
const facts=g=>sha(JSON.stringify({nodes:g.nodes,edges:g.edges,node_accounting:g.node_accounting,edge_accounting:g.edge_accounting}));
const timed=(name,s,fn)=>{const t=performance.now(),f=fn(),ms=performance.now()-t;assert.ok(f,name);const svg=R.renderPrepared(ir,s,f).svg;
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(f.graph[key]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(n=>n.id).sort());}
 rows.push({name,state:s,ms,nodes:f.graph.nodes.length,edges:f.graph.edges.length,svg_sha256:sha(svg),facts_sha256:facts(f.graph),quality:f.prepared.quality,incremental:!!f.prepared.routing?.parent_frontier,preflight:f.prepared.routing?.frontier_preflight});
 fs.writeFileSync(path.join(out,name+'.svg'),svg);fs.writeFileSync(path.join(out,name+'-state.json'),JSON.stringify(s,null,2)+'\n');console.log(JSON.stringify({name,ms,nodes:f.graph.nodes.length,edges:f.graph.edges.length,crossings:f.prepared.quality.line_geometry.crossings}));return f;};
const scratch=path.join('/tmp','archcanvas-attention-'+sha(path.resolve(out)).slice(0,12)),baseFile=scratch+'-base.v8',openFile=scratch+'-open.v8';
const pack=f=>v8.serialize({f,context:f.graph.positions.context}),unpack=file=>{const p=v8.deserialize(fs.readFileSync(file));p.f.graph.positions.context=p.context;return p.f;};
const open=(s,b,id)=>R.prepareFrontier(ir,s,b,id)||R.prepareFigure(ir,s);
if(process.argv[3]==='--case'){
 const name=process.argv[4];let figure,state;
 if(name==='attention-child'){
  const f=unpack(openFile),child=f.graph.nodes.find(n=>n.content_inventory&&n.parent===interaction.id);assert.ok(child);
  state={...interaction.state,open:[...interaction.state.open,child.id]};figure=timed(name,state,()=>open(state,f,child.id));
 }else{
  const base=unpack(baseFile),n=base.graph.nodes.filter(n=>n.semantic_type==='scaled-dot-product-attention')[Number(name.at(-1))-1];assert.ok(n);
  state={...initial,open:[...initial.open,n.id]};figure=timed(name,state,()=>open(state,base,n.id));
 }
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(rows[0],null,2)+'\n');process.exit(0);
}
const base=timed('F1',initial,()=>R.prepareFigure(ir,initial));fs.writeFileSync(baseFile,pack(base));
const id=interaction.id,closedState={...interaction.state,open:interaction.state.open.filter(x=>x!==id)},decoder=initial.open.find(x=>!closedState.open.includes(x));assert.ok(decoder);
const closed=timed('closed-parent',closedState,()=>R.prepareFrontier(ir,closedState,base,decoder)||R.prepareFigure(ir,closedState));assert.equal(closed.graph.nodes.length,39);
const opened=timed('attention-first-open',interaction.state,()=>open(interaction.state,closed,id));assert.equal(opened.graph.nodes.length,49);fs.writeFileSync(openFile,pack(opened));
const restored=timed('save-restore',interaction.state,()=>I.restore(opened,JSON.parse(JSON.stringify(I.placement(opened))),ir));assert.equal(facts(restored.graph),facts(opened.graph));
for(const name of ['F1-attention-1','F1-attention-2','F1-attention-3','attention-child']){
 const t=performance.now(),result=cp.spawnSync(process.execPath,[__filename,out,'--case',name],{encoding:'utf8',env:process.env,timeout:60000,maxBuffer:5e6});
 if(result.error?.code==='ETIMEDOUT'){rows.push({name,status:'timeout',limit_ms:60000,elapsed_ms:performance.now()-t});console.log(JSON.stringify(rows.at(-1)));}
 else {assert.equal(result.status,0,result.stderr);rows.push(read(path.join(out,name+'.json')));console.log(result.stdout.trim());}
}
fs.rmSync(baseFile);fs.rmSync(openFile);
assert.equal(JSON.stringify(ir),raw);for(const [p,h]of Object.entries(frozen))assert.equal(sha(fs.readFileSync(p)),h,'changed during capture');
if(process.argv[3]){const before=read(path.join(process.argv[3],'report.json'));for(const row of rows){const old=before.rows.find(x=>x.name===row.name);assert.ok(old);if(row.status==='timeout'||old.status==='timeout'){row.before_status=old.status||'completed';continue;}for(const key of ['svg_sha256','facts_sha256'])assert.equal(row[key],old[key],row.name+' '+key);row.before_ms=old.ms;row.reduction=1-row.ms/old.ms;}}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({schema:'attention-expansion/1',complete:true,input_sha256:sha(raw),implementation_sha256:frozen,rows},null,2)+'\n');

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const D=require('../semantic_studio/diagram-set.js'),R=require('../semantic_studio/publication-renderer.js');
const read=p=>JSON.parse(fs.readFileSync(p)),state={paperMedium:'canvas',paperGranularity:'roles'};
const same=read('verification/semantic-design/current/after/SameSource.json'),main=R.render(same,state);
const set=D.render(same,state,R,{maxPanels:4,maxTrials:4,main});
test('a bounded diagram set assigns only actual direct detail while preserving its semantic main figure',()=>{
 assert.equal(set.panels[0].result,main);assert.ok(set.panels.length>1);assert.ok(set.attempts.length<=4);
 const before=D.coverage(same,set.plan,[set.panels[0]]).filter(c=>c.status==='fulfilled');
 assert.ok(set.coverage.filter(c=>c.status==='fulfilled').length>before.length);
 assert.ok(set.panels.some(p=>p.id.startsWith('focus:')));assert.ok(set.deferred_goals.length);assert.equal(set.complete,false);
 for(const panel of set.panels.slice(1))assert.ok(D.acceptable(panel.result));
 for(const row of set.coverage.filter(c=>c.status==='fulfilled'))assert.ok(row.panels.every(id=>set.panels.some(p=>p.id===id)));
});
test('limited plans leave deferred obligations; planned pages and failed routes never count as expression',()=>{
 const limited=D.render(same,state,R,{maxPanels:1,maxTrials:0,main});assert.equal(limited.panels.length,1);assert.equal(limited.attempts.length,0);assert.ok(limited.deferred_goals.length);
 const detail=set.panels.find(p=>p.id!=='main'),copy={...detail.result,prepared:{...detail.result.prepared,routes:detail.result.prepared.routes.map(e=>({...e,route:{...e.route,ok:false}}))}};
 const rows=D.coverage(same,set.plan,[{...detail,result:copy}]);
 for(const goal of set.plan.goals.filter(g=>g.edges.length))assert.equal(rows.find(c=>c.goal===goal.id).status,'deferred');
});
test('wrong operand or producer slots cannot discharge an otherwise routed goal',()=>{
 const detail=set.panels.find(p=>p.id!=='main');
 const mutate=change=>({...detail,result:{...detail.result,prepared:{...detail.result.prepared,routes:detail.result.prepared.routes.map(e=>{
  const next={...e,...change(e)};if(e.bundle_members)next.bundle_members=e.bundle_members.map(m=>({...m,...change(m)}));return next;
 })}}});
 const obligations=set.plan.goals.filter(g=>g.edges.length&&D.coverage(same,{goals:[g]},[detail])[0].status==='fulfilled');assert.ok(obligations.length);
 for(const change of [()=>({target_port:'wrong-operand'}),()=>({source_port:'wrong-result'})])for(const goal of obligations)
  assert.equal(D.coverage(same,{goals:[goal]},[mutate(change)])[0].status,'deferred');
});
test('low quality blocks all goal credit, even if nodes and paths are present',()=>{
 for(const change of [q=>q.issues.push('canvas-area-budget'),q=>q.line_geometry.unrelated_contacts.push({}),q=>q.min_canvas_font_px=11]){
  const panel=set.panels[1],quality=structuredClone(panel.result.prepared.quality);change(quality);
  const bad={...panel,result:{...panel.result,prepared:{...panel.result.prepared,quality}}};
  assert.ok(D.coverage(same,set.plan,[bad]).every(r=>r.status==='deferred'));
 }
});
test('an original alias edge cannot bypass checks on the terminal operand, condition, kind or evidence',()=>{
 const ir={nodes:[{id:'producer',kind:'compute'},{id:'alias',kind:'interface'},{id:'consumer',kind:'compute'}],edges:[
  {id:'upstream',source:'producer',source_port:'0',target:'alias',target_port:'in',kind:'data',evidence:'source-dependency'},
  {id:'terminal',source:'alias',source_port:'out',target:'consumer',target_port:'arg:0',kind:'data',evidence:'source-dependency'}]};
 const goal={id:'alias-goal',kind:'source-uses',focus_node:'consumer',core:['consumer'],edges:['upstream']};
 const route={...ir.edges[1],canonical_source:'alias',resolved_source:'producer',source_port:'0',canonical_target:'consumer',originals:['upstream','terminal'],route:{ok:true}};
 const panel=change=>({id:'detail',result:{graph:{positions:new Map([['consumer',{}]]),nodes:[],constraint_receipts:[]},
  prepared:{quality:structuredClone(main.prepared.quality),routes:[{...route,...change}]}}});
 assert.equal(D.coverage(ir,{goals:[goal]},[panel({})])[0].status,'fulfilled');
 for(const change of [{target_port:'arg:1'},{kind:'control'},{condition:{branch:'invented'}},{evidence:'runtime'},
  {canonical_source:'producer'},{resolved_source:'consumer'}])
  assert.equal(D.coverage(ir,{goals:[goal]},[panel(change)])[0].status,'deferred');
});
test('names cannot change requests and source-only planning excludes runtime scopes',()=>{
 const renamed=structuredClone(same);renamed.title='Foreign';for(const n of renamed.nodes){n.label='other';n.source_class='Other';}
 const other=R.render(renamed,state),a=D.plan(same,main,state),b=D.plan(renamed,other,state);
 assert.deepEqual(a.candidates.map(c=>[c.id,c.kind,c.goals,c.state]),b.candidates.map(c=>[c.id,c.kind,c.goals,c.state]));
 const g={...main.graph,architecture:{...main.graph.architecture,nodes:[...main.graph.architecture.nodes,{id:'runtime:extra',parent:main.graph.publication.focus}]},
  expression_goals:{goals:[...main.graph.expression_goals.goals,{id:'runtime-goal',focus_node:'runtime:extra',core:['runtime:extra'],edges:[]}]}};
 assert.ok(!D.plan(same,{graph:g},state).goals.some(g=>g.id==='runtime-goal'));
 assert.ok(D.plan(same,{graph:g},{...state,mode:'merged'}).goals.some(g=>g.id==='runtime-goal'));
});
test('protected folded interiors do not authorize automatic detail, while independent known paths still plan',()=>{
 for(const name of ['FiberBlend','BrokenFiberBlend']){
  const ir=read('verification/diagram-set/current/'+name+'.json'),before=JSON.stringify(ir),result=D.render(ir,state,R,{maxPanels:4,maxTrials:4});
  assert.equal(JSON.stringify(ir),before);assert.ok(ir.nodes.some(n=>n.kind==='opaque'));assert.ok(result.panels.length>1);
  assert.ok(result.panels[0].result.graph.nodes.some(n=>n.kind==='opaque'||n.paper.unknown_count>0));
  assert.ok(!result.plan.candidates.some(c=>c.anchor&&ir.nodes.find(n=>n.id===c.anchor)?.kind==='opaque'&&c.kind!=='local-relationship'));
  assert.ok(result.coverage.filter(c=>c.status==='fulfilled').some(c=>c.panels.some(id=>id!=='main')));
 }
 const chosen=main.graph.nodes.find(n=>n.kind==='composite'&&!main.graph.positions.get(n.id).expanded&&n.semantic_contracts?.length);
 const graph={...main.graph,nodes:main.graph.nodes.map(n=>n.id===chosen.id?{...n,mutable:true}:n)};
 assert.ok(!D.plan(same,{graph},state).candidates.some(c=>c.anchor===chosen.id));
});
test('detail document rerenders deterministically and retains exact external cuts and every original object',()=>{
 const before=JSON.stringify(same);for(const panel of set.panels.slice(1)){
  const r=panel.result;assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);
  for(const [key,items]of [['node_accounting',same.nodes],['edge_accounting',same.edges]]){
   const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
  for(const cut of r.graph.publication.boundary){const original=same.edges.find(e=>e.id===cut.id);assert.ok(original);for(const key of ['source','target','source_port','target_port','kind','condition'])assert.deepEqual(cut[key],original[key]);}
 }assert.equal(JSON.stringify(same),before);
});
test('CLI exports the shared planner result, main/detail links and truthful incomplete manifest',()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'diagram-set-')),{manifest}=require('../tools/export_diagram_set.cjs').exportSet(same,output,{state,maxPanels:4,maxTrials:4,main});
 assert.equal(fs.readFileSync(path.join(output,manifest.panels[0].svg),'utf8'),main.svg);
 assert.deepEqual(manifest.coverage,set.coverage);assert.equal(manifest.complete,false);
 assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/返回主图/);
 assert.deepEqual(read(path.join(output,'manifest.json')).deferred_goals,set.deferred_goals);
});

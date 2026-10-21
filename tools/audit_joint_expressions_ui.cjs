'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=root+'/verification/joint-expressions/current',load=require('./load_publication_renderer.cjs');
const {renderer:R,diagrams:D}=load(root+'/semantic_studio',{diagramSet:true}),E=load(root+'/semantic_studio',{engine:true});
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(out+'/'+f)).digest('hex'),plain=x=>JSON.parse(JSON.stringify(x));
const results=[];
for(const name of ['SourceMosaic','MixedWeave']){
 const base=read('ui-'+name+'-base.json'),saved=read('ui-'+name+'-planned.json'),plan=saved.state.paperDiagramPlan;
 assert.deepEqual(base.ir,saved.ir);assert.deepEqual(plan.requested_state,base.state);
 const main=R.render(base.ir,base.state),set=D.joint(base.ir,base.state,R,{main,maxPanels:3,maxTrials:4});
 const selected=set.panels[0];assert.deepEqual(plain(selected.state),plan.main_state);
 assert.deepEqual(plain(set.coverage),plan.coverage);assert.deepEqual(plain(set.attempts),plan.attempts);
 assert.deepEqual(plain(set.limits),plan.limits);assert.equal(set.complete,plan.complete);
 assert.deepEqual(plain(set.panels.slice(1).map(p=>({id:p.id,anchor:p.anchor,label:p.label,state:p.state}))),plan.details);
 const svg=f=>fs.readFileSync(out+'/'+f,'utf8');
 assert.equal(svg('ui-'+name+'-base.svg'),main.svg);
 assert.equal(svg('ui-'+name+'-planned.svg'),selected.result.svg);
 assert.equal(R.render(saved.ir,saved.state).svg,selected.result.svg);
 if(name==='SourceMosaic'){
  assert.equal(svg('ui-'+name+'-reopened.svg'),selected.result.svg);
  const raw=read('ui-SourceMosaic-raw.json');assert.deepEqual(raw.ir,base.ir);
  const projected=E.project(raw.ir,raw.state);
  assert.deepEqual([...projected.positions.keys()].sort(),base.ir.nodes.map(n=>n.id).sort());
  assert.deepEqual(Array.from(projected.edges,e=>e.id).sort(),base.ir.edges.map(e=>e.id).sort());
  const edges=projected.edges.map(e=>({id:e.id,source:e.source,target:e.target,route:E.route(e,projected.positions)}));
  fs.writeFileSync(out+'/ui-raw-projection.json',JSON.stringify({nodes:[...projected.positions.values()],edges}));
 }else{
  assert.equal(svg('ui-MixedWeave-returned.svg'),selected.result.svg);
  assert.equal(svg('ui-MixedWeave-reopened.svg'),selected.result.svg);
  assert.deepEqual(read('ui-stale-observation.json'),{planned_buttons:0,granularity:'semantic'});
  const detail=read('ui-MixedWeave-detail.json');assert.deepEqual(detail.ir,base.ir);
  assert.deepEqual(detail.state.paperDiagramReturn,saved.state);
  const detailState={...detail.state};delete detailState.paperDiagramReturn;
  assert.deepEqual(detailState,plan.details[0].state);
  assert.equal(svg('ui-MixedWeave-detail.svg'),set.panels[1].result.svg);
  assert.equal(svg('ui-MixedWeave-detail-reopened.svg'),set.panels[1].result.svg);
  const stale=read('ui-MixedWeave-stale.json'),current={...stale.state};delete current.paperDiagramPlan;
  assert.notDeepEqual(current,stale.state.paperDiagramPlan.main_state);
  assert.equal(current.paperGranularity,'semantic');
 }
 results.push({name,base_nodes:main.graph.nodes.length,planned_nodes:selected.result.graph.nodes.length,panels:set.panels.length,fulfilled:set.coverage.filter(g=>g.status==='fulfilled').length,goals:set.coverage.length});
}
const files=fs.readdirSync(out).filter(f=>/^ui-/.test(f)&&f!=='ui-report.json');
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({schema:'joint-expressions-ui/1',results,
 files_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),svg_byte_identical:true,canonical_ir_preserved:true,raw_source_nodes:16,raw_source_edges:14,
 passed:true,scope:'Real file chooser, plan action, SVG exports, saved/reopened documents, detail return and stale-state display. No large UI performance claim.'},null,2)+'\n');
console.log(JSON.stringify(results));

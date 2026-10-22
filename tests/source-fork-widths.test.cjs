'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
function scene(){
 const nodes=[{id:'root',kind:'composite',parent:null},{id:'value',kind:'interface',role:'input',parent:'root'},
  {id:'helper',kind:'composite',parent:'root'},...['first','second'].map(id=>({id,kind:'compute',parent:'helper'}))];
 const edges=['first','second'].map((target,i)=>({id:'e'+i,source:'value',resolved_source:'value',target,kind:'data',
  source_port:'out',target_port:'operand:'+i,evidence:'source-dependency'}));
 const idx={nodes:new Map(nodes.map(n=>[n.id,n])),children:new Map([[null,['root']],['root',['value','helper']],['helper',['first','second']]])};
 return {nodes,idx,edges};
}
function layout(s,extra={},offsets={}){return L.layout(s.idx,['root'],new Set(s.nodes.map(n=>n.id)),s.edges,offsets,
 {sourceForkWidths:true,alignForks:true,nodeSize:n=>({w:n.id==='first'?180:198,h:64}),...extra});}
test('one exact external value gives same-rank consumers bounded equal widths without changing facts',()=>{
 const s=scene(),before=JSON.stringify(s),p=layout(s),row=p.context.sourceForkWidths[0];assert.ok(row);
 assert.deepEqual(row.before.map(n=>n.width),[180,198]);assert.equal(row.width,198);
 assert.equal(p.get('first').w,p.get('second').w);assert.equal(p.get('first').y,p.get('second').y);
 assert.equal(JSON.stringify(s),before);assert.ok(s.edges.every(e=>L.route(e,p).ok));
});
test('different output slots, unresolved representatives and non-source edges cannot create a drawing fork',()=>{
 for(const edit of [s=>s.edges[1].source_port='out:1',s=>delete s.edges[1].source_port,
  s=>delete s.edges[1].resolved_source,s=>s.edges[1].resolved_source='hidden',s=>s.edges[1].evidence='runtime-trace',
  s=>s.edges[1].canonical_target='hidden',s=>s.edges[1].bundle_members=[{...s.edges[1]}],
  s=>s.edges[1].condition={test:'flag'},s=>s.edges[1].iteration={},s=>s.edges[1].design_route={kind:'bypass'}]){
  const s=scene();edit(s);assert.deepEqual(layout(s).context.sourceForkWidths,[]);
 }
});
test('unknown, conditional, mutable, identity and runtime boundaries stay local and unaligned',()=>{
 for(const guard of [{kind:'opaque'},{condition:{test:'flag'}},{mutable:true},{identity_display:{}},
  {runtime_evidence:[{}]},{evidence_status:'runtime-only'},{semantic_type:'loop-template'}]){
  for(const id of ['value','helper','second']){const s=scene();Object.assign(s.idx.nodes.get(id),guard);assert.deepEqual(layout(s).context.sourceForkWidths,[]);}
 }
 const s=scene();s.edges.push({id:'back',source:'first',target:'second',kind:'data'},
  {id:'forward',source:'second',target:'first',kind:'data'});assert.deepEqual(layout(s).context.sourceForkWidths,[]);
});
test('large differences, wrapped ranks, manual offsets and explicit optout preserve ordinary layout',()=>{
 const s=scene();for(const extra of [{sourceForkWidths:false},{rankColumns:1},
  {nodeSize:n=>({w:n.id==='first'?120:240,h:64})}])assert.deepEqual(layout(s,extra).context.sourceForkWidths,[]);
 assert.deepEqual(layout(s,{}, {first:{x:1,y:0}}).context.sourceForkWidths,[]);
});
test('an optional context route can change its drawing side only while its entire value binding stays exact',()=>{
 const a={id:'edge',source:'outside',target:'consumer',canonical_source:'argument',canonical_target:'consumer',resolved_source:'outside',
  source_port:'out:2',target_port:'arbitrary',kind:'data',evidence:'source-dependency',originals:['bind','edge'],
  semantic_bindings:[{role:'unfamiliar',edge:'edge'}],route:{ok:true,target_side:'left'},context_lane:{side:'left'}};
 const b={...a,context_lane:undefined,route:{ok:true,target_side:'top'}};assert.equal(R.sourceForkContextBinding(a,b),true);
 for(const change of [{source:'other'},{target_port:'other'},{source_port:'out:3'},{canonical_source:'other'},
  {originals:['edge']},{semantic_bindings:[]},{condition:{test:'flag'}},{iteration:{}},{kind:'state-read'},
  {bundle_members:[a]},{design_route:{kind:'state-interface'}},{route:{ok:false}}])assert.equal(R.sourceForkContextBinding(a,{...b,...change}),false);
});
const read=name=>JSON.parse(fs.readFileSync('verification/source-fork-widths/current/'+name+'.json'));
// Keep the original shape-read/transform fork visible to exercise width trials.
// Configuration-only folding is independently verified in unconsumed-dimensions.
function state(ir){return {paperUnconsumedDimensions:false,mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperCompact:true,
 paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};}
for(const name of ['BorrowedGrid','SeparateGrid','MixedGrid'])test(name+' preserves all bindings, boundaries, coverage, saved state and further folding',()=>{
 const ir=read(name),raw=JSON.stringify(ir),s=state(ir),a=R.render(ir,{...s,paperSourceForkWidths:false}),b=R.render(ir,s);
 assert.equal(JSON.stringify(ir),raw);assert.deepEqual(b.document.ir,a.document.ir);
 for(const key of ['node_accounting','edge_accounting','representatives'])assert.deepEqual(b.graph[key],a.graph[key]);
 const facts=r=>r.document.layout.edges.map(({route,context_lane,...e})=>e);
 assert.deepEqual(facts(a),facts(b));assert.deepEqual(a.document.expression_coverage,b.document.expression_coverage);
 assert.deepEqual(a.document.summary_coverage,b.document.summary_coverage);assert.deepEqual(b.prepared.quality.issues,[]);
 assert.equal(R.render(b.document.ir,b.document.state).svg,b.svg);
 assert.equal((b.document.layout.source_fork_widths||[]).length,name==='BorrowedGrid'?1:0);
 assert.ok((b.document.layout.source_fork_widths||[]).every(r=>r.geometry_verified));
 if(name==='MixedGrid'){
  const audit=b.prepared.routing.source_fork_width_refinement;assert.equal(audit.accepted,false);
  assert.equal(audit.candidate.crossings,audit.before.crossings+1);assert.equal(b.svg,a.svg);
  for(const n of a.graph.nodes.filter(n=>n.kind==='opaque'||n.condition))assert.ok(b.graph.positions.has(n.id));
 }
 const closed=R.render(ir,{...s,open:[]});assert.deepEqual(closed.document.ir,ir);assert.ok(closed.graph.nodes.length<b.graph.nodes.length);
});
test('model and display names do not select the policy; print and non-role views opt out',()=>{
 const ir=read('BorrowedGrid'),s=state(ir),a=R.render(ir,s);for(const n of ir.nodes){n.label='Renamed';n.source_class='Unseen';}ir.title='Other';
 const b=R.render(ir,s);assert.deepEqual(b.document.layout.source_fork_widths?.map(r=>r.uses),a.document.layout.source_fork_widths?.map(r=>r.uses));
 for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperSourceForkWidths:false}])assert.ok(!R.render(read('BorrowedGrid'),{...s,...extra}).document.layout.source_fork_widths);
});

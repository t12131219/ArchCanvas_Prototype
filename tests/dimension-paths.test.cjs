'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const D=require('../semantic_studio/dimension-paths.js'),P=require('../semantic_studio/publication.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles'},read=name=>JSON.parse(fs.readFileSync('verification/dimension-paths/current/'+name+'.json'));
const draw=(ir,extra={})=>P.project(ir,{...state,...extra},E),derived=g=>g.publication.configuration_arithmetic.filter(r=>r.rule_version===D.VERSION);
const multiply=ir=>ir.nodes.find(n=>n.source?.[0]?.expression==='h * d');
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('dimension operands form a reversible configuration proof and restore a local source-path summary',()=>{
 const ir=read('DimensionWeave'),before=JSON.stringify(ir),g=draw(ir),rows=derived(g),math=multiply(ir),proof=rows.find(r=>r.node===math.id);
 assert.ok(proof.configuration_only);assert.equal(proof.value_evaluation,'not-performed');
 assert.deepEqual(proof.roots.map(r=>[r.slot,r.fact.attribute]),[['1','shape'],['3','shape']]);
 assert.deepEqual(proof.dependencies,ir.edges.filter(e=>e.target===math.id));assert.deepEqual(proof.uses,ir.edges.filter(e=>e.source===math.id));
 const summary=g.publication.local_pipelines.rows.find(r=>r.operations.some(o=>o.operator==='reshape'));assert.ok(summary);
 assert.deepEqual(summary.operations.map(o=>o.operator),['transpose','copy','reshape']);assert.equal(summary.status,'summary');
 const folded=R.render(ir,{...state,paperAuto:false,open:g.publication.open.filter(id=>id!==summary.node)});assert.equal(folded.graph.publication.local_pipelines.rows.find(r=>r.node===summary.node).status,'summary');
 const opened=R.render(ir,{...state,paperAuto:false,open:[...g.publication.open,summary.node]});
 assert.ok(opened.graph.node_accounting.attached.includes(math.id));const reshape=summary.operations.at(-1).node;
 const note=opened.graph.annotations.get(reshape).find(n=>n.configuration_proof?.some(p=>p.node===math.id));assert.ok(note);
 assert.ok(note.configuration_proof.some(p=>p.kind==='dimension-read'));assert.deepEqual(opened.prepared.quality.issues,[]);
 assert.equal(R.render(opened.document.ir,opened.document.state).svg,opened.svg);accounted(ir,opened.graph);assert.equal(JSON.stringify(ir),before);
});
test('multiple dimension arithmetic and alias steps preserve their whole dependency chain',()=>{
 const ir=read('AliasExtent'),g=draw(ir),rows=derived(g);assert.equal(rows.filter(r=>r.kind==='dimension-arithmetic').length,2);
 const view=ir.nodes.find(n=>n.operator==='reshape'),note=g.annotations.get(view.id).find(n=>n.configuration_proof?.some(p=>p.expression==='width + 0'));
 assert.ok(note);assert.deepEqual(new Set(note.configuration_proof.filter(r=>r.kind==='dimension-arithmetic').map(r=>r.expression)),new Set(['h * d','width + 0']));
 for(const r of rows.filter(r=>r.configuration_only))assert.ok(g.node_accounting.attached.includes(r.node)||g.node_accounting.contracted.includes(r.node));accounted(ir,g);
});
for(const name of ['SharedExtent','EscapingExtent','UnknownExtent','ConditionalExtent'])test(name+' retains dimension arithmetic with feature, unknown, output or condition uses',()=>{
 const ir=read(name),g=draw(ir),math=multiply(ir);assert.ok(g.positions.has(math.id));assert.ok(!derived(g).some(r=>r.node===math.id&&r.configuration_only));
 assert.ok(!g.publication.local_pipelines.rows.length);accounted(ir,g);
 if(name==='UnknownExtent')assert.ok(g.nodes.some(n=>n.kind==='opaque'));if(name==='ConditionalExtent')assert.ok(g.nodes.some(n=>n.kind==='control'));
});
test('a shared shape read remains visible while independent configuration-only arithmetic can attach',()=>{
 const ir=read('ExtentBoundary'),g=draw(ir),math=multiply(ir),shape=ir.nodes.find(n=>n.symbolic_value?.attribute==='shape');
 assert.ok(g.positions.has(shape.id));assert.ok(g.node_accounting.attached.includes(math.id));assert.equal(derived(g).find(r=>r.node===shape.id).configuration_only,false);accounted(ir,g);
});
test('stored symbolic labels, source spelling and model family names never replace the dimension binding proof',()=>{
 const ir=read('DimensionWeave'),a=derived(draw(ir));for(const n of ir.nodes){n.label='Transformer';n.source_class='Foreign';}
 assert.deepEqual(derived(draw(ir)),a);
 const wrong=read('AliasExtent'),shape=wrong.nodes.find(n=>n.symbolic_value?.attribute==='shape');shape.source_tensor_annotation='torch.Tensor';
 wrong.nodes.find(n=>n.role==='input').source_tensor_annotation='Custom';assert.ok(!derived(draw(wrong)).some(r=>r.node===multiply(wrong).id));
});
test('effects, runtime, control, missing operands and mismatched scalar slots stop only the affected proof',()=>{
 for(const mutate of [
  (ir,n)=>n.mutable=true,(ir,n)=>n.evidence_status='runtime-only',(ir,n)=>n.observed_calls=[{run:'one'}],
  (ir,n)=>n.runtime_evidence=[{event:1}],(ir,n)=>n.identity_display={reference:'shared'},(ir,n)=>n.condition={branch:'if'},
  (ir,n)=>n.syntax.fields.op.type='Div',
  (ir,n)=>ir.edges.find(e=>e.target===n.id).target_port='missing',
  (ir,n)=>ir.edges.find(e=>e.target===n.id).condition={outcome:'true'},
  (ir,n)=>ir.edges.find(e=>e.target===n.id).source_port='1',
  (ir,n)=>{const e=ir.edges.find(e=>e.target===n.id);ir.edges.push({...e,id:'duplicate'});},
  (ir,n)=>{const e=ir.edges.find(e=>e.target===n.id),alias=ir.nodes.find(a=>a.id===e.source);ir.edges.find(e=>e.target===alias.id).source_port='wrong-slot';}
 ]){const ir=read('AliasExtent'),n=multiply(ir);mutate(ir,n);const r=D.compile({ir,configurationUse:e=>ir.nodes.some(n=>n.id===e.target&&n.operator==='reshape')&&e.target_port.startsWith('arg:')});assert.ok(!r.metadata.has(n.id));assert.ok(!r.rows.some(r=>r.node===n.id&&r.configuration_only));}
});
test('print, other granularities and the explicit disabled configuration policy keep their prior frontiers',()=>{
 const ir=read('AliasExtent'),math=multiply(ir);
 for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperDimensionPaths:false}]){const g=draw(ir,extra);assert.equal(derived(g).length,0);assert.ok(g.positions.has(math.id));accounted(ir,g);}
});


test('automatic path summaries preserve external context entering a later computation',()=>{
 for(const name of ['ContextWeave','BoundaryWeave']){
 const ir=JSON.parse(fs.readFileSync('verification/flow-entries/current/'+name+'.json')),g=draw(ir);
 const rows=g.publication.local_pipelines.rows.filter(r=>r.bindings.some(b=>b.kind==='value'&&!r.operations.some(o=>o.node===b.producer)&&b.target!==r.operations[0].node));
 assert.ok(g.publication.local_pipelines.rows.every(r=>r.status==='expanded'));
 if(name==='ContextWeave')assert.ok(rows.length);for(const r of rows){assert.equal(r.status,'expanded');for(const b of r.bindings.filter(b=>b.kind==='value'&&!r.operations.some(o=>o.node===b.producer)))assert.ok(g.positions.has(b.target));}
 accounted(ir,g);
 }
});

test('focused panels retain external dimension proof cuts without orphan configuration terminals',()=>{
 const ir=read('DimensionWeave'),view=ir.nodes.find(n=>n.operator==='reshape'),owner=view.parent;
 ir.nodes.push({id:'shape-panel',parent:owner,kind:'composite',label:'Foreign panel',evidence_status:'static-only',source:[],runtime_evidence:[]});view.parent='shape-panel';
 const r=R.render(ir,{...state,paperFocus:'shape-panel'}),g=r.graph,cut=ir.edges.find(e=>e.target===view.id&&e.target_port==='arg:2');
 const shown=g.publication.boundary.find(e=>e.id===cut.id);assert.equal(shown.presentation,'attached-metadata');
 for(const key of ['source','target','source_port','target_port','evidence'])assert.equal(shown[key],cut[key]);
 assert.ok(g.annotations.get(view.id).some(n=>n.configuration_proof?.some(p=>p.expression==='h * d')));
 for(const n of g.nodes.filter(n=>n.boundary_edge))assert.ok(g.edges.some(e=>e.source===n.id||e.target===n.id));
 assert.deepEqual(r.prepared.quality.issues,[]);accounted(ir,g);
});

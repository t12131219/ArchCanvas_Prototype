'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../semantic_studio/publication-renderer'),E=require('../semantic_studio/semantic-engine'),F=require('../semantic_studio/frame-ownership');
const read=n=>JSON.parse(fs.readFileSync('verification/stage-sample-frames/current/'+n+'.json'));
const state={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages'};
const render=(n,s={})=>R.render(read(n),{...state,...s});
const done=r=>r.graph.expression_coverage.filter(c=>c.status==='fulfilled').map(c=>c.goal).sort();
const summaries=r=>r.graph.summary_coverage.filter(c=>c.status==='fulfilled').map(c=>c.goal).sort();
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('coarse stages share a verified sample frame while keeping the concrete call and ordered suffix',()=>{
 const ir=read('SignalStack'),before=JSON.stringify(ir),a=R.render(ir,{...state,paperFinalSampleFrames:false}),b=R.render(ir,state),rec=b.prepared.routing.final_sample_frame_refinement;
 assert.ok(rec.accepted);assert.equal(rec.frames.length,1);assert.equal(a.graph.nodes.length-b.graph.nodes.length,1);
 assert.deepEqual(a.document.architecture,b.document.architecture);assert.deepEqual(a.graph.publication.open,b.graph.publication.open);
 const sample=rec.frames[0],seq=b.graph.publication.inline_sequences.sequences[0];
 assert.equal(sample.sequence_sample.index,0);assert.deepEqual(seq.remainders[0].indices,[1,2]);
 assert.ok(b.graph.positions.has(seq.remainders[0].node));assert.ok(b.graph.node_accounting.attached.includes(sample.node));
 assert.equal(JSON.stringify(ir),before);accounted(ir,b.graph);
});
test('read summaries, Add and Norm stages, and exact consumer captions survive the frame map',()=>{
 const a=render('SignalStack',{paperFinalSampleFrames:false}),b=render('SignalStack'),rec=b.prepared.routing.final_sample_frame_refinement;
 assert.deepEqual(summaries(a),summaries(b));assert.ok(summaries(b).length>=2);assert.deepEqual(done(a),done(b));
 assert.deepEqual(rec.lost_summaries,[]);assert.equal(rec.summary_goals_before,rec.summary_goals_candidate);
 const p=b.graph.publication.local_pipelines.rows.find(p=>p.source_reads?.length);assert.ok(p);
 const paper=b.graph.nodes.find(n=>n.id===p.node).paper;
 assert.ok(paper.captions.join(' ').includes(paper.read_binding_rows?'#4 add ← 0=input1("x"); 2=#3':'Input x → #4[0]'));
 assert.ok(b.graph.publication.contract_stages.rows.some(r=>r.status==='summary'));
});
test('accepted compaction only removes empty title bands and never increases crossings or route failures',()=>{
 for(const name of ['SignalStack','TwinStacks','UnknownStack','StateStack']){
  const a=render(name,{paperFinalSampleFrames:false}),b=render(name),r=b.prepared.routing.final_sample_frame_refinement;
  assert.ok(r?.accepted,name);assert.deepEqual(r.lost_goals,[]);assert.deepEqual(r.lost_summaries,[]);
  assert.ok(b.prepared.quality.native_height_px<a.prepared.quality.native_height_px,name);
  assert.ok(b.prepared.quality.wire_length<=a.prepared.quality.wire_length,name);
  assert.ok(b.prepared.quality.line_geometry.crossings<=a.prepared.quality.line_geometry.crossings,name);
  assert.deepEqual(b.prepared.quality.issues,[]);assert.deepEqual(done(a),done(b));assert.deepEqual(summaries(a),summaries(b));
 }
});
test('unknown, conditional and framework state neighbors retain their visible boundaries and slots',()=>{
 for(const name of ['UnknownStack','ConditionalStack','StateStack']){
  const ir=read(name),a=render(name,{paperFinalSampleFrames:false}),b=render(name);
  const protectedNodes=ir.nodes.filter(n=>n.kind==='opaque'||n.kind==='control'||n.framework_type==='torch.nn.GRUCell');
  assert.ok(protectedNodes.length,name);
  for(const n of protectedNodes)assert.equal(b.graph.positions.has(n.id),a.graph.positions.has(n.id),name);
  const exact=g=>g.edges.flatMap(e=>e.bundle_members||[e]).map(({design_route,...e})=>e);
  assert.deepEqual(exact(a.graph),exact(b.graph));accounted(ir,b.graph);
 }
});
test('shared and heterogeneous mutable sequences cannot use a homogeneous sample frame',()=>{
 for(const name of ['SharedStack','MixedStack']){const a=render(name,{paperFinalSampleFrames:false}),b=render(name);
  assert.equal(b.prepared.routing.final_sample_frame_refinement,undefined);assert.equal(a.svg,b.svg);
  assert.ok(read(name).nodes.some(n=>n.identity_display||n.mutable||n.module_binding));accounted(read(name),b.graph);
 }
});
test('manual suffix expansion restores concrete sample boundaries and all later calls',()=>{
 const ir=read('SignalStack'),a=R.render(ir,state),seq=a.graph.publication.inline_sequences.sequences[0],suffix=seq.remainders[0];
 const b=R.render(ir,{...state,paperAuto:false,open:[...a.graph.publication.open,suffix.node]});
 assert.ok(b.graph.positions.has(seq.samples[0].instance));assert.ok(suffix.instances.every(id=>b.graph.positions.has(id)));
 assert.equal(b.prepared.routing.final_sample_frame_refinement,undefined);assert.ok(b.graph.nodes.length>a.graph.nodes.length);accounted(ir,b.graph);
});
test('save and reopen preserve the compact graph, with deterministic return from an expanded suffix',()=>{
 const ir=read('SignalStack'),a=R.render(ir,state),doc=JSON.parse(JSON.stringify(a.document));
 assert.equal(R.render(doc.ir,doc.state).svg,a.svg);
 const suffix=a.graph.publication.inline_sequences.sequences[0].remainders[0].node;
 R.render(ir,{...state,paperAuto:false,open:[...a.graph.publication.open,suffix]});assert.equal(R.render(ir,state).svg,a.svg);
});
test('source frames, explicit sample policy, offsets, print and non-stage semantic views remain opt outs',()=>{
 for(const option of [{paperFrameView:'source'},{paperSampleFrame:false},{paperSampleFrame:true},{paperProtectFrameTitles:true},
  {offsets:{[read('SignalStack').nodes[0].id]:{x:1,y:0}}},{paperMedium:'print'},{paperGranularity:'semantic'}]){
  assert.equal(render('SignalStack',option).prepared.routing.final_sample_frame_refinement,undefined);
 }
});
test('class renaming does not select sample eligibility and corrupt structural receipts are rejected',()=>{
 const ir=read('SignalStack'),a=render('SignalStack',{paperFinalSampleFrames:false});
 const select=g=>[...F.select({ir,idx:g.idx,visible:new Set(g.positions.keys()),open:new Set(g.publication.open),roots:[g.publication.focus],flattenSequenceSamples:true})].filter(([id,r])=>r.kind==='sequence-sample').map(([id,r])=>[id,r.target]);
 const expected=select(a.graph);assert.equal(expected.length,1);
 for(const n of ir.nodes){n.source_class='Unfamiliar';n.class_name='Arbitrary';}
 assert.deepEqual(select(R.render(ir,{...state,paperFinalSampleFrames:false}).graph),expected);
 const changed=structuredClone(ir);changed.nodes.find(n=>n.repeat_contract).repeat_contract.structure.groups[0].indices=[0];
 const b=R.render(changed,state);assert.equal(b.prepared.routing.final_sample_frame_refinement,undefined);
 assert.ok(b.graph.publication.inline_sequences.diagnostics.length);
});
test('all canonical source nodes and bindings remain available below the compact stage view',()=>{
 for(const name of ['SignalStack','TwinStacks','ConditionalStack','UnknownStack','StateStack','SharedStack','MixedStack']){
  const ir=read(name),g=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.map(n=>n.id)});
  assert.deepEqual(g.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(g.edges.map(e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
 }
});

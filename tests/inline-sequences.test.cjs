'use strict';
const structure=require('./diagram-structure.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../semantic_studio/publication.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js'),S=require('../semantic_studio/sequence-frontier.js'),L=require('../semantic_studio/architecture-layout.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/local-relations/current/structural-repeats',name+'.json')));
const coupled=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/inline-sequences/current/CoupledRuns.json')));
const state={paperMedium:'canvas',paperGranularity:'semantic'};
const plan=ir=>S.build(ir,P.plan(ir));
function accounted(ir,g){for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(g[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(v=>v.id).sort());}}
function geometry(r){return JSON.stringify({nodes:r.document.layout.nodes,edges:r.document.layout.edges,labels:r.document.layout.labels});}

test('a concrete first occurrence and a contiguous suffix retain all calls and actual value paths',()=>{
 const ir=read('EquivalentSteps'),before=JSON.stringify(ir),g=P.project(ir,state,E),seq=g.publication.inline_sequences.sequences[0],suffix=seq.remainders[0];
 assert.deepEqual(suffix.indices,[1,2]);assert.equal(seq.samples[0].index,0);
 assert.ok(g.positions.get(seq.samples[0].instance).expanded);assert.equal(g.positions.get(suffix.node).expanded,false);
 const first=new Set(ir.nodes.filter(n=>n.id.startsWith(seq.samples[0].instance+'/')).map(n=>n.id));
 assert.ok(g.edges.some(e=>e.target===suffix.node&&(e.bundle_members||[e]).some(e=>first.has(e.resolved_source))));
 assert.ok(g.edges.some(e=>e.source===suffix.node&&e.target!==suffix.node));
 assert.equal(ir.nodes.filter(n=>n.semantic_type==='repeat-instance').length,3);accounted(ir,g);assert.equal(JSON.stringify(ir),before);
});
test('a heterogeneous A,A,B,A sequence preserves its exceptional position and noncontiguous later occurrence',()=>{
 const ir=read('MixedSteps'),p=plan(ir),seq=p.publication.inline_sequences.sequences[0];
 assert.deepEqual(seq.samples.map(s=>s.index),[0,2]);assert.deepEqual(seq.remainders,[]);
 assert.deepEqual(p.nodes.filter(n=>n.semantic_type==='repeat-instance').map(n=>n.repeat_index),[0,1,2,3]);
 accounted(ir,P.project(ir,state,E));
});
test('unknown and mutable calls never become a proved suffix or substitute another instance',()=>{
 const a=plan(read('UnknownSteps')),b=plan(read('MutableSteps'));
 assert.deepEqual(a.publication.inline_sequences.sequences[0].unclassified.map(r=>r.index),[0,1]);
 assert.equal(a.nodes.filter(n=>n.sequence_remainder).length,0);assert.equal(b.nodes.filter(n=>n.sequence_sample).length,0);
 assert.ok(b.publication.inline_sequences.diagnostics.length);
});
test('changed operands, operation bindings and receipt groups reject inline representation',()=>{
 for(const mutate of [
  ir=>{ir.nodes.find(n=>n.operator==='add').syntax.fields.right={literal_type:'int',literal:'2'};},
  ir=>{ir.edges.find(e=>e.target_port==='arg:0'&&ir.nodes.find(n=>n.id===e.target)?.operator==='linear').source_port='other';},
  ir=>{ir.nodes.find(n=>n.repeat_contract).repeat_contract.structure.groups[0].indices=[0];}
 ]){const ir=read('EquivalentSteps');mutate(ir);const p=plan(ir);assert.equal(p.nodes.filter(n=>n.sequence_remainder||n.sequence_sample).length,0);assert.ok(p.publication.inline_sequences.diagnostics.length);}
});
test('renaming presentation labels and class metadata cannot select a different sequence frontier',()=>{
 const ir=read('MixedSteps'),a=plan(ir);for(const n of ir.nodes){n.label='Foreign spelling';if(n.class_name)n.class_name='Unseen';}
 const b=plan(ir);assert.deepEqual(b.publication.inline_sequences.sequences,a.publication.inline_sequences.sequences);
});
test('a suffix can unfold, save, reopen and fold back to the identical geometry',()=>{
 const ir=read('EquivalentSteps'),a=R.render(ir,state),seq=a.graph.publication.inline_sequences.sequences[0],suffix=seq.remainders[0],before=JSON.stringify(ir);
 const b=R.render(ir,{...a.document.state,paperAuto:false,open:[...a.graph.publication.open,suffix.node]});
 assert.ok(suffix.instances.every(id=>b.graph.positions.has(id)));assert.ok(b.graph.nodes.length>a.graph.nodes.length);
 const doc=JSON.parse(JSON.stringify(b.document));assert.equal(R.render(doc.ir,doc.state).svg,b.svg);accounted(ir,b.graph);
 assert.equal(geometry(R.render(ir,{...a.document.state,paperAuto:false,open:a.graph.publication.open})),geometry(a));assert.equal(JSON.stringify(ir),before);
});
test('a focused later concrete call retains its original sequence identity and index',()=>{
 const ir=read('EquivalentSteps'),suffix=plan(ir).publication.inline_sequences.sequences[0].remainders[0];
 const g=P.project(ir,{...state,paperFocus:suffix.instances[0]},E);
 assert.equal(g.publication.representative.index,1);assert.equal(g.publication.representative.count,3);
 assert.match(g.nodes.find(n=>n.id===g.publication.focus).paper.captions.join(' '),/Instance 2 of 3/);accounted(ir,g);
});
test('summary and print retain the pre-inline sequence projection',()=>{
 const frozen=require('../tools/load_publication_renderer.cjs')(path.resolve(__dirname,'../verification/local-relations/iteration-10-before-inline-sequences/implementation/semantic_studio'));
 const ir=read('EquivalentSteps');for(const preset of ['overview','modules','detailed']){
  assert.equal(structure(R.render(ir,{paperGranularity:preset}).svg),structure(frozen.render(ir,{paperGranularity:preset}).svg));
  const s={paperGranularity:preset,paperMedium:'canvas',paperEmptyBandCompaction:false};
  assert.equal(structure(R.render(ir,{...s,paperSequenceView:'summary',paperFrameView:'source'}).svg),structure(frozen.render(ir,s).svg));
 }
});
test('both generic sequences stay in the whole graph with exact shared context and independent values',()=>{
 const ir=coupled(),g=P.project(ir,state,E),seqs=g.publication.inline_sequences.sequences;
 assert.equal(seqs.length,2);assert.ok(seqs.every(s=>s.samples.every(r=>g.positions.has(r.instance))));
 const contexts=[];
 for(const e of ir.edges.filter(e=>e.target_port==='context')){
  const projected=g.edges.flatMap(e=>e.bundle_members||[e]).find(p=>p.originals.includes(e.id));assert.ok(projected);contexts.push(projected.resolved_source);
  if(projected.id===e.id){assert.equal(projected.canonical_source,e.source);assert.equal(projected.canonical_target,e.target);assert.equal(projected.target_port,'context');}
  else{assert.ok(g.edge_accounting.contracted.includes(e.id));const use=ir.edges.find(use=>use.id===projected.id);assert.equal(use.source,e.target);assert.equal(projected.canonical_target,use.target);assert.equal(projected.target_port,use.target_port);}
 }
 assert.equal(new Set(contexts).size,1);
 accounted(ir,g);assert.ok(g.positions.context.compoundAlignments.some(c=>c.accepted));
});

function compoundFixture(independent=true,control=false){
 const nodes=[{id:'root',parent:null,kind:'composite'}, {id:'a',parent:'root',kind:'composite'}, {id:'b',parent:'root',kind:'composite'},
  {id:'a1',parent:'a',kind:'compute'}, {id:'a2',parent:'a',kind:'compute'}, {id:'b1',parent:'b',kind:'compute'}, {id:'b2',parent:'b',kind:'compute'}, {id:'input',parent:'root',kind:'interface',role:'input'}];
 const edges=[{id:'a-chain',source:'a1',target:'a2',kind:'data'}, {id:'b-chain',source:'b1',target:'b2',kind:'data'},
  {id:'context',source:'a2',target:'b2',kind:control?'control':'data'}, {id:'start-a',source:'input',target:'a1',kind:'data'}];
 if(independent)edges.push({id:'start-b',source:'input',target:'b1',kind:'data'});
 const idx=E.index({nodes}),visible=new Set(nodes.map(n=>n.id));return {idx,edges,visible};
}
test('port alignment needs an independent early entry and never relaxes a control dependency',()=>{
 for(const [independent,control,expected]of [[true,false,true],[false,false,false],[true,true,false]]){
  const f=compoundFixture(independent,control),p=L.layout(f.idx,['root'],f.visible,f.edges,{}, {compoundPorts:true,foldSerial:false,nodeSize:n=>({w:150,h:n.kind==='interface'?40:200})});
  assert.equal(p.context.compoundAlignments.some(c=>c.accepted),expected);
  if(expected){const a=p.get('a'),b=p.get('b');assert.ok(b.y<a.y+a.h);assert.ok(b.x>=a.x+a.w||a.x>=b.x+b.w);assert.ok(p.get('b2').y>=p.get('a2').y+p.get('a2').h);}
 }
});

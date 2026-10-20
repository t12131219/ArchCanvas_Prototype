'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../semantic_studio/semantic-engine.js'),F=require('../semantic_studio/frame-ownership.js'),R=require('../semantic_studio/publication-renderer.js');
const read=n=>JSON.parse(fs.readFileSync('verification/local-relations/current/structural-repeats/'+n+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles'};
function fixture(){
 const ir={nodes:[{id:'root',kind:'composite',parent:null},{id:'seq',kind:'composite',parent:'root',semantic_type:'serial-repeat',repeat_contract:{count:4,parameter_sharing:'independent'},sequence_frontier:{samples:[{instance:'sample',index:0}],remainders:[{node:'suffix'}],unclassified:[]}},
 {id:'sample',parent:'seq',kind:'composite',semantic_type:'repeat-instance',module_identity:'actual:0',repeat_index:0,sequence_sample:{sequence:'seq',index:0},structure_representative:{status:'proved',indices:[0,1,2,3]}},
 {id:'a',parent:'sample',kind:'compute'},{id:'b',parent:'sample',kind:'compute'},
 {id:'suffix',parent:'seq',kind:'composite',semantic_type:'serial-remainder',sequence_remainder:{sequence:'seq',representative:'sample',indices:[1,2,3]}}],edges:[{id:'e',source:'a',target:'b',source_port:'out',target_port:'arg:0',kind:'data'}]};return ir;
}
const select=(ir,options={})=>F.select({ir,idx:E.index(ir),visible:new Set(ir.nodes.map(n=>n.id)),open:new Set(['root','seq','sample']),roots:['root'],flattenSequenceSamples:true,...options});
test('only a single expanded concrete representative and complete closed suffix can share their frame',()=>{
 const ir=fixture(),r=select(ir).get('sample');assert.equal(r.kind,'sequence-sample');assert.equal(r.target,'seq');assert.equal(r.sequence_sample.module_identity,'actual:0');assert.equal(r.sequence_sample.parameter_sharing,'independent');
 assert.equal(select(ir,{flattenSequenceSamples:false}).has('sample'),false);
 assert.equal(select(ir,{roots:['sample']}).has('sample'),false);
 assert.equal(select(ir,{open:new Set(['root','seq'])}).has('sample'),false);
});
test('heterogeneous, unclassified, incomplete and already opened suffixes retain sample boundaries',()=>{
 const mutations=[ir=>ir.nodes[1].sequence_frontier.samples.push({instance:'other',index:1}),ir=>ir.nodes[1].sequence_frontier.unclassified.push({instance:'bad'}),ir=>ir.nodes.at(-1).sequence_remainder.indices.pop(),ir=>ir.nodes.at(-1).sequence_remainder.representative='other',ir=>ir.nodes[1].sequence_frontier.remainders=[],ir=>ir.nodes.push({id:'extra',parent:'seq',kind:'compute'}),ir=>ir.nodes[2].repeat_index=1];
 for(const change of mutations){const ir=fixture();change(ir);assert.equal(select(ir).has('sample'),false);}
 assert.equal(select(fixture(),{open:new Set(['root','seq','sample','suffix'])}).has('sample'),false);
});
test('unknown, observed, mutable, incident, identity, contract and state boundaries cannot disappear',()=>{
 for(const mutate of [ir=>ir.nodes[3].kind='opaque',ir=>ir.nodes[3].mutable=true,ir=>ir.nodes[3].observed_calls={},ir=>ir.nodes[2].identity_display={},ir=>ir.nodes[2].semantic_contracts=['certificate'],ir=>ir.nodes[2].condition={branch:'flag'},ir=>ir.edges[0].kind='state-write',ir=>ir.edges[0].source='sample',ir=>ir.nodes[2].evidence_status='runtime-only']){const ir=fixture();mutate(ir);assert.equal(select(ir).has('sample'),false);}
});
test('conditional descendant keeps its condition and exact operands while source ownership moves',()=>{
 const ir=fixture();ir.nodes[3].condition={branch:'flag',outcome:true};ir.edges[0].condition={branch:'flag',outcome:true};
 const original=JSON.stringify(ir),g=E.project(ir,{view:'architecture',details:true,open:['root','seq','sample']},ir,{frameOwnership:args=>F.select({...args,flattenSequenceSamples:true})});
 assert.ok(g.positions.has('a')&&g.positions.has('b'));assert.deepEqual(g.edges[0].condition,ir.edges[0].condition);assert.equal(g.edges[0].target_port,'arg:0');assert.equal(g.idx.nodes.get('a').parent,'seq');assert.equal(JSON.stringify(ir),original);
});
test('local sequence framing is independent of source and class names',()=>{
 const ir=fixture(),before=[...select(ir)];for(const n of ir.nodes){n.label='Foreign';n.class_name='Unknown';}
 assert.deepEqual([...select(ir)].map(([id,r])=>[id,r.target,r.kind]),before.map(([id,r])=>[id,r.target,r.kind]));
});
test('real source repeat is rechecked and exact bindings survive frame sharing and source restoration',()=>{
 const ir=read('EquivalentSteps'),original=JSON.stringify(ir),a=R.render(ir,{...state,paperSampleFrame:false}),b=R.render(ir,{...state,paperSampleFrame:true});
 const attached=b.graph.frame_ownership.filter(r=>r.kind==='sequence-sample');assert.equal(attached.length,1);assert.equal(b.graph.nodes.length,a.graph.nodes.length-1);
 const edges=g=>g.edges.map(e=>[e.id,e.source,e.target,e.source_port,e.target_port,e.originals,e.condition]);assert.deepEqual(edges(a.graph),edges(b.graph));
 const saved=JSON.parse(JSON.stringify(b.document));assert.equal(R.render(saved.ir,saved.state).svg,b.svg);
 assert.equal(R.render(ir,{...state,paperSampleFrame:false}).svg,a.svg);assert.equal(JSON.stringify(ir),original);
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(b.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 const suffix=b.graph.publication.inline_sequences.sequences[0].remainders[0].node;
 const opened=R.render(ir,{...state,paperSampleFrame:true,paperAuto:false,open:[...b.graph.publication.open,suffix]});assert.ok(opened.graph.positions.has(attached[0].node));assert.ok(opened.graph.positions.has(suffix));
});
test('stale source structure and mixed or unknown calls cannot be upgraded by their names',()=>{
 for(const name of ['MixedSteps','UnknownSteps','MutableSteps']){const r=R.render(read(name),{...state,paperSampleFrame:true});assert.equal((r.graph.frame_ownership||[]).filter(f=>f.kind==='sequence-sample').length,0);}
 const ir=read('EquivalentSteps');ir.nodes.find(n=>n.kind==='compute').operator='foreign_changed';
 const r=R.render(ir,{...state,paperSampleFrame:true});assert.equal((r.graph.frame_ownership||[]).filter(f=>f.kind==='sequence-sample').length,0);
});
test('automatic selection measures geometry; explicit policies and offsets preserve control',()=>{
 const ir=read('EquivalentSteps'),r=R.render(ir,state),receipt=r.prepared.routing.sample_frame_refinement;
 assert.ok(receipt);if(receipt.accepted){assert.ok(receipt.facts_preserved);assert.ok(receipt.candidate.area<receipt.before.area*.98);assert.ok(receipt.candidate.crossings<=receipt.before.crossings);}
 assert.equal(R.render(ir,{...state,paperSampleFrame:false}).prepared.routing.sample_frame_refinement,undefined);
 assert.equal(R.render(ir,{...state,offsets:{[ir.nodes[0].id]:{x:1,y:0}}}).prepared.routing.sample_frame_refinement,undefined);
 assert.equal(R.render(ir,{...state,paperFrameView:'source'}).graph.frame_ownership,undefined);
});

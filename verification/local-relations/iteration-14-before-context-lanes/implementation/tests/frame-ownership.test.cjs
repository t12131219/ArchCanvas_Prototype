'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../semantic_studio/frame-ownership.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/local-relations/current/structural-repeats',name+'.json')));
function fixture(){
 const nodes=[{id:'root',parent:null,kind:'composite',label:'root'},
 {id:'call',parent:'root',kind:'composite',semantic_type:'repeat-instance',module_identity:'object:1',label:'call'},
 {id:'owner',parent:'call',kind:'composite',semantic_type:'source-module',module_identity:'object:1',label:'source label',source:[{file:'model.py',line:12}]},
 {id:'region',parent:'owner',kind:'composite',semantic_type:'structural-region',presentation_only:true,label:'group'},
 {id:'a',parent:'region',kind:'compute',operator:'add'}, {id:'b',parent:'region',kind:'compute',operator:'multiply'}];
 const edges=[{id:'operand',source:'a',target:'b',source_port:'out:0',target_port:'arg:1',kind:'data',condition:'flag'}];
 return {nodes,edges};
}
function select(ir,overrides={}){const idx=E.index(ir);return F.select({ir,idx,visible:new Set(ir.nodes.map(n=>n.id)),open:new Set(ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)),roots:['root'],...overrides});}
function projection(ir,compact=true){return E.project(ir,{view:'architecture',open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id),details:true},ir,compact?{frameOwnership:F.select}:{});}
function accounting(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(g[key]).flat();assert.equal(all.length,new Set(all).size);assert.deepEqual(all.sort(),items.map(n=>n.id).sort());}}

test('only an explicit same-object binding can remove a concrete call source wrapper',()=>{
 const ir=fixture();assert.equal(select(ir).get('owner').kind,'same-call-source');
 ir.nodes.find(n=>n.id==='owner').module_identity='object:2';ir.nodes.push({id:'extra',parent:'owner',kind:'compute'});
 assert.equal(select(ir).has('owner'),false);
});
test('a distinct single source owner remains distinct in its annotation',()=>{
 const ir=fixture();ir.nodes.find(n=>n.id==='owner').module_identity='object:2';ir.nodes.find(n=>n.id==='region').presentation_only=false;
 const r=select(ir).get('owner');assert.equal(r.kind,'source-owner');assert.equal(r.target,'region');assert.equal(r.module_identity,'object:2');assert.match(r.scope,/no value substitution or object equivalence/);
});
test('closed wrappers and focused roots retain their own frame',()=>{
 const ir=fixture();assert.equal(select(ir,{open:new Set(['root','call'])}).has('owner'),false);
 assert.equal(select(ir,{roots:['owner']}).has('owner'),false);
});
test('unknown, mutable, shared identity and state writes protect affected source boundaries',()=>{
 for(const mutate of [
  ir=>ir.nodes.find(n=>n.id==='a').kind='opaque',
  ir=>ir.nodes.find(n=>n.id==='a').mutable=true,
  ir=>ir.nodes.find(n=>n.id==='a').identity_display={object:'shared'},
  ir=>ir.nodes.find(n=>n.id==='a').observed_calls={observations:[]},
  ir=>ir.edges[0].kind='state-write',
  ir=>ir.nodes.find(n=>n.id==='owner').condition='flag',
  ir=>ir.edges.push({id:'frame-value',source:'owner',target:'b',kind:'data'})
 ]){const ir=fixture();mutate(ir);assert.equal(select(ir).has('owner'),false);}
});
test('removing a pure surrounding group preserves conditional frame and operand identity',()=>{
 const ir=fixture();ir.nodes.find(n=>n.id==='a').kind='control';ir.nodes.find(n=>n.id==='a').condition='flag';
 const before=JSON.stringify(ir),a=projection(ir),b=projection(ir,false);
 assert.ok(a.positions.has('a'));assert.equal(a.idx.nodes.get('a').condition,'flag');assert.equal(a.idx.nodes.get('a').parent,'call');
 assert.deepEqual(a.edges,b.edges);assert.equal(a.edges[0].target_port,'arg:1');assert.equal(a.edges[0].condition,'flag');assert.equal(JSON.stringify(ir),before);accounting(ir,a);
});
test('nested ownership destinations are acyclic and retain every source record',()=>{
 const ir=fixture(),g=projection(ir);assert.deepEqual(g.frame_ownership.map(r=>r.node).sort(),['owner','region']);
 assert.ok(g.frame_ownership.every(r=>r.target==='call'));assert.equal(g.idx.nodes.get('call').frame_ownership.length,2);
 assert.equal(g.representatives.owner,'call');assert.equal(g.representatives.region,'call');assert.equal(g.idx.nodes.get('a').parent,'call');accounting(ir,g);
 const chain={nodes:[{id:'r',parent:null,kind:'composite'},...['a','b','c'].map((id,i)=>({id,parent:['r','a','b'][i],kind:'composite',semantic_type:'source-module'})),{id:'value',parent:'c',kind:'compute'}],edges:[]};
 const h=projection(chain);assert.ok(h.frame_ownership.every(r=>h.positions.has(r.target)));assert.equal(h.idx.nodes.get('value').parent,'c');assert.ok(h.positions.has('c'));
});
test('renaming source and class labels never selects a frame reduction',()=>{
 const ir=fixture(),a=[...select(ir)].map(([id,r])=>[id,r.target,r.kind]);for(const n of ir.nodes){n.label='Unfamiliar';n.class_name='Other';}
 assert.deepEqual([...select(ir)].map(([id,r])=>[id,r.target,r.kind]),a);
});
test('restoring source frames reproduces frozen SVG and compact documents save and unfold deterministically',()=>{
 const ir=read('EquivalentSteps'),state={paperMedium:'canvas',paperGranularity:'semantic'},before=JSON.stringify(ir);
 const frozen=require('../tools/load_publication_renderer.cjs')(path.resolve(__dirname,'../verification/local-relations/iteration-11-before-frame-ownership/implementation/semantic_studio'));
 assert.equal(R.render(ir,{...state,paperFrameView:'source'}).svg,frozen.render(ir,state).svg);
 const a=R.render(ir,state);assert.ok(a.graph.frame_ownership.length);assert.deepEqual(a.document.layout.frame_ownership,a.graph.frame_ownership);
 const saved=JSON.parse(JSON.stringify(a.document));assert.equal(R.render(saved.ir,saved.state).svg,a.svg);
 const suffix=a.graph.publication.inline_sequences.sequences[0].remainders[0];
 const b=R.render(ir,{...state,paperAuto:false,open:[...a.graph.publication.open,suffix.node]});assert.ok(b.graph.nodes.length>a.graph.nodes.length);accounting(ir,b.graph);
 assert.equal(R.render(ir,{...state,paperAuto:false,open:a.graph.publication.open}).svg,a.svg);
 assert.equal(JSON.stringify(ir),before);assert.ok(a.svg.includes('Source ownership:'));assert.ok(a.graph.frame_ownership.every(r=>a.document.architecture.nodes.some(n=>n.id===r.node)));
});

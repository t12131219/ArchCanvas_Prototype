'use strict';
const structure=require('./diagram-structure.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../semantic_studio/semantic-engine.js'),L=require('../semantic_studio/architecture-layout.js'),R=require('../semantic_studio/publication-renderer.js');
const {fixtureForRank,state}=require('./rank-clearance-fixtures.cjs');
const old=require('../tools/load_publication_renderer.cjs')(require('node:path').resolve('verification/local-relations/iteration-24-before-rank-clearance/implementation/semantic_studio'));
function layout(ir,extra={}){const idx=E.index(ir),regions=L.labelClearances(idx,ir.edges);
 return L.layout(idx,ir.nodes.filter(n=>!n.parent).map(n=>n.id),new Set(ir.nodes.map(n=>n.id)),ir.edges,{},
  {gapY:28,gapYForParent:parent=>regions.find(r=>r.parent===parent)?.gap_y||0,rankLabelClearances:regions,foldSerial:false,...extra});}
const gap=(p,a,b)=>p.get(b).y-p.get(a).y-p.get(a).h;
function identity(g){const {rule_version,...roles}=g.publication.role_frontier;
 return JSON.parse(JSON.stringify({nodes:g.nodes.map(n=>n.id),edges:g.edges,open:g.publication.open,
 nodes_accounted:g.node_accounting,edges_accounted:g.edge_accounting,boundary:g.publication.boundary,roles}));}
test('only the receiving rank gets parallel-label space, including around an unknown call',()=>{
 const ir=fixtureForRank(),before=JSON.stringify(ir),p=layout(ir);
 assert.deepEqual([gap(p,'x','a'),gap(p,'a','b'),gap(p,'b','unknown'),gap(p,'unknown','result')],[28,88,28,28]);
 const r=p.context.rankClearances[0];assert.equal(r.mode,'rank');assert.equal(r.applied,true);
 assert.equal(r.pairs[0].after_rank,1);assert.deepEqual(r.pairs[0].edges,['e1','e2']);assert.equal(JSON.stringify(ir),before);
});
test('the channel follows actual dependencies across intervening ranks, not declaration order',()=>{
 const ir=fixtureForRank();ir.nodes.reverse();ir.edges.push({id:'late',source:'x',target:'result',kind:'data',condition:{branch:'c',outcome:'yes'}});
 ir.edges.push({id:'late2',source:'x',target:'result',kind:'data',condition:{branch:'c',outcome:'no'}});
 const p=layout(ir),r=p.context.rankClearances[0];
 assert.equal(gap(p,'unknown','result'),88);assert.equal(gap(p,'x','a'),28);
 assert.deepEqual(r.pairs.find(p=>p.source==='x').after_rank,3);
});
test('SCC and same-rank pairs keep parent spacing and the original cycle edges',()=>{
 const ir=fixtureForRank();ir.edges.push({id:'feedback',source:'b',target:'a',kind:'data'});const p=layout(ir);
 assert.equal(p.context.rankClearances[0].mode,'parent');assert.equal(gap(p,'x','a'),88);
 assert.equal(p.get('a').y,p.get('b').y);assert.ok(p.context.feedback.has('feedback'));
});
test('clearance ownership uses actual nested drawing children',()=>{
 const ir=fixtureForRank();ir.nodes.push({id:'left',parent:'root',kind:'composite',label:'L'},{id:'right',parent:'root',kind:'composite',label:'R'});
 for(const n of ir.nodes)if(['x','a'].includes(n.id))n.parent='left';else if(['b','unknown','result'].includes(n.id))n.parent='right';
 const p=layout(ir),r=p.context.rankClearances.find(r=>r.parent==='root');
 assert.equal(r.pairs[0].source_child,'left');assert.equal(r.pairs[0].target_child,'right');assert.equal(gap(p,'left','right'),88);
});
test('folded rank columns explicitly defer receiving-rank clearance',()=>{
 const p=layout(fixtureForRank(),{foldSerial:true,foldMinRanks:3,foldGain:2,maxWidth:Infinity});
 assert.equal(p.context.rankClearances[0].applied,false);assert.match(p.context.rankClearances[0].reason,/Folded/);
 assert.equal(p.get('a').arrangement,'folded-ranks');
});
test('a selected rank parent leaves unselected helpers at the baseline global spacing',()=>{
 const ir=fixtureForRank();ir.nodes.push({id:'helper',parent:'root',kind:'composite',label:'Other'},
  {id:'u',parent:'helper',kind:'compute',label:'U'},{id:'v',parent:'helper',kind:'opaque',label:'V'});
 ir.edges.push({id:'uv',source:'u',target:'v',source_port:'out',target_port:'arg:0',kind:'data'});
 const baseline=R.render(ir,{...state,open:['root','helper'],paperLabelSpacing:'global'});
 const r=R.render(ir,{...state,open:['root','helper'],paperLabelSpacing:'rank',paperLabelRankParents:['root'],paperLabelRankFallback:'global'});
 assert.equal(gap(r.graph.positions,'u','v'),gap(baseline.graph.positions,'u','v'));
 assert.equal(r.graph.publication.label_clearance.rank_layout[0].ranks[0].gap_after,28);
 assert.deepEqual(identity(r.graph),identity(baseline.graph));
});
test('measured selection shrinks the same semantic frontier and reopens deterministically',()=>{
 const ir=fixtureForRank(),before=JSON.stringify(ir),baseline=old.render(ir,state),r=R.render(ir,state),decision=r.prepared.routing.rank_clearance_refinement;
 assert.equal(baseline.graph.publication.role_frontier.rule_version,'role-frontier/2');assert.equal(r.graph.publication.role_frontier.rule_version,'role-frontier/3');
 assert.ok(decision.accepted);assert.deepEqual(identity(r.graph),identity(baseline.graph));assert.equal(JSON.stringify(ir),before);
 assert.ok(r.prepared.quality.native_height_px<baseline.prepared.quality.native_height_px*.85);
 assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(r.prepared.quality.line_geometry.unrelated_contacts.length,0);
 assert.equal(r.svg,R.render(r.document.ir,r.document.state).svg);
 const folded=R.render(ir,{...state,open:[]});assert.ok(folded.graph.nodes.length<r.graph.nodes.length);
 assert.equal(r.svg,R.render(ir,state).svg);assert.ok(r.graph.nodes.some(n=>n.kind==='opaque'));
});
test('names and mutable, identity, state or control boundaries do not become new semantic claims',()=>{
 for(const guard of [{mutable:true},{identity_display:{kind:'same-object-calls',label:'shared',invocation:1,count:2}},{kind:'state'},{kind:'control'}]){
  const ir=fixtureForRank();Object.assign(ir.nodes.find(n=>n.id==='unknown'),guard);for(const n of ir.nodes){n.label='Renamed';n.source_class='Foreign';}
  const before=JSON.stringify(ir),r=R.render(ir,state),baseline=old.render(ir,state);
  assert.deepEqual(identity(r.graph),identity(baseline.graph));assert.equal(JSON.stringify(ir),before);
 }
});
test('explicit spacing, print, manual positions and minimum spacing preserve the requested policy',()=>{
 const ir=fixtureForRank();for(const s of [{...state,paperLabelSpacing:'global'},{...state,paperLabelSpacing:'local'},
  {...state,paperMedium:'print'},{...state,offsets:{root:{x:12,y:0}}},{...state,paperLabelGapY:112}]){
  const r=R.render(ir,s);assert.equal(r.prepared.routing.rank_clearance_refinement,undefined);assert.equal(structure(r.svg),structure(old.render(ir,s).svg));
 }
 const p=layout(ir,{gapY:112});assert.ok(gap(p,'x','a')>=112);assert.ok(gap(p,'a','b')>=112);
});

'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./local-bypasses.test.cjs');
const L=require('../semantic_studio/architecture-layout.js'),E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
function conditionalFixture(){
 const f=fixture(),g=f.baseline.graph,edge=g.edges[0],raw=g.architecture.edges;
 const more=[{id:'gate',kind:'control',operator:'if',parent:'branch'},
  ...['true','false'].map(outcome=>({id:outcome,kind:'composite',parent:'branch',condition:{branch:'gate',outcome}})),
  {id:'phi',kind:'value-alias',operator:'phi',parent:'branch'}].map(n=>({...n,label:n.id,source:[]}));
 g.idx.nodes.get('one').parent='true';g.idx.nodes.get('two').parent='false';
 f.ir.nodes.push(...more);g.architecture.nodes=f.ir.nodes;g.idx=E.index(f.ir);
 const extra=[...['true','false'].map(outcome=>({id:'ctrl-'+outcome,source:'gate',target:outcome,kind:'control',source_port:'out',target_port:outcome})),
  ...['one','two'].map((source,i)=>({id:'alt-'+i,source,target:'phi',kind:'data',source_port:'out',target_port:i?'false':'true',condition:{branch:'gate',outcome:i?'false':'true'}}))];
 raw.push(...extra);f.ir.edges=raw;
 g.architecture.semantic_contracts[0].roles.branch_path=['one','two','phi'];
 g.constraint_receipts[0].properties.branch_path=['one','two','phi'];
 g.positions.delete('one');g.positions.delete('two');g.positions.get('branch').expanded=false;g.nodes=f.ir.nodes.filter(n=>g.positions.has(n.id));
 for(const n of f.ir.nodes)g.representatives[n.id]=n.id==='branch'||['one','two','gate','true','false','phi'].includes(n.id)?'branch':n.id;
 g.positions.context.idx=g.idx;
 return f;
}
test('a closed unfamiliar conditional keeps both alternatives while its certified bypass becomes local',()=>{
 const {ir,baseline:b}=conditionalFixture(),before=JSON.stringify(ir),r=R.prepareLocalBypasses(ir,{},b),s=r.graph.positions.context.localBypassScopes[0];
 assert.ok(r.prepared.quality.wire_length<b.prepared.quality.wire_length);
 assert.deepEqual(s.frontier,['branch']);assert.equal(s.contained_boundaries.length,1);
 assert.equal(s.contained_boundaries[0].phis[0].inputs.length,2);
 assert.equal(JSON.stringify(ir),before);assert.deepEqual(r.graph.nodes,b.graph.nodes);assert.deepEqual(r.graph.edges,b.graph.edges);
 assert.equal(r.graph.constraint_receipts[0].status,'applied');
 const renamed=conditionalFixture();for(const n of renamed.ir.nodes)n.label='new-name';
 assert.deepEqual(L.localBypassScope(renamed.baseline.graph,renamed.baseline.graph.edges[0]),L.localBypassScope(b.graph,b.graph.edges[0]));
});
test('opening the condition, foreign control, missing alternatives and hidden effects veto containment',()=>{
 const changes=[g=>g.positions.get('branch').expanded=true,
  g=>g.idx.nodes.get('one').mutable=true,g=>g.idx.nodes.get('one').kind='opaque',
  g=>g.idx.nodes.get('one').evidence_status='runtime-only',g=>g.idx.nodes.get('one').runtime_evidence=[{}],
  g=>g.idx.nodes.get('one').identity_display={shared:true},g=>g.idx.nodes.get('one').iteration={},
  g=>g.architecture.edges.find(e=>e.id==='alt-0').condition.branch='outside',
  g=>g.architecture.edges.find(e=>e.id==='alt-1').condition.outcome='true',
  g=>g.architecture.edges.find(e=>e.id==='ctrl-false').target='join',
  g=>g.architecture.edges.push({id:'effect',source:'one',target:'two',kind:'state-write'}),
  g=>g.architecture.edges.push({id:'foreign',source:'s',target:'gate',kind:'control'})];
 for(const change of changes){const {baseline:b}=conditionalFixture();change(b.graph);assert.equal(L.localBypassScope(b.graph,b.graph.edges[0]),null);}
});
test('final route audit rechecks the full contained condition and its original cut witnesses',()=>{
 for(const corrupt of [s=>s.contained_boundaries[0].phis[0].inputs[0].target_port='wrong',
  s=>s.contained_boundaries[0].members.pop(),s=>s.contained_boundaries[0].cuts.push({id:'invented'}),
  s=>s.mapping[0].visible='join',s=>delete s.contained_boundaries]){
  const {ir,baseline:b}=conditionalFixture(),r=R.prepareLocalBypasses(ir,{},b);
  corrupt(r.graph.positions.context.localBypassScopes[0]);E.auditConstraintRoutes(r.graph,r.prepared.routes);
  assert.equal(r.graph.constraint_receipts[0].status,'conflict');
 }
});
test('contained-boundary opt-out retains the original outer route',()=>{
 const {ir,baseline:b}=conditionalFixture();assert.equal(R.prepareLocalBypasses(ir,{paperContainedBypasses:false},b),b);
});
test('a partial local value is retained inside the boundary but cannot witness a complete branch path',()=>{
 const {baseline:b}=conditionalFixture(),g=b.graph,partial={id:'partial',parent:'branch',kind:'value-alias',operator:'phi'};
 g.idx.nodes.set(partial.id,partial);g.architecture.nodes.push(partial);g.representatives.partial='branch';
 g.architecture.edges.push({id:'partial-use',source:'one',target:'partial',kind:'data',source_port:'out',target_port:'true',condition:{branch:'gate',outcome:'true'}});
 const s=L.localBypassScope(g,g.edges[0]);assert.ok(s);
 assert.equal(s.contained_boundaries[0].phis.find(r=>r.node==='partial').inputs.length,1);
 g.architecture.semantic_contracts[0].roles.branch_path.push('partial');
 assert.equal(L.localBypassScope(g,g.edges[0]),null);
});
module.exports={conditionalFixture};

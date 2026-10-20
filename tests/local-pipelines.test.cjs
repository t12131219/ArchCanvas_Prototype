'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../semantic_studio/local-pipelines.js'),R=require('../semantic_studio/publication-renderer.js');
function fixture(){
 const nodes=[{id:'root',kind:'composite',parent:null},{id:'scope',kind:'composite',semantic_type:'source-function',parent:'root'},
 {id:'x',kind:'interface',role:'input',parent:'scope'},{id:'a',kind:'compute',operator:'first',parent:'scope'},
 {id:'b',kind:'compute',operator:'second',parent:'scope'},{id:'c',kind:'compute',operator:'third',parent:'scope'},
 {id:'out',kind:'interface',role:'output',parent:'scope'},{id:'sink',kind:'compute',operator:'last',parent:'root'}];
 const edges=[['x','a'],['a','b'],['b','c'],['c','out'],['out','sink']].map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'arg:0',kind:'data'}));
 return {nodes,edges};
}
function derive(ir,extra={}){return F.compile({ir,plan:ir,bindings:new Map([['out',ir.edges.find(e=>e.target==='out')]]),metadata:new Set(),configurationUses:new Set(),...extra});}
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}}
test('a dependency path retains order, exact operands, cuts and canonical membership without family rules',()=>{
 const ir=fixture(),before=JSON.stringify(ir),r=derive(ir).get('scope');assert.deepEqual(r.operations.map(o=>o.node),['a','b','c']);
 assert.deepEqual(r.bindings.map(b=>b.edge),['e0','e1','e2']);assert.deepEqual(r.cuts,ir.edges.slice(4));assert.equal(JSON.stringify(ir),before);
 for(const n of ir.nodes){n.label='Transformer';n.source_class='anything';}assert.deepEqual(derive(ir).get('scope'),r);
});
test('unknown, condition, effects, identity, observation, nested and certified boundaries prevent a summary',()=>{
 for(const attrs of [{kind:'opaque'},{kind:'control'},{mutable:true},{condition:{outcome:true}},{identity_display:{reference:'obj'}},
  {observed_calls:{observations:[]}},{runtime_evidence:[{}]},{evidence_status:'runtime-only'},{semantic_contracts:['certificate']},{repeat_contract:{}},{iteration:{}},{kind:'composite'}]){
  const ir=fixture();Object.assign(ir.nodes.find(n=>n.id==='b'),attrs);assert.equal(derive(ir).size,0,JSON.stringify(attrs));
 }
 const ir=fixture();ir.edges[1].condition={branch:'if'};assert.equal(derive(ir).size,0);
});
test('cycles, escaping results and non-value dependencies retain the original representation',()=>{
 for(const mutate of [ir=>ir.edges.push({id:'cycle',source:'c',target:'a',kind:'data'}),ir=>ir.edges.push({id:'escape',source:'b',target:'sink',kind:'data'}),
  ir=>ir.edges[1].kind='state-write']){const ir=fixture();mutate(ir);assert.equal(derive(ir).size,0);}
 const fork=fixture();fork.edges.push({id:'fork',source:'a',target:'c',source_port:'out',target_port:'side',kind:'data'});
 const row=derive(fork).get('scope');assert.equal(row.form,'dependency-dag-summary');
 assert.deepEqual(row.dependency_dag.nodes.at(-1).inputs.map(i=>i.reference),['#2','#1']);
});
test('symbolic reads stay auxiliary, unresolved values are not evaluated, and nonconfiguration uses reject the summary',()=>{
 const ir=fixture();ir.nodes.push({id:'shape',kind:'compute',operator:'attribute',parent:'scope',symbolic_value:{kind:'tensor-attribute',attribute:'shape'}});
 ir.edges.push({id:'read',source:'x',target:'shape',kind:'data'},{id:'size',source:'shape',target:'a',source_port:'0',target_port:'arg:1',kind:'data'});
 assert.equal(derive(ir).size,0);const r=derive(ir,{configurationUses:new Set(['size'])}).get('scope');assert.equal(r.auxiliary_reads.length,1);
 assert.equal(r.bindings.find(b=>b.edge==='size').source_port,'0');assert.equal(r.bindings.find(b=>b.edge==='size').kind,'symbolic-read');
});
for(const name of ['PipelineMosaic','InterruptedPipeline','EscapingPipeline'])test(name+' preserves exact topology and deeper expansion in a real extracted source',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/local-pipelines/current/'+name+'.json')),original=JSON.stringify(ir),root=ir.nodes.find(n=>!n.parent).id;
 const state={paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:[root]},r=R.render(ir,state),rows=r.graph.publication.local_pipelines.rows.filter(r=>r.status==='summary');
 assert.equal(rows.length,name==='PipelineMosaic'?2:1);assert.deepEqual(r.prepared.quality.issues,[]);assert.equal(JSON.stringify(ir),original);
 for(const row of rows){assert.equal(row.detailed_operations_exposed,false);assert.ok(r.svg.includes(row.operations[0].label));
  const opened=R.render(ir,{...state,open:[root,row.node]});assert.ok(opened.graph.nodes.length>r.graph.nodes.length);assert.equal(opened.graph.publication.local_pipelines.rows.find(x=>x.node===row.node).status,'expanded');accounted(ir,opened.graph);
 }
 const saved=JSON.parse(JSON.stringify(r.document));assert.equal(R.render(saved.ir,saved.state).svg,r.svg);accounted(ir,r.graph);
 const old=R.render(ir,{...state,paperPipelineSummaries:false});assert.deepEqual(r.graph.edges,old.graph.edges);assert.deepEqual(r.graph.node_accounting,old.graph.node_accounting);
 assert.ok(!r.graph.expression_coverage.some(g=>rows.flatMap(r=>r.operations).some(o=>'goal:node:'+o.node===g.goal)&&g.status==='fulfilled'));
});
test('source function names do not trigger a summary, and print/other presets preserve their contract',()=>{
 const ir=JSON.parse(fs.readFileSync('verification/local-pipelines/current/PipelineMosaic.json')),root=ir.nodes.find(n=>!n.parent).id;
 for(const s of [{paperMedium:'print',paperGranularity:'roles'},{paperMedium:'canvas',paperGranularity:'semantic'}]){
  const r=R.render(ir,{...s,paperAuto:false,open:[root]});assert.equal(r.graph.publication.local_pipelines,undefined);
 }
 const before=derive(fixture()),unrecognized=fixture();unrecognized.nodes.find(n=>n.id==='scope').semantic_type='unrecognized-scope';assert.equal(derive(unrecognized).size,0);assert.ok(before.size);
});

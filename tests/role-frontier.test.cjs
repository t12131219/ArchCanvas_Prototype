'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../semantic_studio/role-frontier.js'),E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/semantic-design/current/after',name+'.json')));
const state={paperMedium:'canvas',paperGranularity:'roles'};
function accounted(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(g[key]).flat();assert.equal(all.length,new Set(all).size);assert.deepEqual(all.sort(),items.map(n=>n.id).sort());}}
function arbitraryPlan(){
 const nodes=[{id:'root',parent:null,kind:'composite'},{id:'input',parent:'root',kind:'interface'},
 {id:'unit',parent:'root',kind:'composite',semantic_contracts:['custom']},
 {id:'helper',parent:'unit',kind:'composite'},{id:'p',parent:'helper',kind:'compute'},
 {id:'nested',parent:'unit',kind:'composite',semantic_contracts:['inner']},{id:'hidden',parent:'nested',kind:'compute'},
 {id:'condition',parent:'unit',kind:'control',condition:{outcome:true}},{id:'branch',parent:'condition',kind:'compute'},
 {id:'unknown',parent:'unit',kind:'opaque'},{id:'extra',parent:'unit',kind:'compute'}];
 return {nodes,semantic_contracts:[{id:'custom',node:'unit',rule:'unseen-computation',roles:{signal:'p',auxiliary:'hidden',conditional:'branch',boundary:'unknown',context:{node:'input',slot:'out'}},scope:'local proof'},
 {id:'inner',node:'nested',roles:{result:'hidden'},scope:'independent proof'}]};
}

test('a previously unseen role schema opens only necessary paths without a family registry',()=>{
 const p=arbitraryPlan(),before=JSON.stringify(p),f=F.compile({plan:p,focus:'root'});
 assert.deepEqual([...f.owners],['unit']);assert.deepEqual([...f.open].sort(),['helper','unit']);
 assert.equal(f.records.find(r=>r.role==='signal').frontier_node,'p');
 assert.equal(f.records.find(r=>r.role==='auxiliary').frontier_node,'nested');
 assert.equal(f.records.find(r=>r.role==='conditional').frontier_node,'condition');
 assert.equal(f.records.find(r=>r.role==='boundary').frontier_node,'unknown');
 assert.equal(f.records.find(r=>r.role==='context.node').location,'external');
 assert.equal(JSON.stringify(p),before);assert.ok(f.plan.nodes.find(n=>n.id==='p').role_annotations.some(r=>r.role==='signal'));
});
test('a focused nested contract can expose its own local roles',()=>{
 const f=F.compile({plan:arbitraryPlan(),focus:'nested'});assert.deepEqual([...f.owners],['nested']);assert.ok(f.open.has('nested'));assert.ok(f.records.some(r=>r.node==='hidden'&&r.frontier_node==='hidden'));
});
test('closed helper and unknown boundary membership are never inferred from labels',()=>{
 const p=arbitraryPlan(),a=F.compile({plan:p,focus:'root'});for(const n of p.nodes){n.label='Transformer';n.source_class='Random';}
 const b=F.compile({plan:p,focus:'root'});assert.deepEqual(a.records,b.records);assert.deepEqual([...a.open],[...b.open]);
 p.nodes.find(n=>n.id==='helper').mutable=true;const c=F.compile({plan:p,focus:'root'});assert.equal(c.records.find(r=>r.role==='signal').frontier_node,'helper');assert.equal(c.open.has('helper'),false);
});
test('no role schema or missing certificate cannot invent internal roles',()=>{
 const p=arbitraryPlan();p.semantic_contracts=[];const f=F.compile({plan:p,focus:'root'});assert.equal(f.open.size,0);assert.equal(f.records.length,0);
});
test('role granularity exposes the three proved projection bindings and preserves canonical inputs',()=>{
 const ir=read('SameSource'),before=JSON.stringify(ir),g=P.project(ir,state,E),m=g.nodes.find(n=>n.contract_roles?.projections);
 assert.ok(g.positions.get(m.id).expanded);for(const [role,id]of Object.entries(m.contract_roles.projections)){
  const n=g.idx.nodes.get(id);assert.ok(g.positions.has(id));assert.ok(n.role_annotations.some(r=>r.role==='projections.'+role));assert.equal(n.paper.title,role);
  const edge=g.edges.find(e=>e.target===id);assert.ok(edge);assert.equal(edge.canonical_target,id);assert.equal(edge.target_port,'arg:0');
 }
 assert.equal(g.positions.get(m.contract_roles.attention).expanded,false);assert.ok(g.publication.role_frontier.roles.some(r=>r.status==='contracted'));accounted(ir,g);assert.equal(JSON.stringify(ir),before);
});
test('a semantic view with explicit title avoidance reproduces the frozen pre-role renderer',()=>{
 const frozen=require('../tools/load_publication_renderer.cjs')(path.resolve(__dirname,'../verification/local-relations/iteration-12-before-role-frontier/implementation/semantic_studio'));
 const ir=read('SameSource');for(const medium of ['canvas','print'])for(const preset of ['overview','modules','semantic','detailed']){
  const s={paperMedium:medium,paperGranularity:preset,paperProtectFrameTitles:true,paperCoupledRoutes:false};assert.equal(R.render(ir,s).svg,frozen.render(ir,s).svg);
 }
});
test('role view saves, reopens, expands a nested boundary and returns to the same SVG',()=>{
 const ir=read('SameSource'),a=R.render(ir,state),saved=JSON.parse(JSON.stringify(a.document));assert.equal(R.render(saved.ir,saved.state).svg,a.svg);
 const outer=a.graph.nodes.find(n=>n.contract_roles?.projections),nested=outer.contract_roles.attention;
 const b=R.render(ir,{...state,paperAuto:false,open:[...a.graph.publication.open,nested]});assert.ok(b.graph.positions.get(nested).expanded);assert.ok(b.graph.nodes.length>a.graph.nodes.length);accounted(ir,b.graph);
 const c=R.render(ir,{...state,paperAuto:false,open:a.graph.publication.open});assert.equal(c.svg,a.svg);assert.equal(c.graph.publication.role_frontier.rule_version,F.VERSION);
});
test('local budgets defer roles honestly while retaining source and boundary identities',()=>{
 const ir=read('SameSource'),g=P.project(ir,{...state,paperBudget:4},E),receipt=g.publication.role_frontier;
 assert.ok(receipt.roles.some(r=>['folded','contracted'].includes(r.status)));accounted(ir,g);
 assert.ok(receipt.modules.some(m=>!m.expanded));
});

test('the same role compiler exposes feed-forward stages without changing dropout semantics',()=>{
 const ir=JSON.parse(fs.readFileSync(path.join(__dirname,'../verification/symbolic-values/current/transformer-current.json'))),node=ir.semantic_contracts.find(c=>c.rule==='feed-forward').node;
 const g=P.project(ir,{...state,paperFocus:node},E),owner=g.idx.nodes.get(node);
 assert.ok(g.positions.get(node).expanded);for(const role of ['input_projection','activation','output_projection']){
  const id=owner.contract_roles[role];assert.ok(g.positions.has(id));assert.ok(g.idx.nodes.get(id).role_annotations.some(r=>r.role===role));
 }
 const dropout=g.nodes.find(n=>n.operator==='dropout');assert.ok(dropout);assert.ok(g.edges.some(e=>e.target===dropout.id));assert.ok(g.edges.some(e=>e.source===dropout.id));accounted(ir,g);
});

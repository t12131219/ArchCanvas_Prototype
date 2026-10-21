'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const I=require('../semantic_studio/invocation-inputs.js'),E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const read=name=>JSON.parse(fs.readFileSync('verification/invocation-inputs/current/'+name+'.json'));
const state={paperMedium:'canvas',paperGranularity:'roles',paperBudget:20};
const opened=ir=>({...state,paperAuto:false,paperInvocationInputDocks:true,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
function account(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
 const actual=Object.values(g[key]).flat();assert.equal(actual.length,new Set(actual).size);assert.deepEqual(actual.slice().sort(),items.map(n=>n.id).sort());
}}
function uses(ir,g){for(const [id,binding]of I.compile(ir)){
 assert.ok(g.positions.has(id),'original literal terminal stays visible');
 const actual=g.edges.filter(e=>e.canonical_source===id);
 for(const use of binding.uses){const e=actual.find(e=>e.originals.includes(use.id));assert.ok(e,'literal dependency retained '+use.id);
  for(const key of ['source_port','target_port','kind','condition'])assert.deepEqual(e[key],use[key]);
 }
}}
test('different literal invocations remain separate while dynamic overrides stay dynamic',()=>{
 const ir=read('BoundCalls'),rows=[...I.compile(ir).values()],g=P.project(ir,opened(ir),E);
 assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.source_parent)).size,2);
 assert.deepEqual(rows.map(r=>r.value),[.25,false,.75,true]);
 const incoming=new Set(ir.edges.map(e=>e.target));assert.ok(rows.every(r=>!incoming.has(r.node)));
 assert.ok(ir.nodes.filter(n=>n.kind==='interface'&&['coefficient','inspected'].includes(n.label)&&incoming.has(n.id)).every(n=>!I.compile(ir).has(n.id)));
 uses(ir,g);account(ir,g);
});
test('fixed controls retain physical dependencies and both conditional outcomes',()=>{
 const ir=read('BoundCalls'),before=JSON.stringify(ir),r=R.render(ir,opened(ir)),baseline=P.project(ir,{...opened(ir),paperInvocationInputs:false},E);
 assert.deepEqual(r.prepared.quality.issues,[]);assert.deepEqual(r.prepared.quality.route_failures,[]);
 assert.deepEqual(r.prepared.quality.line_geometry.unrelated_contacts,[]);
 for(const row of r.document.publication.invocation_inputs.rows){
  assert.equal(row.status,'docked');const control=row.uses.find(e=>e.kind==='control');if(!control)continue;
  const route=r.document.layout.edges.find(e=>e.id===control.id);assert.equal(route.route.ok,true);assert.equal(route.source,row.node);
  const outcomes=ir.nodes.filter(n=>n.condition?.branch===control.target);assert.deepEqual(outcomes.map(n=>n.condition.outcome),['true','false']);
  assert.ok(outcomes.every(n=>r.graph.representatives[n.id]&&r.graph.representatives[n.id]===baseline.representatives[n.id]));
 }
 assert.equal(JSON.stringify(ir),before);assert.deepEqual(r.document.ir,ir);uses(ir,r.graph);account(ir,r.graph);
});
test('None passed to an unknown call remains a unique node with its exact operand',()=>{
 const ir=read('OptionalUnknown'),r=R.render(ir,opened(ir)),[row]=r.document.publication.invocation_inputs.rows;
 assert.equal(row.value,null);assert.equal(row.status,'docked');assert.ok(r.svg.includes('option = None'));assert.ok(r.svg.includes('Fixed call argument:'));
 const edge=r.graph.edges.find(e=>e.source===row.node),target=r.graph.idx.nodes.get(edge.target);assert.equal(target.kind,'opaque');
 assert.ok(r.svg.includes('no branch pruning'));uses(ir,r.graph);account(ir,r.graph);assert.deepEqual(r.prepared.quality.issues,[]);
});
test('multiple rows and long labels fit the owning header without losing original uses',()=>{
 const ir=read('WideBindings'),r=R.render(ir,opened(ir)),g=r.graph,dock=g.publication.invocation_inputs.docks[0],parent=g.positions.get(dock.parent);
 assert.equal(dock.nodes.length,4);assert.ok(new Set(dock.nodes.map(id=>g.positions.get(id).y)).size>1);
 for(const id of dock.nodes){const p=g.positions.get(id);assert.ok(p.x>=parent.x+parent.protected_header_width);assert.ok(p.x+p.w<=parent.x+parent.w);
  assert.ok(p.y+p.h<parent.y+parent.header-10);const n=g.idx.nodes.get(id);assert.ok(24+(n.paper.lines.length-1)*20+5<=p.h);
 }
 for(let i=0;i<dock.nodes.length;i++)for(let j=i+1;j<dock.nodes.length;j++){
  const a=g.positions.get(dock.nodes[i]),b=g.positions.get(dock.nodes[j]);assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
 }
 uses(ir,g);account(ir,g);assert.deepEqual(r.prepared.quality.issues,[]);assert.deepEqual(r.prepared.quality.line_geometry.unrelated_contacts,[]);
});
test('conditional and loop ancestors cannot authorize a fixed header rail',()=>{
 for(const name of ['ConditionalCalls','LoopCalls']){const ir=read(name);assert.ok(ir.nodes.some(n=>n.source_constant_input));assert.equal(I.compile(ir).size,0);
  const a=R.render(ir,opened(ir)),b=R.render(ir,{...opened(ir),paperInvocationInputs:false});assert.equal(a.svg,b.svg);account(ir,a.graph);}
});
test('mutable, observed, shared, conditioned and unresolved origins remain ordinary interfaces',()=>{
 const mutations=[n=>n.mutable=true,n=>n.condition={branch:'g',outcome:'true'},n=>n.identity_display={},n=>n.observed_calls={},
  n=>n.runtime_evidence=[{run:'one'}],n=>n.evidence_status='runtime-only',n=>n.kind='opaque',n=>n.semantic_type='iteration-region'];
 for(const ancestor of [false,true])for(const mutate of mutations){const ir=read('OptionalUnknown'),[id]=I.compile(ir).keys(),n=ir.nodes.find(n=>n.id===id);mutate(ancestor?ir.nodes.find(p=>p.id===n.parent):n);assert.equal(I.compile(ir).size,0);}
 const ir=read('OptionalUnknown'),[id]=I.compile(ir).keys();ir.edges.push({id:'incoming',source:ir.nodes[0].id,target:id,kind:'interface-binding'});assert.equal(I.compile(ir).size,0);
});
test('values need explicit bounded literal evidence; root defaults and unresolved data are not constants',()=>{
 for(const value of [undefined,{},[],Infinity,NaN,'x'.repeat(41)]){const ir=read('OptionalUnknown'),n=ir.nodes.find(n=>n.source_constant_input);n.source_constant_input.value=value;assert.equal(I.compile(ir).size,0);}
 for(const change of [n=>delete n.source_constant_input.value,n=>n.source_constant_input.scope='',n=>delete n.parent]){const ir=read('OptionalUnknown');change(ir.nodes.find(n=>n.source_constant_input));assert.equal(I.compile(ir).size,0);}
 const ir=read('BoundCalls');assert.ok(!ir.nodes.filter(n=>n.label==='dynamic_flag').some(n=>I.compile(ir).has(n.id)));
});
test('renaming classes and parameters changes labels without changing eligibility or uses',()=>{
 const ir=read('BoundCalls'),a=[...I.compile(ir)],renamed=structuredClone(ir);renamed.title='Unseen model';
 for(const n of renamed.nodes){n.label='unfamiliar';n.source_class='NeverSeen';}
 const b=[...I.compile(renamed)];assert.deepEqual(b.map(([id,r])=>[id,r.value,r.uses]),a.map(([id,r])=>[id,r.value,r.uses]));
});
test('manual offsets preserve ownership and exact uses without enabling a rail',()=>{
 const ir=read('OptionalUnknown'),g=P.project(ir,{...opened(ir),offsets:{[ir.nodes[0].id]:{x:8,y:0}}},E);
 assert.equal(g.publication.invocation_inputs.docks.length,0);assert.ok(g.publication.invocation_inputs.rows.every(r=>r.status==='visible'));uses(ir,g);account(ir,g);
});
test('save, reopen, summary and raw-source transitions retain the canonical graph',()=>{
 const ir=read('OptionalUnknown'),r=R.render(ir,opened(ir)),summary=R.render(ir,{...opened(ir),open:[ir.nodes[0].id]});
 assert.equal(R.render(r.document.ir,r.document.state).svg,r.svg);assert.ok(summary.graph.publication.invocation_inputs.rows.every(r=>r.status==='folded'));
 assert.equal(R.render(summary.document.ir,r.document.state).svg,r.svg);
 const raw=E.project(ir,{view:'source',mode:'source',open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)});
 assert.deepEqual(raw.nodes.map(n=>n.id).sort(),ir.nodes.map(n=>n.id).sort());assert.equal(raw.edges.length,ir.edges.length);assert.deepEqual(summary.document.ir,ir);
});
test('other publication presets and source projection do not decorate fixed arguments',()=>{
 const ir=read('OptionalUnknown');for(const extra of [{paperMedium:'print'},{paperGranularity:'semantic'},{paperGranularity:'detailed'},{paperInvocationInputs:false}]){
  const g=P.project(ir,{...opened(ir),...extra},E);assert.equal(g.publication.invocation_inputs,undefined);assert.ok(!g.nodes.some(n=>n.invocation_binding));account(ir,g);
 }
 const raw=E.project(ir,{view:'source',mode:'source',open:ir.nodes.map(n=>n.id)});assert.ok(!raw.nodes.some(n=>n.invocation_binding));
});
test('default measurement rejects wider or more crossing header layouts and keeps the exact annotated baseline SVG',()=>{
 for(const name of ['BoundCalls','OptionalUnknown','WideBindings']){const ir=read(name),s={...opened(ir)};delete s.paperInvocationInputDocks;
  const r=R.render(ir,s),baseline=R.render(ir,{...s,paperInvocationInputDocks:false}),receipt=r.prepared.routing.invocation_input_refinement;
  assert.equal(receipt.accepted,false);assert.equal(receipt.facts_preserved,true);assert.equal(r.svg,baseline.svg);
  assert.equal(r.graph.publication.invocation_inputs.docks.length,0);assert.ok(r.graph.nodes.some(n=>n.invocation_binding));uses(ir,r.graph);account(ir,r.graph);
 }
});

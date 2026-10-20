const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const A=require('../semantic_studio/architecture.js'),E=require('../semantic_studio/semantic-engine.js'),C=require('../semantic_studio/relation-constraints.js'),R=require('../semantic_studio/publication-renderer.js');
const load=name=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../verification/local-relations/current',name+'.json')));
const relations=ir=>A.build(ir).relation_graph.relations;
const counts=ir=>{const result={};for(const r of relations(ir))result[r.type]=(result[r.type]||0)+1;return result;};
function canonical(ir,g){const copy=JSON.stringify(ir);for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(g[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(x=>x.id).sort());}assert.equal(JSON.stringify(ir),copy);}

test('mixed source preserves independent gate, axis, framework state, conditions and unknown boundaries',()=>{
  const ir=load('MixedCircuit'),before=JSON.stringify(ir),rs=relations(ir),by=new Map(ir.edges.map(e=>[e.id,e]));
  for(const type of ['gated-product','axis-transform','axis-normalization','state-interface','conditional-join','unknown-boundary'])assert.ok(rs.some(r=>r.type===type),type);
  for(const r of rs){assert.ok(ir.nodes.some(n=>n.id===r.node));for(const b of r.bindings){const e=by.get(b.edge);assert.ok(e);assert.equal(b.source,e.source);assert.equal(b.source_port,e.source_port);assert.equal(b.target,e.target);assert.equal(b.target_port,e.target_port);assert.deepEqual(b.condition,e.condition);}}
  const state=rs.find(r=>r.type==='state-interface');assert.deepEqual(state.bindings.map(b=>b.role),['sequence-input','initial-state','sequence-output','final-state']);
  assert.equal(state.bindings.find(b=>b.role==='sequence-output').source_port,'0');assert.equal(state.bindings.find(b=>b.role==='final-state').source_port,'1');
  assert.equal(JSON.stringify(ir),before);assert.ok(!rs.some(r=>/lstm|moe|encoder|decoder/i.test(r.type)));
});

test('unknown insertion invalidates the full certificate while independently proved transforms survive',()=>{
  const good=load('ProjectedMixer'),broken=load('InterruptedMixer');
  assert.ok(good.semantic_contracts.some(c=>c.rule==='multihead-attention'));
  assert.ok(!(broken.semantic_contracts||[]).some(c=>c.rule==='multihead-attention'));
  const a=counts(good),b=counts(broken);assert.equal(b['linear-transform'],4);assert.equal(b['axis-transform'],a['axis-transform']);assert.equal(b['axis-normalization'],a['axis-normalization']);assert.equal(b['unknown-boundary'],1);
  const foreign=relations(broken).find(r=>r.type==='unknown-boundary');assert.match(foreign.properties.effects,/unresolved/);assert.ok(foreign.not_asserted.includes('transparency'));
});

test('renaming and helper extraction preserve independent semantic properties',()=>{
  const original=load('ProjectedMixer');for(const name of ['RenamedMixer','WrappedMixer']){
    const candidate=load(name),a=counts(original),b=counts(candidate);
    for(const type of ['linear-transform','axis-transform','axis-normalization','arithmetic'])assert.equal(b[type],a[type],name+':'+type);
    const properties=ir=>relations(ir).filter(r=>r.type!=='source-uses').map(r=>[r.type,r.properties]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.deepEqual(properties(candidate),properties(original));
  }
});

test('selection, conditional calls and a source loop do not imply routing or temporal state',()=>{
  const selected=relations(load('ChosenCircuit'));assert.ok(selected.some(r=>r.type==='selection'));assert.ok(selected.some(r=>r.type==='conditional-region'));
  assert.ok(!selected.some(r=>['dispatch','expert-routing','state-update'].includes(r.type)));
  const loop=relations(load('LoopWithBoundary'));assert.ok(loop.some(r=>r.type==='iteration-template'));assert.ok(loop.some(r=>r.type==='unknown-boundary'&&r.properties.reason==='iteration-binding-unresolved'));
  assert.ok(!loop.some(r=>['state-update','state-interface','time-recurrence'].includes(r.type)));
});

test('gate facts require the actual sigmoid operand and retain the surviving linear computations',()=>{
  const ir=load('BrokenCell');assert.equal(counts(ir)['gated-product'],1);
  const gate=ir.nodes.find(n=>n.function_target==='torch.sigmoid');gate.function_target='torch.relu';
  assert.equal(counts(ir)['gated-product']||0,0);assert.equal(counts(ir)['linear-transform'],2);
  const unknown=load('UnknownFusion');assert.equal(counts(unknown)['gated-product'],1);assert.equal(counts(unknown)['unknown-boundary'],1);
  const mixed=load('BrokenCell'),gateFact=relations(mixed).find(r=>r.type==='gated-product');mixed.edges.find(e=>e.id===gateFact.bindings[0].edge).evidence='runtime-tensor';
  assert.equal(counts(mixed)['gated-product']||0,0);
});

test('constraint receipts explain folded and unsupported relations without asserting consumption',()=>{
  const ir=load('BrokenCell'),plan=A.build(ir);plan.design_constraints.push({kind:'future-relationship',node:ir.nodes.find(n=>n.kind==='compute').id});
  const roots=ir.nodes.filter(n=>!n.parent).map(n=>n.id),g=E.project(ir,{view:'architecture',mode:'source',open:roots,details:true},plan);
  canonical(ir,g);assert.ok(g.constraint_receipts.every(c=>['applied','deferred','conflict'].includes(c.status)&&c.reason));
  assert.equal(g.constraint_receipts.find(c=>c.type==='future-relationship').status,'deferred');
  const folded=E.project(ir,{view:'architecture',mode:'source',open:[],details:true},plan);
  assert.ok(folded.constraint_receipts.filter(c=>c.evidence.relation).every(c=>c.status==='deferred'));
  for(const r of C.compile(plan))for(const b of r.endpoints)assert.ok(ir.edges.some(e=>e.id===b.edge));
});

test('exact framework state slots obtain independent visible side channels with SVG bindings',()=>{
  const n=(id,kind,extra={})=>({id,kind,parent:id==='root'?null:'root',label:id,source:[],...extra});
  const ir={schema:'archcanvas-source-semantic/2',title:'Unfamiliar state circuit',nodes:[n('root','composite'),n('x','interface',{role:'input'}),n('initial','interface',{role:'input'}),n('op','compute',{operator:'rnn',framework_type:'torch.nn.RNN'}),n('output','interface',{role:'output'}),n('final','interface',{role:'output'})],edges:[
    ['x','op','out','arg:0'],['initial','op','out','arg:1'],['op','output','0','in'],['op','final','1','in']].map(([source,target,source_port,target_port],i)=>({id:'e'+i,source,target,source_port,target_port,kind:'data',evidence:'framework-contract'})),motifs:[]};
  const before=JSON.stringify(ir),out=R.render(ir,{paperAuto:false,open:['root']}),g=out.graph,receipt=g.constraint_receipts.find(r=>r.type==='state-ports');
  assert.equal(receipt.status,'applied',receipt.reason);assert.equal(receipt.consumption,'reserved-state-lanes');
  assert.equal(receipt.route_verified,true);
  for(const id of ['e1','e3']){const e=g.edges.find(e=>e.id===id),p=g.positions.get(e.design_route.owner),route=out.prepared.routes.find(e=>e.id===id).route;
    assert.equal(e.design_route.kind,'state-interface');assert.ok(route.ok);assert.ok(route.points.some(v=>v.x>p.x&&v.x<p.x+p.design_gutter));}
  assert.match(out.svg,/data-design-route="state-interface"/);assert.match(out.svg,/data-semantic-bindings=/);assert.equal(JSON.stringify(ir),before);canonical(ir,g);
});

test('folded panels cannot fulfill local goals; a relationship panel must draw their actual bindings',()=>{
  const ir=load('MixedCircuit'),plan=A.build(ir),r=plan.relation_graph.relations.find(r=>r.type==='gated-product');
  const folded=R.render(ir,{paperAuto:false,open:[]});assert.equal(folded.graph.expression_coverage.find(c=>c.goal==='goal:'+r.id).status,'unfulfilled');
  const before=JSON.stringify(ir),detail=R.render(ir,{paperRelation:r.id});
  assert.equal(detail.graph.expression_coverage.find(c=>c.goal==='goal:'+r.id).status,'fulfilled');
  assert.deepEqual(detail.prepared.quality.issues,[]);assert.match(detail.svg,/>gate</);assert.match(detail.svg,/>signal</);
  canonical(ir,detail.graph);assert.equal(JSON.stringify(ir),before);
  assert.equal(R.render(detail.document.ir,detail.document.state).svg,detail.svg);
  const stateRelation=plan.relation_graph.relations.find(r=>r.type==='state-interface'),state=R.render(ir,{paperRelation:stateRelation.id});
  assert.equal(state.graph.nodes.filter(n=>n.kind==='compute').length,1);
  assert.ok(state.graph.nodes.some(n=>n.label==='initial'));assert.ok(state.graph.nodes.some(n=>n.label==='final'));
  assert.equal(state.graph.expression_coverage.find(c=>c.goal==='goal:'+stateRelation.id).status,'fulfilled');
  const join=plan.relation_graph.relations.find(r=>r.type==='conditional-join'),conditional=R.render(ir,{paperRelation:join.id});
  assert.equal(conditional.graph.nodes.filter(n=>n.semantic_type==='conditional-region').length,2);
  assert.equal(conditional.graph.nodes.filter(n=>n.framework_type==='torch.nn.Linear').length,2);
  assert.deepEqual(conditional.prepared.quality.issues,[]);
});

test('atlas coverage names actual readable panels; limiting output leaves unmet goals explicit',()=>{
  const os=require('node:os'),{exportAtlas}=require('../tools/export_publication.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'relation-atlas-'));
  try{const ir=load('BrokenCell'),all=exportAtlas(ir,path.join(dir,'all')),limited=exportAtlas(ir,path.join(dir,'limited'),{maxPanels:1});
    assert.ok(all.complete);assert.ok(all.expression_goals.length);assert.ok(all.expression_goals.every(g=>g.panels.length&&g.panels.every(file=>all.panels.some(p=>p.svg===file&&!p.quality.issues.length))));
    assert.equal(limited.complete,false);assert.ok(limited.unfulfilled_goals.length);assert.ok(limited.expression_goals.some(g=>g.status==='unfulfilled'&&!g.panels.length));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('stale relation focus cannot leak source computations into a runtime panel or vice versa',()=>{
  const ir=load('BrokenCell');ir.nodes.push({id:'runtime-observations',kind:'composite',label:'Observed',parent:null,source:[],evidence_status:'runtime-only'},
    {id:'runtime:op',kind:'compute',operator:'linear',label:'Observed operation',parent:'runtime-observations',source:[],evidence_status:'runtime-only'});
  const p=A.build(ir),source=p.relation_graph.relations.find(r=>r.type==='gated-product'),runtime=p.relation_graph.relations.find(r=>r.node==='runtime:op');
  const a=R.render(ir,{mode:'source',paperRelation:runtime.id}),b=R.render(ir,{mode:'runtime',paperRelation:source.id}),c=R.render(ir,{mode:'runtime',paperRelation:runtime.id});
  assert.equal(a.graph.publication.relation,null);assert.ok(a.graph.nodes.every(n=>!n.id.startsWith('runtime')));
  assert.equal(b.graph.publication.relation,null);assert.ok(b.graph.nodes.every(n=>n.id.startsWith('runtime')));
  assert.equal(c.graph.publication.relation,runtime.id);assert.ok(c.graph.nodes.some(n=>n.id==='runtime:op'));canonical(ir,c.graph);
});

test('mixed region selection exposes state, unknown and escaping joins with exact canonical cuts',()=>{
  const P=require('../semantic_studio/publication.js'),ir=load('MixedCircuit'),before=JSON.stringify(ir),p=P.plan(ir),by=new Map(ir.nodes.map(n=>[n.id,n]));
  const decisions=p.publication.boundary_plans;assert.ok(decisions.length);
  const proposals=decisions.flatMap(d=>d.proposals),condition=proposals.find(c=>c.kind==='conditional-collection');
  assert.ok(condition);assert.equal(condition.canonical_members.filter(id=>by.get(id)?.condition).length,2);
  assert.ok(condition.canonical_members.some(id=>by.get(id)?.kind==='control'));
  for(const c of proposals){
    const inside=new Set(c.canonical_members),cuts=ir.edges.filter(e=>inside.has(e.source)!==inside.has(e.target));
    assert.deepEqual(c.boundary_edges.slice().sort(),cuts.map(e=>e.id).sort());
    assert.ok(c.canonical_members.every(id=>by.has(id)));
    assert.ok(c.canonical_members.every(id=>by.get(id).kind!=='opaque'&&by.get(id).framework_type!=='torch.nn.RNN'));
    assert.equal(c.claims.purity,'not-asserted');
  }
  const computation=proposals.find(c=>c.kind==='computation-region');assert.ok(computation);
  // The region's result both feeds a source module and escapes to a later join.
  assert.ok(computation.escaping_results.length);assert.ok(computation.output_edges.length>=2);
  assert.ok(decisions.flatMap(d=>d.protected).some(d=>d.reasons.includes('boundary-join')));
  assert.match(p.nodes.find(n=>!n.parent).paper.caption,/Source module/);
  assert.equal(JSON.stringify(ir),before);
});

test('candidate regions cannot absorb a path across unknown computation or manufacture a cycle',()=>{
  const Regions=require('../semantic_studio/presentation-regions.js');
  const nodes=[{id:'root',kind:'composite'},...Array.from({length:8},(_,i)=>({id:'n'+i,parent:'root',kind:'compute'})),{id:'u',parent:'root',kind:'opaque'}];
  const chain=Array.from({length:7},(_,i)=>['n'+i,'n'+(i+1)]),make=pairs=>pairs.map(([source,target],i)=>({id:'e'+i,source,target,kind:'data',source_port:'out',target_port:'arg:0'}));
  const options={nodes,children:new Map([['root',nodes.slice(1).map(n=>n.id)]]),parent:'root',relations:[],resolve:id=>id,eligible:()=>true};
  const bad=Regions.candidates({...options,edges:make([...chain,['n3','u'],['u','n4']])});
  assert.ok(bad.protected.some(c=>c.id==='n4'&&c.reasons.includes('boundary-join')));
  assert.ok(bad.proposals.every(c=>!c.members.includes('n3')||!c.members.includes('n4')));
  const valid=Regions.candidates({...options,edges:make([...chain.filter((_,i)=>i!==3),['n3','u'],['u','n4']])});
  assert.equal(valid.proposals.length,2);assert.ok(valid.proposals.every(c=>!c.members.includes('u')));
  const reversed=Regions.candidates({...options,nodes:nodes.slice().reverse(),children:new Map([['root',nodes.slice(1).reverse().map(n=>n.id)]]),edges:make([...chain.filter((_,i)=>i!==3),['n3','u'],['u','n4']])});
  const sets=report=>report.proposals.map(c=>c.members.slice().sort().join(',')).sort();assert.deepEqual(sets(valid),sets(reversed));
  const conditional=structuredClone(nodes);conditional.find(n=>n.id==='n0').kind='control';
  for(const id of ['n1','n2'])Object.assign(conditional.find(n=>n.id===id),{kind:'composite',condition:{branch:'n0',outcome:id}});
  const facts=['n1','n2'].map(node=>({type:'conditional-region',node,properties:{condition:{branch:'n0'}}}));
  facts.push({type:'conditional-join',node:'n3',bindings:[{condition:{branch:'n0'}}]});
  const reenter=Regions.candidates({...options,nodes:conditional,relations:facts,edges:make([['n0','n1'],['n0','n2'],['n1','u'],['u','n3'],['n2','n3']])});
  assert.ok(reenter.rejected.some(c=>c.kind==='conditional-collection'&&c.reason==='dependency-leaves-and-reenters-region'));
});

test('mixed overview retains role identities and realized state lanes while meeting print and label checks',()=>{
  const ir=load('MixedCircuit'),out=R.render(ir,{paperGranularity:'modules'}),q=out.prepared.quality;
  canonical(ir,out.graph);assert.deepEqual(q.issues,[]);assert.ok(q.min_print_font_pt>=8);assert.ok(q.line_geometry.crossings<13);
  assert.equal(q.line_geometry.unrelated_contacts.length,0);
  const state=out.graph.constraint_receipts.find(c=>c.type==='state-ports');assert.equal(state.status,'applied');assert.equal(state.route_verified,true);
  const sequence=out.graph.edges.find(e=>e.sequence_output);assert.ok(sequence);assert.equal(sequence.bundle_values,1);
  assert.ok(sequence.bundle_members.every(m=>m.source_port==='0'));
  assert.ok(out.graph.edges.some(e=>e.source_port==='1'&&!e.bundle_members));
  assert.ok(out.graph.nodes.some(n=>n.kind==='opaque'));assert.equal(R.render(out.document.ir,out.document.state).svg,out.svg);
  const output=out.graph.expression_goals.goals.find(g=>g.direction==='output');assert.ok(output);assert.ok(output.edges.length);
  assert.equal(out.graph.expression_coverage.find(g=>g.goal===output.id).status,'fulfilled');
  assert.equal(R.render(ir,{paperAuto:false,open:[]}).graph.expression_coverage.find(g=>g.goal===output.id).status,'unfulfilled');
});

test('later compositions retain calls and unknown boundaries without inventing routing or temporal proofs',()=>{
  for(const name of ['ConditionalCarry','SharedMismatch','EarlyBoundary']){
    const ir=load(name),rs=relations(ir);assert.ok(rs.some(r=>r.type==='unknown-boundary'));
    assert.ok(!rs.some(r=>['expert-routing','dispatch','time-recurrence','state-update'].includes(r.type)));
    assert.ok(!(ir.semantic_contracts||[]).some(c=>c.rule==='multihead-attention'));
    if(name==='SharedMismatch'){
      const calls=ir.nodes.filter(n=>n.kind==='compute'&&n.module_path==='shared');assert.equal(calls.length,2);
      const inputs=calls.map(n=>ir.edges.find(e=>e.target===n.id&&e.kind==='data').source);assert.notEqual(inputs[0],inputs[1]);
      assert.ok(rs.some(r=>r.type==='selection'));assert.ok(rs.some(r=>r.type==='state-interface'));
    }
    if(name==='EarlyBoundary'){assert.ok(rs.some(r=>r.type==='iteration-template'));assert.ok(!rs.some(r=>r.type==='state-interface'));}
  }
});

test('role boundaries survive depth grouping and compact figures keep legible text and actual state routes',()=>{
  const ir=load('SharedMismatch'),out=R.render(ir,{paperGranularity:'modules'}),rs=relations(ir);
  canonical(ir,out.graph);assert.deepEqual(out.prepared.quality.issues,[]);assert.ok(out.prepared.quality.min_print_font_pt>=8);
  assert.equal(out.prepared.quality.line_geometry.unrelated_contacts.length,0);
  for(const type of ['state-interface','selection','unknown-boundary'])assert.ok(out.graph.positions.has(rs.find(r=>r.type===type).node),type);
  const receipt=out.graph.constraint_receipts.find(r=>r.type==='state-ports');assert.equal(receipt.status,'applied');assert.equal(receipt.route_verified,true);
  const calls=ir.nodes.filter(n=>n.kind==='compute'&&n.module_path==='shared');assert.notEqual(out.graph.representatives[calls[0].id],out.graph.representatives[calls[1].id]);
  const P=require('../semantic_studio/publication.js');
  for(const node of out.graph.nodes){const p=out.graph.positions.get(node.id);if(p.expanded||p.symbol)continue;
    for(const line of node.paper.lines)assert.ok(P.width(line,node.paper.font)+28<=p.w+1);
    for(const line of node.paper.captions)assert.ok(P.width(line,13)+28<=p.w+1);
  }
});

test('source iteration relations use real entry/backedge/exit bindings without asserting time or fixed count',()=>{
  for(const name of ['accumulate','conditional','coupled','guarded','item_input']){
    const ir=load('iteration-bindings/'+name),before=JSON.stringify(ir),rs=relations(ir).filter(r=>r.type==='iteration-binding');
    assert.ok(rs.length,name);
    for(const r of rs){
      assert.ok(r.not_asserted.includes('time recurrence'));assert.ok(r.not_asserted.includes('storage identity'));
      const back=r.bindings.find(b=>b.role==='iteration-feedback'),e=ir.edges.find(e=>e.id===back.edge);
      assert.equal(e.target,r.properties.entry);assert.equal(e.target_port,'backedge');
      assert.ok(r.bindings.some(b=>b.role==='iteration-initial'));assert.ok(r.bindings.some(b=>b.role==='iteration-result'));
      assert.ok(r.properties.required_nodes.includes(r.properties.exit));
    }
    assert.equal(JSON.stringify(ir),before);assert.ok(!relations(ir).some(r=>['time-recurrence','state-update'].includes(r.type)));
  }
});

test('tampering with loop reads or backedge operands removes the relationship proof',()=>{
  for(const field of ['read_edges','backedge']){
    const ir=load('iteration-bindings/accumulate'),loop=ir.nodes.find(n=>n.iteration_contract),row=loop.iteration_contract.bindings[0];
    ir.edges.find(e=>e.id===(field==='read_edges'?row.read_edges[0]:row.backedge)).source=row.initial;
    assert.equal(relations(ir).filter(r=>r.type==='iteration-binding').length,0,field);
  }
});

test('unsupported loop exits and effects keep unknown boundaries while independent local facts survive',()=>{
  for(const name of ['early','unknown','mutable','unbound']){
    const ir=load('iteration-bindings/'+name),rs=relations(ir);
    assert.ok(rs.some(r=>r.type==='iteration-template'));assert.ok(rs.some(r=>r.type==='unknown-boundary'));
    assert.ok(!rs.some(r=>r.type==='iteration-binding'),name);
  }
});

test('iteration panels meet print checks and route proved backedges through actual reserved channels',()=>{
  for(const name of ['accumulate','conditional','coupled','guarded','item_input']){
    const ir=load('iteration-bindings/'+name),r=relations(ir).find(r=>r.type==='iteration-binding'),out=R.render(ir,{paperRelation:r.id,paperGranularity:'detailed'});
    canonical(ir,out.graph);assert.deepEqual(out.prepared.quality.issues,[],name);
    assert.equal(out.prepared.quality.line_geometry.unrelated_contacts.length,0,name);
    assert.equal(out.graph.expression_coverage.find(c=>c.goal==='goal:'+r.id).status,'fulfilled');
    const receipt=out.graph.constraint_receipts.find(c=>c.evidence.relation===r.id);
    assert.equal(receipt.consumption,'reserved-iteration-lane',name);assert.equal(receipt.route_verified,true);
    assert.equal(receipt.reading_order.applied,true,name);
    const back=out.prepared.routes.find(e=>e.design_route?.certificate===r.id),p=out.graph.positions.get(back.design_route.owner);
    assert.ok(back.route.points.some(v=>v.x>p.x&&v.x<p.x+p.design_gutter));
    assert.match(out.svg,/data-design-route="iteration-feedback"/);
    const damaged=structuredClone(out.prepared.routes);damaged.find(e=>e.id===back.id).route.points=[{x:p.x+p.w+1,y:p.y},{x:p.x+p.w+1,y:p.y+10}];
    const receipts=structuredClone(out.graph.constraint_receipts);C.auditRoutes(receipts,out.graph.positions,damaged);
    assert.equal(receipts.find(c=>c.id===receipt.id).status,'conflict');
  }
});

test('compact relationship planning keeps required update nodes and does not fulfill hidden branch computation goals',()=>{
  const ir=load('iteration-bindings/conditional'),r=relations(ir).find(r=>r.type==='iteration-binding');
  const out=R.render(ir,{paperRelation:r.id,paperGranularity:'detailed',paperCompact:true});
  assert.ok(r.properties.required_nodes.every(id=>out.graph.positions.has(id)));
  const activation=ir.nodes.find(n=>n.function_target==='torch.tanh');assert.ok(!out.graph.positions.has(activation.id));
  assert.equal(out.graph.expression_coverage.find(c=>c.goal==='goal:node:'+activation.id).status,'unfulfilled');
  assert.ok(out.graph.nodes.some(n=>n.condition?.outcome==='true'));
});

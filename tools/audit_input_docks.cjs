#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/input-docks/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-37-before-input-docks',snapshot=read(checkpoint+'/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html',
 'tools/audit_input_docks.cjs','tools/extract_input_docks.py','tools/audit_local_svg.py','tools/audit_input_dock_receipts.py','tests/input-docks.test.cjs','tests/semantic_fixtures/input_docks.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[],state={paperMedium:'canvas',paperGranularity:'roles'};
const facts=d=>JSON.stringify({ir:d.ir,nodes:d.layout.nodes.map(n=>n.id),edges:d.layout.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,kind:e.kind,condition:e.condition,originals:e.originals,bundle_members:e.bundle_members})),open:d.publication.open,nodes_accounted:d.layout.node_accounting,edges_accounted:d.layout.edge_accounting,roles:d.publication.role_frontier,boundary:d.publication.boundary,expression:d.expression_coverage,summary:d.summary_coverage});
function save(name,input,s,r){
 const d=r.document;fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(d));
 rows.push({name,input,input_sha256:sha(input),state:s,selected:d.publication.granularity,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(folder+'/'+name+'.svg'),document_sha256:sha(folder+'/'+name+'.layout.json'),
  nodes:d.layout.nodes.length,edges:d.layout.edges.length,quality:d.diagnostics.publication,role_frontier:d.publication.role_frontier,frame_ownership:d.layout.frame_ownership||[],
  local_pipelines:d.publication.local_pipelines,contract_stages:d.publication.contract_stages,local_expressions:d.publication.local_expressions,
  configuration_paths:d.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),context_lanes:d.layout.context_lanes||[],branch_columns:d.layout.branch_columns||[],compound_alignments:d.layout.compound_alignments||[],input_docks:d.layout.input_docks||[]});
}
const inputs=[...read(folder+'/extraction.json').rows.map(r=>[r.entry,r.input,{...state,paperPipelineSummaries:false}]),
 ['MixedWeave','verification/coverage-selection/current/MixedWeave.json',state],['ConditionalCarry','verification/local-relations/current/ConditionalCarry.json',state],
 ['ReturnAlternatives','verification/return-regions/current/ReturnAlternatives.json',state],['transformer','verification/symbolic-values/current/transformer-current.json',state]];
for(const [name,input,s]of inputs){
 const ir=read(input),original=JSON.stringify(ir);let before;
 if(name==='transformer'){
  const previous=read('verification/return-regions/current/render-report.json'),row=previous.rows.find(r=>r.name==='transformer-current');
  for(const [f,h]of Object.entries(snapshot.files).filter(([f])=>f.endsWith('.js')))assert.equal(h,previous.implementation_sha256[f]);
  for(const field of ['svg','document'])assert.equal(sha('verification/return-regions/current/'+row[field]),row[field+'_sha256']);
  before={svg:fs.readFileSync(path.join(root,'verification/return-regions/current',row.svg),'utf8'),document:read('verification/return-regions/current/'+row.document)};
 }else before=old.render(ir,s);
 const after=R.render(ir,s);assert.equal(JSON.stringify(ir),original);assert.equal(facts(before.document),facts(after.document),name+' exact frontier/facts changed');
 save(name+'-before',input,s,before);save(name+'-current',input,s,after);
 const metric=d=>{const q=d.diagnostics.publication;return {nodes:d.layout.nodes.length,edges:d.layout.edges.length,width:q.native_width_px,height:q.native_height_px,wire:q.wire_length,crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues};};
 comparisons.push({name,input,frontier_and_facts_identical:true,svg_unchanged:before.svg===after.svg,before:metric(before.document),current:metric(after.document),refinement:after.prepared.routing.input_dock_refinement||null});
 if(name==='BraidedInputs'){
  const open={...s,paperAuto:false,open:after.graph.publication.open};save(name+'-manual',input,open,R.render(ir,open));
  const full={...s,paperAuto:false,open:after.graph.architecture.nodes.filter(n=>n.kind==='composite').map(n=>n.id),paperRoleDetails:after.graph.architecture.nodes.filter(n=>n.kind==='composite').map(n=>n.id)};
  save(name+'-expanded',input,full,R.render(ir,full));
 }
 console.log(JSON.stringify({name,before:comparisons.at(-1).before,current:comparisons.at(-1).current,accepted:comparisons.at(-1).refinement?.accepted}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h);
const reference='verification/generic-convergence/current/reference-expanded.svg';
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'input-docks-render/1',checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),implementation_sha256:hashes,comparisons,rows,reference:{file:reference,sha256:sha(reference)},goal_complete:false,
 scope:'Existing external input geometry only. Immutable IR, exact operands, unchanged frontier and canonical accounting; actual routed candidates may be rejected. No model-family lookup or whole-goal completion.'},null,2)+'\n');

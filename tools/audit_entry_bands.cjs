#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/entry-bands/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const checkpoint='verification/local-relations/iteration-34-before-entry-band',read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const snapshot=read(checkpoint+'/snapshot.json');for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html',
 'tools/audit_entry_bands.cjs','tools/extract_entry_bands.py','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py','tests/entry-bands.test.cjs','tests/semantic_fixtures/entry_bands.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[],state={paperMedium:'canvas',paperGranularity:'roles'};
const inputs=[...read(folder+'/extraction.json').rows.map(r=>[r.entry,r.input,{...state,paperPipelineSummaries:false}]),
 ['ContextWeave','verification/flow-entries/current/ContextWeave.json',state],['BoundaryWeave','verification/flow-entries/current/BoundaryWeave.json',state],
 ['MixedWeave','verification/coverage-selection/current/MixedWeave.json',state],['UnknownFusion','verification/local-relations/current/UnknownFusion.json',state],
 ['FiberBlend','verification/diagram-set/current/FiberBlend.json',state],['transformer','verification/symbolic-values/current/transformer-current.json',state]];
const facts=d=>JSON.stringify({ir:d.ir,nodes:d.layout.nodes.map(n=>n.id),edges:d.layout.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,kind:e.kind,condition:e.condition,originals:e.originals,bundle_members:e.bundle_members})),open:d.publication.open,nodes_accounted:d.layout.node_accounting,edges_accounted:d.layout.edge_accounting,roles:d.publication.role_frontier,boundary:d.publication.boundary,expression:d.expression_coverage,summary:d.summary_coverage});
function save(name,input,state,document,svg){
 fs.writeFileSync(path.join(out,name+'.svg'),svg);fs.writeFileSync(path.join(out,name+'.layout.json'),JSON.stringify(document,null,2)+'\n');
 const q=document.diagnostics.publication;
 rows.push({name,input,input_sha256:sha(input),state,selected:document.publication.granularity,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(folder+'/'+name+'.svg'),document_sha256:sha(folder+'/'+name+'.layout.json'),
  nodes:document.layout.nodes.length,edges:document.layout.edges.length,quality:q,role_frontier:document.publication.role_frontier,frame_ownership:document.layout.frame_ownership||[],
  local_pipelines:document.publication.local_pipelines,contract_stages:document.publication.contract_stages,local_expressions:document.publication.local_expressions,
  configuration_paths:document.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  context_lanes:document.layout.context_lanes||[],branch_columns:document.layout.branch_columns||[],compound_alignments:document.layout.compound_alignments||[]});
}
for(const [name,input,s]of inputs){
 const ir=read(input),original=JSON.stringify(ir);let before;
 if(name==='transformer'){
  const report=read('verification/diagram-set/current/render-report.json'),row=report.rows.find(r=>r.name==='transformer-main');
  for(const [f,h]of Object.entries(snapshot.files).filter(([f])=>f.endsWith('.js')))assert.equal(h,report.implementation_sha256[f]);
  assert.equal(sha('verification/diagram-set/current/'+row.svg),row.svg_sha256);
  assert.equal(sha('verification/diagram-set/current/'+row.document),row.document_sha256);
  before={document:read('verification/diagram-set/current/'+row.document),svg:fs.readFileSync(path.join(root,'verification/diagram-set/current',row.svg),'utf8')};
 }else before=old.render(ir,s);
 const after=R.render(ir,s);assert.equal(JSON.stringify(ir),original);assert.equal(facts(before.document),facts(after.document),name+' changed frontier or exact expression');
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(after.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 save(name+'-before',input,s,before.document,before.svg);save(name+'-current',input,s,after.document,after.svg);
 const a=before.document.diagnostics.publication,b=after.prepared.quality;
 comparisons.push({name,input,frontier_and_facts_identical:true,svg_unchanged:before.svg===after.svg,before:{width:a.native_width_px,height:a.native_height_px,wire:a.wire_length,crossings:a.line_geometry.crossings,contacts:a.line_geometry.unrelated_contacts.length},
  current:{width:b.native_width_px,height:b.native_height_px,wire:b.wire_length,crossings:b.line_geometry.crossings,contacts:b.line_geometry.unrelated_contacts.length},refinement:after.prepared.routing.entry_band_refinement||null});
 console.log(JSON.stringify(comparisons.at(-1)));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'entry-band-render/1',checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),implementation_sha256:hashes,comparisons,rows,goal_complete:false,
 scope:'Measured input-band and context-gutter geometry at an identical visible frontier. No additional semantic recognition, model-specific coordinates or whole-goal completion claim.'},null,2)+'\n');

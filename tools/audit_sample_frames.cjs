'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js'),root=path.resolve(__dirname,'..'),folder='verification/sample-frames/current',out=path.join(root,folder);
fs.mkdirSync(out,{recursive:true});
const checkpoint='verification/local-relations/iteration-35-before-sample-frame',read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const frozen=read(checkpoint+'/snapshot.json');for(const [f,h]of Object.entries(frozen.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const files=[...fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html','tests/sample-frames.test.cjs','tools/audit_sample_frames.cjs','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[],state={paperMedium:'canvas',paperGranularity:'roles'},prefix='verification/local-relations/current/structural-repeats/';
const inputs=[...['EquivalentSteps','MixedSteps','UnknownSteps','MutableSteps','IndependentStack','SharedStack'].map(n=>[n,prefix+n+'.json']),['CoupledRuns','verification/inline-sequences/current/CoupledRuns.json'],['transformer','verification/symbolic-values/current/transformer-current.json']];
const facts=d=>({ir:d.ir,open:d.publication.open,edges:d.layout.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,kind:e.kind,condition:e.condition,originals:e.originals,bundle_members:e.bundle_members})),edge_accounting:d.layout.edge_accounting,roles:d.publication.role_frontier,boundary:d.publication.boundary,expressions:d.expression_coverage,summary:d.summary_coverage});
function save(name,input,r){
 const doc=r.document,q=doc.diagnostics.publication;
 fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(doc,null,2)+'\n');
 fs.writeFileSync(out+'/'+name+'-import.layout.json',JSON.stringify({schema:doc.schema,ir:doc.ir,state:doc.state}));
 rows.push({name,input,input_sha256:sha(input),state,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(out+'/'+name+'.svg'),document_sha256:sha(out+'/'+name+'.layout.json'),nodes:doc.layout.nodes.length,edges:doc.layout.edges.length,selected:doc.publication.granularity,
  quality:q,frame_ownership:doc.layout.frame_ownership||[],role_frontier:doc.publication.role_frontier,local_pipelines:doc.publication.local_pipelines,contract_stages:doc.publication.contract_stages,local_expressions:doc.publication.local_expressions,
  configuration_paths:doc.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),context_lanes:doc.layout.context_lanes||[],branch_columns:doc.layout.branch_columns||[],compound_alignments:doc.layout.compound_alignments||[]});
}
for(const [name,input]of inputs){
 const ir=read(input),original=JSON.stringify(ir);let before;
 if(name==='transformer'){
  const previous=read('verification/entry-bands/current/render-report.json'),row=previous.rows.find(r=>r.name==='transformer-current');
  for(const [f,h]of Object.entries(frozen.files).filter(([f])=>f.endsWith('.js')))assert.equal(h,previous.implementation_sha256[f]);
  assert.equal(sha('verification/entry-bands/current/'+row.svg),row.svg_sha256);assert.equal(sha('verification/entry-bands/current/'+row.document),row.document_sha256);
  before={document:read('verification/entry-bands/current/'+row.document),svg:fs.readFileSync('verification/entry-bands/current/'+row.svg,'utf8')};
 }else before=old.render(ir,state);
 const after=R.render(ir,state);assert.equal(JSON.stringify(ir),original);assert.equal(JSON.stringify(facts(before.document)),JSON.stringify(facts(after.document)),name+' changed expressions or bindings');
 const frames=(after.graph.frame_ownership||[]).filter(r=>r.kind==='sequence-sample'),ids=new Set(frames.map(r=>r.node));
 assert.equal(JSON.stringify(before.document.layout.nodes.filter(n=>!ids.has(n.id)).map(n=>n.id).sort()),JSON.stringify(after.document.layout.nodes.map(n=>n.id).sort()));
 for(const key of Object.keys(after.graph.node_accounting))assert.equal(JSON.stringify(before.document.layout.node_accounting[key].filter(id=>!ids.has(id))),JSON.stringify(after.graph.node_accounting[key].filter(id=>!ids.has(id))));
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(after.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 save(name+'-before',input,before);save(name+'-current',input,after);
 const metrics=d=>{const q=d.diagnostics.publication;return {width:q.native_width_px,height:q.native_height_px,wire:q.wire_length,crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length};};
 comparisons.push({name,input,facts_and_expressions_identical:true,svg_unchanged:before.svg===after.svg,attached_samples:frames.map(r=>r.node),before:metrics(before.document),current:metrics(after.document),refinement:after.prepared.routing.sample_frame_refinement||null});
 console.log(JSON.stringify({name,nodes:after.graph.nodes.length,samples:frames.length,metrics:metrics(after.document),issues:after.prepared.quality.issues}));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h);
const extraction='verification/inline-sequences/current/extraction.json';
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'sample-frame-render/1',checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),extraction,extraction_sha256:sha(extraction),inputs_reused:true,implementation_sha256:hashes,comparisons,rows,goal_complete:false},null,2)+'\n');

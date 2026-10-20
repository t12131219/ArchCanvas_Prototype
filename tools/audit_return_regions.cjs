'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/return-regions/current',out=path.join(root,folder),checkpoint='verification/local-relations/iteration-36-before-return-regions';
const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const frozen=read(checkpoint+'/snapshot.json');for(const [f,h]of Object.entries(frozen.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const files=[...Object.keys(frozen.files),'tools/audit_return_regions.cjs','tools/extract_return_regions.py','tools/audit_return_region_receipts.py','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py','tests/return-regions.test.cjs','tests/semantic_fixtures/return_regions.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[],state={paperMedium:'canvas',paperGranularity:'roles'};
const priorFile='verification/sample-frames/current/render-report.json',prior=read(priorFile);
function save(name,input,s,r,extra={}){
 const doc=r.document,q=doc.diagnostics.publication;
 fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(doc,null,2)+'\n');
 fs.writeFileSync(out+'/'+name+'-import.layout.json',JSON.stringify({schema:doc.schema,ir:doc.ir,state:doc.state}));
 const row={name,input,input_sha256:sha(input),state:s,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(out+'/'+name+'.svg'),document_sha256:sha(out+'/'+name+'.layout.json'),nodes:doc.layout.nodes.length,edges:doc.layout.edges.length,selected:doc.publication.granularity,
  quality:q,return_regions:doc.publication.return_regions||null,condition_predicates:doc.publication.condition_predicates||null,
  frame_ownership:doc.layout.frame_ownership||[],role_frontier:doc.publication.role_frontier,local_pipelines:doc.publication.local_pipelines,contract_stages:doc.publication.contract_stages,local_expressions:doc.publication.local_expressions,
  configuration_paths:doc.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),context_lanes:doc.layout.context_lanes||[],branch_columns:doc.layout.branch_columns||[],compound_alignments:doc.layout.compound_alignments||[],...extra};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,size:[q.native_width_px,q.native_height_px],crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues,returns:row.return_regions?.rows.filter(r=>r.status!=='folded').length||0}));return row;
}
function current(name,input,s,extra={}){
 const ir=read(input),original=JSON.stringify(ir),r=R.render(ir,s);assert.equal(JSON.stringify(ir),original);
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[bucket]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 return {r,row:save(name,input,s,r,{version:'current',...extra})};
}
function pair(name,input,s){
 let before,baseline_receipt;
 if(name==='transformer'){
  const cached=prior.rows.find(r=>r.name==='transformer-current');assert.equal(cached.input_sha256,sha(input));assert.equal(JSON.stringify(cached.state),JSON.stringify(s));
  for(const [f,h]of Object.entries(frozen.files))assert.equal(h,prior.implementation_sha256[f]||sha(f),'not exact baseline '+f);
  for(const key of ['svg','document'])assert.equal(sha(path.dirname(priorFile)+'/'+cached[key]),cached[key+'_sha256']);
  before={document:read(path.dirname(priorFile)+'/'+cached.document),svg:fs.readFileSync(path.dirname(priorFile)+'/'+cached.svg,'utf8')};
  baseline_receipt={report:priorFile,sha256:sha(priorFile),row:cached.name,method:'exact-hashed-prior-output'};
 }else before=old.render(read(input),s);
 const a=save(name+'-before',input,s,before,{version:'before',baseline_receipt}),b=current(name+'-current',input,s,{baseline:name+'-before'});
 assert.equal(JSON.stringify(b.r.document.ir),JSON.stringify(before.document.ir));assert.equal(JSON.stringify(b.r.document.publication.open),JSON.stringify(before.document.publication.open));
 const metrics=row=>({nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,wire:row.quality.wire_length,crossings:row.quality.line_geometry.crossings,contacts:row.quality.line_geometry.unrelated_contacts.length});
 comparisons.push({name,input,canonical_ir_and_allocated_open_unchanged:true,svg_unchanged:before.svg===b.r.svg,before:metrics(a),current:metrics(b.row)});
 return b.r;
}
for(const entry of read(folder+'/extraction.json').rows){
 const r=pair(entry.entry,entry.input,state);
 if(!['UnknownReturns','StatefulReturns'].includes(entry.entry)){
  const g=E.project(read(entry.input),{...state,view:'publication'}),row=g.publication.return_regions.rows[0];assert.ok(row);
  const folded={...state,paperAuto:false,open:g.publication.open.filter(id=>id!==row.group)};
  pair(entry.entry+'-summary',entry.input,folded);
  current(entry.entry+'-opened',entry.input,{...folded,open:[...new Set([...folded.open,row.group,...row.canonical_members])]},{folded:entry.entry+'-summary-current'});
 }
}
for(const [name,input]of [['MixedWeave','verification/coverage-selection/current/MixedWeave.json'],['ConditionalCarry','verification/local-relations/current/ConditionalCarry.json'],['transformer','verification/symbolic-values/current/transformer-current.json']])pair(name,input,state);
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h,'producer changed '+f);
const extraction=folder+'/extraction.json',reference='verification/generic-convergence/current/reference-expanded.svg';
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'return-regions-render/1',implementation_sha256:hashes,checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 extraction,extraction_sha256:sha(extraction),reference:{file:reference,sha256:sha(reference)},comparisons,rows,goal_complete:false,
 scope:'Local source return sites and their common output interface join an existing conditional region. Source conditions, return slots and external terminals are preserved. Expanded return interfaces are explicit. No selected execution, fallthrough negation or full reference convergence is claimed.'},null,2)+'\n');

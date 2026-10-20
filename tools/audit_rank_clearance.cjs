'use strict';
// Evaluation names locate inputs only. No renderer dispatch consumes them.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),folder='verification/rank-clearance/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
fs.mkdirSync(out,{recursive:true});
const frozen='verification/local-relations/iteration-24-before-rank-clearance/snapshot.json',snapshot=read(frozen),prior=read(snapshot.prior_report);
assert.equal(sha(snapshot.prior_report),snapshot.prior_report_sha256);
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(path.dirname(frozen)+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,path.dirname(frozen),'implementation/semantic_studio'));
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tests/rank-clearance-fixtures.cjs','tests/rank-clearance.test.cjs','tools/audit_rank_clearance.cjs','tools/audit_local_svg.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
function render(name,input,state,baselineName=null,experimentFor=null,renderer=R){
 const ir=read(input),before=JSON.stringify(ir),r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),before);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 let comparison=null;
 if(baselineName){const b=prior.rows.find(r=>r.name===baselineName);assert.ok(b);assert.equal(sha(input),b.input_sha256);assert.deepEqual(state,b.state);
  const previous=path.join(root,path.dirname(snapshot.prior_report),b.document);
  if(!fs.existsSync(previous)){const restored=old.render(read(input),state);fs.writeFileSync(previous,JSON.stringify(restored.document,null,2)+'\n');}
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(previous)).digest('hex'),b.document_sha256);
  comparison={row:baselineName,report:snapshot.prior_report,report_sha256:snapshot.prior_report_sha256,svg_sha256:b.svg_sha256,unchanged:sha(folder+'/'+svg)===b.svg_sha256};
  if(!comparison.unchanged)assert.equal(r.prepared.routing.rank_clearance_refinement?.accepted,true);
 }
 const q=r.prepared.quality;
 rows.push({name,input,input_sha256:sha(input),state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),comparison,
  experiment_for:experimentFor,geometry_fixture:/verification\/(rank|label)-clearance\/current\//.test(input),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  selected:r.graph.publication.granularity,quality:q,clearance:r.graph.publication.label_clearance||null,
  refinement:r.prepared.routing.clearance_refinement||null,rank_refinement:r.prepared.routing.rank_clearance_refinement||null,
  frame_ownership:r.graph.frame_ownership||[],role_frontier:r.graph.publication.role_frontier||null,local_expressions:r.graph.publication.local_expressions,
  local_pipelines:r.graph.publication.local_pipelines,contract_stages:r.graph.publication.contract_stages,
  configuration_paths:r.graph.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[]});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,width:q.native_width_px,height:q.native_height_px,
  crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues,accepted:r.prepared.routing.rank_clearance_refinement?.accepted,
  attempts:r.prepared.routing.rank_clearance_refinement?.attempts.map(a=>({accepted:a.accepted,size:[a.candidate.width,a.candidate.height],crossings:a.candidate.crossings,contacts:a.candidate.contacts}))}));return r;
}
const {fixtureForRank,state}=require('../tests/rank-clearance-fixtures.cjs'),ir=fixtureForRank(),source=path.join(root,'tests/rank-clearance-fixtures.cjs');
ir.entry={file:source,basis:'hand-authored geometry fixture, not extracted model facts'};ir.sources=[{path:source,sha256:sha('tests/rank-clearance-fixtures.cjs')}];
for(const n of ir.nodes){n.evidence_status='static-only';n.source=[{file:source,line:4,expression:'Synthetic geometry node '+n.id}];}
const input=folder+'/ChannelChain.json';fs.writeFileSync(path.join(root,input),JSON.stringify(ir));
const seal=cp.spawnSync('python3',['-c','import json,sys;from pathlib import Path;from semantic_adapter.schema import seal,validate_ir;p=Path(sys.argv[1]);ir=seal(json.loads(p.read_text()));assert validate_ir(ir)["ok"];p.write_text(json.dumps(ir,indent=2)+chr(10))',path.join(root,input)],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(seal.status,0,seal.stderr);
render('ChannelChain-before',input,state,null,null,old);
render('ChannelChain-auto',input,state);
render('ChannelChain-folded',input,{...state,open:[]});
for(const name of ['ForeignSignals-auto','CrossedSignals-auto','MixedCircuit-default','ForeignComposition-default','UnknownFusion-default','BrokenCell-default','ConditionalCarry-default','SharedMismatch-default',
 'SameSource-default','SameSource-selected','SameSource-detail','transformer-default','transformer-local-panel','transformer-local','transformer-selected']){
 const row=prior.rows.find(r=>r.name===name),r=render(name,row.input,row.state,name);
 if(['transformer-local','transformer-selected','CrossedSignals-auto'].includes(name)){
  const a=r.prepared.routing.rank_clearance_refinement?.attempts[0];
  if(a)render(name+'-candidate',row.input,{...row.state,...a.configuration},null,name);
 }
}
for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'rank-clearance-audit/1',implementation_sha256:implementation,
 frozen_snapshot:frozen,frozen_snapshot_sha256:sha(frozen),prior_report:snapshot.prior_report,prior_report_sha256:snapshot.prior_report_sha256,
 extraction:prior.extraction,extraction_sha256:prior.extraction_sha256,rows,goal_complete:false},null,2)+'\n');

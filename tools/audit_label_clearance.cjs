'use strict';
// Real SVGs from unchanged semantic frontiers. Model names locate evaluation
// files only. Synthetic graphs test geometry; they are not extraction evidence.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),folder='verification/label-clearance/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
fs.mkdirSync(out,{recursive:true});
const frozen='verification/local-relations/iteration-23-before-label-clearance/snapshot.json',snapshot=read(frozen),prior=read(snapshot.prior_report);
assert.equal(sha(snapshot.prior_report),snapshot.prior_report_sha256);for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(path.dirname(frozen)+'/implementation/'+f),h);
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tests/label-clearance-fixtures.cjs','tests/label-clearance.test.cjs','tools/audit_label_clearance.cjs','tools/audit_local_svg.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
function render(name,input,state,baselineName=null,experiment=false){
 const ir=read(input),before=JSON.stringify(ir),r=R.render(ir,state);assert.equal(JSON.stringify(ir),before);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 let comparison=null;
 if(baselineName){const old=prior.rows.find(r=>r.name===baselineName);assert.ok(old);assert.equal(sha(input),old.input_sha256);assert.deepEqual(state,old.state);if(!r.prepared.routing.clearance_refinement?.accepted)assert.equal(sha(folder+'/'+svg),old.svg_sha256);comparison={row:baselineName,report:snapshot.prior_report,report_sha256:snapshot.prior_report_sha256,svg_sha256:old.svg_sha256,unchanged:sha(folder+'/'+svg)===old.svg_sha256};}
 rows.push({name,input,input_sha256:sha(input),state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),comparison,experiment,
  geometry_fixture:input.startsWith(folder),nodes:r.graph.nodes.length,edges:r.graph.edges.length,selected:r.graph.publication.granularity,quality:r.prepared.quality,
  clearance:r.graph.publication.label_clearance||null,refinement:r.prepared.routing.clearance_refinement||null,
  frame_ownership:r.graph.frame_ownership||[],role_frontier:r.graph.publication.role_frontier||null,local_expressions:r.graph.publication.local_expressions,
  local_pipelines:r.graph.publication.local_pipelines,contract_stages:r.graph.publication.contract_stages,
  configuration_paths:r.graph.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[]});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,width:r.prepared.quality.native_width_px,height:r.prepared.quality.native_height_px,
  crossings:r.prepared.quality.line_geometry.crossings,contacts:r.prepared.quality.line_geometry.unrelated_contacts.length,issues:r.prepared.quality.issues,accepted:r.prepared.routing.clearance_refinement?.accepted}));return r;
}
const {fixture,state}=require('../tests/label-clearance-fixtures.cjs');
function synthetic(name,extra=[]){
 const ir=fixture();for(const [i,source,target]of extra)ir.edges.push({id:'cross-'+i,source,target,source_port:'out',target_port:'use:'+i,kind:'data',evidence:'source-dependency'});
 const source=path.join(root,'tests/label-clearance-fixtures.cjs');ir.entry={file:source,basis:'hand-authored geometry fixture, not extracted model facts'};ir.sources=[{path:source,sha256:sha('tests/label-clearance-fixtures.cjs')}];
 for(const n of ir.nodes){n.evidence_status='static-only';n.source=[{file:source,line:8,expression:'Synthetic geometry node '+n.id}];}
 const file=path.join(out,name+'.json');fs.writeFileSync(file,JSON.stringify(ir));
 const seal=cp.spawnSync('python3',['-c','import json,sys;from pathlib import Path;from semantic_adapter.schema import seal,validate_ir;p=Path(sys.argv[1]);ir=seal(json.loads(p.read_text()));assert validate_ir(ir)["ok"];p.write_text(json.dumps(ir,indent=2)+chr(10))',file],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(seal.status,0,seal.stderr);
 return folder+'/'+name+'.json';
}
for(const [name,input]of [['ForeignSignals',synthetic('ForeignSignals')],['CrossedSignals',synthetic('CrossedSignals',[[0,'v','z'],[1,'a','w']])]]){
 render(name+'-global',input,{...state,paperLabelSpacing:'global'});
 render(name+'-candidate',input,{...state,paperLabelSpacing:'local'},null,true);
 render(name+'-auto',input,state);
 if(name==='ForeignSignals')render(name+'-folded',input,{...state,open:['root']});
}
const defaults={paperMedium:'canvas',paperGranularity:'roles'};
for(const name of ['MixedCircuit','ForeignComposition','UnknownFusion','BrokenCell','ConditionalCarry','SharedMismatch'])render(name+'-default','verification/local-relations/current/'+name+'.json',defaults,name+'-default');
const same='verification/semantic-design/current/after/SameSource.json';
for(const name of ['SameSource-default','SameSource-selected','SameSource-detail']){const row=prior.rows.find(r=>r.name===name);render(name,same,row.state,name);}
for(const name of ['transformer-default','transformer-local','transformer-selected','transformer-local-panel']){
 const row=prior.rows.find(r=>r.name===name);render(name,row.input,row.state,name);
 if(['transformer-local','transformer-selected'].includes(name))render(name+'-candidate',row.input,{...row.state,paperLabelSpacing:'local'},null,true);
}
for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h);
const report={schema:'label-clearance-audit/1',implementation_sha256:implementation,frozen_snapshot:frozen,frozen_snapshot_sha256:sha(frozen),
 prior_report:snapshot.prior_report,prior_report_sha256:snapshot.prior_report_sha256,extraction:prior.extraction,extraction_sha256:prior.extraction_sha256,
 rows,goal_complete:false};fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');

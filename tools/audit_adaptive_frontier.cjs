'use strict';
// Evaluation input labels never enter production candidate selection.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/adaptive-frontier/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/adaptive-frontier.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
fs.mkdirSync(out,{recursive:true});
const frozen='verification/local-relations/iteration-25-before-adaptive-frontier/snapshot.json',snapshot=read(frozen),prior=read(snapshot.prior_report);
assert.equal(sha(snapshot.prior_report),snapshot.prior_report_sha256);
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(path.dirname(frozen)+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tests/adaptive-frontier.test.cjs','tools/audit_adaptive_frontier.cjs','tools/audit_local_svg.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[],state={paperMedium:'canvas',paperGranularity:'roles'};
// Complete row metadata from the saved measured document, without claiming a
// new render pass. Keep the original report bytes and renderer/input hashes.
if(process.argv.includes('--complete-report')){
 const measuredFile=folder+'/render-pass-report.json';
 if(!fs.existsSync(path.join(root,measuredFile)))fs.copyFileSync(path.join(out,'render-report.json'),path.join(root,measuredFile));
 const report=read(measuredFile),changed=[];
 for(const [file,digest]of Object.entries(report.implementation_sha256))if(sha(file)!==digest){assert.equal(file,'tools/audit_adaptive_frontier.cjs');changed.push(file);}
 for(const row of report.rows){
  assert.equal(sha(row.input),row.input_sha256);for(const key of ['svg','document'])assert.equal(sha(folder+'/'+row[key]),row[key+'_sha256']);
  const doc=read(folder+'/'+row.document);row.selected=doc.publication.granularity;
  row.configuration_paths=doc.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1');
 }
 report.report_completion={render_pass_report:measuredFile,render_pass_report_sha256:sha(measuredFile),changed_files:changed,
  scope:'Granularity and configuration-path row fields derived from immutable measured documents; no SVG, layout, input, outcome or renderer byte changed.'};
 report.implementation_sha256=implementation;fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');process.exit(0);
}
function save(name,input,s,r,extra={}){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const q=r.prepared.quality,g=r.graph;
 const row={name,input,input_sha256:sha(input),state:s,selected:g.publication.granularity,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),nodes:g.nodes.length,edges:g.edges.length,quality:q,
  adaptive:g.publication.adaptive_frontier||null,local_expressions:g.publication.local_expressions,role_frontier:g.publication.role_frontier,
  configuration_paths:g.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  local_pipelines:g.publication.local_pipelines,contract_stages:g.publication.contract_stages,
  frame_ownership:g.frame_ownership||[],context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[],...extra};rows.push(row);
 console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,size:[q.native_width_px,q.native_height_px],crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,
  issues:q.issues,attempts:row.adaptive?.attempts.map(t=>({kind:t.opportunity.kind,accepted:t.accepted,gain:t.gain,reasons:t.reasons}))}));return row;
}
let captures=[];const assess=A.assess;A.assess=(ir,b,t)=>{const result=assess(ir,b,t);captures.push(t);return result;};
function pair(name,input,{compare=null,extra={}}={}){
 const ir=read(input),before=JSON.stringify(ir),s={...state,...extra};captures=[];
 const b=R.render(ir,s);let comparison=null;
 if(compare){const p=prior.rows.find(r=>r.name===compare);assert.ok(p);assert.equal(sha(input),p.input_sha256);assert.deepEqual(s,p.state);assert.equal(crypto.createHash('sha256').update(b.svg).digest('hex'),p.svg_sha256);comparison={report:snapshot.prior_report,row:compare,svg_sha256:p.svg_sha256,unchanged:true};}
 save(name+'-default',input,s,b,{comparison});captures=[];
 const active={...s,paperAdaptive:true},r=R.render(ir,active),trials=captures.slice(),a=r.graph.publication.adaptive_frontier;
 save(name+'-adaptive',input,active,r,{baseline:name+'-default'});
 let parent=name+'-default';
 for(let i=0;i<trials.length;i++){
  const attempt=a.attempts[i],trialState={...s,paperAdaptive:false,...attempt.requested_state,view:'publication'},id=name+'-trial-'+(i+1);
  const figure={...trials[i],graph:{...trials[i].graph,publication:{...trials[i].graph.publication}},prepared:{...trials[i].prepared,routing:{...trials[i].prepared.routing}}};
  delete figure.graph.publication.adaptive_frontier;delete figure.prepared.routing.semantic_refinement;
  save(id,input,trialState,R.renderPrepared(ir,trialState,figure),{trial_for:name+'-adaptive',trial_parent:parent,attempt:i,accepted:attempt.accepted});
  if(attempt.accepted)parent=id;
 }
 assert.equal(JSON.stringify(ir),before);assert.ok(a.attempts.length<=3);assert.ok(a.preflights.length<=36);
}
for(const name of ['MixedCircuit','ForeignComposition','UnknownFusion','BrokenCell','ConditionalCarry','SharedMismatch'])pair(name,'verification/local-relations/current/'+name+'.json',{compare:name+'-default'});
pair('SameSource','verification/semantic-design/current/after/SameSource.json',{compare:'SameSource-default'});
pair('InterruptedMixer','verification/local-relations/current/InterruptedMixer.json');
pair('InterruptedPaths','verification/branch-columns/current/InterruptedPaths.json');
pair('BoundaryWeave','verification/flow-entries/current/BoundaryWeave.json');
pair('transformer','verification/symbolic-values/current/transformer-current.json',{compare:'transformer-default'});
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest, 'changed producer '+file);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'adaptive-frontier-audit/1',implementation_sha256:implementation,
 frozen_snapshot:frozen,frozen_snapshot_sha256:sha(frozen),prior_report:snapshot.prior_report,prior_report_sha256:snapshot.prior_report_sha256,
 extraction:prior.extraction,extraction_sha256:prior.extraction_sha256,rows,goal_complete:false},null,2)+'\n');

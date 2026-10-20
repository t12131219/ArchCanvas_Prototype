'use strict';
// Case names are evaluation inputs only, never production policy.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/frontier-reservations/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-27-before-frontier-reservations',snapshot=read(checkpoint+'/snapshot.json');
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+file),digest);
const load=require('./load_publication_renderer.cjs'),old=load(path.join(root,checkpoint,'implementation/semantic_studio')),
 oldEngine=load(path.join(root,checkpoint,'implementation/semantic_studio'),{engine:true}),R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/adaptive-frontier.js');
const priorFile='verification/dependency-trees/current/render-report.json',prior=read(priorFile);
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(prior.implementation_sha256[file],digest);
const files=[...Object.keys(snapshot.files),'tools/load_publication_renderer.cjs','tools/audit_frontier_reservations.cjs','tools/extract_frontier_reservations.py',
 'tools/audit_local_svg.py','tools/audit_role_detail_receipts.py','tests/frontier-reservations.test.cjs','tests/semantic_fixtures/frontier_reservations.py','tests/semantic_fixtures/branched_mosaic.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[],state={paperMedium:'canvas',paperGranularity:'roles'};
let captures=[];const assess=A.assess;A.assess=(ir,b,t)=>{const result=assess(ir,b,t);captures.push(t);return result;};
function save(name,input,s,r,extra={}){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const g=r.graph,q=r.prepared.quality,row={name,input,input_sha256:sha(input),state:s,selected:g.publication.granularity,svg,document,
  svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),nodes:g.nodes.length,edges:g.edges.length,quality:q,
  local_pipelines:g.publication.local_pipelines||null,role_frontier:g.publication.role_frontier,contract_stages:g.publication.contract_stages,local_expressions:g.publication.local_expressions,
  reservations:g.publication.frontier_reservations||null,adaptive:g.publication.adaptive_frontier||null,
  configuration_paths:g.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  frame_ownership:g.frame_ownership||[],context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[],...extra};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,size:[q.native_width_px,q.native_height_px],crossings:q.line_geometry.crossings,
  contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues,attempts:row.adaptive?.attempts.map(t=>({type:t.opportunity.type,kind:t.opportunity.kind,accepted:t.accepted,gain:t.gain,reasons:t.reasons}))}));
}
function before(name,input,s){
 const cached=prior.rows.find(r=>r.input===input&&r.input_sha256===sha(input)&&JSON.stringify(s)===JSON.stringify(r.state)&&r.version==='current');
 if(cached){
  for(const key of ['svg','document']){const file=path.dirname(priorFile)+'/'+cached[key];assert.equal(sha(file),cached[key+'_sha256']);fs.copyFileSync(path.join(root,file),path.join(out,name+(key==='svg'?'.svg':'.layout.json')));}
  rows.push({...cached,name,svg:name+'.svg',document:name+'.layout.json',baseline_receipt:{report:priorFile,report_sha256:sha(priorFile),row:cached.name,method:'exact-hashed-prior-output'}});
  console.log(JSON.stringify({name,nodes:cached.nodes,edges:cached.edges,baseline:'exact-hashed-prior-output'}));return;
 }
 save(name,input,s,old.render(read(input),s),{version:'before'});
}
function current(name,input,s,extra={}){
 const ir=read(input),bytes=JSON.stringify(ir),r=R.render(ir,s);assert.equal(JSON.stringify(ir),bytes);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 save(name,input,s,r,extra);return r;
}
function pair(name,input,extra={}){
 const s={...state,...extra};before(name+'-before',input,s);
 // The frozen, unsummarized projection is an independent reference for the
 // original logical allocation. It is not a new thousands-node SVG claim.
 const logical=oldEngine.project(read(input),{...s,view:'publication',paperPipelineSummaries:false});
 return current(name+'-current',input,s,{baseline:name+'-before',logical_frontier:{implementation:'frozen-checkpoint',open:logical.publication.open,nodes:logical.nodes.map(n=>n.id)}});
}
function adaptive(name,input,extra={}){
 const s={...state,...extra,paperAdaptive:true};captures=[];const r=current(name+'-adaptive',input,s,{adaptive_baseline:name+'-current'}),trials=captures.slice();
 let parent=name+'-current';
 for(let i=0;i<trials.length;i++){
  const attempt=r.graph.publication.adaptive_frontier.attempts[i],trialState={...s,paperAdaptive:false,...attempt.requested_state},
   figure={...trials[i],graph:{...trials[i].graph,publication:{...trials[i].graph.publication}},prepared:{...trials[i].prepared,routing:{...trials[i].prepared.routing}}};
  delete figure.graph.publication.adaptive_frontier;delete figure.prepared.routing.semantic_refinement;
  save(name+'-trial-'+(i+1),input,trialState,R.renderPrepared(read(input),trialState,figure),{trial_for:name+'-adaptive',trial_parent:parent,attempt:i,accepted:attempt.accepted});
  if(attempt.accepted)parent=name+'-trial-'+(i+1);
 }
}
for(const entry of read(folder+'/extraction.json').rows){
 const budget=entry.entry==='NestedMosaic'?6:8,r=pair(entry.entry,entry.input,{paperBudget:budget});
 adaptive(entry.entry,entry.input,{paperBudget:budget});
 const summary=r.graph.publication.local_pipelines.rows.find(p=>p.status==='summary');
 if(summary)current(entry.entry+'-opened',entry.input,{...state,paperAuto:false,open:[...r.graph.publication.open,...summary.source_boundaries.map(b=>b.node)]});
}
for(const name of ['MergeWeave','ScaledProjection','ResultFanout','SharedTree','ConditionalTree'])pair(name,'verification/dependency-trees/current/'+name+'.json');
for(const [name,input]of [['SameSource','verification/semantic-design/current/after/SameSource.json'],
 ['ForeignComposition','verification/local-relations/current/ForeignComposition.json'],['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json'],
 ['ConditionalCarry','verification/local-relations/current/ConditionalCarry.json'],['BoundaryWeave','verification/flow-entries/current/BoundaryWeave.json']])pair(name,input);
const input='verification/symbolic-values/current/transformer-current.json',r=pair('transformer',input);
const summary=r.graph.publication.local_pipelines.rows.find(p=>p.status==='summary'&&p.dependency_tree);
if(summary){current('transformer-focused',input,{...state,paperFocus:summary.node,paperAuto:false,open:[]});
 current('transformer-focused-open',input,{...state,paperFocus:summary.node,paperAuto:false,open:[summary.node]});}
adaptive('transformer',input);
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest,'changed producer '+file);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'frontier-reservation-audit/1',implementation_sha256:implementation,
 checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),prior_report:priorFile,prior_report_sha256:sha(priorFile),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),reference:prior.reference,rows,goal_complete:false,
 scope:'Logical allocation precedes reversible summary lowering. Source-use detail requires all consumers and exact physical paths; measured adaptive additions may be accepted or rejected. No family-specific planning or global optimality claim.'},null,2)+'\n');

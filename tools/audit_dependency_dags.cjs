'use strict';
// Named cases are evaluation inputs only; production uses local facts.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/dependency-dags/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-28-before-dependency-dags',snapshot=read(checkpoint+'/snapshot.json');
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+file),digest);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio')),R=require('../semantic_studio/publication-renderer.js');
const priorFile='verification/frontier-reservations/current/render-report.json',prior=read(priorFile);
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(prior.implementation_sha256[file],digest);
const files=[...Object.keys(snapshot.files),'tools/load_publication_renderer.cjs','tools/audit_dependency_dags.cjs',
 'tools/extract_dependency_dags.py','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py','tests/dependency-dags.test.cjs','tests/semantic_fixtures/dependency_dags.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[],state={paperMedium:'canvas',paperGranularity:'roles'};
function save(name,input,s,r,extra={}){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const g=r.graph,q=r.prepared.quality;rows.push({name,input,input_sha256:sha(input),state:s,selected:g.publication.granularity,svg,document,
  svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),nodes:g.nodes.length,edges:g.edges.length,quality:q,
  local_pipelines:g.publication.local_pipelines||null,role_frontier:g.publication.role_frontier,contract_stages:g.publication.contract_stages,local_expressions:g.publication.local_expressions,
  configuration_paths:g.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),frame_ownership:g.frame_ownership||[],
  context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[],...extra});
 console.log(JSON.stringify({name,nodes:g.nodes.length,edges:g.edges.length,size:[q.native_width_px,q.native_height_px],crossings:q.line_geometry.crossings,
  contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues,dags:g.publication.local_pipelines?.rows.filter(p=>p.dependency_dag).length||0}));return r;
}
function before(name,input,s){
 const cached=prior.rows.find(r=>r.name===name.replace(/-before$/,'-current')&&r.input===input&&r.input_sha256===sha(input)&&JSON.stringify(s)===JSON.stringify(r.state));
 if(cached){
  for(const key of ['svg','document']){const file=path.dirname(priorFile)+'/'+cached[key];assert.equal(sha(file),cached[key+'_sha256']);fs.copyFileSync(path.join(root,file),path.join(out,name+(key==='svg'?'.svg':'.layout.json')));}
  rows.push({...cached,name,svg:name+'.svg',document:name+'.layout.json',version:'before',baseline_receipt:{report:priorFile,report_sha256:sha(priorFile),row:cached.name,method:'exact-hashed-prior-output'}});
  console.log(JSON.stringify({name,nodes:cached.nodes,edges:cached.edges,baseline:'exact-hashed-prior-output'}));return;
 }
 save(name,input,s,old.render(read(input),s),{version:'before'});
}
function current(name,input,s,extra={}){
 const ir=read(input),bytes=JSON.stringify(ir),r=R.render(ir,s);assert.equal(JSON.stringify(ir),bytes);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 return save(name,input,s,r,{version:'current',...extra});
}
function pair(name,input,s=state){before(name+'-before',input,s);return current(name+'-current',input,s,{baseline:name+'-before'});}
for(const entry of read(folder+'/extraction.json').rows){
 const r=pair(entry.entry,entry.input),summary=r.graph.publication.local_pipelines.rows.find(p=>p.dependency_dag&&p.status==='summary');
 if(summary){
  current(entry.entry+'-opened',entry.input,{...state,paperAuto:false,open:[...r.graph.publication.open,...summary.source_boundaries.map(b=>b.node)]},{folded:entry.entry+'-current'});
  const relation=r.graph.architecture.relation_graph.relations.find(r=>['source-uses','arithmetic'].includes(r.type)&&summary.operations.some(o=>o.node===r.node));
  if(relation)current(entry.entry+'-requested',entry.input,{...state,paperExpressionDetails:[relation.id]},{folded:entry.entry+'-current',requested_relation:relation.id});
 }
}
const shared='verification/dependency-trees/current/SharedTree.json',sharedFigure=pair('SharedTree',shared),sharedSummary=sharedFigure.graph.publication.local_pipelines.rows.find(p=>p.dependency_dag&&p.status==='summary');
if(sharedSummary)current('SharedTree-opened',shared,{...state,paperAuto:false,open:[...sharedFigure.graph.publication.open,...sharedSummary.source_boundaries.map(b=>b.node)]},{folded:'SharedTree-current'});
for(const name of ['MergeWeave','ScaledProjection','ResultFanout','ConditionalTree','EscapingTree','LateTree'])pair(name,'verification/dependency-trees/current/'+name+'.json');
for(const [name,input]of [['SameSource','verification/semantic-design/current/after/SameSource.json'],['ForeignComposition','verification/local-relations/current/ForeignComposition.json'],
 ['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json'],['ConditionalCarry','verification/local-relations/current/ConditionalCarry.json']])pair(name,input);
const transformer='verification/symbolic-values/current/transformer-current.json',r=pair('transformer',transformer),summary=r.graph.publication.local_pipelines.rows.find(p=>p.status==='summary');
if(summary){current('transformer-focused',transformer,{...state,paperFocus:summary.node,paperAuto:false,open:[]});current('transformer-focused-open',transformer,{...state,paperFocus:summary.node,paperAuto:false,open:[summary.node]});}
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest,'changed producer '+file);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'dependency-dag-audit/1',implementation_sha256:implementation,
 checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),prior_report:priorFile,prior_report_sha256:sha(priorFile),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),reference:prior.reference,rows,goal_complete:false,
 scope:'Bounded single-result dependency DAG summaries with one record per operation and exact per-use result/operand references. Original cuts and detail remain recoverable; no model-family, fusion, concurrency or runtime-order assertion.'},null,2)+'\n');

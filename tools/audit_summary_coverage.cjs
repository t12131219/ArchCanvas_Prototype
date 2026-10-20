'use strict';
// Named cases are evaluation inputs only; production uses local facts.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/summary-coverage/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-29-before-summary-coverage',snapshot=read(checkpoint+'/snapshot.json');
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+file),digest);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio')),R=require('../semantic_studio/publication-renderer.js');
const priorFile='verification/dependency-dags/current/render-report.json',prior=read(priorFile);
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(prior.implementation_sha256[file],digest);
const files=[...Object.keys(snapshot.files),'tools/load_publication_renderer.cjs','tools/audit_summary_coverage.cjs',
 'semantic_studio/summary-goals.js','tools/extract_summary_coverage.py','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py','tests/summary-coverage.test.cjs','tests/semantic_fixtures/summary_coverage.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[],state={paperMedium:'canvas',paperGranularity:'roles'};
function save(name,input,s,r,extra={}){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const g=r.graph,q=r.prepared.quality;rows.push({name,input,input_sha256:sha(input),state:s,selected:g.publication.granularity,svg,document,
  svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),nodes:g.nodes.length,edges:g.edges.length,quality:q,
  local_pipelines:g.publication.local_pipelines||null,role_frontier:g.publication.role_frontier,contract_stages:g.publication.contract_stages,local_expressions:g.publication.local_expressions,
  summary_goals:g.summary_goals,summary_coverage:g.summary_coverage,adaptive:g.publication.adaptive_frontier||null,
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
function unfold(name,input,r){
 const summary=r.graph.publication.local_pipelines.rows.find(p=>p.status==='summary');
 if(summary)current(name+'-opened',input,{...state,paperAuto:false,open:[...r.graph.publication.open,...summary.source_boundaries.map(b=>b.node)]},{folded:name+'-current'});
}
for(const entry of read(folder+'/extraction.json').rows){const r=pair(entry.entry,entry.input);unfold(entry.entry,entry.input,r);}
for(const name of ['ReusedCircuit','SquaredCircuit','TupleCircuit','UnknownCircuit','ConditionalCircuit']){
 const input='verification/dependency-dags/current/'+name+'.json',r=pair(name,input);unfold(name,input,r);
}
for(const name of ['MergeWeave','ScaledProjection','SharedTree','EscapingTree']){
 const input='verification/dependency-trees/current/'+name+'.json',r=pair(name,input);unfold(name,input,r);
}
for(const name of ['FrontierMosaic','BranchedMosaic','UnknownMosaic']){
 const input='verification/frontier-reservations/current/'+name+'.json';pair(name,input,{...state,paperBudget:8});
 current(name+'-adaptive',input,{...state,paperBudget:8,paperAdaptive:true},{baseline:name+'-current'});
}
const transformer='verification/symbolic-values/current/transformer-current.json';pair('transformer',transformer);
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest,'changed producer '+file);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'summary-coverage-audit/1',implementation_sha256:implementation,
 checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),prior_report:priorFile,prior_report_sha256:sha(priorFile),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),reference:prior.reference,rows,goal_complete:false,
 scope:'Separate coarse dependency-structure expression from atomic operand/path goals. Summary and operation-path forms require independently reconstructed canonical uses and routed cuts; adaptive refinement preserves prior coarse structure. No family or execution assertion.'},null,2)+'\n');

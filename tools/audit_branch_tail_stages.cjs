'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/branch-tail-stages/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-32-before-branch-tail-stages',snapshot=read(checkpoint+'/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const R=require('../semantic_studio/publication-renderer.js');
const state={paperMedium:'canvas',paperGranularity:'roles'},rows=[];
const files=[...Object.keys(snapshot.files),'tools/load_publication_renderer.cjs','tools/audit_branch_tail_stages.cjs',
 'tools/extract_branch_tail_stages.py','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py',
 'tests/branch-tail-stages.test.cjs','tests/semantic_fixtures/branch_tail_stages.py'];
const implementation_sha256=Object.fromEntries(files.sort().map(f=>[f,sha(f)]));
if(process.argv.includes('--complete-receipts')){
 const file=folder+'/render-report.json',report=read(file),digest=sha(file);
 const reviewTools=new Set(['tools/audit_branch_tail_stages.cjs','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py']);
 for(const [f,h]of Object.entries(report.implementation_sha256))if(!reviewTools.has(f))assert.equal(sha(f),h,'changed renderer or evidence '+f);
 const priorName='render-report-before-receipts-'+digest.slice(0,12)+'.json';
 fs.copyFileSync(path.join(root,file),path.join(out,priorName));
 for(const row of report.rows){
  assert.equal(sha(folder+'/'+row.svg),row.svg_sha256);assert.equal(sha(folder+'/'+row.document),row.document_sha256);
  const doc=read(folder+'/'+row.document);
  for(const key of ['context_lanes','branch_columns','compound_alignments'])row[key]=doc.layout[key]||[];
 }
 report.implementation_sha256=implementation_sha256;
 report.metadata_completion={prior:priorName,prior_sha256:digest,
  scope:'Read-only extraction of layout receipts from identical hashed SVG and saved documents. Only producer/auditor tooling hashes may change; rendering implementation hashes must match. No render was rerun.'};
 fs.writeFileSync(path.join(root,file),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({panels:report.rows.length,completed:'layout-receipts',svg_bytes_unchanged:true}));return;
}
function save(name,input,s,result,extra={}){
 const svg=name+'.svg',document=name+'.layout.json',g=result.graph,q=result.prepared.quality;
 fs.writeFileSync(path.join(out,svg),result.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(result.document,null,2)+'\n');
 rows.push({name,input,input_sha256:sha(input),state:s,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:g.nodes.length,edges:g.edges.length,selected:g.publication.granularity,quality:q,role_frontier:g.publication.role_frontier,
  contract_stages:g.publication.contract_stages,frame_ownership:g.frame_ownership||[],local_pipelines:g.publication.local_pipelines,
  local_expressions:g.publication.local_expressions,summary_goals:g.summary_goals,summary_coverage:g.summary_coverage,
  configuration_paths:g.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  context_lanes:result.document.layout.context_lanes||[],branch_columns:result.document.layout.branch_columns||[],
  compound_alignments:result.document.layout.compound_alignments||[],...extra});
 console.log(JSON.stringify({name,nodes:g.nodes.length,edges:g.edges.length,size:[q.native_width_px,q.native_height_px],
  crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues,
  tails:g.publication.contract_stages.rows.filter(r=>r.branch_tail&&r.status!=='folded').length}));return result;
}
function render(name,input,s,renderer,version){
 const ir=read(input),before=JSON.stringify(ir),result=renderer.render(ir,s);assert.equal(JSON.stringify(ir),before);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
  const ids=Object.values(result.graph[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 return save(name,input,s,result,{version});
}
for(const entry of read(folder+'/extraction.json').rows){
 const {input}=entry,name=entry.entry;
 render(name+'-before',input,state,old,'before');const r=render(name+'-current',input,state,R,'current');
 if(name==='UnaryWeave'){
  const stage=r.graph.publication.contract_stages.rows.find(r=>r.branch_tail);
  render(name+'-opened',input,{...state,paperAuto:false,open:[...r.graph.publication.open,stage.node]},R,'current');
  render(name+'-disabled',input,{...state,paperStageTails:false},R,'current');
 }
}
const priorFile='verification/condition-predicates/current/render-report.json',prior=read(priorFile),cached=prior.rows.find(r=>r.name==='transformer-current');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(prior.implementation_sha256[f],h);
for(const key of ['svg','document']){
 const file=path.dirname(priorFile)+'/'+cached[key];assert.equal(sha(file),cached[key+'_sha256']);
 fs.copyFileSync(path.join(root,file),path.join(out,'transformer-before'+(key==='svg'?'.svg':'.layout.json')));
}
rows.push({...cached,name:'transformer-before',svg:'transformer-before.svg',document:'transformer-before.layout.json',version:'before',
 baseline_receipt:{report:priorFile,report_sha256:sha(priorFile),row:cached.name,method:'exact-hashed-prior-output'}});
console.log(JSON.stringify({name:'transformer-before',nodes:cached.nodes,edges:cached.edges,baseline:'exact-hashed-prior-output'}));
render('transformer-current',cached.input,state,R,'current');
for(const [f,h]of Object.entries(implementation_sha256))assert.equal(sha(f),h,'producer changed '+f);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'branch-tail-stages-render/1',implementation_sha256,
 checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),
 prior_report:priorFile,prior_report_sha256:sha(priorFile),reference:prior.reference,rows,goal_complete:false,
 scope:'Reversible composition of exclusive unary tails with a certified local join/normalization stage. Only already-open count partitions within one source scope may be crossed. No purity, identity or model-family equivalence is added.'},null,2)+'\n');

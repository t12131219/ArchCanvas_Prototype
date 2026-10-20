'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/condition-predicates/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-31-before-condition-predicates',snapshot=read(checkpoint+'/snapshot.json');
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+file),digest);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const files=[...Object.keys(snapshot.files),'tools/load_publication_renderer.cjs','tools/audit_condition_predicates.cjs',
 'tools/extract_condition_predicates.py','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py','tests/condition-predicates.test.cjs','tests/semantic_fixtures/condition_predicates.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[],state={paperMedium:'canvas',paperGranularity:'roles'};
const priorFile='verification/coverage-selection/current/render-report.json',prior=read(priorFile);
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(prior.implementation_sha256[file],digest);
function save(name,input,s,r,extra={}){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const g=r.graph,q=r.prepared.quality;rows.push({name,input,input_sha256:sha(input),state:s,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:g.nodes.length,edges:g.edges.length,selected:g.publication.granularity,quality:q,local_pipelines:g.publication.local_pipelines||null,role_frontier:g.publication.role_frontier,
  contract_stages:g.publication.contract_stages,condition_predicates:g.publication.condition_predicates||null,local_expressions:g.publication.local_expressions,
  frame_ownership:g.frame_ownership||[],summary_goals:g.summary_goals,summary_coverage:g.summary_coverage,
  configuration_paths:g.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[],...extra});
 console.log(JSON.stringify({name,nodes:g.nodes.length,edges:g.edges.length,size:[q.native_width_px,q.native_height_px],crossings:q.line_geometry.crossings,
  contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues,predicates:g.publication.condition_predicates?.rows.filter(r=>r.status!=='folded').length||0}));return r;
}
function before(name,input,s){
 const cached=prior.rows.find(r=>r.name===name.replace(/-before$/,'-current')&&r.input===input&&r.input_sha256===sha(input)&&JSON.stringify(s)===JSON.stringify(r.state));
 if(cached){
  for(const key of ['svg','document']){const file=path.dirname(priorFile)+'/'+cached[key];assert.equal(sha(file),cached[key+'_sha256']);fs.copyFileSync(path.join(root,file),path.join(out,name+(key==='svg'?'.svg':'.layout.json')));}
  rows.push({...cached,name,svg:name+'.svg',document:name+'.layout.json',version:'before',baseline_receipt:{report:priorFile,report_sha256:sha(priorFile),row:cached.name,method:'exact-hashed-prior-output'}});
  console.log(JSON.stringify({name,nodes:cached.nodes,edges:cached.edges,baseline:'exact-hashed-prior-output'}));return;
 }
 return save(name,input,s,old.render(read(input),s),{version:'before'});
}
function current(name,input,s,extra={}){
 const ir=read(input),before=JSON.stringify(ir),r=R.render(ir,s);assert.equal(JSON.stringify(ir),before);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 return save(name,input,s,r,{version:'current',...extra});
}
for(const row of read(folder+'/extraction.json').rows){
 const name=row.entry,input=row.input;before(name+'-before',input,state);current(name+'-current',input,state,{baseline:name+'-before'});
 if(name==='ConditionalSplice'){
  const g=E.project(read(input),{...state,view:'publication'}),stages=g.publication.condition_predicates.rows;
  const folded={...state,paperAuto:false,open:g.publication.open.filter(id=>!stages.some(r=>r.group===id))};
  before(name+'-summary-before',input,folded);const r=current(name+'-summary',input,folded,{baseline:name+'-summary-before'});
  current(name+'-opened',input,{...folded,open:[...folded.open,stages[0].group]},{folded:name+'-summary'});
 }
}
for(const [name,input]of [['MixedWeave','verification/coverage-selection/current/MixedWeave.json'],['ConditionalCarry','verification/local-relations/current/ConditionalCarry.json']]){
 before(name+'-before',input,state);current(name+'-current',input,state,{baseline:name+'-before'});
}
const transformer='verification/symbolic-values/current/transformer-current.json';before('transformer-before',transformer,state);current('transformer-current',transformer,state,{baseline:'transformer-before'});
const selected=prior.rows.find(r=>r.name==='transformer-planned').adaptive.attempts[0].opportunity.node,detail={...state,paperRoleDetails:[selected]};
before('transformer-role-before',transformer,detail);current('transformer-role-current',transformer,detail,{baseline:'transformer-role-before'});
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest,'changed producer '+file);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'condition-predicates-render/1',implementation_sha256:implementation,
 checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),prior_report:priorFile,prior_report_sha256:sha(priorFile),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),reference:prior.reference,rows,goal_complete:false,
 scope:'A direct exclusive source comparison can join its existing conditional presentation region after logical detail allocation. The predicate is printed and original conditions, cuts and finer detail remain. This is not complete conditional semantics, global expression planning or reference convergence.'},null,2)+'\n');

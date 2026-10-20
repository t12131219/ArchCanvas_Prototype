'use strict';
// Named entries are evaluation fixtures only; production selects local facts.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/dependency-trees/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const frozen='verification/local-relations/iteration-26-before-dependency-trees',snapshot=read(frozen+'/snapshot.json');
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(frozen+'/implementation/'+file),digest);
const old=require('./load_publication_renderer.cjs')(path.join(root,frozen,'implementation/semantic_studio')),R=require('../semantic_studio/publication-renderer.js');
const priorFile='verification/adaptive-frontier/current/render-report.json',prior=read(priorFile);
for(const [file,digest]of Object.entries(snapshot.files))assert.equal(prior.implementation_sha256[file],digest,'prior renderer mismatch: '+file);
const files=[...Object.keys(snapshot.files),'tests/dependency-trees.test.cjs','tests/semantic_fixtures/dependency_trees.py','tests/semantic_fixtures/result_fanout.py',
 'tools/audit_dependency_trees.cjs','tools/extract_dependency_trees.py','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[],state={paperMedium:'canvas',paperGranularity:'roles'};
function save(name,input,s,r,version){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 const g=r.graph,q=r.prepared.quality;
 const row={name,input,input_sha256:sha(input),state:s,selected:g.publication.granularity,version,svg,document,
  svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),nodes:g.nodes.length,edges:g.edges.length,quality:q,
  local_pipelines:g.publication.local_pipelines||null,role_frontier:g.publication.role_frontier,contract_stages:g.publication.contract_stages,
  local_expressions:g.publication.local_expressions,frame_ownership:g.frame_ownership||[],
  configuration_paths:g.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
  context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[]};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,size:[q.native_width_px,q.native_height_px],crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,issues:q.issues}));
}
function render(name,input,s=state,version='current'){
 if(version==='before'){
  const cached=prior.rows.find(r=>r.input===input&&r.input_sha256===sha(input)&&JSON.stringify(s)===JSON.stringify(r.state));
  if(cached){
   for(const key of ['svg','document']){assert.equal(sha(path.dirname(priorFile)+'/'+cached[key]),cached[key+'_sha256']);fs.copyFileSync(path.join(root,path.dirname(priorFile),cached[key]),path.join(out,name+(key==='svg'?'.svg':'.layout.json')));}
   const row={...cached,name,version,svg:name+'.svg',document:name+'.layout.json',baseline_receipt:{report:priorFile,report_sha256:sha(priorFile),row:cached.name,method:'exact-hashed-prior-output'}};
   rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,baseline:'exact-hashed-prior-output'}));return;
  }
 }
 const ir=read(input),before=JSON.stringify(ir),r=(version==='before'?old:R).render(ir,s);assert.equal(JSON.stringify(ir),before);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
 save(name,input,s,r,version);return r;
}
for(const {entry:name,input}of read(folder+'/extraction.json').rows){
 render(name+'-before',input,state,'before');const r=render(name+'-current',input);
 for(const row of r.graph.publication.local_pipelines.rows.filter(p=>p.dependency_tree&&p.status==='summary')){
  render(name+'-opened',input,{...state,paperAuto:false,open:[...r.graph.publication.open,...row.source_boundaries.map(b=>b.node)]});
 }
}
for(const [name,input]of [
 ['SameSource','verification/semantic-design/current/after/SameSource.json'],
 ['ForeignComposition','verification/local-relations/current/ForeignComposition.json'],
 ['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json'],
 ['ConditionalCarry','verification/local-relations/current/ConditionalCarry.json'],
 ['BoundaryWeave','verification/flow-entries/current/BoundaryWeave.json']]){
 render(name+'-before',input,state,'before');render(name+'-current',input);
}
const transformer='verification/symbolic-values/current/transformer-current.json';
render('transformer-before',transformer,state,'before');const tr=render('transformer-current',transformer);
const tree=tr.graph.publication.local_pipelines.rows.find(p=>p.dependency_tree&&p.status==='summary');
if(tree){
 render('transformer-focused',transformer,{...state,paperFocus:tree.node,paperAuto:false,open:[]});
 render('transformer-focused-open',transformer,{...state,paperFocus:tree.node,paperAuto:false,open:[tree.node]});
}
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest,'producer changed: '+file);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'dependency-tree-audit/1',implementation_sha256:implementation,
 frozen_snapshot:frozen+'/snapshot.json',frozen_snapshot_sha256:sha(frozen+'/snapshot.json'),
 prior_report:priorFile,prior_report_sha256:sha(priorFile),extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),
 reference:{svg:'verification/generic-convergence/current/reference-expanded.svg',svg_sha256:sha('verification/generic-convergence/current/reference-expanded.svg')},
 rows,goal_complete:false,scope:'Bounded converging source dependency trees retain exact operand/result and parameter-read bindings, source boundaries and deeper expansion; no scalar evaluation, purity, scheduling or family assertion. Summary-level expression goals and automatic summary/detail tradeoffs remain incomplete.'},null,2)+'\n');

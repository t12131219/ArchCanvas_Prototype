#!/usr/bin/env node
'use strict';
// Named cases select evaluation inputs only. Production decisions use local facts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const branchMode=process.argv.includes('--branches'),contextMode=process.argv.includes('--context')||branchMode;
const root=path.resolve(__dirname,'..'),folder=branchMode?'verification/branch-columns/current':contextMode?'verification/context-lanes/current':'verification/local-expressions/current',out=path.join(root,folder);fs.mkdirSync(out,{recursive:true});
const R=require('../semantic_studio/publication-renderer.js');
const frozenPath=branchMode?'verification/local-relations/iteration-15-before-branch-columns':contextMode?'verification/local-relations/iteration-14-before-context-lanes':'verification/local-relations/iteration-13-before-local-expressions',frozen=require('./load_publication_renderer.cjs')(path.join(root,frozenPath,'implementation/semantic_studio'));
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
for(const [file,digest]of Object.entries(read(frozenPath+'/snapshot.json').files))assert.equal(sha(frozenPath+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tools/audit_local_expressions.cjs','tools/load_publication_renderer.cjs'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
function render(name,input,state,version='current'){
 const ir=read(input),before=JSON.stringify(ir),r=(version==='before'?frozen:R).render(ir,state);assert.equal(JSON.stringify(ir),before);
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(r.graph[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(v=>v.id).sort());}
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 rows.push({name,input,input_sha256:sha(input),version,state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,context_lanes:r.document.layout.context_lanes||[],context_refinement:r.prepared.routing.context_refinement||null,branch_columns:r.document.layout.branch_columns||[],branch_refinement:r.prepared.routing.branch_refinement||null,selected:r.graph.publication.granularity,quality:r.prepared.quality,
  local_expressions:r.graph.publication.local_expressions||null,expression_coverage:r.graph.expression_coverage,frame_ownership:r.graph.frame_ownership||[],role_frontier:r.graph.publication.role_frontier||null,inline_sequences:r.graph.publication.inline_sequences||null,representative:r.graph.publication.representative});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,frames_attached:r.graph.frame_ownership?.length||0,issues:r.prepared.quality.issues}));return r;
}
const state={paperMedium:'canvas',paperGranularity:'roles'};
for(const name of ['MixedCircuit','ForeignComposition','UnknownFusion','InterruptedMixer','BrokenCell','ChosenCircuit','ConditionalCarry','EarlyBoundary','SharedMismatch']){
 const input='verification/local-relations/current/'+name+'.json';
 render(name+'-before',input,state,'before');render(name+'-roles',input,state);
}
render('GatedMixture-before','verification/semantic-design/current/after/GatedMixture.json',state,'before');
render('GatedMixture-roles','verification/semantic-design/current/after/GatedMixture.json',state);
const same='verification/semantic-design/current/after/SameSource.json';
const source=render('SameSource-roles',same,state),attention=source.graph.nodes.find(n=>n.contract_roles?.projections).contract_roles.attention;
render('SameSource-role-open',same,{...state,paperAuto:false,open:[...source.graph.publication.open,attention]});
render('MixedCircuit-budget','verification/local-relations/current/MixedCircuit.json',{...state,paperBudget:4});
const transformer='verification/symbolic-values/current/transformer-current.json';
render('transformer-before',transformer,state,'before');
render('transformer-overview',transformer,{...state,paperGranularity:'overview'});
render('transformer-semantic',transformer,{...state,paperGranularity:'semantic'});
render('transformer-roles',transformer,state);
if(contextMode&&!branchMode)render('transformer-right-experiment',transformer,{...state,paperContextLanes:'right'});
if(branchMode)for(const name of ['WovenInputs','InterruptedPaths']){
 const input=folder+'/'+name+'.json';render(name+'-before',input,state,'before');render(name+'-roles',input,state);
 if(name==='InterruptedPaths')render(name+'-explicit',input,{...state,paperBranchColumns:true});
}
const old=read('verification/frame-ownership/current/render-report.json');
for(const ref of old.reference)assert.equal(sha(ref.svg),ref.svg_sha256);
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest);
const report={schema:branchMode?'branch-columns-audit/1':contextMode?'context-lanes-audit/1':'local-expressions-audit/1',implementation_sha256:implementation,frozen_snapshot:frozenPath+'/snapshot.json',frozen_snapshot_sha256:sha(frozenPath+'/snapshot.json'),
 extraction:old.extraction,extraction_sha256:old.extraction_sha256,reference:old.reference,rows,
 runtime_executed:false,goal_complete:false,reference_frontier_match:false,
 scope:branchMode?'Topology-derived independent path columns with exact consumer operands and verified geometry; presentation rank enclosures become reversible annotations. No scheduling, stage equality or family inference.':contextMode?'Topology-derived context side entries with measured acceptance; canonical frontier and local expression facts retained. Channel realization is checked against final routes.':'Independent local relation requests influence the intermediate frontier and local budgets. Certified, conditional, mutable, unknown and iteration boundaries remain protected; final routed expression coverage verifies receipts.',
 unresolved:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues})),
 remaining:['Reference-frontier node/role correspondence remains unverified.','Role detail exposes real source helpers; geometry still differs substantially from the reference.','Local expression requests cover boundary and role relations, but graph-wide adaptive selection and panel coverage remain incomplete.','Whole graph context paths and dense role views need further crossing reduction.','Cross-language JSON numeric digest contract remains unresolved.']};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');

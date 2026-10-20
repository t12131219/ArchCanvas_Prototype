#!/usr/bin/env node
'use strict';
// Named cases select evaluation inputs only. Production decisions use local facts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dimensionMode=process.argv.includes('--dimensions'),stabilityMode=process.argv.includes('--stability')||dimensionMode,stageMode=process.argv.includes('--stages')||stabilityMode,pipelineMode=process.argv.includes('--pipelines')||stageMode,flowMode=process.argv.includes('--flows')||pipelineMode,branchMode=process.argv.includes('--branches')||flowMode,contextMode=process.argv.includes('--context')||branchMode;
const root=path.resolve(__dirname,'..'),folder=dimensionMode?'verification/dimension-paths/current':stabilityMode?'verification/stage-stability/current':stageMode?'verification/contract-stages/current':pipelineMode?'verification/local-pipelines/current':flowMode?'verification/flow-entries/current':branchMode?'verification/branch-columns/current':contextMode?'verification/context-lanes/current':'verification/local-expressions/current',out=path.join(root,folder);fs.mkdirSync(out,{recursive:true});
const R=require('../semantic_studio/publication-renderer.js');
const frozenPath=dimensionMode?'verification/local-relations/iteration-20-before-dimension-paths':stabilityMode?'verification/local-relations/iteration-19-before-stage-stability':stageMode?'verification/local-relations/iteration-18-before-contract-stages':pipelineMode?'verification/local-relations/iteration-17-before-local-pipelines':flowMode?'verification/local-relations/iteration-16-before-flow-entries':branchMode?'verification/local-relations/iteration-15-before-branch-columns':contextMode?'verification/local-relations/iteration-14-before-context-lanes':'verification/local-relations/iteration-13-before-local-expressions',frozen=require('./load_publication_renderer.cjs')(path.join(root,frozenPath,'implementation/semantic_studio'));
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
for(const [file,digest]of Object.entries(read(frozenPath+'/snapshot.json').files))assert.equal(sha(frozenPath+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tools/audit_local_expressions.cjs','tools/load_publication_renderer.cjs'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
// Reuse only an exact, hashed current output from the frozen implementation's
// recorded prior report. This preserves historical evidence and avoids a slow
// VM baseline re-render. New inputs/states still execute the archived renderer.
const snapshot=read(frozenPath+'/snapshot.json'),prior=stageMode?read(snapshot.prior_report):null;
if(prior){
 assert.equal(sha(snapshot.prior_report),snapshot.prior_report_sha256);
 for(const [file,digest]of Object.entries(prior.implementation_sha256))assert.equal(snapshot.files[file],digest,'prior producer differs from frozen snapshot: '+file);
}

function render(name,input,state,version='current'){
 const cached=version==='before'&&prior?.rows.find(r=>r.version==='current'&&r.input===input&&r.input_sha256===sha(input)&&JSON.stringify(r.state)===JSON.stringify(state));
 if(cached){
  const directory=path.dirname(snapshot.prior_report),svg=name+'.svg',document=name+'.layout.json';
  assert.equal(sha(directory+'/'+cached.svg),cached.svg_sha256);assert.equal(sha(directory+'/'+cached.document),cached.document_sha256);
  fs.copyFileSync(path.join(root,directory,cached.svg),path.join(out,svg));fs.copyFileSync(path.join(root,directory,cached.document),path.join(out,document));
  rows.push({...cached,name,version,state,svg,document,contract_stages:stabilityMode?cached.contract_stages:null,...(dimensionMode?{configuration_paths:[]}:{}),baseline_receipt:{report:snapshot.prior_report,report_sha256:snapshot.prior_report_sha256,row:cached.name,method:'exact-hashed-prior-output'}});
  console.log(JSON.stringify({name,nodes:cached.nodes,edges:cached.edges,issues:cached.quality.issues,baseline:'exact-hashed-prior-output'}));return null;
 }
 const ir=read(input),before=JSON.stringify(ir),r=(version==='before'?frozen:R).render(ir,state);assert.equal(JSON.stringify(ir),before);
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(r.graph[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(v=>v.id).sort());}
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 rows.push({name,input,input_sha256:sha(input),version,state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,...(dimensionMode?{configuration_paths:r.graph.publication.configuration_arithmetic.filter(r=>r.rule_version==='dimension-paths/1')}:{}),context_lanes:r.document.layout.context_lanes||[],context_refinement:r.prepared.routing.context_refinement||null,branch_columns:r.document.layout.branch_columns||[],branch_refinement:r.prepared.routing.branch_refinement||null,selected:r.graph.publication.granularity,quality:r.prepared.quality,...(pipelineMode?{local_pipelines:r.graph.publication.local_pipelines||null,...(stageMode?{contract_stages:r.graph.publication.contract_stages||null}:{})}:{}),
  ...(flowMode?{compound_alignments:r.document.layout.compound_alignments||[],flow_refinement:r.prepared.routing.flow_refinement||null}:{}),
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
 const input='verification/branch-columns/current/'+name+'.json';render(name+'-before',input,state,'before');render(name+'-roles',input,state);
 if(name==='InterruptedPaths')render(name+'-explicit',input,{...state,paperBranchColumns:true});
}
if(flowMode)for(const name of ['ContextWeave','BoundaryWeave']){
 const input='verification/flow-entries/current/'+name+'.json';render(name+'-before',input,state,'before');render(name+'-roles',input,state);
}
if(pipelineMode)for(const name of ['PipelineMosaic','InterruptedPipeline','EscapingPipeline']){
 const input='verification/local-pipelines/current/'+name+'.json',ir=read(input),rootId=ir.nodes.find(n=>!n.parent).id,manual={...state,paperAuto:false,open:[rootId]};
 render(name+'-before',input,manual,'before');const result=render(name+'-roles',input,manual);
 if(name==='PipelineMosaic')render(name+'-opened',input,{...manual,open:[rootId,result.graph.publication.local_pipelines.rows[0].node]});
}
if(stageMode){
 for(const name of ['TailChain','TailMosaic','EscapingTail','InterruptedTail','ConditionalTail','ImageResidual','VectorResidual']){
  const input=['ImageResidual','VectorResidual'].includes(name)?'verification/semantic-design/current/after/'+name+'.json':'verification/contract-stages/current/'+name+'.json';
  render(name+'-before',input,state,'before');const r=render(name+'-roles',input,state);
  const stage=r.graph.publication.contract_stages.rows.find(r=>r.status==='summary');
  if(stage)render(name+'-opened',input,{...state,paperAuto:false,open:[...r.graph.publication.open,stage.node]});
 }
 if(stabilityMode){
  const input='verification/contract-stages/current/ConditionalTail.json';
  render('ConditionalTail-stage-disabled',input,{...state,paperContractStages:false});
  for(const name of ['ContextWeave','BoundaryWeave']){
   const input='verification/flow-entries/current/'+name+'.json',r=R.render(read(input),state),manual={...state,paperAuto:false,open:r.graph.publication.open};
   render(name+'-manual-before',input,manual,'before');render(name+'-manual',input,manual);
  }
  const priorOpen=prior.rows.find(r=>r.name==='transformer-stage-open');
  render('transformer-stage-open-before',transformer,priorOpen.state,'before');
 }
 const current=R.render(read(transformer),state),stage=current.graph.publication.contract_stages.rows.find(r=>r.status==='summary');
 render('transformer-stage-open',transformer,{...state,paperAuto:false,open:[...current.graph.publication.open,stage.node]});
}
if(dimensionMode){
 for(const name of ['DimensionWeave','AliasExtent','SharedExtent','EscapingExtent','UnknownExtent','ConditionalExtent','ExtentBoundary']){
  const input=folder+'/'+name+'.json';render(name+'-before',input,state,'before');const r=render(name+'-roles',input,state);
  if(name==='DimensionWeave'){
   const helper=r.graph.publication.local_pipelines.rows.find(r=>r.operations.some(o=>o.operator==='reshape'));
   render(name+'-opened',input,{...state,paperAuto:false,open:[...r.graph.publication.open,helper.node]});
  }
 }
 const r=R.render(read(transformer),state),helper=r.graph.publication.local_pipelines.rows.find(r=>r.operations[0].operator==='transpose');
 const manual={...state,paperAuto:false,open:[...r.graph.publication.open,helper.node]};
 render('transformer-dimension-open-before',transformer,manual,'before');render('transformer-dimension-open',transformer,manual);
}
const old=read('verification/frame-ownership/current/render-report.json');
for(const ref of old.reference)assert.equal(sha(ref.svg),ref.svg_sha256);
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest);
const report={schema:dimensionMode?'dimension-paths-audit/1':stabilityMode?'stage-stability-audit/1':stageMode?'contract-stages-audit/1':pipelineMode?'local-pipelines-audit/1':flowMode?'flow-entries-audit/1':branchMode?'branch-columns-audit/1':contextMode?'context-lanes-audit/1':'local-expressions-audit/1',implementation_sha256:implementation,frozen_snapshot:frozenPath+'/snapshot.json',frozen_snapshot_sha256:sha(frozenPath+'/snapshot.json'),
 extraction:old.extraction,extraction_sha256:old.extraction_sha256,reference:old.reference,rows,
 runtime_executed:false,goal_complete:false,reference_frontier_match:false,
 scope:dimensionMode?'Dimension configuration paths use freshly derived source Tensor read facts, exact integer operands and configuration-only use closure. Local path summaries remain reversible and do not assert values, valid shapes or execution.':stabilityMode?'Select automatic evidence detail before presentation grouping; retain measured canvas layout refinements with manually selected detail while preserving explicit profiles and positions.':stageMode?'Certified role subregions fold only the addition and post-normalization tail, retaining canonical certificate ownership, exact skip/branch cuts, independent computations and deeper expansion.':pipelineMode?'Topology-proved local source paths expose ordered operation summaries with auxiliary reads, exact bindings and further expansion; no purity, fusion or execution-order assertion.':flowMode?'Independently entered compound regions may start in adjacent lanes while exact cross-region arrows can point upward. Measured selection preserves the frontier, operands, realized channels and columns. No execution scheduling assertion.':branchMode?'Topology-derived independent path columns with exact consumer operands and verified geometry; presentation rank enclosures become reversible annotations. No scheduling, stage equality or family inference.':contextMode?'Topology-derived context side entries with measured acceptance; canonical frontier and local expression facts retained. Channel realization is checked against final routes.':'Independent local relation requests influence the intermediate frontier and local budgets. Certified, conditional, mutable, unknown and iteration boundaries remain protected; final routed expression coverage verifies receipts.',
 unresolved:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues})),
 remaining:['Reference-frontier node/role correspondence remains unverified.','Role detail exposes real source helpers; geometry still differs substantially from the reference.','Local expression requests cover boundary and role relations, but graph-wide adaptive selection and panel coverage remain incomplete.','Whole graph context paths and dense role views need further crossing reduction.','Cross-language JSON numeric digest contract remains unresolved.']};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');

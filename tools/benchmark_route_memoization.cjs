'use strict';
// Isolated routing-kernel experiment. This does not replace the pending full
// Transformer adaptive comparison or modify the editor's production scripts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/route-memoization/experiment');
const load=require('./load_publication_renderer.cjs'),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const Goals=require('../semantic_studio/expression-goals.js'),SummaryGoals=require('../semantic_studio/summary-goals.js');
const only=process.argv.find(a=>a.startsWith('--case='))?.slice(7),variant=process.argv.find(a=>a.startsWith('--variant='))?.slice(10);
const reportFile=process.argv.find(a=>a.startsWith('--report='))?.slice(9)||'render-report.json';
const base={paperMedium:'canvas',paperGranularity:'roles'};
const planned=JSON.parse(fs.readFileSync(path.join(root,'verification/adaptive-role-paths/current/render-report.json')));
const rows=planned.rows.filter(r=>['BoundedWeave-current','MixedBoundary-current','ConditionalWeave-current','SameSource-current','UnknownFusion-current','BoundedWeave-whole-trial'].includes(r.name)).map(r=>({
 name:r.name,input:r.input,state:r.adaptive?{...base,paperRoleDetails:r.adaptive.selected_role_details,paperRolePaths:r.adaptive.selected_role_paths,paperExpressionDetails:r.adaptive.selected_expression_details}:r.state}));
rows.push({name:'Transformer-roles',input:'verification/helper-contracts/current/Transformer-current.json',state:base});
const extra=[['GatedMixture','verification/local-relations/current/GatedMixture.json'],['ConditionalCarry','verification/local-relations/current/ConditionalCarry.json'],
 ['SharedMismatch','verification/local-relations/current/SharedMismatch.json'],['BrokenCell','verification/local-relations/current/BrokenCell.json']];
for(const [name,input]of extra)if(fs.existsSync(path.join(root,input)))rows.push({name,input,state:base});
const variants=variant?[variant]:['before','candidate'];assert.ok(variants.every(v=>['before','candidate'].includes(v)));
const files=fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f);
files.push('tools/load_publication_renderer.cjs','tools/benchmark_route_memoization.cjs',
 'verification/route-memoization/experiment/architecture-layout-before.js','verification/route-memoization/experiment/architecture-layout-candidate.js');
const implementation=Object.fromEntries(files.map(f=>[f,sha(path.join(root,f))]));
assert.ok(['before','candidate'].some(v=>sha(path.join(root,'semantic_studio/architecture-layout.js'))===sha(path.join(out,'architecture-layout-'+v+'.js'))),'production changed; explicitly rebase experiment');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'archcanvas-route-memo-')),results=[];
try{
 for(const item of rows.filter(r=>only?r.name===only:process.argv.includes('--large')||r.name!=='Transformer-roles')){
  let before=null;
  for(const v of variants){
   for(const f of files.filter(f=>f.startsWith('semantic_studio/')))fs.copyFileSync(path.join(root,f),path.join(tmp,path.basename(f)));
   fs.copyFileSync(path.join(out,'architecture-layout-'+v+'.js'),path.join(tmp,'architecture-layout.js'));
   const R=load(tmp),E=load(tmp,{engine:true}),input=path.join(root,item.input),ir=JSON.parse(fs.readFileSync(input)),original=JSON.stringify(ir);
   const graph=E.project(ir,{...item.state,view:'publication'}),projected=JSON.stringify({nodes:graph.nodes,edges:graph.edges,positions:[...graph.positions]});
   console.log('START '+item.name+' '+v+' '+graph.nodes.length+' nodes '+graph.edges.length+' edges');
   const started=process.hrtime.bigint(),prepared=R.prepare(graph),elapsed=Number(process.hrtime.bigint()-started)/1e6;
   E.auditConstraintRoutes(graph,prepared.routes);
   graph.expression_goals=Goals.build(ir,graph.architecture);graph.expression_coverage=Goals.evaluate(graph.expression_goals,graph,prepared);
   graph.summary_goals=SummaryGoals.build(ir,graph.architecture);graph.summary_coverage=SummaryGoals.evaluate(graph.summary_goals,ir,graph,prepared);
   const result=R.renderPrepared(ir,item.state,{graph,prepared});
   assert.equal(JSON.stringify(ir),original);
   assert.equal(JSON.stringify({nodes:graph.nodes,edges:graph.edges,positions:[...graph.positions]}),projected,'routing changed visible graph');
   const name=item.name+'-'+v,svg=name+'.svg',document=name+'.layout.json';
   fs.writeFileSync(path.join(out,svg),result.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(result.document));
   const row={name,case:item.name,variant:v,input:item.input,input_sha256:sha(input),state:item.state,selected:graph.publication.granularity,
    nodes:graph.nodes.length,edges:graph.edges.length,elapsed_ms:elapsed,svg,document,svg_sha256:sha(path.join(out,svg)),document_sha256:sha(path.join(out,document)),
    quality:prepared.quality,contract_stages:graph.publication.contract_stages,local_pipelines:graph.publication.local_pipelines,
    scope:'One fixed projected frontier; complete routing strategy and repair search. Adaptive and outer layout refinements are not run.'};
   if(v==='before')before={svg:result.svg,routes:JSON.stringify(prepared.routes),quality:JSON.stringify(prepared.quality)};
   else if(before){assert.equal(result.svg,before.svg,'SVG changed');assert.equal(JSON.stringify(prepared.routes),before.routes,'route changed');assert.equal(JSON.stringify(prepared.quality),before.quality,'quality changed');row.exact_before_match=true;}
   results.push(row);fs.writeFileSync(path.join(out,reportFile),JSON.stringify({schema:'route-memoization-experiment/1',status:'in-progress',implementation_sha256:implementation,rows:results},null,2)+'\n');
   console.log(JSON.stringify({name,elapsed_ms:Math.round(elapsed),svg_sha256:row.svg_sha256,exact_before_match:row.exact_before_match,issues:prepared.quality.issues}));
  }
 }
 for(const [f,h]of Object.entries(implementation))assert.equal(sha(path.join(root,f)),h,'producer changed: '+f);
 assert.ok(results.length,'No cases selected');
 fs.writeFileSync(path.join(out,reportFile),JSON.stringify({schema:'route-memoization-experiment/1',status:'complete',production_modified:false,
  scope:'Isolated fixed-frontier routing experiment only; no full adaptive or thousands-node UI performance claim.',
  implementation_sha256:implementation,rows:results},null,2)+'\n');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/coherent-frontiers/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const snapshot=read(folder+'/snapshot.json'),before=require('./load_publication_renderer.cjs')(out+'/before'),current=require('../semantic_studio/publication-renderer.js');
const files=[...Object.keys(snapshot.files),'semantic_studio/index.html','tests/coherent-frontiers.test.cjs','tests/semantic_fixtures/coherent_frontiers.py','tools/audit_coherent_frontiers.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[];
const inputs=[['Coherent-tight',folder+'/CoherentMosaic.json',6],['Coherent-wide',folder+'/CoherentMosaic.json',8],
 ['Broken',folder+'/BrokenMosaic.json',10],['Conditional',folder+'/ConditionalMosaic.json',12],['Unequal',folder+'/UnequalMosaic.json',6],
 ['ForeignComposition','data/semantic/architecture/ForeignComposition.json',20],['BranchMosaic','data/semantic/architecture/BranchMosaic.json',20],
 ['LoopWithBoundary','data/semantic/architecture/LoopWithBoundary.json',20],['SharedBranches','data/semantic/architecture/SharedBranches.json',20],
 ['Transformer-overview','verification/helper-contracts/current/Transformer-current.json',12,'overview'],
 ['Transformer-fixed','verification/helper-contracts/current/Transformer-current.json',20]];
function save(name,input,state,renderer){
 console.log('START '+name);const ir=read(input),original=JSON.stringify(ir),r=renderer.render(ir,state);
 assert.equal(JSON.stringify(ir),original);assert.equal(JSON.stringify(r.document.ir),original);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 const row={name,input,input_sha256:sha(input),state:r.document.state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,choices:r.graph.publication.coherent_frontier?.choices||[],
  selected:r.graph.publication.granularity,
  expression_counts:r.graph.expression_coverage.reduce((o,c)=>{const key=c.kind+':'+c.status;o[key]=(o[key]||0)+1;return o;},{}),
  local_pipelines:r.document.publication.local_pipelines,role_frontier:r.document.publication.role_frontier,frame_ownership:r.document.publication.frame_ownership||[],
  contract_stages:r.document.publication.contract_stages,local_expressions:r.document.publication.local_expressions,
  context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[]};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,choices:row.choices.length,issues:row.quality.issues}));return {r,row};
}
for(const [name,input,paperBudget,granularity='roles']of inputs){
 const state={paperMedium:'canvas',paperGranularity:granularity,paperBudget},a=save(name+'-before',input,state,before),b=save(name+'-current',input,state,current);
 comparisons.push({name,before:a.row.name,current:b.row.name,svg_equal:a.r.svg===b.r.svg});
 if(name==='Coherent-tight'){
  const peers=b.row.choices[0].nodes,manual={...state,paperAuto:false,open:[...b.r.graph.publication.open,peers[0]]};
  const expanded=save('Coherent-one-open',input,manual,current),reopened=save('Coherent-reopened',input,expanded.r.document.state,current),returned=save('Coherent-returned',input,state,current);
  assert.equal(expanded.r.svg,reopened.r.svg);assert.equal(returned.r.svg,b.r.svg);
  fs.writeFileSync(out+'/ui-import.json',JSON.stringify({schema:'semantic-canvas/1',ir:b.r.document.ir,state:{...state,view:'publication',mode:'source'}},null,2)+'\n');
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h,'producer changed '+f);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'coherent-frontiers-render/1',implementation_sha256:hashes,
 baseline:folder+'/snapshot.json',baseline_sha256:sha(folder+'/snapshot.json'),rows,comparisons,goal_complete:false,
 scope:'Comparable local presentation regions share one automatic budget decision. No semantic equivalence or instance merge. Fixed-policy main figures only; default adaptive Transformer process remains separate.'},null,2)+'\n');

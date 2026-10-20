'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/adaptive-role-paths/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-41-before-adaptive-role-paths',snapshot=read(checkpoint+'/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const R=require('../semantic_studio/publication-renderer.js'),A=require('../semantic_studio/adaptive-frontier.js'),old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const files=[...Object.keys(snapshot.files),'tools/audit_adaptive_role_paths.cjs','tools/extract_adaptive_role_paths.py','tests/adaptive-role-paths.test.cjs','tests/semantic_fixtures/adaptive_role_paths.py','tools/audit_local_svg.py',
 'tools/audit_role_path_receipts.py','tools/check_adaptive_role_path_svgs.py','tools/audit_adaptive_role_path_ui.cjs','tools/check_helper_contract_ui_svgs.py'];
const implementation=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[];
const base={paperMedium:'canvas',paperGranularity:'roles'},planned={...base,paperAdaptive:true,paperAdaptivePolicy:'structure'};
function save(name,input,state,r){
 const doc=r.document;assert.deepEqual(doc.ir,read(input));fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(doc));
 const q=doc.diagnostics.publication,row={name,input,input_sha256:sha(input),state,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(folder+'/'+name+'.svg'),document_sha256:sha(folder+'/'+name+'.layout.json'),
  nodes:doc.layout.nodes.length,edges:doc.layout.edges.length,selected:doc.publication.granularity,quality:q,
  contract_stages:doc.publication.contract_stages,local_pipelines:doc.publication.local_pipelines,adaptive:doc.publication.adaptive_frontier||null};rows.push(row);
 console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,height:q.native_height_px,crossings:q.line_geometry.crossings,issues:q.issues}));return row;
}
function render(name,input,state,renderer=R){const ir=read(input),bytes=JSON.stringify(ir),r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),bytes);save(name,input,state,r);return r;}
for(const [name,input]of [
 ...read(folder+'/extraction.json').rows.map(r=>[r.entry,r.input]),
 ['SeparateStages','verification/role-paths/current/SeparateStages.json'],['SameSource','verification/semantic-design/current/after/SameSource.json'],
 ['UnknownFusion','verification/local-relations/current/UnknownFusion.json']]){
 const a=render(name+'-before',input,planned,old),b=render(name+'-current',input,planned);
 comparisons.push({name,svg_unchanged:a.svg===b.svg,before:a.graph.nodes.length,current:b.graph.nodes.length,
  selected_paths:b.graph.publication.adaptive_frontier.selected_role_paths||[]});
}
const input=folder+'/BoundedWeave.json',main=render('BoundedWeave-main-before',input,base,old),current=render('BoundedWeave-main-current',input,base);
assert.equal(main.svg,current.svg);
const r=render('BoundedWeave-manual-paths',input,{...base,paperRolePaths:rows.find(r=>r.name==='BoundedWeave-current').adaptive.selected_role_paths});
const c=r.graph.publication.adaptive_frontier;
assert.equal(c,undefined);assert.equal(r.svg,fs.readFileSync(out+'/BoundedWeave-current.svg','utf8'));
render('BoundedWeave-source-frames',input,{...r.document.state,paperFrameView:'source'});
// Persist the previously measured alternatives as real SVGs as well. A
// rejected layout must not be presented as the selected optimization result.
for(const name of ['BoundedWeave','MixedBoundary','ConditionalWeave']){
 const owner=rows.find(r=>r.name===name+'-current'),attempt=owner.adaptive.attempts.find(t=>t.opportunity.kind==='roles');
 const trial=render(name+'-whole-trial',owner.input,{...planned,paperAdaptive:false,paperRoleDetails:attempt.requested_state.paperRoleDetails,
  paperRolePaths:attempt.requested_state.paperRolePaths,paperExpressionDetails:attempt.requested_state.paperExpressionDetails});
 assert.deepEqual(A.metrics(trial),attempt.candidate);
}
const first=rows.find(r=>r.name==='BoundedWeave-current').adaptive.attempts.find(t=>t.opportunity.kind==='role-path');
const firstTrial=render('BoundedWeave-first-path',input,{...planned,paperAdaptive:false,...first.requested_state});
assert.deepEqual(A.metrics(firstTrial),first.candidate);
for(const suffix of process.argv.includes('--small')?[]:['before','current']){
 const name='transformer-'+suffix,doc=read(folder+'/'+name+'.layout.json'),svg=fs.readFileSync(out+'/'+name+'.svg','utf8');
 assert.deepEqual(doc.state,planned);save(name,'verification/helper-contracts/current/Transformer-current.json',planned,{document:doc,svg});
}
for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h,'producer changed: '+f);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'adaptive-role-paths-render/1',implementation_sha256:implementation,
 checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),
 rows,comparisons,reference:{file:'verification/generic-convergence/current/reference-expanded.svg',sha256:sha('verification/generic-convergence/current/reference-expanded.svg')},goal_complete:false},null,2)+'\n');

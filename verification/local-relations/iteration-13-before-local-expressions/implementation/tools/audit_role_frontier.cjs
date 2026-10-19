#!/usr/bin/env node
'use strict';
// Named cases select evaluation inputs only. Production decisions use local facts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/role-frontier/current',out=path.join(root,folder);fs.mkdirSync(out,{recursive:true});
const R=require('../semantic_studio/publication-renderer.js');
const frozenPath='verification/local-relations/iteration-12-before-role-frontier',frozen=require('./load_publication_renderer.cjs')(path.join(root,frozenPath,'implementation/semantic_studio'));
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
for(const [file,digest]of Object.entries(read(frozenPath+'/snapshot.json').files))assert.equal(sha(frozenPath+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tools/audit_role_frontier.cjs','tools/load_publication_renderer.cjs'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
function render(name,input,state,version='current'){
 const ir=read(input),before=JSON.stringify(ir),r=(version==='before'?frozen:R).render(ir,state);assert.equal(JSON.stringify(ir),before);
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(r.graph[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(v=>v.id).sort());}
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 rows.push({name,input,input_sha256:sha(input),version,state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,selected:r.graph.publication.granularity,quality:r.prepared.quality,
  frame_ownership:r.graph.frame_ownership||[],role_frontier:r.graph.publication.role_frontier||null,inline_sequences:r.graph.publication.inline_sequences||null,representative:r.graph.publication.representative});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,frames_attached:r.graph.frame_ownership?.length||0,issues:r.prepared.quality.issues}));return r;
}
const state={paperMedium:'canvas',paperGranularity:'roles'},struct='verification/local-relations/current/structural-repeats/';
for(const name of ['EquivalentSteps','MixedSteps','UnknownSteps','MutableSteps'])render(name+'-roles',struct+name+'.json',state);
const same='verification/semantic-design/current/after/SameSource.json';
render('SameSource-before',same,{...state,paperGranularity:'semantic'},'before');
const source=render('SameSource-roles',same,state),attention=source.graph.nodes.find(n=>n.contract_roles?.projections).contract_roles.attention;
render('SameSource-role-open',same,{...state,paperAuto:false,open:[...source.graph.publication.open,attention]});
render('SameSource-budget',same,{...state,paperBudget:4});
for(const name of ['MixedCircuit','ForeignComposition','UnknownFusion','InterruptedMixer'])render(name+'-roles','verification/local-relations/current/'+name+'.json',state);
const transformer='verification/symbolic-values/current/transformer-current.json',tir=read(transformer);
render('transformer-before',transformer,{paperMedium:'canvas',paperGranularity:'semantic'},'before');
render('transformer-overview',transformer,{...state,paperGranularity:'overview'});
render('transformer-semantic',transformer,{...state,paperGranularity:'semantic'});
render('transformer-roles',transformer,state);
const ffn=tir.semantic_contracts.find(c=>c.rule==='feed-forward').node;
render('feed-forward-roles',transformer,{...state,paperFocus:ffn});
const old=read('verification/frame-ownership/current/render-report.json');
for(const ref of old.reference)assert.equal(sha(ref.svg),ref.svg_sha256);
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest);
const report={schema:'role-frontier-audit/1',implementation_sha256:implementation,frozen_snapshot:frozenPath+'/snapshot.json',frozen_snapshot_sha256:sha(frozenPath+'/snapshot.json'),
 extraction:old.extraction,extraction_sha256:old.extraction_sha256,reference:old.reference,rows,
 runtime_executed:false,goal_complete:false,reference_frontier_match:false,
 scope:'Certificate role references choose one local layer, stopping at nested certificates, control, unknown and mutable boundaries. No computation is substituted or bypassed; original operands, conditions and auxiliary operations remain.',
 unresolved:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues})),
 remaining:['Reference-frontier node/role correspondence remains unverified.','Role detail exposes real source helpers; geometry still differs substantially from the reference.','Local relation fragments need expression choices beyond certificate-owned modules.','Whole graph context paths and dense role views need further crossing reduction.','Cross-language JSON numeric digest contract remains unresolved.']};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');

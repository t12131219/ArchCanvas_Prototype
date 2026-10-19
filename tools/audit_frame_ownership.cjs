#!/usr/bin/env node
'use strict';
// Named cases select evaluation inputs only. Production decisions use local facts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/frame-ownership/current',out=path.join(root,folder);fs.mkdirSync(out,{recursive:true});
const R=require('../semantic_studio/publication-renderer.js');
const frozenPath='verification/local-relations/iteration-11-before-frame-ownership',frozen=require('./load_publication_renderer.cjs')(path.join(root,frozenPath,'implementation/semantic_studio'));
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
for(const [file,digest]of Object.entries(read(frozenPath+'/snapshot.json').files))assert.equal(sha(frozenPath+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tools/audit_frame_ownership.cjs','tools/load_publication_renderer.cjs'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
function render(name,input,state,version='current'){
 const ir=read(input),before=JSON.stringify(ir),r=(version==='before'?frozen:R).render(ir,state);assert.equal(JSON.stringify(ir),before);
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(r.graph[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(v=>v.id).sort());}
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 rows.push({name,input,input_sha256:sha(input),version,state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,selected:r.graph.publication.granularity,quality:r.prepared.quality,
  frame_ownership:r.graph.frame_ownership||[],inline_sequences:r.graph.publication.inline_sequences||null,representative:r.graph.publication.representative});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,frames_attached:r.graph.frame_ownership?.length||0,issues:r.prepared.quality.issues}));return r;
}
const state={paperMedium:'canvas',paperGranularity:'semantic'},struct='verification/local-relations/current/structural-repeats/';
for(const name of ['EquivalentSteps','MixedSteps','UnknownSteps','MutableSteps'])render(name+'-semantic',struct+name+'.json',state);
const eq=rows[0].input,eqOut=R.render(read(eq),state),suffix=eqOut.graph.publication.inline_sequences.sequences[0].remainders[0];
render('EquivalentSteps-suffix-open',eq,{...state,paperAuto:false,open:[...eqOut.graph.publication.open,suffix.node]});
render('EquivalentSteps-later-call',eq,{...state,paperFocus:suffix.instances[0]});
const coupled='verification/inline-sequences/current/CoupledRuns.json';
render('coupled-before',coupled,state,'before');render('coupled-semantic',coupled,state);render('coupled-detailed',coupled,{...state,paperGranularity:'detailed'});
for(const name of ['MixedCircuit','ForeignComposition','UnknownFusion'])render(name+'-semantic','verification/local-relations/current/'+name+'.json',state);
const transformer='verification/symbolic-values/current/transformer-current.json';
const previous=render('transformer-before',transformer,state,'before');
const restored=render('transformer-source-frames',transformer,{...state,paperFrameView:'source'});assert.equal(previous.svg,restored.svg);
render('transformer-overview',transformer,{...state,paperGranularity:'overview'});
const semantic=render('transformer-semantic',transformer,state);
const edgeFacts=edges=>edges.map(e=>{const v=structuredClone(e);if(v.design_route)delete v.design_route.owner;return v;});
assert.equal(JSON.stringify(edgeFacts(previous.graph.edges)),JSON.stringify(edgeFacts(semantic.graph.edges)));
assert.ok(semantic.graph.edges.every(e=>!e.design_route?.owner||semantic.graph.positions.has(e.design_route.owner)));
render('transformer-detailed',transformer,{...state,paperGranularity:'detailed'});
const old=read('verification/inline-sequences/current/render-report.json');
for(const ref of old.reference)assert.equal(sha(ref.svg),ref.svg_sha256);
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest);
const report={schema:'frame-ownership-audit/1',implementation_sha256:implementation,frozen_snapshot:frozenPath+'/snapshot.json',frozen_snapshot_sha256:sha(frozenPath+'/snapshot.json'),
 extraction:old.extraction,extraction_sha256:old.extraction_sha256,reference:old.reference,rows,
 runtime_executed:false,goal_complete:false,reference_frontier_match:false,
 scope:'Expanded redundant source/group frames become inspectable, reversible ownership annotations. Canonical operands, conditions, object identities and source hierarchy remain unchanged.',
 unresolved:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues})),
 remaining:['Reference-frontier node/role correspondence remains unverified.','Certified-module interiors need composable role expression.','Cross-frame context routes and taller detailed views still need layout improvement.','Cross-language JSON numeric digest contract remains unresolved.']};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');

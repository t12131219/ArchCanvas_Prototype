#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/diagram-set/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const {exportSet}=require('./export_diagram_set.cjs'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-33-before-diagram-set',snapshot=read(checkpoint+'/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','tools/export_diagram_set.cjs','tools/audit_diagram_sets.cjs','tools/audit_local_svg.py','tools/audit_role_detail_receipts.py',
 'tools/extract_diagram_sets.py','tests/diagram-set.test.cjs','tests/semantic_fixtures/diagram_sets.py'];
const implementation_sha256=Object.fromEntries(files.map(f=>[f,sha(f)])),state={paperMedium:'canvas',paperGranularity:'roles'},rows=[],sets=[];
const inputs=[...read(folder+'/extraction.json').rows.map(r=>[r.entry,r.input]),
 ['SameSource','verification/semantic-design/current/after/SameSource.json'],['MixedWeave','verification/coverage-selection/current/MixedWeave.json'],
 ['UnknownFusion','verification/local-relations/current/UnknownFusion.json'],['transformer','verification/symbolic-values/current/transformer-current.json']];
for(const [name,input]of inputs){
 const ir=read(input),main=R.render(ir,state),dir=name,result=exportSet(ir,path.join(out,dir),{state,maxPanels:name==='transformer'?4:5,maxTrials:5,main});
 const {manifest,set}=result;let baseline;
 if(name==='transformer'){
  const priorFile='verification/branch-tail-stages/current/render-report.json',prior=read(priorFile).rows.find(r=>r.name==='transformer-current');
  for(const f of Object.keys(snapshot.files).filter(f=>f.endsWith('.js')&&f!=='semantic_studio/app.js'))assert.equal(sha(f),snapshot.files[f]);
  baseline=fs.readFileSync(path.join(root,'verification/branch-tail-stages/current',prior.svg),'utf8');
  assert.equal(crypto.createHash('sha256').update(baseline).digest('hex'),prior.svg_sha256);
 }else baseline=old.render(ir,state).svg;
 assert.equal(main.svg,baseline,'main changed '+name);fs.writeFileSync(path.join(out,dir,'baseline.svg'),baseline);
 for(const [i,p]of set.panels.entries()){
  const r=p.result,m=manifest.panels[i],g=r.graph;
  rows.push({name:name+'-'+(i?'detail-'+i:'main'),input,input_sha256:sha(input),state:r.document.state,selected:g.publication.granularity,
   svg:dir+'/'+m.svg,document:dir+'/'+m.document,svg_sha256:m.svg_sha256,document_sha256:m.document_sha256,
   nodes:g.nodes.length,edges:g.edges.length,quality:r.prepared.quality,role_frontier:g.publication.role_frontier,frame_ownership:g.frame_ownership||[],
   local_pipelines:g.publication.local_pipelines,contract_stages:g.publication.contract_stages,local_expressions:g.publication.local_expressions,
   configuration_paths:g.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
   context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[]});
 }
 sets.push({name,input,input_sha256:sha(input),manifest:dir+'/manifest.json',manifest_sha256:sha(folder+'/'+dir+'/manifest.json'),
  baseline:dir+'/baseline.svg',baseline_sha256:sha(folder+'/'+dir+'/baseline.svg'),main_svg:dir+'/'+manifest.panels[0].svg,
  main_unchanged:true,panels:manifest.panels.length,goals:manifest.coverage.length,fulfilled:manifest.coverage.filter(c=>c.status==='fulfilled').length,
  main_fulfilled:manifest.coverage.filter(c=>c.panels.includes('main')).length,deferred:manifest.deferred_goals.length,complete:manifest.complete});
 console.log(JSON.stringify(sets.at(-1)));
}
for(const [f,h]of Object.entries(implementation_sha256))assert.equal(sha(f),h,'changed during render '+f);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'diagram-set-render/1',implementation_sha256,checkpoint:checkpoint+'/snapshot.json',
 checkpoint_sha256:sha(checkpoint+'/snapshot.json'),extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),
 sets,rows,goal_complete:false,scope:'Bounded main/detail assignment of direct canonical expression goals. Main SVG unchanged; no full reference convergence or large-graph performance claim.'},null,2)+'\n');

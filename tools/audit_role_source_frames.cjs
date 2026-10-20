'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/role-source-frames/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-39-before-role-source-frames',snap=read(checkpoint+'/snapshot.json');for(const [f,h]of Object.entries(snap.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const implementation=Object.fromEntries([...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html',
 'tools/audit_role_source_frames.cjs','tools/extract_role_source_frames.py','tests/role-source-frames.test.cjs','tests/semantic_fixtures/role_source_frames.py','tools/audit_local_svg.py'].map(f=>[f,sha(f)]));
const rows=[],comparisons=[];
function render(name,input,state,renderer){const ir=read(input),before=JSON.stringify(ir),r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),before);const d=r.document;
 fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(d));
 const row={name,input,state,input_sha256:sha(input),svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(folder+'/'+name+'.svg'),document_sha256:sha(folder+'/'+name+'.layout.json'),
  nodes:d.layout.nodes.length,edges:d.layout.edges.length,quality:d.diagnostics.publication,contract_stages:d.publication.contract_stages,local_pipelines:d.publication.local_pipelines};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,issues:row.quality.issues}));return r;}
function pair(name,input,state){const a=render(name+'-before',input,state,old),b=render(name+'-current',input,state,R),receipt=b.prepared.routing.role_source_frame_refinement;
 comparisons.push({name,svg_unchanged:a.svg===b.svg,refinement:receipt||null,before:rows.at(-2).quality,current:rows.at(-1).quality});return b;}
const base={paperMedium:'canvas',paperGranularity:'roles'},saved=read('verification/role-paths/current/ui-saved.layout.json'),input='verification/role-paths/current/SeparateStages.json';
pair('SeparateStages-main',input,base);pair('SeparateStages-path',input,saved.state);
pair('SeparateStages-all',input,{...base,paperRoleDetails:[saved.state.paperRolePaths[0].node]});
render('SeparateStages-source-frames',input,{...saved.state,paperFrameView:'source'},R);
const historical=read('verification/role-paths/current/render-report.json');
const same=historical.rows.find(r=>r.name==='SameSource-path');pair('SameSource-path',same.input,same.state);
for(const name of ['WrappedStages','UnknownStages','ConditionalStages'])pair(name,folder+'/'+name+'.json',base);
for(const name of ['transformer-main','transformer-fixed-path','transformer-fixed-core']){const row=historical.rows.find(r=>r.name===name);pair(name,row.input,row.state);}
for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'role-source-frames-render/1',implementation_sha256:implementation,checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),rows,comparisons,reference:historical.reference,goal_complete:false},null,2)+'\n');

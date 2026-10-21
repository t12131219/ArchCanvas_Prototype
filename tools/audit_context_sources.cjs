/* Measured routing-only comparison. Family names and reference coordinates
 * occur only in this evaluation tool, never in source-side selection. */
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/context-sources/current');fs.mkdirSync(out,{recursive:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
const baselineDir='/tmp/archcanvas-context-source-before',baseline=read(baselineDir+'/snapshot.json');
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f);
for(const [file,h]of Object.entries(baseline.files))assert.equal(sha(baselineDir+'/'+path.basename(file)),h);
const producers=[...files,...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),'tests/context-source-fixtures.cjs','tools/audit_context_sources.cjs'];
const implementation_sha256=Object.fromEntries(producers.map(f=>[f,sha(root+'/'+f)]));
const load=require('./load_publication_renderer.cjs'),before=load(baselineDir),current=load(root+'/semantic_studio');
const {fixture,state}=require('../tests/context-source-fixtures.cjs');const rows=[],comparisons=[];
const q=r=>({nodes:r.graph.nodes.length,edges:r.graph.edges.length,width:r.prepared.quality.native_width_px,height:r.prepared.quality.native_height_px,crossings:r.prepared.quality.line_geometry.crossings,wire:r.prepared.quality.wire_length});
function save(name,input,s,renderer,reuse){
 const ir=read(root+'/'+input),original=JSON.stringify(ir),start=performance.now();
 const r=reuse?{svg:fs.readFileSync(reuse.svg,'utf8'),document:read(reuse.document)}:renderer.render(ir,s);
 assert.equal(JSON.stringify(ir),original);assert.deepEqual(r.document.ir,ir);
 fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(r.document));
 const row={name,input,input_sha256:sha(root+'/'+input),state:r.document.state,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(out+'/'+name+'.svg'),document_sha256:sha(out+'/'+name+'.layout.json'),
 nodes:r.document.layout.nodes.length,edges:r.document.layout.edges.length,quality:r.document.diagnostics.publication,
 context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],
 contract_stages:r.document.publication.contract_stages||null,local_pipelines:r.document.publication.local_pipelines||null,
 receipt:r.document.diagnostics.routing.context_source_refinement||null,elapsed_ms:performance.now()-start,
 ...(reuse?{reuse:{svg:reuse.svg.replace(root+'/',''),document:reuse.document.replace(root+'/',''),report:'verification/invocation-inputs/current/render-report.json'}}:{})};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,wire:row.quality.wire_length,accepted:row.receipt?.accepted}));return r;
}
const inputs=[];
for(const [name,options]of [['ForeignLong',{}],['SameHeight',{balanced:true}],['UnknownSource',{unknown:true}],['GuardedSource',{guarded:true}]]){
 const file='verification/context-sources/current/'+name+'.json';fs.writeFileSync(root+'/'+file,JSON.stringify(fixture(options),null,2));inputs.push([name,file,state]);
}
for(const name of ['ForeignComposition','BranchMosaic','LoopWithBoundary','SharedBranches'])inputs.push([name,'data/semantic/architecture/'+name+'.json',{paperMedium:'canvas',paperGranularity:'roles',paperBudget:20}]);
for(const name of ['GuardedInputs','StatefulInputs','UnknownInputs'])inputs.push([name,'verification/input-docks/current/'+name+'.json',{paperMedium:'canvas',paperGranularity:'roles',paperPipelineSummaries:false}]);
inputs.push(['Transformer','verification/helper-contracts/current/Transformer-current.json',{paperMedium:'canvas',paperGranularity:'roles',paperBudget:20}]);
for(const [name,input,s]of inputs){
 const reuse=name==='Transformer'?{svg:root+'/verification/invocation-inputs/current/Transformer-fixed-current.svg',document:root+'/verification/invocation-inputs/current/Transformer-fixed-current.layout.json'}:null;
 const a=save(name+'-before',input,s,before,reuse),b=save(name+'-current',input,s,current);
 comparisons.push({name,before:name+'-before',current:name+'-current',svg_equal:a.svg===b.svg});
 if(name==='ForeignLong'){
  fs.writeFileSync(out+'/ui-import.json',JSON.stringify({schema:'semantic-canvas/1',ir:b.document.ir,state:{...s,mode:'source',view:'publication'}},null,2));
  save(name+'-folded',input,{...s,open:['root','right']},current);
 }
}
for(const [f,h]of Object.entries(implementation_sha256))assert.equal(sha(root+'/'+f),h);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'context-source-render/1',implementation_sha256,baseline,rows,comparisons,goal_complete:false,
 scope:'Same-frontier source-side routing; fixed roles Transformer request. Full adaptive execution and thousands-node browser performance are not audited by this report.'},null,2));

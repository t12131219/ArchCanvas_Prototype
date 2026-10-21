/* Measured routing-only comparison. Family names and reference coordinates
 * occur only in this evaluation tool, never in region-follower selection. */
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/region-followers/current');fs.mkdirSync(out,{recursive:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
const baselineDir='/tmp/archcanvas-region-followers-before',baseline=read(baselineDir+'/snapshot.json');
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f);
for(const [file,h]of Object.entries(baseline.files))assert.equal(sha(baselineDir+'/'+path.basename(file)),h);
const producers=[...files,...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),'tests/context-source-fixtures.cjs','tools/audit_region_followers.cjs'];
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
 receipt:r.document.diagnostics.routing.region_follower_refinement||null,elapsed_ms:performance.now()-start,
 ...(reuse?{reuse:{svg:reuse.svg.replace(root+'/',''),document:reuse.document.replace(root+'/',''),report:'verification/context-sources/current/render-report.json'}}:{})};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,wire:row.quality.wire_length,accepted:row.receipt?.accepted}));return r;
}
const inputs=[];
for(const [name,options]of [['ForeignLong',{}],['SameHeight',{balanced:true}],['UnknownSource',{unknown:true}],['GuardedSource',{guarded:true}]]){
 const file='verification/region-followers/current/'+name+'.json';fs.writeFileSync(root+'/'+file,JSON.stringify(fixture(options),null,2));inputs.push([name,file,state]);
}
for(const name of ['ForeignComposition','BranchMosaic','LoopWithBoundary','SharedBranches'])inputs.push([name,'data/semantic/architecture/'+name+'.json',{paperMedium:'canvas',paperGranularity:'roles',paperBudget:20}]);
for(const name of ['GuardedInputs','StatefulInputs','UnknownInputs'])inputs.push([name,'verification/input-docks/current/'+name+'.json',{paperMedium:'canvas',paperGranularity:'roles',paperPipelineSummaries:false}]);
for(const [name,alter]of [['UnknownFollower',ir=>{ir.nodes.find(n=>n.id==='out').kind='opaque';}],['TwoSources',ir=>{ir.edges.push({id:'other-exit',source:'c',target:'out',kind:'data',source_port:'out',target_port:'arg:1',evidence:'source-dependency'});}]]){
 const ir=fixture();alter(ir);const file='verification/region-followers/current/'+name+'.json';fs.writeFileSync(root+'/'+file,JSON.stringify(ir,null,2));inputs.push([name,file,state]);
}
{
 const ir=fixture();ir.nodes.push({id:'tail',parent:'root',kind:'compute',label:'tail',operator:'linear',source:[],runtime_evidence:[]});
 ir.edges.find(e=>e.target==='out').target='tail';ir.edges.push({id:'tail-exit',source:'tail',target:'out',kind:'data',source_port:'out',target_port:'return',evidence:'source-dependency'});
 const file='verification/region-followers/current/ExitChain.json';fs.writeFileSync(root+'/'+file,JSON.stringify(ir,null,2));inputs.push(['ExitChain',file,state]);
}
inputs.push(['Transformer','verification/helper-contracts/current/Transformer-current.json',{paperMedium:'canvas',paperGranularity:'roles',paperBudget:20}]);
for(const [name,input,s]of inputs){
 const reuse=name==='Transformer'?{svg:root+'/verification/context-sources/current/Transformer-current.svg',document:root+'/verification/context-sources/current/Transformer-current.layout.json'}:null;
 const a=save(name+'-before',input,s,before,reuse),b=save(name+'-current',input,s,current);
 comparisons.push({name,before:name+'-before',current:name+'-current',svg_equal:a.svg===b.svg});
 if(name==='ExitChain'){
  fs.writeFileSync(out+'/ui-import.json',JSON.stringify({schema:'semantic-canvas/1',ir:b.document.ir,state:{...s,mode:'source',view:'publication'}},null,2));
  save(name+'-folded',input,{...s,open:['root','left']},current);
 }
}
for(const [f,h]of Object.entries(implementation_sha256))assert.equal(sha(root+'/'+f),h);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'region-follower-render/1',implementation_sha256,baseline,rows,comparisons,goal_complete:false,
 scope:'Same-frontier horizontal followers of expanded regions; fixed roles Transformer request. Full adaptive execution and thousands-node browser performance are not audited by this report.'},null,2));

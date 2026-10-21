/* Paired source-identical renders; dedicated figures are evaluation only. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/invocation-inputs/current',out=path.join(root,folder);
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const snapshot=read(folder+'/snapshot.json'),load=require('./load_publication_renderer.cjs'),before=load(out+'/before'),current=load(root+'/semantic_studio');
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 'tools/audit_invocation_inputs.cjs','tools/load_publication_renderer.cjs','tests/invocation-inputs.test.cjs','tests/test_invocation_inputs.py','tests/semantic_fixtures/invocation_inputs.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[];
const state={paperMedium:'canvas',paperGranularity:'roles',paperBudget:20};
const inputs=['BoundCalls','OptionalUnknown','ConditionalCalls','LoopCalls','WideBindings'].map(name=>{
 const input=folder+'/'+name+'.json',ir=read(input);return [name,input,{...state,paperAuto:false,open:ir.nodes.filter(n=>n.kind==='composite').map(n=>n.id)}];
});
inputs.push(...['ForeignComposition','BranchMosaic','LoopWithBoundary','SharedBranches'].map(name=>[name,'data/semantic/architecture/'+name+'.json',state]),
 ['Transformer-overview','verification/helper-contracts/current/Transformer-current.json',{...state,paperGranularity:'overview',paperBudget:12}],
 ['Transformer-fixed','verification/helper-contracts/current/Transformer-current.json',state]);
function save(name,input,s,renderer){
 console.log('START '+name);const ir=read(input),original=JSON.stringify(ir),start=performance.now(),r=renderer.render(ir,s),elapsed_ms=performance.now()-start;
 assert.equal(JSON.stringify(ir),original);assert.equal(JSON.stringify(r.document.ir),original);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 const row={name,input,input_sha256:sha(input),state:r.document.state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,elapsed_ms,
  invocation_inputs:r.document.publication.invocation_inputs||null,role_frontier:r.document.publication.role_frontier||null,routing:r.prepared.routing};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,docks:row.invocation_inputs?.docks.length||0,issues:row.quality.issues}));return {r,row};
}
for(const [name,input,s]of inputs){
 const a=save(name+'-before',input,s,before),b=save(name+'-current',input,s,current);
 comparisons.push({name,before:a.row.name,current:b.row.name,svg_equal:a.r.svg===b.r.svg});
 if(['BoundCalls','OptionalUnknown','WideBindings'].includes(name))save(name+'-header-trial',input,{...s,paperInvocationInputDocks:true},current);
 if(name==='BoundCalls'){
  const saved={schema:'semantic-canvas/1',ir:b.r.document.ir,state:{...s,view:'publication',mode:'source'}};
  fs.writeFileSync(out+'/ui-import.json',JSON.stringify(saved,null,2)+'\n');
  const fixed=b.row.invocation_inputs.rows[0].source_parent;
  save('BoundCalls-one-folded',input,{...s,open:s.open.filter(id=>id!==fixed)},current);
  const reopened=save('BoundCalls-reopened',input,b.r.document.state,current);assert.equal(reopened.r.svg,b.r.svg);
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h,'producer changed '+f);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'invocation-inputs-render/1',implementation_sha256:hashes,baseline:folder+'/snapshot.json',baseline_sha256:sha(folder+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),rows,comparisons,goal_complete:false,
 scope:'Fixed invocation terminals remain visible with exact uses; source-identical frozen/current fixed-policy comparison. Full default adaptive Transformer and thousands-node browser performance not measured in this stage.'},null,2)+'\n');

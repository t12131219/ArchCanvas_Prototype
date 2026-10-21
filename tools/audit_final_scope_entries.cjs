'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/source-columns/current',out=root+'/'+folder;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),R=load(root+'/semantic_studio'),B=load('/tmp/archcanvas-source-columns-before-478ae13');
const snapshot=read(folder+'/snapshot.json'),files=[...Object.keys(snapshot.files),'semantic_studio/index.html','tools/audit_final_scope_entries.cjs','tests/final-scope-entries.test.cjs','tests/cross-scope-fixtures.cjs'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,result){const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,quality:result.document.diagnostics.publication});
 const q=result.document.diagnostics.publication,rec=result.document.diagnostics.routing.final_scope_entry_refinement;
 console.log(JSON.stringify({name,nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,crossings:q.line_geometry.crossings,wire:q.wire_length,selected:rec?.selected.length,attempts:rec?.attempts.map(t=>[t.route_mode,t.accepted,t.candidate.crossings,t.candidate.wire_length])}));return name;}
const large=process.argv.includes('--large');let cases;
if(large){const report=read('verification/operand-order/current/large-report.json');cases=report.comparisons.map((c,i)=>{const p=read('verification/operand-order/current/'+c.after+'.layout.json');return {name:'Transformer-panel-'+i,input:report.rows.find(r=>r.name===c.after).input,state:p.state};});}
else{
 const {fixture,state}=require('../tests/cross-scope-fixtures.cjs');
 cases=[['ForeignFour',{}],['ForeignBudget',{left:8,right:6,branches:3}],['ForeignOpaque',{unknown:true}],['ForeignGuarded',{guarded:true}]].map(([name,extra])=>{
  const input=folder+'/'+name+'.json';fs.writeFileSync(root+'/'+input,JSON.stringify(fixture({left:4,right:4,branches:4,...extra}),null,2)+'\n');return {name,input,state};});
 for(const [name,input,extra]of [
  ['MixedColumns','verification/operand-order/current/MixedColumns.json',{manual:true}],['ForeignDeclaration','verification/operand-order/current/ForeignDeclaration.json',{manual:true}],
  ['SameSource','verification/semantic-design/current/after/SameSource.json',{}],['MixedWeave','verification/coverage-selection/current/MixedWeave.json',{}],['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json',{}],
  ...['BraidedInputs','GuardedInputs','StatefulInputs','UnknownInputs'].map(n=>[n,'verification/input-docks/current/'+n+'.json',{paperPipelineSummaries:false}])]){
  const ir=read(input),helpers=new Set(ir.nodes.filter(n=>n.semantic_type==='source-function').map(n=>n.id));
  cases.push({name,input,state:extra.manual?{paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite'&&!helpers.has(n.id)).map(n=>n.id)}:{paperAdaptive:true,...extra}});
 }
}
for(const {name,input,state:extra}of cases){const ir=read(input),original=JSON.stringify(ir),state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',...extra};
 console.log('START '+name);const old=B.render(ir,state),result=R.render(ir,state);
 const before=save(name+'-before',input,old),after=save(name+'-current',input,result);comparisons.push({name,before,after});assert.equal(JSON.stringify(ir),original);
 assert.equal(R.render(ir,{...state,paperFinalScopeEntries:false}).svg,old.svg,'exact final-pass opt-out');
 if(['ForeignFour','MixedColumns'].includes(name)){
 const opened=name==='ForeignFour'?R.render(ir,{...state,open:['root','right']}):R.render(ir,{...state,open:[...state.open,...ir.nodes.filter(n=>n.semantic_type==='source-function').map(n=>n.id)]});
 save(name+'-opened',input,opened);assert.equal(R.render(opened.document.ir,opened.document.state).svg,opened.svg);
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'final-scope-entries/1',implementation_sha256:hashes,baseline:snapshot,synthetic_inputs:['ForeignFour','ForeignBudget','ForeignOpaque','ForeignGuarded'],rows,comparisons,goal_complete:false},null,2)+'\n');

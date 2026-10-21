'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/operand-order/current',out=root+'/'+folder;
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),R=load(root+'/semantic_studio'),B=load('/tmp/archcanvas-operand-order-before-87732cb');
const snapshot=read(folder+'/snapshot.json'),files=[...Object.keys(snapshot.files),'semantic_studio/index.html','tools/audit_declared_operands.cjs','tests/declared-operands.test.cjs','tests/semantic_fixtures/declared_operands.py','tools/extract_declared_operands.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,result){const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:result.document.layout.nodes.length,edges:result.document.layout.edges.length,quality:result.document.diagnostics.publication});
 const rec=result.document.diagnostics.routing.declared_operand_refinement;console.log(JSON.stringify({name,nodes:result.graph?.nodes.length??result.document.layout.nodes.length,edges:result.document.layout.edges.length,crossings:result.document.diagnostics.publication.line_geometry.crossings,wire:result.document.diagnostics.publication.wire_length,selected:rec?.selected.length??0,attempts:rec?.attempts.map(t=>[t.route_mode,t.accepted,t.before.crossings,t.candidate.crossings])}));return name;}
const large=process.argv.includes('--large');
const cases=large?read('verification/module-arguments/current/large-report.json').comparisons.map((c,i)=>{const p=read('verification/module-arguments/current/'+c.after+'.layout.json');return {name:'Transformer-panel-'+i,input:read('verification/module-arguments/current/large-report.json').rows.find(r=>r.name===c.after).input,state:p.state};}):[
 ...read(folder+'/extraction.json').rows.map(({name,input})=>{const ir=read(input),helpers=new Set(ir.nodes.filter(n=>n.semantic_type==='source-function').map(n=>n.id));return {name,input,state:{paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:ir.nodes.filter(n=>n.kind==='composite'&&!helpers.has(n.id)).map(n=>n.id)}};}),
 ...[['SameSource','verification/semantic-design/current/after/SameSource.json'],['MixedWeave','verification/coverage-selection/current/MixedWeave.json'],['InterruptedMixer','verification/local-relations/current/InterruptedMixer.json']].map(([name,input])=>({name,input,state:{paperAdaptive:true}}))];
for(const {name,input,state:extra}of cases){const ir=read(input),original=JSON.stringify(ir),state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',...extra};
 console.log('START '+name);const old=B.render(ir,state),result=R.render(ir,state);
 const before=save(name+'-before',input,old),after=save(name+'-current',input,result);comparisons.push({name,before,after});
 assert.equal(JSON.stringify(ir),original);assert.equal(R.render(ir,{...state,paperDeclaredOperandOrder:false}).svg,old.svg,'opt-out must match the frozen prior implementation');
 if(!large){const consumers=result.graph.nodes.filter(n=>n.semantic_type==='source-function'&&!result.graph.positions.get(n.id).expanded).map(n=>n.id);
 if(consumers.length){const opened=R.render(ir,{...state,paperAuto:false,paperAdaptive:false,open:[...result.graph.publication.open,...consumers]});save(name+'-opened',input,opened);assert.equal(R.render(opened.document.ir,opened.document.state).svg,opened.svg);}}
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'declared-operands/1',implementation_sha256:hashes,baseline:snapshot,rows,comparisons,goal_complete:false},null,2)+'\n');

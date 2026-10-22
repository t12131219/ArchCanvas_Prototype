'use strict';
const fs=require('fs'),crypto=require('crypto'),assert=require('node:assert/strict');
const load=require('./load_publication_renderer.cjs'),R=load('./semantic_studio'),C=require('../semantic_studio/composition-layout'),E=require('../semantic_studio/semantic-engine');
const out='verification/composition-rounds/current/',sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const implementation=Object.fromEntries(fs.readdirSync('semantic_studio').filter(f=>f.endsWith('.js')||f==='index.html').map(f=>['semantic_studio/'+f,sha('semantic_studio/'+f)]));
const source='verification/helper-contracts/current/Transformer-current.json';
const rows=[];
function capture(name,input,state){
 const ir=JSON.parse(fs.readFileSync(input)),raw=JSON.stringify(ir),r=R.render(ir,state);assert.equal(JSON.stringify(ir),raw);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+svg,r.svg);fs.writeFileSync(out+document,JSON.stringify(r.document));
 const row={name,input,input_sha256:sha(input),state,svg,document,svg_sha256:sha(out+svg),document_sha256:sha(out+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality};rows.push(row);
 console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,issues:row.quality.issues}));return r;
}
const base={view:'publication',mode:'source',paperMedium:'canvas',paperGranularity:'stages',paperComposition:'architecture',paperDirection:'up',paperAdaptive:false,paperCompact:true};
const coarse=capture('Transformer-F0',source,base),fineState=C.certifiedDetails(coarse.document.ir,C.frontier(base,'detail'));
const fine=capture('Transformer-F1',source,fineState);
const child=fine.graph.nodes.find(n=>n.role_path_stage&&!fine.graph.positions.get(n.id).expanded&&(fine.graph.idx.children.get(n.id)||[]).length);
assert.ok(child);const local={...fineState,paperAuto:false,open:[...new Set([...fine.graph.publication.open,child.id])]};
capture('Transformer-finer',source,local);
const back=capture('Transformer-returned',source,C.frontier(local,'return'));assert.equal(back.svg,coarse.svg);
for(const name of ['ReadWorkshop','PairReads','SharedReadWorkshop','InterruptedRead','ConditionalRead','MutableRead','EscapingRead']){
 const input='verification/call-boundaries/current/'+name+'.json';capture(name+'-F0',input,base);
 capture(name+'-F1',input,C.certifiedDetails(JSON.parse(fs.readFileSync(input)),C.frontier(base,'detail')));
}
for(const name of ['StateWorkshop','ConditionalStep','NamedImpostor','StepPair']){
 const input='verification/cell-interfaces/current/'+name+'.json';capture(name+'-F0',input,base);
 capture(name+'-F1',input,C.certifiedDetails(JSON.parse(fs.readFileSync(input)),C.frontier(base,'detail')));
}
for(const name of ['WrappedChain','SharedChain','UnknownChain','NestedChain']){
 const input='verification/helper-contracts/current/'+name+'-current.json';capture(name+'-F0',input,base);
 capture(name+'-F1',input,C.certifiedDetails(JSON.parse(fs.readFileSync(input)),C.frontier(base,'detail')));
}
for(const name of ['TinyCNN','BranchMLP','ReusedRecurrent','UnknownCall']){
 const input=out+name+'.json';capture(name+'-F0',input,base);
 capture(name+'-F1',input,C.certifiedDetails(JSON.parse(fs.readFileSync(input)),C.frontier(base,'detail')));
}
for(const [p,h]of Object.entries(implementation))assert.equal(sha(p),h,'Producer changed during capture');
fs.writeFileSync(out+'suite-report.json',JSON.stringify({schema:'architecture-composition-suite/1',implementation_sha256:implementation,rows,goal_complete:false},null,2)+'\n');

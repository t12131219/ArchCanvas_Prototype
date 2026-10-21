/* A shorter-wire proposal must still preserve already realized channels. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),out=root+'/verification/context-sources/current',R=require('./load_publication_renderer.cjs')(root+'/semantic_studio');
const input='verification/input-docks/current/LateInputs.json',ir=JSON.parse(fs.readFileSync(root+'/'+input)),state={paperMedium:'canvas',paperGranularity:'roles',paperPipelineSummaries:false,paperContextLanes:'left'};
const a=R.render(ir,{...state,paperContextSourceFacing:false}),b=R.render(ir,state),receipt=b.prepared.routing.context_source_refinement;
assert.equal(receipt.accepted,false);assert.ok(receipt.candidate.wire_length<receipt.before.wire_length);
assert.ok(receipt.realized_before.contexts.some(id=>!receipt.realized_candidate.contexts.includes(id)));assert.equal(a.svg,b.svg);
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),rows=[];
for(const [name,r]of [['LateInputs-before',a],['LateInputs-current',b]]){
 fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(r.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(out+'/'+name+'.svg'),document_sha256:sha(out+'/'+name+'.layout.json'),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,contract_stages:r.document.publication.contract_stages||null,local_pipelines:r.document.publication.local_pipelines||null});
}
fs.writeFileSync(out+'/rejection-report.json',JSON.stringify({schema:'context-source-rejection/1',render_report_sha256:sha(out+'/render-report.json'),tool_sha256:sha(__filename),rows,receipt,svg_byte_identical:true,passed:true},null,2));
console.log('Shorter-wire candidate rejected: existing side channel would disappear.');

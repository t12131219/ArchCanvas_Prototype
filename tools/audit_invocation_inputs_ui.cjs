'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/invocation-inputs/current');
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(out+'/'+f)).digest('hex');
const source=read('BoundCalls.json'),bytes=JSON.stringify(source),rows=[];
for(const [name,file]of [['planned','ui-saved.json'],['folded','ui-folded-state.json']]){
 const d=read(file);assert.deepEqual(d.ir,source);const r=R.render(source,d.state),svg='ui-'+name+'.svg',document='cli-ui-'+name+'.layout.json';
 assert.equal(r.svg,fs.readFileSync(out+'/'+svg,'utf8'));fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 rows.push({name:'ui-'+name,svg,document,svg_sha256:sha(svg),document_sha256:sha(document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  quality:r.prepared.quality,local_pipelines:r.document.publication.local_pipelines,contract_stages:r.document.publication.contract_stages});
 assert.equal(r.document.publication.invocation_inputs.docks.length,0);assert.ok(r.graph.nodes.some(n=>n.invocation_binding));
}
for(const file of ['ui-reopened.svg','ui-returned.svg','BoundCalls-current.svg'])assert.equal(sha(file),sha('ui-planned.svg'));
assert.equal(sha('ui-folded.svg'),sha('BoundCalls-one-folded.svg'));
const raw=read('ui-raw-state.json');assert.deepEqual(raw.ir,source);assert.equal(raw.state.view,'source');const g=E.project(source,raw.state);
assert.deepEqual(g.nodes.map(n=>n.id).sort(),source.nodes.map(n=>n.id).sort());assert.deepEqual(g.edges.map(e=>e.id).sort(),source.edges.map(e=>e.id).sort());
fs.writeFileSync(out+'/cli-ui-raw.json',JSON.stringify({ir:source,state:raw.state,nodes:[...g.positions].map(([id,p])=>({id,...p})),edges:g.edges.map(e=>({...e,route:E.route(e,g.positions)}))}));
assert.equal(JSON.stringify(source),bytes);
const files=['ui-import.json','ui-saved.json','ui-folded-state.json','ui-raw-state.json','ui-planned.svg','ui-reopened.svg','ui-folded.svg','ui-raw.svg','ui-returned.svg','ui-returned.png','cli-ui-raw.json',...rows.map(r=>r.document)];
const report={schema:'invocation-inputs-ui/1',render_report_sha256:sha('render-report.json'),auditor_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),rows,
 sequence:[rows[0].nodes,rows[0].nodes,rows[1].nodes,g.nodes.length,rows[0].nodes],canonical_ir_unchanged:true,cli_svg_equal:true,saved_reopened:true,exact_return_svg:true,
 raw_document:'cli-ui-raw.json',raw_svg:'ui-raw.svg',artifacts_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),
 scope:'Actual editor import/save/reopen/one-call fold/source expand all/restore on a mixed literal and dynamic fixture. Four fixed terminals and condition uses retained. Default measured header rejection preserved. Not thousands-node browser performance.'};
fs.writeFileSync(out+'/ui-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sequence:report.sequence,passed:true}));

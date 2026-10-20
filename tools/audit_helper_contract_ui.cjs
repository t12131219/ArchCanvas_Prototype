'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/helper-contracts/current'),R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const saved=read('ui-saved.layout.json'),raw=read('ui-raw-state.json'),source=read('SplitChain-current.json'),rows=[];
assert.deepEqual(saved.ir,source);assert.deepEqual(raw.ir,source);const before=JSON.stringify(source);
for(const [name,state,svg]of [['compact',saved.state,'ui-compact.svg'],['source-frames',{...saved.state,paperFrameView:'source'},'ui-source-frames.svg']]){
 const r=R.render(source,state);assert.equal(r.svg,fs.readFileSync(path.join(out,svg),'utf8'));
 const document='cli-ui-'+name+'.layout.json';fs.writeFileSync(path.join(out,document),JSON.stringify(r.document));
 rows.push({name:'ui-'+name,svg,document,svg_sha256:sha(svg),document_sha256:sha(document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  quality:r.document.diagnostics.publication,contract_stages:r.document.publication.contract_stages,local_pipelines:r.document.publication.local_pipelines});
}
for(const name of ['ui-reopened.svg','ui-restored-compact.svg','ui-returned.svg'])assert.equal(fs.readFileSync(path.join(out,name),'utf8'),fs.readFileSync(path.join(out,'ui-compact.svg'),'utf8'));
assert.equal(fs.readFileSync(path.join(out,'ui-compact.svg'),'utf8'),fs.readFileSync(path.join(out,'SplitChain-current.svg'),'utf8'));
assert.equal(fs.readFileSync(path.join(out,'ui-source-frames.svg'),'utf8'),fs.readFileSync(path.join(out,'SplitChain-source-frames.svg'),'utf8'));
const g=E.project(source,raw.state);assert.deepEqual(g.nodes.map(n=>n.id).sort(),source.nodes.map(n=>n.id).sort());assert.deepEqual(g.edges.map(e=>e.id).sort(),source.edges.map(e=>e.id).sort());
const rawDocument={ir:source,state:raw.state,nodes:[...g.positions].map(([id,p])=>({id,...p})),edges:g.edges.map(e=>({...e,route:E.route(e,g.positions)}))};
fs.writeFileSync(path.join(out,'cli-ui-raw.json'),JSON.stringify(rawDocument));assert.equal(JSON.stringify(source),before);
const artifacts=['ui-saved.layout.json','ui-raw-state.json','ui-compact.svg','ui-reopened.svg','ui-source-frames.svg','ui-restored-compact.svg','ui-raw.svg','ui-returned.svg','ui-compact.png','cli-ui-raw.json',...rows.map(r=>r.document)];
const report={schema:'helper-contracts-ui/1',render_report_sha256:sha('render-report.json'),rows,generic_sequence:[6,6,9,6,17,6],raw_source_nodes:g.nodes.length,raw_source_edges:g.edges.length,
 saved_reopened:true,canonical_ir_unchanged:true,cli_svg_equal:true,exact_return_svg:true,raw_document:'cli-ui-raw.json',raw_svg:'ui-raw.svg',
 scope:'Actual import, canvas/roles selection, save/reopen, source frame restoration, compact return, source view Expand all17 nodes12 edges and reopened semantic state. No Transformer UI or thousands-node performance claim.',
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sequence:report.generic_sequence,raw_nodes:g.nodes.length,raw_edges:g.edges.length}));

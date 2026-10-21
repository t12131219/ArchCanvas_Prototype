'use strict';
// Verify actual editor exports against their saved requests and canonical facts.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/adaptive-comparison/current');
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const source=JSON.parse(fs.readFileSync(path.join(root,'verification/adaptive-role-paths/current/BoundedWeave.json'))),bytes=JSON.stringify(source),rows=[];
for(const [name,file]of [['planned','ui-saved.json'],['refolded','ui-refolded-state.json']]){
 const d=read(file);assert.deepEqual(d.ir,source);const r=R.render(d.ir,d.state),svg='ui-'+name+'.svg',document='cli-ui-'+name+'.layout.json';
 assert.equal(r.svg,fs.readFileSync(path.join(out,svg),'utf8'));fs.writeFileSync(path.join(out,document),JSON.stringify(r.document));
 rows.push({name:'ui-'+name,svg,document,svg_sha256:sha(svg),document_sha256:sha(document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  quality:r.document.diagnostics.publication,contract_stages:r.document.publication.contract_stages,local_pipelines:r.document.publication.local_pipelines});
}
const planned=read(rows[0].document).publication.adaptive_frontier.selected_role_paths;
assert.equal(planned.length,1);assert.equal(read('ui-saved.json').state.paperAdaptive,true);
const folded=read('ui-refolded-state.json');assert.equal(folded.state.paperAdaptive,false);assert.equal(folded.state.paperRolePaths.length,0);
for(const file of ['ui-reopened.svg','ui-returned.svg','BoundedWeave-current.svg'])assert.equal(sha(file),sha('ui-planned.svg'));
assert.equal(sha('ui-refolded.svg'),sha('BoundedWeave-main-current.svg'));
const raw=read('ui-raw-state.json');assert.deepEqual(raw.ir,source);assert.equal(raw.state.view,'source');
const g=E.project(source,raw.state);
assert.deepEqual(g.nodes.map(n=>n.id).sort(),source.nodes.map(n=>n.id).sort());
assert.deepEqual(g.edges.map(e=>e.id).sort(),source.edges.map(e=>e.id).sort());
const rawDoc={ir:source,state:raw.state,nodes:[...g.positions].map(([id,p])=>({id,...p})),edges:g.edges.map(e=>({...e,route:E.route(e,g.positions)}))};
fs.writeFileSync(path.join(out,'cli-ui-raw.json'),JSON.stringify(rawDoc));assert.equal(JSON.stringify(source),bytes);
const files=['ui-input.json','ui-saved.json','ui-refolded-state.json','ui-raw-state.json','ui-planned.svg','ui-reopened.svg','ui-refolded.svg','ui-raw.svg','ui-returned.svg','ui-returned.png','cli-ui-raw.json',...rows.map(r=>r.document)];
const report={schema:'adaptive-comparison-ui/1',render_report_sha256:sha('render-report.json'),auditor_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),rows,
 generic_sequence:[rows[0].nodes,rows[0].nodes,rows[1].nodes,g.nodes.length,rows[0].nodes],selected_paths:planned,
 saved_reopened:true,canonical_ir_unchanged:true,cli_svg_equal:true,exact_return_svg:true,raw_document:'cli-ui-raw.json',raw_svg:'ui-raw.svg',
 scope:'Actual import, automatic partial selection, save/reopen, inspector path refold, source details plus Expand all, reopen semantic state. This verifies a 144-node generic fixture; it does not verify Transformer default-adaptive browser latency or thousands-node routing.',
 artifacts_sha256:Object.fromEntries(files.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sequence:report.generic_sequence,paths:planned.length}));

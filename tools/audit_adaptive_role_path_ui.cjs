'use strict';
// Rebuild the actual saved UI requests and compare their complete SVG exports.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/adaptive-role-paths/current');
const R=require('../semantic_studio/publication-renderer.js'),E=require('../semantic_studio/semantic-engine.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(out,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,f))).digest('hex');
const source=read('BoundedWeave.json'),saved=read('ui-saved.layout.json'),manual=read('ui-manual-state.json'),raw=read('ui-raw-state.json'),rows=[];
const before=JSON.stringify(source);
for(const [name,d,svg]of [['planned',saved,'ui-planned.svg'],['manual',manual,'ui-manual.svg']]){
 assert.deepEqual(d.ir,source);const r=R.render(d.ir,d.state);assert.equal(r.svg,fs.readFileSync(path.join(out,svg),'utf8'));
 const document='cli-ui-'+name+'.layout.json';fs.writeFileSync(path.join(out,document),JSON.stringify(r.document));
 rows.push({name:'ui-'+name,svg,document,svg_sha256:sha(svg),document_sha256:sha(document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  quality:r.document.diagnostics.publication,contract_stages:r.document.publication.contract_stages,local_pipelines:r.document.publication.local_pipelines});
}
const planned=read(rows[0].document).publication.adaptive_frontier.selected_role_paths;
assert.equal(planned.length,2);assert.equal(saved.state.paperRolePaths,undefined);assert.equal(saved.state.paperAdaptive,true);
assert.equal(manual.state.paperAdaptive,false);assert.equal(manual.state.paperRolePaths.length,1);
assert.ok(planned.some(p=>JSON.stringify(p)===JSON.stringify(manual.state.paperRolePaths[0])));
assert.equal(JSON.stringify(source),before);assert.deepEqual(raw.ir,source);
const equal=(a,b)=>assert.equal(fs.readFileSync(path.join(out,a),'utf8'),fs.readFileSync(path.join(out,b),'utf8'));
for(const name of ['ui-reopened.svg','ui-returned.svg','BoundedWeave-current.svg'])equal('ui-planned.svg',name);
equal('ui-refolded.svg','BoundedWeave-main-current.svg');
const g=E.project(source,raw.state);assert.deepEqual(g.nodes.map(n=>n.id).sort(),source.nodes.map(n=>n.id).sort());
assert.deepEqual(g.edges.map(e=>e.id).sort(),source.edges.map(e=>e.id).sort());
const rawDoc={ir:source,state:raw.state,nodes:[...g.positions].map(([id,p])=>({id,...p})),edges:g.edges.map(e=>({...e,route:E.route(e,g.positions)}))};
fs.writeFileSync(path.join(out,'cli-ui-raw.json'),JSON.stringify(rawDoc));
const artifacts=['ui-saved.layout.json','ui-manual-state.json','ui-raw-state.json','ui-planned.svg','ui-reopened.svg','ui-manual.svg','ui-refolded.svg','ui-raw.svg','ui-returned.svg','ui-planned.png','ui-returned.png','cli-ui-raw.json',...rows.map(r=>r.document)];
const report={schema:'adaptive-role-paths-ui/1',render_report_sha256:sha('render-report.json'),rows,
 generic_sequence:[rows[0].nodes,rows[0].nodes,rows[1].nodes,13,g.nodes.length,rows[0].nodes],
 selected_paths:planned,retained_manual_paths:manual.state.paperRolePaths,
 saved_reopened:true,canonical_ir_unchanged:true,cli_svg_equal:true,exact_return_svg:true,raw_document:'cli-ui-raw.json',raw_svg:'ui-raw.svg',
 scope:'Actual file chooser import, canvas/roles structure policy, automatic path inspector, save/reopen, refold one path while retaining another, refold remainder, source view details and Expand all, then reopen semantic document. No Transformer UI or thousands-node routing/performance claim.',
 artifacts_sha256:Object.fromEntries(artifacts.map(f=>[f,sha(f)]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sequence:report.generic_sequence,retained_paths:manual.state.paperRolePaths}));

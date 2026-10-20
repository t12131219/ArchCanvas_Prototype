'use strict';
// Reconstruct real UI exports from their saved canonical IR and exact state.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/role-paths/current'),R=require('../semantic_studio/publication-renderer.js');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(out,f)));
const source=read('SeparateStages.json'),saved=read('ui-saved.layout.json'),further=read('ui-further-state.json'),rows=[];
for(const [name,d,svg]of [['path',saved,'ui-path.svg'],['further',further,'ui-further.svg']]){
 assert.deepEqual(d.ir,source);const before=JSON.stringify(d.ir),r=R.render(d.ir,d.state);assert.equal(JSON.stringify(d.ir),before);
 assert.equal(r.svg,fs.readFileSync(path.join(out,svg),'utf8'));
 const document='cli-ui-'+name+'.layout.json';fs.writeFileSync(path.join(out,document),JSON.stringify(r.document));
 rows.push({name:'ui-'+name,svg,document,svg_sha256:sha(path.join(out,svg)),document_sha256:sha(path.join(out,document)),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.document.diagnostics.publication,
  contract_stages:r.document.publication.contract_stages,local_pipelines:r.document.publication.local_pipelines});
}
assert.equal(rows[0].nodes,20);assert.equal(rows[1].nodes,40);
const equal=(a,b)=>assert.equal(fs.readFileSync(path.join(out,a),'utf8'),fs.readFileSync(path.join(out,b),'utf8'));
for(const name of ['ui-main.svg','ui-refolded.svg','ui-final-refolded.svg'])equal(name,'SeparateStages-main.svg');
for(const name of ['ui-path.svg','ui-reopened.svg','ui-further-refolded.svg'])equal(name,'SeparateStages-path.svg');
const files=['ui-main.svg','ui-path.svg','ui-reopened.svg','ui-refolded.svg','ui-further.svg','ui-further-refolded.svg','ui-final-refolded.svg','ui-saved.layout.json','ui-further-state.json','ui-path.png'];
const implementation=Object.fromEntries(fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>['semantic_studio/'+f,sha(path.join(root,'semantic_studio',f))]));
const report={schema:'role-paths-ui/1',render_report_sha256:sha(path.join(out,'render-report.json')),implementation_sha256:implementation,rows,
 generic_sequence:[13,20,20,13,20,40,20,13],saved_reopened:true,canonical_ir_unchanged:true,cli_svg_equal:true,exact_refold_svg:true,
 scope:'Actual local file chooser, scores-path button, SVG/document export, saved reopen, refold, Expand all and Undo. No thousands-node UI or Transformer default path layout claim.',
 artifacts_sha256:Object.fromEntries([...files,...rows.map(r=>r.document)].map(f=>[f,sha(path.join(out,f))]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sequence:report.generic_sequence,cli_svg_equal:true,exact_refold_svg:true}));

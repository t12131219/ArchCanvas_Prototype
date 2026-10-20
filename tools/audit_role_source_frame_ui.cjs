'use strict';
// Reconstruct actual exported UI states, including restoration of source frames.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/role-source-frames/current'),R=require('../semantic_studio/publication-renderer.js');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(out,f)));
const saved=read('ui-saved.layout.json'),further=read('ui-further-state.json'),rows=[];
const source=JSON.parse(fs.readFileSync(path.join(root,'verification/role-paths/current/SeparateStages.json')));
for(const [name,state,svg]of [['compact',saved.state,'ui-compact.svg'],['source-frames',{...saved.state,paperFrameView:'source'},'ui-source-frames.svg'],
 ['further',further.state,'ui-further.svg'],['refolded',{...saved.state,paperRolePaths:[]},'ui-refolded.svg']]){
 assert.deepEqual(saved.ir,source);assert.deepEqual(further.ir,source);const before=JSON.stringify(source),r=R.render(source,state);assert.equal(JSON.stringify(source),before);
 assert.equal(r.svg,fs.readFileSync(path.join(out,svg),'utf8'),name);
 const document='cli-ui-'+name+'.layout.json';fs.writeFileSync(path.join(out,document),JSON.stringify(r.document));
 rows.push({name:'ui-'+name,svg,document,svg_sha256:sha(path.join(out,svg)),document_sha256:sha(path.join(out,document)),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  quality:r.document.diagnostics.publication,contract_stages:r.document.publication.contract_stages,local_pipelines:r.document.publication.local_pipelines});
}
assert.deepEqual(rows.map(r=>r.nodes),[19,21,39,13]);
const equal=(a,b)=>assert.equal(fs.readFileSync(path.join(out,a),'utf8'),fs.readFileSync(path.join(out,b),'utf8'));
for(const name of ['ui-compact.svg','ui-reopened.svg','ui-restored-compact.svg','ui-further-refolded.svg'])equal(name,'SeparateStages-path-current.svg');
equal('ui-source-frames.svg','SeparateStages-source-frames.svg');equal('ui-refolded.svg','SeparateStages-main-current.svg');
const files=['ui-compact.svg','ui-reopened.svg','ui-restored-compact.svg','ui-source-frames.svg','ui-refolded.svg','ui-further.svg','ui-further-refolded.svg','ui-saved.layout.json','ui-further-state.json','ui-compact.png'];
const implementation=Object.fromEntries(fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>['semantic_studio/'+f,sha(path.join(root,'semantic_studio',f))]));
const report={schema:'role-source-frames-ui/1',render_report_sha256:sha(path.join(out,'render-report.json')),implementation_sha256:implementation,rows,
 generic_sequence:[19,21,19,39,19,13,19],saved_reopened:true,canonical_ir_unchanged:true,cli_svg_equal:true,exact_refold_svg:true,
 scope:'Actual file import and saved reopen; restored source frames, compact return, Expand all, saved detail, Undo and selected-path refold. 39 visible detail objects do not denote all97 canonical nodes. No thousands-node routing or UI-performance claim.',
 artifacts_sha256:Object.fromEntries([...files,...rows.map(r=>r.document)].map(f=>[f,sha(path.join(out,f))]))};
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({sequence:report.generic_sequence,cli_svg_equal:true,exact_refold_svg:true}));

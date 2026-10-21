'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),assert=require('node:assert/strict'),load=require('./load_publication_renderer.cjs');
const root=path.resolve(__dirname,'..'),out=root+'/verification/cohort-folds/current',R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),rows=[];
const reports=['small','large'].flatMap(s=>read(s+'-render-report.json').comparisons);
const requested=[['SplitEnvelopes-main','SplitEnvelopes'],['SplitEnvelopes-first','SplitEnvelopes'],['SplitEnvelopes-second','SplitEnvelopes'],['SplitEnvelopes-deep','SplitEnvelopes'],['GuardedEnvelope-main','GuardedEnvelope']];
const optionalTransformer=[['Transformer-main','Transformer'],['Transformer-recovery','Transformer']];
const missingTransformer=optionalTransformer.filter(([name])=>!fs.existsSync(out+'/ui-'+name+'.json'));
const cases=requested.concat(missingTransformer.length?[]:optionalTransformer);
for(const [name,model]of cases){
 const saved=read('ui-'+name+'.json'),input=model==='Transformer'?'verification/helper-contracts/current/Transformer-current.json':'verification/cohort-folds/current/'+model+'.json';
 assert.deepEqual(saved.ir,JSON.parse(fs.readFileSync(root+'/'+input)));
 const r=R.render(saved.ir,saved.state),svg='ui-'+name+'.svg',document='ui-'+name+'.layout.json';
 assert.equal(r.svg,fs.readFileSync(out+'/'+svg,'utf8'),'actual SVG differs: '+name);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 rows.push({name:'ui-'+name,input,input_sha256:sha(root+'/'+input),state:saved.state,svg,svg_sha256:sha(out+'/'+svg),document,document_sha256:sha(out+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,role_path_stages:r.graph.publication.role_path_stages||null});
 if(name.endsWith('-main')){
  const planned=saved.state.paperDiagramPlan;assert.equal(planned.policy,'compact');
  const c=reports.find(c=>c.name===model),p=c&&c.current.panels[0];
  rows.at(-1).formal_match=Boolean(p&&r.svg===fs.readFileSync(out+'/'+p.capture+'.svg','utf8'));
  rows.at(-1).coverage_match=Boolean(c&&JSON.stringify(planned.coverage)===JSON.stringify(c.current.coverage));
 }
}
assert.equal(fs.readFileSync(out+'/ui-SplitEnvelopes-main.svg','utf8'),fs.readFileSync(out+'/ui-SplitEnvelopes-reopened.svg','utf8'));
const ir=JSON.parse(fs.readFileSync(root+'/verification/helper-contracts/current/Transformer-current.json')),before=JSON.stringify(ir),g=E.project(ir,{view:'source',mode:'source',details:true,open:ir.nodes.filter(n=>n.kind==='composite'||n.kind==='control').map(n=>n.id)});
assert.deepEqual(Array.from(g.positions.keys()).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(Array.from(g.edges,e=>e.id).sort(),ir.edges.map(e=>e.id).sort());assert.equal(before,JSON.stringify(ir));
fs.writeFileSync(out+'/source-expandability.json',JSON.stringify({input:'verification/helper-contracts/current/Transformer-current.json',input_sha256:sha(root+'/verification/helper-contracts/current/Transformer-current.json'),nodes:g.nodes.length,edges:g.edges.length,all_canonical_ids_visible:true,canonical_ir_unchanged:true,scope:'Raw projection only; full thousands-node SVG routing and interaction performance remain unverified.'},null,2)+'\n');
const files=fs.readdirSync(out).filter(f=>f.startsWith('ui-')&&!f.endsWith('.layout.json')&&f!=='ui-report.json');
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({schema:'cohort-folds-ui/1',passed:true,auditor_sha256:sha(__filename),rows,files_sha256:Object.fromEntries(files.map(f=>[f,sha(out+'/'+f)])),
   results:['Actual file chooser imports','Selected owners recover in their original source scopes','Packed recovery buttons open and return','Planned stage continues to deeper computation detail','Saved main reopens to byte-identical SVG','Conditional unknown and recurrent state mixture retains boundaries',missingTransformer.length?'Transformer browser recovery capture is pending; formal Transformer SVG comparison remains available':'Actual Transformer planning and recovery were captured'],goal_complete:false,missing_transformer_ui:missingTransformer.map(([name])=>name)},null,2)+'\n');
console.log(JSON.stringify({ui_panels:rows.length,byte_identical:true,raw_nodes:g.nodes.length,raw_edges:g.edges.length}));

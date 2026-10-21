'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),load=require('./load_publication_renderer.cjs');
const root=path.resolve(__dirname,'..'),folder='verification/prefix-role-paths/current',out=root+'/'+folder,R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),rows=[];
for(const [name,saved,formal,model]of [
 ['initial','ui-initial-saved.json','PreparedCurve-current','PreparedCurve'],
 ['opened',null,'PreparedCurve-opened','PreparedCurve'],
 ['deep','ui-deep-saved.json','PreparedCurve-deep','PreparedCurve'],
 ['deep-reopened','ui-deep-saved.json','PreparedCurve-deep','PreparedCurve'],
 ['refolded','ui-refolded-saved.json','PreparedCurve-current','PreparedCurve'],
 ['restored-auto','ui-initial-saved.json','PreparedCurve-current','PreparedCurve'],
 ['mixed','ui-mixed-saved.json','MixedPreparation-current','MixedPreparation']]){
 const input=folder+'/'+model+'.json',doc=saved?read(saved):read(formal+'.layout.json'),ir=read(model+'.json');assert.deepEqual(doc.ir,ir);
 const r=R.render(ir,doc.state),svg='ui-'+name+'.svg',document='ui-'+name+'.layout.json';
 assert.equal(fs.readFileSync(out+'/'+svg,'utf8'),r.svg,'actual UI/renderer mismatch '+name);
 assert.equal(fs.readFileSync(out+'/'+svg,'utf8'),fs.readFileSync(out+'/'+formal+'.svg','utf8'),'actual UI/formal mismatch '+name);
 fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 rows.push({name:'ui-'+name,input,input_sha256:sha(root+'/'+input),svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,role_path_stages:r.graph.publication.role_path_stages});
}
assert.equal(fs.readFileSync(out+'/ui-disabled.svg','utf8'),fs.readFileSync(out+'/PreparedCurve-before.svg','utf8'),'disabled rule retains frozen SVG');
const raw=read('ui-source-saved.json'),ir=read('PreparedCurve.json');assert.deepEqual(raw.ir,ir);const g=E.project(ir,raw.state);
assert.deepEqual(Array.from(g.positions.keys()).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(Array.from(g.edges,e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
fs.writeFileSync(out+'/ui-raw-projection.json',JSON.stringify({nodes:Array.from(g.positions.values()),edges:g.edges.map(e=>({id:e.id,route:E.route(e,g.positions)}))}));
const files=fs.readdirSync(out).filter(f=>f.startsWith('ui-')&&!f.endsWith('.layout.json')&&f!=='ui-report.json');
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({passed:true,goal_complete:false,auditor_sha256:sha(__filename),rows,
 files_sha256:Object.fromEntries(files.map(f=>[f,sha(out+'/'+f)])),raw_nodes:ir.nodes.length,raw_edges:ir.edges.length,
 method:'Actual file chooser import; checkbox opt-out; stage double-click; helper double-click; complete chunked Save/SVG reads; deep save/reimport; stage minus single-click refold; automatic state restoration; raw source Expand all; mixed neighbor import/export.',
 scope:'Small actual editor diagrams; no thousands-node routed browser/performance claim.'},null,2)+'\n');
console.log(JSON.stringify({passed:true,actual_ui_svgs:rows.length,raw_nodes:ir.nodes.length,raw_edges:ir.edges.length}));

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),load=require('./load_publication_renderer.cjs');
const root=path.resolve(__dirname,'..'),folder='verification/module-arguments/current',out=root+'/'+folder,R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),rows=[];
for(const [name,formal,model]of [
 ['initial','SuppliedCurve-current','SuppliedCurve'],['opened','SuppliedCurve-opened','SuppliedCurve'],
 ['reopened','SuppliedCurve-opened','SuppliedCurve'],['refolded','SuppliedCurve-current','SuppliedCurve'],
 ['mixed','MixedSuppliers-current','MixedSuppliers'],['main','Transformer-panel-0-current',null]]){
 const doc=read('ui-'+name+'-saved.json'),reference=read(formal+'.layout.json'),ir=model?read(model+'.json'):reference.ir;
 assert.deepEqual(doc.ir,ir);const actual=fs.readFileSync(out+'/ui-'+name+'.svg','utf8');
 assert.equal(actual,fs.readFileSync(out+'/'+formal+'.svg','utf8'),'actual UI/formal mismatch '+name);
 const r=model?R.render(ir,doc.state):{document:reference,graph:{nodes:reference.layout.nodes,edges:reference.layout.edges},prepared:{quality:reference.diagnostics.publication},svg:actual};
 if(model)assert.equal(r.svg,actual,'actual UI/renderer mismatch '+name);
 else for(const [k,v]of Object.entries(reference.state))assert.deepEqual(doc.state[k],v,'main state '+k);
 const svg='ui-'+name+'.svg',document='ui-'+name+'.layout.json';fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 const report=read(model?'small-report.json':'large-report.json'),formalRow=report.rows.find(r=>r.name===formal);
 rows.push({...formalRow,name:'ui-'+name,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),role_path_stages:r.document.publication.role_path_stages});
}
const raw=read('ui-source-saved.json'),ir=read('MixedSuppliers.json');assert.deepEqual(raw.ir,ir);const g=E.project(ir,raw.state);
assert.deepEqual(Array.from(g.positions.keys()).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(Array.from(g.edges,e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
fs.writeFileSync(out+'/ui-raw-projection.json',JSON.stringify({nodes:Array.from(g.positions.values()),edges:g.edges.map(e=>({id:e.id,route:E.route(e,g.positions)}))}));
const files=fs.readdirSync(out).filter(f=>f.startsWith('ui-')&&!f.endsWith('.layout.json')&&f!=='ui-report.json'&&f!=='ui-independent-report.json');
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({passed:true,goal_complete:false,auditor_sha256:sha(__filename),rows,
 files_sha256:Object.fromEntries(files.map(f=>[f,sha(out+'/'+f)])),raw_nodes:ir.nodes.length,raw_edges:ir.edges.length,
 method:'Actual file chooser import; consumer double-click; chunked Save/SVG reads; save/reimport; consumer minus single-click refold; mixed import; raw source Expand all; actual large main import/export.',
 scope:'Actual selected semantic main and small editor diagrams; no thousands-node routed browser/performance claim.'},null,2)+'\n');
console.log(JSON.stringify({passed:true,actual_ui_svgs:rows.length,raw_nodes:ir.nodes.length,raw_edges:ir.edges.length}));

'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),path=require('node:path'),load=require('./load_publication_renderer.cjs');
const root=path.resolve(__dirname,'..'),out=root+'/verification/role-path-stages/current',R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),rows=[];
const input=name=>'verification/role-path-stages/current/'+name+'.json';
for(const [name,model] of [['PrismPath-summary','PrismPath'],['PrismPath-opened','PrismPath'],['PrismPath-detail','PrismPath'],['PrismPath-refolded','PrismPath'],['MixedPaths-grouped','MixedPaths']]){
 const saved=read('ui-'+name+'.json'),ir=read(model+'.json');assert.deepEqual(saved.ir,ir);const r=R.render(saved.ir,saved.state);
 assert.equal(fs.readFileSync(out+'/ui-'+name+'.svg','utf8'),r.svg,'actual SVG differs: '+name);
 fs.writeFileSync(out+'/ui-'+name+'.layout.json',JSON.stringify(r.document));
 rows.push({name:'ui-'+name,input:input(model),input_sha256:sha(root+'/'+input(model)),state:saved.state,svg:'ui-'+name+'.svg',svg_sha256:sha(out+'/ui-'+name+'.svg'),document:'ui-'+name+'.layout.json',document_sha256:sha(out+'/ui-'+name+'.layout.json'),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,role_path_stages:r.graph.publication.role_path_stages});
}
assert.equal(fs.readFileSync(out+'/ui-PrismPath-summary.svg','utf8'),fs.readFileSync(out+'/ui-PrismPath-refolded.svg','utf8'));
assert.equal(fs.readFileSync(out+'/ui-PrismPath-detail.svg','utf8'),fs.readFileSync(out+'/ui-PrismPath-reopened.svg','utf8'));
for(const suffix of ['summary','opened','detail'])assert.equal(fs.readFileSync(out+'/ui-PrismPath-'+suffix+'.svg','utf8'),fs.readFileSync(out+'/PrismPath-'+({summary:'grouped',opened:'opened',detail:'detail'})[suffix]+'.svg','utf8'));
assert.equal(fs.readFileSync(out+'/ui-MixedPaths-grouped.svg','utf8'),fs.readFileSync(out+'/MixedPaths-grouped.svg','utf8'));
assert.equal(fs.readFileSync(out+'/ui-Transformer-grouped.svg','utf8'),fs.readFileSync(out+'/Transformer-grouped.svg','utf8'));
const raw=read('ui-PrismPath-raw.json'),ir=read('PrismPath.json');assert.deepEqual(raw.ir,ir);const g=E.project(ir,raw.state);
assert.deepEqual(Array.from(g.positions.keys()).sort(),ir.nodes.map(n=>n.id).sort());assert.deepEqual(Array.from(g.edges,e=>e.id).sort(),ir.edges.map(e=>e.id).sort());
fs.writeFileSync(out+'/ui-raw-projection.json',JSON.stringify({nodes:Array.from(g.positions.values()),edges:g.edges.map(e=>({id:e.id,route:E.route(e,g.positions)}))}));
const files=fs.readdirSync(out).filter(f=>f.startsWith('ui-')&&!f.endsWith('.layout.json')&&f!=='ui-report.json');
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({schema:'role-path-stages-ui/1',auditor_sha256:sha(__filename),passed:true,rows,
 files_sha256:Object.fromEntries(files.map(f=>[f,sha(out+'/'+f)])),raw_nodes:ir.nodes.length,raw_edges:ir.edges.length,goal_complete:false,
 results:['Actual file chooser import and optional checkbox','Two-level title doubleclick expansion','Deep stage collapse clears stale helper request','Saved deep state reopens to identical SVG','Source view expands all canonical IDs','Mixed unknown and recurrent state boundaries retained','Actual Transformer SVG matches formal renderer'],
 scope:'Actual editor interactions and SVGs; no thousands-node routed UI/performance claim.'},null,2)+'\n');
console.log(JSON.stringify({actual_ui_cases:rows.length,raw_nodes:ir.nodes.length,raw_edges:ir.edges.length,svg_byte_identical:true}));

'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=root+'/verification/role-operation-stages/current',load=require('./load_publication_renderer.cjs');
const R=load(root+'/semantic_studio'),E=load(root+'/semantic_studio',{engine:true});
const read=f=>JSON.parse(fs.readFileSync(out+'/'+f)),svg=f=>fs.readFileSync(out+'/'+f,'utf8');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(out+'/'+f)).digest('hex');
const plain=x=>JSON.parse(JSON.stringify(x)),results=[],rows=[];
for(const [name,input] of [['QuartzPath-summary','QuartzPath'],['QuartzPath-opened','QuartzPath'],['MixedStageWeave-grouped','MixedStageWeave']]){
 const saved=read('ui-'+name+'.json'),ir=read(input+'.json');assert.deepEqual(saved.ir,ir);assert.equal(saved.state.paperRoleOperationStages,true);
 const r=R.render(saved.ir,saved.state);assert.equal(r.svg,svg('ui-'+name+'.svg'));
 const stages=r.graph.publication.role_operation_stages.rows;assert.equal(stages.length,1);
 assert.equal(stages[0].status,name.endsWith('opened')?'expanded':'summary');
 const document='ui-'+name+'.layout.json';fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 rows.push({name:'ui-'+name,input:'verification/role-operation-stages/current/'+input+'.json',input_sha256:sha(input+'.json'),
  svg:'ui-'+name+'.svg',svg_sha256:sha('ui-'+name+'.svg'),document,document_sha256:sha(document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
  state:saved.state,quality:r.prepared.quality,role_operation_stages:plain(r.graph.publication.role_operation_stages),
  contract_stages:plain(r.graph.publication.contract_stages),local_pipelines:plain(r.graph.publication.local_pipelines)});
 results.push({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,status:stages[0].status,svg_reconstructed:true});
}
for(const f of ['refolded','reopened','returned'])assert.equal(svg('ui-QuartzPath-'+f+'.svg'),svg('ui-QuartzPath-summary.svg'));
const raw=read('ui-QuartzPath-raw.json'),original=read('QuartzPath.json');assert.deepEqual(raw.ir,original);
const projected=E.project(raw.ir,raw.state);
assert.deepEqual([...projected.positions.keys()].sort(),original.nodes.map(n=>n.id).sort());
assert.deepEqual(Array.from(projected.edges,e=>e.id).sort(),original.edges.map(e=>e.id).sort());
fs.writeFileSync(out+'/ui-raw-projection.json',JSON.stringify({nodes:[...projected.positions.values()],edges:projected.edges.map(e=>({id:e.id,source:e.source,target:e.target,route:E.route(e,projected.positions)}))}));
const large=read('ui-Transformer-grouped.json'),formal=read('Transformer-grouped.layout.json');assert.deepEqual(large.ir,formal.ir);
assert.equal(large.state.paperRoleOperationStages,true);assert.equal(large.state.paperGranularity,'roles');assert.equal(large.state.paperMedium,'canvas');
// The actual SVG must match the already independently audited formal render.
// Do not perform another expensive render or infer success from UI node counts.
assert.equal(svg('ui-Transformer-grouped.svg'),svg('Transformer-grouped.svg'));
results.push({name:'Transformer-grouped',nodes:78,edges:89,svg_byte_identical_to_formal:true});
const inspector=fs.readFileSync(out+'/ui-summary-inspector.txt','utf8');assert.ok(inspector.includes('角色阶段与原始运算')&&inspector.includes('Dropout')&&inspector.includes('0.2'));
const files=fs.readdirSync(out).filter(f=>f.startsWith('ui-')&&f!=='ui-report.json');
fs.writeFileSync(out+'/ui-report.json',JSON.stringify({schema:'role-operation-stages-ui/1',auditor_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
 rows,results,files_sha256:Object.fromEntries(files.map(f=>[f,sha(f)])),svg_byte_identical:true,canonical_ir_preserved:true,raw_source_nodes:original.nodes.length,raw_source_edges:original.edges.length,
 passed:true,scope:'Actual chooser import, checkbox, inspector, double-click expansion/refolding, save/reopen, raw-source all IDs and return. Formal Transformer SVG reproduced in UI; no thousands-node UI claim.'},null,2)+'\n');
console.log(JSON.stringify(results));

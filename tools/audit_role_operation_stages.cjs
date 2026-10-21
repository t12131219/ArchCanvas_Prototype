'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),assert=require('node:assert/strict'),load=require('./load_publication_renderer.cjs');
const root=path.resolve(__dirname,'..'),out=root+'/verification/role-operation-stages/current',frozen='/tmp/archcanvas-role-operation-stages-before';
const R=load(root+'/semantic_studio'),B=load(frozen),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f),...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),'tools/load_publication_renderer.cjs','tools/audit_role_operation_stages.cjs'];
const implementation_sha256=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)]));
const baseline=JSON.parse(fs.readFileSync(frozen+'/snapshot.json'));for(const [f,h]of Object.entries(baseline.files))assert.equal(sha(frozen+'/'+path.basename(f)),h);
const rows=[],comparisons=[];const large=process.argv.includes('--large');
function render(name,input,state,renderer){
 const ir=JSON.parse(fs.readFileSync(root+'/'+input)),before=JSON.stringify(ir),r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),before);
 for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.slice().sort(),items.map(n=>n.id).sort());}
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),state,svg,svg_sha256:sha(out+'/'+svg),document,document_sha256:sha(out+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,
  local_pipelines:r.graph.publication.local_pipelines,role_operation_stages:r.graph.publication.role_operation_stages||null,expression_coverage:r.graph.expression_coverage,summary_coverage:r.graph.summary_coverage});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,width:r.prepared.quality.native_width_px,height:r.prepared.quality.native_height_px,crossings:r.prepared.quality.line_geometry.crossings,issues:r.prepared.quality.issues,stages:r.graph.publication.role_operation_stages?.rows.length||0}));return r;
}
const fixtures=JSON.parse(fs.readFileSync(out+'/fixture-extraction.json'));
const inputs=large?[{name:'Transformer',input:'verification/helper-contracts/current/Transformer-current.json'}]:fixtures.rows;
for(const {name,input}of inputs){
 const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
 const b=render(name+'-before',input,state,B),d=render(name+'-default',input,state,R);assert.equal(b.svg,d.svg,'unchanged default');
 const g=render(name+'-grouped',input,{...state,paperRoleOperationStages:true},R),stage=g.graph.publication.role_operation_stages?.rows[0];
 let opened=null;if(stage&&!large){opened=name+'-opened';render(opened,input,{...state,paperRoleOperationStages:true,paperAuto:false,open:[...g.graph.publication.open,stage.node]},R);}
 comparisons.push({name,before:name+'-before',current:name+'-grouped',default:name+'-default',opened});
}
for(const [f,h]of Object.entries(implementation_sha256))assert.equal(sha(root+'/'+f),h,'producer changed');
fs.writeFileSync(out+'/'+(large?'large':'small')+'-render-report.json',JSON.stringify({schema:'role-operation-stages-render/1',implementation_sha256,baseline,rows,comparisons,goal_complete:false},null,2)+'\n');

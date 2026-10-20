'use strict';
// Compare real source-derived frontiers against the frozen previous producer.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/role-identity/experiment',out=path.join(root,folder);
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const snapshot=JSON.parse(fs.readFileSync(path.join(out,'snapshot.json')));
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(folder+'/before/'+path.basename(f)),h);
const current=require('../semantic_studio/publication-renderer.js'),before=require('./load_publication_renderer.cjs')(path.join(out,'before'));
const files=[...Object.keys(snapshot.files),'tests/role-identity.test.cjs','tools/audit_role_identity.cjs','tools/check_role_identity.py','tools/build_role_identity_review.py','tools/audit_role_path_receipts.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[];
const state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
const cases=[
 ...['BoundedWeave','MixedBoundary','ConditionalWeave'].map(n=>[n,'verification/adaptive-role-paths/current/'+n+'.json']),
 ['SameSource','verification/semantic-design/current/after/SameSource.json'],
 ...['ConditionalCarry','SharedMismatch','BrokenCell'].map(n=>[n,'verification/local-relations/current/'+n+'.json']),
 ['GatedMixture','verification/semantic-design/current/after/GatedMixture.json']
];
for(const [name,input]of cases){
 const ir=JSON.parse(fs.readFileSync(path.join(root,input))),original=JSON.stringify(ir),pair=[];
 for(const [variant,renderer]of [['before',before],['current',current]]){
  const r=renderer.render(ir,state),document=name+'-'+variant+'.layout.json',svg=name+'-'+variant+'.svg';
  assert.equal(JSON.stringify(ir),original);assert.equal(JSON.stringify(r.document.ir),original);
  fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document));
  const row={name:name+'-'+variant,case:name,variant,input,input_sha256:sha(input),state,svg,document,
   svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,
   quality:r.prepared.quality,contract_stages:r.document.publication.contract_stages,local_pipelines:r.document.publication.local_pipelines};
  rows.push(row);pair.push(r);
 }
 const [a,b]=pair,geometry=r=>({nodes:r.document.layout.nodes.map(({title,caption,lines,captions,...n})=>n),edges:r.document.layout.edges});
 const annotations=r=>(r.document.publication.role_frontier?.roles||[]).map(({role_keys,...r})=>r);
 assert.deepEqual(JSON.parse(JSON.stringify(annotations(b))),JSON.parse(JSON.stringify(annotations(a))));
 assert.deepEqual(JSON.parse(JSON.stringify(b.graph.node_accounting)),JSON.parse(JSON.stringify(a.graph.node_accounting)));
 assert.deepEqual(JSON.parse(JSON.stringify(b.graph.edge_accounting)),JSON.parse(JSON.stringify(a.graph.edge_accounting)));
 const changed=b.document.layout.nodes.filter(n=>a.document.layout.nodes.find(m=>m.id===n.id)?.title!==n.title).map(n=>({node:n.id,before:a.document.layout.nodes.find(m=>m.id===n.id)?.title,current:n.title}));
  const comparison={name,geometry_equal:JSON.stringify(geometry(a))===JSON.stringify(geometry(b)),quality_equal:JSON.stringify(a.prepared.quality)===JSON.stringify(b.prepared.quality),
  routes_equal:JSON.stringify(a.document.layout.edges)===JSON.stringify(b.document.layout.edges),
  changed_node_geometry:b.document.layout.nodes.filter(n=>{const old=a.document.layout.nodes.find(m=>m.id===n.id);return ['x','y','w','h'].some(k=>n[k]!==old?.[k]);}).map(n=>({node:n.id,before:Object.fromEntries(['x','y','w','h'].map(k=>[k,a.document.layout.nodes.find(m=>m.id===n.id)[k]])),current:Object.fromEntries(['x','y','w','h'].map(k=>[k,n[k]]))})),
  svg_equal:a.svg===b.svg,canonical_ir_unchanged:true,role_annotations_preserved:true,changed_titles:changed};
 comparisons.push(comparison);console.log(JSON.stringify(comparison));
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h,'producer changed: '+f);
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({schema:'role-identity-render/1',status:'complete',implementation_sha256:hashes,
 baseline:folder+'/snapshot.json',baseline_sha256:sha(folder+'/snapshot.json'),rows,comparisons,goal_complete:false,
 scope:'Exact role keys, contextual numeric member titles and actual SVG source bindings. No new family recognition or Transformer convergence claim.'},null,2)+'\n');

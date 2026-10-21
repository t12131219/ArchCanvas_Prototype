'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/serial-paths/experiment',out=path.join(root,folder);
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const snapshot=JSON.parse(fs.readFileSync(out+'/snapshot.json'));
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(folder+'/before/'+path.basename(f)),h);
const before=require('./load_publication_renderer.cjs')(out+'/before'),current=require('../semantic_studio/publication-renderer.js');
const files=[...Object.keys(snapshot.files),'tests/serial-paths.test.cjs','tests/semantic_fixtures/serial_paths.py','tools/audit_serial_paths.cjs','tools/audit_local_svg.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[];
const state={paperMedium:'canvas',paperGranularity:'roles'},adaptive={...state,paperAdaptive:true,paperAdaptivePolicy:'structure'};
const cases=[...JSON.parse(fs.readFileSync(out+'/fixture-extraction.json')).rows.map(r=>[r.entry,r.input,state]),
 ...['BoundedWeave','MixedBoundary','ConditionalWeave'].map(n=>[n,'verification/adaptive-role-paths/current/'+n+'.json',adaptive]),
 ['Transformer-fixed','verification/helper-contracts/current/Transformer-current.json',state],
 ['SameSource','verification/semantic-design/current/after/SameSource.json',adaptive],
 ['GatedMixture','verification/semantic-design/current/after/GatedMixture.json',adaptive]];
const requestedInput='verification/adaptive-role-paths/current/BoundedWeave.json',requestedIr=JSON.parse(fs.readFileSync(path.join(root,requestedInput))),
 requestedCertificate=requestedIr.semantic_contracts.find(c=>c.roles?.numerical_guards?.length);
cases.push(['Bounded-requested',requestedInput,{...state,paperRolePaths:[{node:requestedCertificate.node,certificate:requestedCertificate.id,role:['numerical_guards','0']}]}]);
function record(name,caseName,variant,input,settings,r){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 const row={name,case:caseName,variant,input,input_sha256:sha(input),state:settings,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
 nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,local_pipelines:r.document.publication.local_pipelines,contract_stages:r.document.publication.contract_stages};
 rows.push(row);return row;
}
for(const [name,input,settings]of cases){
 const ir=JSON.parse(fs.readFileSync(path.join(root,input))),original=JSON.stringify(ir),pair=[];
 for(const [variant,R]of [['before',before],['current',current]]){
  console.log('START '+name+' '+variant);
  const r=R.render(ir,settings);assert.equal(JSON.stringify(ir),original);assert.equal(JSON.stringify(r.document.ir),original);
  assert.deepEqual(JSON.parse(JSON.stringify(r.prepared.quality.issues)),[]);
  for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(r.graph[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
  pair.push(r);record(name+'-'+variant,name,variant,input,settings,r);
 }
 const [a,b]=pair;const comparison={name,before:{nodes:a.graph.nodes.length,edges:a.graph.edges.length,width:a.prepared.quality.native_width_px,height:a.prepared.quality.native_height_px,crossings:a.prepared.quality.line_geometry.crossings},
 current:{nodes:b.graph.nodes.length,edges:b.graph.edges.length,width:b.prepared.quality.native_width_px,height:b.prepared.quality.native_height_px,crossings:b.prepared.quality.line_geometry.crossings},
 canonical_ir_unchanged:true,svg_equal:a.svg===b.svg,routes_equal:JSON.stringify(a.document.layout.edges)===JSON.stringify(b.document.layout.edges)};
 comparisons.push(comparison);console.log(JSON.stringify(comparison));
 if(name==='LongCurve'){
  const p=b.graph.publication.local_pipelines.rows.find(p=>p.path_display),base=b.graph.publication.open;
  const sequence=[['frame',{...state,paperAuto:false,open:[...base,p.node]}],['operations',{...state,paperAuto:false,open:[...base,...p.source_boundaries.map(b=>b.node),...p.display_partitions.map(b=>b.node)]}]];
  for(const [variant,settings]of sequence){const r=current.render(ir,settings);record(name+'-'+variant,name,variant,input,settings,r);assert.deepEqual(r.prepared.quality.issues,[]);}
  fs.writeFileSync(out+'/LongCurve-ui-import.json',JSON.stringify({schema:'semantic-canvas/1',ir,state:{...state,view:'publication',mode:'source'}},null,2)+'\n');
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h,'producer changed during render: '+f);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'serial-paths-render/1',status:'complete',implementation_sha256:hashes,
 baseline:folder+'/snapshot.json',baseline_sha256:sha(folder+'/snapshot.json'),rows,comparisons,goal_complete:false,
 scope:'Long source dependency paths through exact structural partitions; individual calls/configurations retained. Transformer-fixed has no adaptive search. The original full adaptive comparison remains pending.'},null,2)+'\n');

/* Boundary endpoints are geometric targets; protected interiors are not. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/boundary-inputs/current',out=root+'/'+folder,commit='33c38ba',baseline='/tmp/archcanvas-boundary-before-33c38ba';fs.mkdirSync(out,{recursive:true});fs.mkdirSync(baseline,{recursive:true});
const read=f=>JSON.parse(fs.readFileSync(root+'/'+f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const snapshot=read(folder+'/snapshot.json'),frozen=snapshot.files,files=Object.keys(frozen);assert.equal(snapshot.commit,commit);
for(const [f,h]of Object.entries(frozen))assert.equal(sha(baseline+'/'+path.basename(f)),h);
const load=require('./load_publication_renderer.cjs'),old=load(baseline),{renderer:R,diagrams:D}=load(root+'/semantic_studio',{diagramSet:true});
const producerFiles=[...files,'tools/audit_boundary_inputs.cjs','tools/extract_boundary_inputs.py','tests/input-docks.test.cjs','tests/semantic_fixtures/boundary_inputs.py'];
const hashes=Object.fromEntries(producerFiles.map(f=>[f,sha(root+'/'+f)])),rows=[],comparisons=[];
function save(name,input,r){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),state:r.document.state,svg,document,svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:r.document.layout.nodes.length,edges:r.document.layout.edges.length,quality:r.document.diagnostics.publication});
 return name;
}
const identity=d=>JSON.stringify({ir:d.ir,nodes:d.layout.nodes.map(n=>n.id),edges:d.layout.edges.map(e=>({id:e.id,source:e.source,target:e.target,source_port:e.source_port,target_port:e.target_port,kind:e.kind,condition:e.condition,originals:e.originals,bundle_members:e.bundle_members})),
 open:d.publication.open,node_accounting:d.layout.node_accounting,edge_accounting:d.layout.edge_accounting,boundary:d.publication.boundary,roles:d.publication.role_frontier});
let joint=null;
if(process.argv.includes('--large')){
 const source='verification/cohort-folds/current',report=read(source+'/large-render-report.json'),initial=[];let main;
 for(const [i,name]of ['Transformer-current-trial-1','Transformer-current-trial-2','Transformer-current-trial-3'].entries()){
  const row=report.rows.find(r=>r.name===name),doc=read(source+'/'+row.document);assert.equal(sha(root+'/'+source+'/'+row.document),row.document_sha256);assert.equal(sha(root+'/'+source+'/'+row.svg),row.svg_sha256);
  assert.equal(row.svg_sha256,snapshot.artifacts[source+'/'+row.svg]);
  const input=row.input,before=save(name+'-before',input,{svg:fs.readFileSync(root+'/'+source+'/'+row.svg,'utf8'),document:doc});
  console.log('START '+name);const r=R.render(doc.ir,doc.state),after=save(name+'-current',input,r);assert.equal(identity(doc),identity(r.document));
  comparisons.push({name,before,after,receipt:r.prepared.routing.input_dock_refinement||null});
  initial.push({id:i?'recovery:'+r.graph.publication.focus:'main',anchor:i?r.graph.publication.focus:null,label:i?'Exact instance detail':'Main',state:doc.state,result:r,refinable:!!i});if(!i)main=r;
  console.log(JSON.stringify({name,crossings:r.prepared.quality.line_geometry.crossings}));
 }
 let seq=0;const captures=new Map(initial.map((p,i)=>[p.result,comparisons[i].after]));
 const renderer={render:(ir,s)=>{console.log('START joint trial '+(seq+1));const r=R.render(ir,s);captures.set(r,save('Transformer-refinement-'+(++seq),rows[0].input,r));return r;}};
 const set=D.joint(main.document.ir,initial[0].state,renderer,{main,initialPanels:initial,maxPanels:3,maxTrials:1});
 joint={plan:set.plan,initial_panels:initial.map(p=>({id:p.id,capture:captures.get(p.result)})),panels:set.panels.map(({result,...p})=>({...p,capture:captures.get(result)})),attempts:set.attempts,baseline_coverage:set.baseline_coverage,coverage:set.coverage,limits:set.limits};
 console.log(JSON.stringify({before:set.baseline_coverage.filter(r=>r.status==='fulfilled').length,after:set.coverage.filter(r=>r.status==='fulfilled').length,attempts:set.attempts.map(a=>({target:a.target_panel,accepted:a.accepted,reasons:a.reasons}))}));
}else{
 for(const e of read(folder+'/extraction.json').rows){
  const ir=read(e.input),original=JSON.stringify(ir),s={paperMedium:'canvas',paperGranularity:'roles'};
  console.log('START '+e.name);const a=old.render(ir,s),b=R.render(ir,s);assert.equal(JSON.stringify(ir),original);assert.equal(identity(a.document),identity(b.document));
  const before=save(e.name+'-before',e.input,a),after=save(e.name+'-current',e.input,b);comparisons.push({name:e.name,before,after,receipt:b.prepared.routing.input_dock_refinement||null});
  console.log(JSON.stringify({name:e.name,before:a.prepared.quality.line_geometry.crossings,after:b.prepared.quality.line_geometry.crossings,accepted:b.prepared.routing.input_dock_refinement?.accepted}));
  if(e.name==='UnknownWorkshop'){
   // An explicit geometry view demonstrates the endpoint primitive even
   // when automatic selection rejects its width cost. Do not call it chosen.
   const explicit={...s,paperInputDocks:true},x=old.render(ir,explicit),y=R.render(ir,explicit);
   assert.equal(identity(x.document),identity(y.document));
   comparisons.push({name:e.name+'-explicit',before:save(e.name+'-explicit-before',e.input,x),after:save(e.name+'-explicit-current',e.input,y),receipt:null,explicit:true});
  }
 }
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale producer '+f);
const large=process.argv.includes('--large');fs.writeFileSync(out+'/'+(large?'large':'small')+'-report.json',JSON.stringify({schema:'boundary-inputs/1',implementation_sha256:hashes,baseline:{commit,files:frozen},rows,comparisons,joint,goal_complete:false},null,2)+'\n');

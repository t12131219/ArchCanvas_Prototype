/* Independent fact comparisons use the assembled document itself, before the
 * sourceIR baseline shortcut. Projection checks do not claim SVG/visual QA. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');process.chdir(root);
const A=require('../semantic_studio/authoring-model'),E=require('../semantic_studio/semantic-engine'),P=require('../semantic_studio/publication'),C=require('../semantic_studio/composition-layout');
const out=path.join(root,'verification/authoring/current');fs.mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p)),sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const ordered=rows=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));
function partition(rows,accounting){
 const ids=Object.values(accounting).flat(),expected=rows.map(r=>r.id);
 assert.equal(ids.length,expected.length);assert.equal(new Set(ids).size,expected.length);assert.deepEqual(ids.slice().sort(),expected.slice().sort());
 return Object.fromEntries(Object.entries(accounting).map(([key,values])=>[key,values.length]));
}
const results=[];
for(const model of read('data/semantic/catalog.json').models){
 const file='data/semantic/'+model.ir,bytes=fs.readFileSync(file,'utf8'),ir=JSON.parse(bytes),record={id:model.id,title:model.title,file,input_sha256:sha(bytes),nodes:ir.nodes.length,edges:ir.edges.length,rebuilds:[]};
 for(const atomic of [false,true]){
  const recipe=A.recipe(ir,{atomic}),doc=A.empty(ir.title);doc.recipe={parents:recipe.parents,baseline:ir};
  for(const part of recipe.parts.slice().reverse())A.add(doc,part,{keepIdentity:true});
  for(const edge of recipe.connections)A.restoreConnection(doc,edge);A.validate(doc);
  assert.deepEqual(ordered(doc.nodes),ordered(ir.nodes),model.title+' direct node facts');
  assert.deepEqual(ordered(doc.edges),ordered(ir.edges),model.title+' direct edge facts');
  assert.deepEqual(A.sourceIR(doc),ir);assert.equal(fs.readFileSync(file,'utf8'),bytes);
  record.rebuilds.push({granularity:atomic?'raw-node':'source-component',components:recipe.parts.length,connections:recipe.connections.length,
   original_nodes_sha256:sha(ordered(ir.nodes)),assembled_nodes_sha256:sha(ordered(doc.nodes)),original_edges_sha256:sha(ordered(ir.edges)),assembled_edges_sha256:sha(ordered(doc.edges)),exact:true});
 }
 record.projections=[];
 for(const name of ['overview','detail','full-source']){
  const state=name==='full-source'?P.fullyExpanded(ir,{view:'publication',mode:'merged'},E):C.frontier({mode:'merged'},name);
  const graph=E.project(ir,state),nodes=partition(ir.nodes,graph.node_accounting),edges=partition(ir.edges,graph.edge_accounting);
  if(name==='full-source'){assert.equal(graph.nodes.length,ir.nodes.length);assert.equal(graph.edges.length,ir.edges.length);}
  record.projections.push({state:name,visible_nodes:graph.nodes.length,visible_edges:graph.edges.length,node_accounting:nodes,edge_accounting:edges});
 }
 results.push(record);
}
const files=['semantic_studio/authoring-model.js','semantic_studio/authoring-app.js','semantic_adapter/authoring.py','tools/serve_semantic_studio.py','data/semantic/authoring-presets.json','tools/audit_authoring.cjs'];
const report={schema:'semantic-authoring-audit/1',passed:true,model_count:results.length,reconstruction_count:results.length*2,projection_count:results.length*3,
 scope:'Programmatic reconstruction from empty documents, direct complete fact comparison including source ownership, identity, operand slots, conditions and runtime facts; partition completeness in ordinary F0/F1/full-source projection. This is not a manual UI test of every model or a fresh SVG layout-quality audit.',
 implementation_sha256:Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(file,'utf8'))])),models:results};
fs.writeFileSync(path.join(out,'assembly-audit.json'),JSON.stringify(report,null,2)+'\n');
const uiFile=path.join(out,'ui-built-document.json');
if(fs.existsSync(uiFile)){
 const doc=read(uiFile),draft=A.sourceIR(doc);A.validate(doc);
 const {spawnSync}=require('node:child_process');
 // Regular files avoid platform-specific synchronous pipe limits for large IR.
 const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'archcanvas-authoring-audit-'));
 let response;const handles=[];
 try{fs.writeFileSync(path.join(tmp,'input.json'),JSON.stringify({_operation:'certify',ir:draft}));
  for(const [name,mode]of [['input.json','r'],['output.json','w'],['error.txt','w']])handles.push(fs.openSync(path.join(tmp,name),mode));
  const child=spawnSync('python3',['tools/serve_semantic_studio.py','--compile-worker'],{stdio:handles,timeout:30000});
  assert.equal(child.status,0,fs.readFileSync(path.join(tmp,'error.txt'),'utf8')||child.error?.message);
  response=JSON.parse(fs.readFileSync(path.join(tmp,'output.json'),'utf8'));
 }finally{handles.forEach(fd=>fs.closeSync(fd));fs.rmSync(tmp,{recursive:true,force:true});}
 assert.equal(response.ok,true,response.error);const ir=response.ir;E.validate(ir);
 assert.deepEqual(ir.edges,doc.edges);assert.ok(doc.nodes.every(n=>ir.nodes.some(v=>v.id===n.id)));assert.ok(ir.semantic_contracts.length);
 assert.ok(ir.semantic_contracts.every(c=>c.scope.includes('declared user assembly')));assert.equal(ir.runtime.model_executed,false);
 const R=require('../semantic_studio/publication-renderer'),state={...C.frontier({mode:'merged'},'detail'),paperAuto:true,paperDirection:'up'},rendered=R.render(ir,state);
 fs.writeFileSync(path.join(out,'ui-built-ir.json'),JSON.stringify(ir,null,2)+'\n');fs.writeFileSync(path.join(out,'ui-built-preview.svg'),rendered.svg);
 fs.writeFileSync(path.join(out,'ui-built-audit.json'),JSON.stringify({schema:'semantic-authoring-ui-artifact-audit/1',passed:true,
  scope:'Actual document read from the browser Save dialog after manual assembly and delete/undo. Preview SVG is regenerated by the unchanged production renderer, rather than a browser screenshot.',
  raw_nodes:doc.nodes.length,raw_edges:doc.edges.length,preview_ir_nodes:ir.nodes.length,preview_ir_edges:ir.edges.length,visible_nodes:rendered.graph.nodes.length,visible_edges:rendered.graph.edges.length,
  contracts:ir.semantic_contracts.map(c=>({rule:c.rule,scope:c.scope})),document_sha256:sha(fs.readFileSync(uiFile,'utf8')),exact_edges_preserved:true,source_text_preserved:Object.values(doc.modules).filter(m=>m.source).length,
  quality:rendered.prepared.quality},null,2)+'\n');
}
console.log(JSON.stringify({passed:true,models:results.length,reconstructions:results.length*2,projections:results.length*3}));

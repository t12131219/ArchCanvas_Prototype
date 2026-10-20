'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/helper-contracts/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-40-before-helper-contracts',snapshot=read(checkpoint+'/snapshot.json');
for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const extraction=read(folder+'/extraction.json'),priorFolder='verification/role-source-frames/current',prior=read(priorFolder+'/render-report.json');
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 'tools/audit_helper_contracts.cjs','tools/extract_helper_contracts.py','tests/helper-contracts.test.cjs','tests/test_helper_contracts.py','tests/semantic_fixtures/helper_contracts.py','tools/audit_local_svg.py'];
const implementation=Object.fromEntries(files.map(f=>[f,sha(f)])),rows=[],comparisons=[];
function save(name,input,state,r,provenance){
 const ir=read(input),d=r.document;assert.deepEqual(JSON.parse(JSON.stringify(d.ir)),ir);
 fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(d));
 const row={name,input,state,input_sha256:sha(input),svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(folder+'/'+name+'.svg'),document_sha256:sha(folder+'/'+name+'.layout.json'),
  nodes:d.layout.nodes.length,edges:d.layout.edges.length,quality:d.diagnostics.publication,contract_stages:d.publication.contract_stages,local_pipelines:d.publication.local_pipelines,...(provenance?{provenance}:{})};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,issues:row.quality.issues}));return r;
}
function render(name,input,state,renderer){const ir=read(input),before=JSON.stringify(ir),r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),before);return save(name,input,state,r);}
function finish(name,a,b){const geometry=r=>JSON.stringify({nodes:r.document.layout.nodes,edges:r.document.layout.edges,labels:r.document.layout.labels});
 comparisons.push({name,geometry_unchanged:geometry(a)===geometry(b),svg_unchanged:a.svg===b.svg,
  before:{nodes:a.document.layout.nodes.length,edges:a.document.layout.edges.length,width:a.prepared.quality.native_width_px,height:a.prepared.quality.native_height_px,crossings:a.prepared.quality.line_geometry.crossings},
  current:{nodes:b.document.layout.nodes.length,edges:b.document.layout.edges.length,width:b.prepared.quality.native_width_px,height:b.prepared.quality.native_height_px,crossings:b.prepared.quality.line_geometry.crossings}});
}
const base={paperMedium:'canvas',paperGranularity:'roles'};
for(const item of extraction.rows.filter(r=>r.entry!=='Transformer')){
 const a=render(item.entry+'-before',item.before.input,base,old),b=render(item.entry+'-current',item.current.input,base,R);finish(item.entry,a,b);
}
const split=extraction.rows.find(r=>r.entry==='SplitChain').current.input;
render('SplitChain-source-frames',split,{...base,paperFrameView:'source'},R);
render('SplitChain-further',split,{...base,paperFrameView:'source',paperGranularity:'details',paperAuto:false,open:read(split).nodes.map(n=>n.id)},R);
const transformer=extraction.rows.find(r=>r.entry==='Transformer');
for(const name of ['transformer-main','transformer-fixed-path','transformer-fixed-core']){
 const p=prior.rows.find(r=>r.name===name+'-current');assert.ok(p);
 assert.equal(sha(priorFolder+'/'+p.svg),p.svg_sha256);assert.equal(sha(priorFolder+'/'+p.document),p.document_sha256);
 const d=read(priorFolder+'/'+p.document);assert.deepEqual(d.ir,read(transformer.before.input));
 const a=save(name+'-before',transformer.before.input,p.state,{document:d,svg:fs.readFileSync(path.join(root,priorFolder,p.svg),'utf8'),prepared:{quality:d.diagnostics.publication}},
  {kind:'existing-actual-SVG',report:priorFolder+'/render-report.json',report_sha256:sha(priorFolder+'/render-report.json'),row:p.name,scope:'Exact frozen implementation and byte-identical old IR; actual routed baseline reused without relabeling its evidence.'});
 const b=render(name+'-current',transformer.current.input,p.state,R);finish(name,a,b);
}
for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'helper-contracts-render/1',implementation_sha256:implementation,checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),rows,comparisons,reference:prior.reference,goal_complete:false},null,2)+'\n');

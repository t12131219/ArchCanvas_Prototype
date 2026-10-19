#!/usr/bin/env node
/* Compare presentation changes without pretending derived region IDs are stable.
 * All external models remain extracted JSON data. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dest='verification/publication/configuration/',snap='verification/publication/configuration-baseline/';
const read=f=>JSON.parse(fs.readFileSync(path.resolve(root,f))),json=x=>JSON.parse(JSON.stringify(x));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,f))).digest('hex');
const save=(name,value)=>fs.writeFileSync(path.join(root,dest,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
const before=read(snap+'corpus-report.json'),after=read(dest+'corpus-report.json'),baseline=read(snap+'baseline.json');
for(const [f,h]of Object.entries(baseline.implementation_sha256))assert.equal(sha(snap+f),h);
for(const [f,h]of Object.entries(after.implementation_sha256))assert.equal(sha(f),h);
assert.equal(before.audit_digest,baseline.audit_digest);assert.deepEqual(before.extraction_implementation_sha256,after.extraction_implementation_sha256);
const load=require('./load_publication_renderer.cjs'),B=load(path.join(root,snap,'semantic_studio')),R=load(path.join(root,'semantic_studio'));
const extraction=read('verification/architecture/corpus/extraction.json'),old=new Map(before.results.map(r=>[JSON.stringify([r.id,r.focus]),r]));
const newKeys=new Set(after.results.map(r=>JSON.stringify([r.id,r.focus]))),irs=new Map(),oldPlans=new Map(),newPlans=new Map();
const changed=[],increases=[],improvements=[],added=[],removed=[],proofs=[];let common=0,identical=0,commonBefore=0,commonAfter=0;
function accounting(ir,g){for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length);assert.deepEqual(ids.sort(),items.map(i=>i.id).sort());}}
const cutRows=g=>g.publication.boundary.map(e=>Object.fromEntries(['id','source','target','source_port','target_port','kind','evidence','condition'].filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))).sort((a,b)=>a.id.localeCompare(b.id));
for(const row of after.results){
  if(!irs.has(row.id)){
    const item=extraction.results.find(i=>i.id===row.id),ir=read('verification/architecture/corpus/'+item.ir);irs.set(row.id,ir);
    const a=B.render(ir,{}),b=R.render(ir,{});oldPlans.set(row.id,a.graph.architecture);newPlans.set(row.id,b.graph.architecture);
    for(const n of ir.nodes)assert.ok(b.graph.architecture.nodes.some(p=>p.id===n.id),'canonical node missing');
    const semantic=p=>p.findings.filter(f=>f.evidence_scope!=='presentation').map(f=>({id:f.id,rule:f.rule,members:f.members,roles:f.roles,proof:f.proof}));
    assert.deepEqual(json(semantic(a.graph.architecture)),json(semantic(b.graph.architecture)),'semantic facts changed');
    const literal=b.graph.publication.configuration_arithmetic.filter(p=>p.kind==='literal-arithmetic');
    if(literal.length)proofs.push({id:row.id,entry:row.entry,nodes:literal});
    if(row.id==='2db9b47ab2ea'){save('ConvNet-before.svg',a.svg);save('ConvNet-after.svg',b.svg);save('ConvNet.layout.json',b.document);}
  }
  const ir=irs.get(row.id),canonical=JSON.stringify(ir),state={paperFocus:row.focus},b=R.render(ir,state);accounting(ir,b.graph);
  assert.deepEqual(json(b.prepared.quality),Object.fromEntries(Object.keys(b.prepared.quality).map(k=>[k,row[k]])));
  const prior=old.get(JSON.stringify([row.id,row.focus]));
  if(!prior){const n=newPlans.get(row.id).nodes.find(n=>n.id===row.focus);assert.ok(n?.presentation_only);added.push({id:row.id,entry:row.entry,focus:row.focus,type:n.semantic_type});continue;}
  common++;const a=B.render(ir,state);accounting(ir,a.graph);
  assert.deepEqual(json(a.prepared.quality),Object.fromEntries(Object.keys(a.prepared.quality).map(k=>[k,prior[k]])),'baseline report was not reproduced');
  assert.equal(a.graph.publication.unknowns,b.graph.publication.unknowns,'unknown count changed in a common scope');
  assert.deepEqual(json(cutRows(a.graph)),json(cutRows(b.graph)),'canonical cuts differ');
  assert.equal(JSON.stringify(ir),canonical);identical+=a.svg===b.svg;
  const p=a.prepared.quality,q=b.prepared.quality;commonBefore+=p.line_geometry.crossings;commonAfter+=q.line_geometry.crossings;
  if(a.svg!==b.svg){
    const result={id:row.id,entry:row.entry,focus:row.focus,before:{nodes:a.graph.nodes.length,crossings:p.line_geometry.crossings,font:p.min_print_font_pt,wire:p.wire_length,height:p.height_mm},
      after:{nodes:b.graph.nodes.length,crossings:q.line_geometry.crossings,font:q.min_print_font_pt,wire:q.wire_length,height:q.height_mm}};changed.push(result);
    if(q.line_geometry.crossings>p.line_geometry.crossings){
      const key=row.id+'-'+crypto.createHash('sha256').update(String(row.focus)).digest('hex').slice(0,8);
      save(key+'-before.svg',a.svg);save(key+'-after.svg',b.svg);save(key+'.layout.json',b.document);
      increases.push({...result,before_svg:key+'-before.svg',after_svg:key+'-after.svg',document:key+'.layout.json'});
    }
    if(q.line_geometry.crossings<p.line_geometry.crossings)improvements.push(result);
  }
}
for(const prior of before.results)if(!newKeys.has(JSON.stringify([prior.id,prior.focus]))){
  const p=oldPlans.get(prior.id),n=p.nodes.find(n=>n.id===prior.focus),finding=p.findings.find(f=>f.id===n?.finding);
  assert.ok(n?.presentation_only&&finding?.evidence_scope==='presentation','a semantic/source scope disappeared');
  removed.push({id:prior.id,entry:prior.entry,focus:prior.focus,type:n.semantic_type,canonical_members:n.canonical_members,reason:'Topology partition changed after excluding proven configuration-only units; no canonical node is removed.'});
}
const original=read('data/semantic/architecture/ShapeDrivenFusion.json'),originalA=B.render(original,{}),originalB=R.render(original,{});accounting(original,originalB.graph);
save('ShapeDrivenFusion-before.svg',originalA.svg);save('ShapeDrivenFusion-after.svg',originalB.svg);save('ShapeDrivenFusion.layout.json',originalB.document);
const sourceManifest=read('verification/architecture/corpus/manifest-before.json'),actual=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile())actual.push({path:path.relative(extraction.source_root,file),sha256:sha(file)});}}
walk(extraction.source_root);assert.deepEqual(actual.sort((a,b)=>a.path.localeCompare(b.path)),sourceManifest.slice().sort((a,b)=>a.path.localeCompare(b.path)));
const implementation={...after.implementation_sha256};for(const name of ['semantic_studio/index.html','semantic_studio/app.js','tools/compare_configuration.cjs','tools/load_publication_renderer.cjs'])implementation[name]=sha(name);
const report={schema:'publication-configuration-comparison/1',baseline_digest:before.audit_digest,current_digest:after.audit_digest,
 baseline_directory:snap,external_files_unchanged:actual.length,external_models_executed:false,canonical_ir_unchanged:true,semantic_facts_identical:true,
 common_scopes_cuts_identical:true,complete_accounting:true,baseline_panels:before.panels,current_panels:after.panels,
 common_panels:common,identical_common_svgs:identical,common_crossings:[commonBefore,commonAfter],changed,improvements,crossing_increases:increases,
 new_presentation_panels:added,removed_presentation_panels:removed,configuration_models:proofs.length,literal_expressions:proofs.reduce((s,p)=>s+p.nodes.length,0),proofs,
 original:{entry:original.title,nodes:original.nodes.length,edges:original.edges.length,unknowns:originalB.graph.publication.unknowns,before:json(originalA.prepared.quality),after:json(originalB.prepared.quality)},
 implementation_sha256:implementation,
 limits:['Three common source panels gain crossings after presentation partitions change; these are explicit visual regressions and remain unresolved.',
 'Fewer panels reflect changed presentation partitions only; all source scopes, semantic facts, original nodes, edges and common-scope cuts are checked.',
 'Only bounded integer-literal arithmetic with configuration-only uses is attached. Dynamic shape arithmetic and coefficients used as data remain visible.',
 'Shape captions report recorded call arguments, not inferred or measured output shapes.'],regressions:increases.map(r=>({id:r.id,focus:r.focus,kind:'more-crossings'}))};
save('comparison.json',report);
console.log(JSON.stringify({before_panels:before.panels,after_panels:after.panels,common,changed:changed.length,improved:improvements.length,increases:increases.length,configuration_models:proofs.length,literal_expressions:report.literal_expressions,common_crossings:report.common_crossings,removed:removed.length,added:added.length,external_files_unchanged:actual.length}));

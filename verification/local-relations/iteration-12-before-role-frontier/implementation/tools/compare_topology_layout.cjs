#!/usr/bin/env node
/* Staged evidence: archived and current renderers use isolated VM registries.
 * Corpus files are data only; source notebooks are only hashed, never executed. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dest='verification/publication/topology-layout/',snap='verification/publication/topology-layout-baseline/';
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),json=x=>JSON.parse(JSON.stringify(x));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root,f))).digest('hex');
const save=(f,x)=>fs.writeFileSync(path.join(root,dest,f),typeof x==='string'?x:JSON.stringify(x,null,2)+'\n');
const baseline=read(snap+'baseline.json'),before=read(snap+'corpus-report.json'),after=read(dest+'corpus-report.json');
for(const [f,h]of Object.entries(baseline.implementation_sha256))assert.equal(sha(snap+f),h,'archived implementation changed');
for(const [f,h]of Object.entries(after.implementation_sha256))assert.equal(sha(f),h,'stale current audit');
assert.equal(before.audit_digest,baseline.audit_digest);assert.deepEqual(after.extraction_implementation_sha256,before.extraction_implementation_sha256);
const load=require('./load_publication_renderer.cjs'),B=load(path.join(root,snap,'semantic_studio')),R=load(path.join(root,'semantic_studio'));
const extraction=read('verification/architecture/corpus/extraction.json'),irs=new Map(),old=new Map(before.results.map(r=>[JSON.stringify([r.id,r.focus]),r]));
const changes=[],rejections=[],originals=[];let externalIdentical=0,externalCrossingsBefore=0,externalCrossingsAfter=0;
function compare(ir,state,a,b){
  for(const field of ['node_accounting','edge_accounting','representatives','edges'])assert.deepEqual(json(a.graph[field]),json(b.graph[field]),field);
  assert.deepEqual(json(a.graph.publication.boundary),json(b.graph.publication.boundary),'canonical cuts');
  assert.deepEqual(json(a.graph.architecture.findings),json(b.graph.architecture.findings),'semantic findings');
  assert.equal(a.graph.publication.unknowns,b.graph.publication.unknowns);
  const t=b.prepared.routing.topology_refinement,q=b.prepared.quality,p=a.prepared.quality;
  if(t?.accepted){
    assert.ok(q.line_geometry.crossings<p.line_geometry.crossings);assert.ok(q.min_print_font_pt>=p.min_print_font_pt);
    assert.ok(q.line_geometry.unrelated_contacts.length<=p.line_geometry.unrelated_contacts.length);
    assert.ok(q.issues.every(i=>p.issues.includes(i)));assert.ok(q.unplaced_port_labels.length<=p.unplaced_port_labels.length);
    assert.ok(q.route_failures.length<=p.route_failures.length);
    assert.ok(q.wire_length<=p.wire_length*1.1);assert.ok(q.width_mm*q.height_mm<=p.width_mm*p.height_mm*1.1);
    assert.equal(R.render(ir,state).svg,b.svg,'repeatability');
  }else assert.equal(a.svg,b.svg,'rejected candidate must not change the diagram');
  return t;
}
for(const row of after.results){
  const prior=old.get(JSON.stringify([row.id,row.focus]));assert.ok(prior);assert.equal(prior.canonical_digest,row.canonical_digest);
  if(!irs.has(row.id)){const item=extraction.results.find(i=>i.id===row.id);irs.set(row.id,read('verification/architecture/corpus/'+item.ir));}
  const ir=irs.get(row.id),canonical=JSON.stringify(ir),state={paperFocus:row.focus},a=B.render(ir,state),b=R.render(ir,state);
  assert.deepEqual(json(a.prepared.quality),Object.fromEntries(Object.keys(a.prepared.quality).map(k=>[k,prior[k]])),'reproduce archived report');
  assert.deepEqual(json(b.prepared.quality),Object.fromEntries(Object.keys(b.prepared.quality).map(k=>[k,row[k]])),'reproduce current report');
  const t=compare(ir,state,a,b);assert.equal(JSON.stringify(ir),canonical);
  externalIdentical+=a.svg===b.svg;externalCrossingsBefore+=a.prepared.quality.line_geometry.crossings;externalCrossingsAfter+=b.prepared.quality.line_geometry.crossings;
  if(t)(t.accepted?changes:rejections).push({id:row.id,entry:row.entry,focus:row.focus,...t});
}
assert.equal(after.panels,before.panels);assert.equal(after.panels,old.size);
const catalog=read('data/semantic/catalog.json');let originalPanels=0;
for(const item of catalog.models){
  const ir=read('data/semantic/'+item.ir),canonical=JSON.stringify(ir),overview=B.render(ir,{});
  const focuses=[null,...overview.graph.architecture.nodes.filter(n=>n.kind==='composite'&&n.parent&&overview.graph.architecture.nodes.some(c=>c.parent===n.id)).map(n=>n.id)];
  for(const focus of focuses){
    originalPanels++;
    const state={paperFocus:focus},a=focus?B.render(ir,state):overview,b=R.render(ir,state),t=compare(ir,state,a,b);
    if(t?.accepted){
      const key=crypto.createHash('sha256').update(item.ir+'|'+focus).digest('hex').slice(0,12);
      save(key+'-before.svg',a.svg);save(key+'-after.svg',b.svg);save(key+'.layout.json',b.document);
      originals.push({entry:ir.title,ir:item.ir,focus,...t,before_svg:key+'-before.svg',after_svg:key+'-after.svg',document:key+'.layout.json'});
    }
  }
  assert.equal(JSON.stringify(ir),canonical);
}
const sources=read('verification/architecture/corpus/manifest-before.json'),actual=[];
function walk(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())walk(file);else if(item.isFile())actual.push({path:path.relative(extraction.source_root,file),sha256:sha(file)});}}
walk(extraction.source_root);actual.sort((a,b)=>a.path.localeCompare(b.path));
assert.deepEqual(actual,sources.slice().sort((a,b)=>a.path.localeCompare(b.path)),'external sources changed');
const implementation={...after.implementation_sha256};
for(const f of ['tools/compare_topology_layout.cjs','tools/load_publication_renderer.cjs','semantic_studio/app.js','semantic_studio/index.html'])implementation[f]=sha(f);
const report={schema:'publication-topology-comparison/1',baseline_digest:before.audit_digest,current_digest:after.audit_digest,
  baseline_directory:snap,scope:'One consumer-rank candidate after current routing and label preparation; fixed 10% area/wire ceilings and no font reduction.',
  external_panels:after.panels,external_svg_identical:externalIdentical,external_crossings:[externalCrossingsBefore,externalCrossingsAfter],
  external_accepted:changes,external_rejected:rejections,original_accepted:originals,
  original_catalog_models:catalog.models.length,original_catalog_panels:originalPanels,external_files_unchanged:actual.length,all_accounting_and_cuts_identical:true,
  semantic_findings_identical:true,canonical_ir_unchanged:true,regressions:[],implementation_sha256:implementation,
  limits:['No external corpus candidate met the improvement gates. External coverage demonstrates preservation and rejection, not positive generalization.',
    'Folded reading order still needs arrows; fewer crossings does not prove aesthetic or algorithmic completeness.',
    'Only one alternative, at most 64 visible edges, no automatic override of manual geometry; denser or wholly novel topologies can remain poor.']};
save('comparison.json',report);
console.log(JSON.stringify({panels:after.panels,external_accepted:changes.length,external_rejected:rejections.length,external_identical:externalIdentical,original_accepted:originals.map(r=>({entry:r.entry,focus:r.focus,before:r.before.crossings,after:r.candidate.crossings})),external_files_unchanged:actual.length}));

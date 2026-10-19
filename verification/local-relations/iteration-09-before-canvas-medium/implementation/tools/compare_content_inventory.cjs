#!/usr/bin/env node
/* Compare readable, source-backed contents with the archived structural-only
 * captions. External IRs are data; model modules are never imported. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir='verification/publication/',snapshot=dir+'content-inventory-baseline/';
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const baseline=read(snapshot+'baseline.json'),before=read(snapshot+'corpus-report.json'),after=read(dir+'corpus-report.json');
for(const [f,h]of Object.entries(baseline.implementation_sha256))assert.equal(sha(snapshot+f),h,'archived '+f);
for(const [f,h]of Object.entries(after.implementation_sha256))assert.equal(sha(f),h,'current '+f);
assert.equal(baseline.audit_digest,before.audit_digest);assert.deepEqual(before.extraction_implementation_sha256,after.extraction_implementation_sha256);assert.equal(before.results.length,after.results.length);
const load=require('./load_publication_renderer.cjs'),B=load(path.join(root,snapshot,'semantic_studio')),R=load(path.join(root,'semantic_studio'));
const plain=v=>JSON.parse(JSON.stringify(v)),geometry=map=>[...map].map(([id,p])=>[id,Object.fromEntries(['x','y','w','h','header','expanded','symbol','cyclic','topological_rank','arrangement'].filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]]))]);
const extraction=read('verification/architecture/corpus/extraction.json'),irs=new Map(),old=new Map(before.results.map(r=>[JSON.stringify([r.id,r.focus]),r]));
const changes=[],visibleInventories=new Set();let shown=0,complete=0;
for(const row of after.results){
  const previous=old.get(JSON.stringify([row.id,row.focus]));assert.ok(previous);assert.equal(previous.canonical_digest,row.canonical_digest);
  if(!irs.has(row.id)){const item=extraction.results.find(i=>i.id===row.id);irs.set(row.id,read('verification/architecture/corpus/'+item.ir));}
  const ir=irs.get(row.id),canonical=JSON.stringify(ir),state={paperFocus:row.focus},a=B.render(ir,state),b=R.render(ir,state);
  assert.deepEqual(plain(a.prepared.quality),previous?Object.fromEntries(Object.keys(a.prepared.quality).map(k=>[k,previous[k]])):null);
  assert.deepEqual(plain(geometry(a.graph.positions)),plain(geometry(b.graph.positions)),'node geometry');
  for(const field of ['node_accounting','edge_accounting','representatives'])assert.deepEqual(plain(a.graph[field]),plain(b.graph[field]),field);
  assert.deepEqual(plain(a.graph.publication.boundary),plain(b.graph.publication.boundary),'canonical cuts');
  assert.deepEqual(plain(a.prepared.routes),plain(b.prepared.routes),'canonical operands or selected routes');
  assert.deepEqual(plain(b.prepared.quality),Object.fromEntries(Object.keys(b.prepared.quality).map(k=>[k,row[k]])));
  assert.equal(JSON.stringify(ir),canonical);
  const captions=[];
  for(const n of b.graph.nodes.filter(n=>n.content_inventory)){
    visibleInventories.add(row.id+'|'+n.id);const prior=a.graph.idx.nodes.get(n.id),c=n.content_inventory;complete++;
    assert.ok(prior);assert.equal(n.label,prior.label);assert.equal(n.paper.unknown_count,prior.paper.unknown_count);
    assert.equal(c.terms.reduce((s,t)=>s+t.count,0),c.units.length);
    assert.ok(n.paper.captions.length<=prior.paper.captions.length);
    if(n.paper.caption!==prior.paper.caption){shown++;captions.push({node:n.id,label:n.label,before:prior.paper.caption,after:n.paper.caption,units:c.units.length,omitted_kinds:n.paper.inventory_summary.omitted_kinds});}
  }
  if(captions.length)changes.push({id:row.id,entry:row.entry,focus:row.focus,captions});
}
const report={schema:'publication-content-inventory-comparison/1',baseline_digest:before.audit_digest,current_digest:after.audit_digest,panels:after.panels,
  changed_panels:changes.length,visible_inventory_occurrences:complete,unique_visible_inventories:visibleInventories.size,changed_caption_occurrences:shown,
  before_crossings:baseline.crossings,after_crossings:after.results.reduce((s,r)=>s+r.line_geometry.crossings,0),before_contacts:baseline.contacts,after_contacts:after.unrelated_contacts,
  same_node_geometry:true,same_routes_and_operands:true,same_accounting:true,same_canonical_cuts:true,regressions:[],changes,
  implementation_sha256:{...after.implementation_sha256,'semantic_studio/app.js':sha('semantic_studio/app.js'),'tools/compare_content_inventory.cjs':sha('tools/compare_content_inventory.cjs'),'tools/load_publication_renderer.cjs':sha('tools/load_publication_renderer.cjs')},
  limits:['Counts describe extracted operations, calls and proven local groups, not serial repetition, runtime equivalence or parameter sharing.','Compact captions may list selected kinds; complete per-unit inventories survive in documents, SVG titles and the UI inspector.','Node geometry is preserved; label fields deliberately change. This comparison does not establish new model-family semantics.']};
fs.writeFileSync(path.join(root,dir+'content-inventory-comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,changes:undefined,implementation_sha256:undefined}));

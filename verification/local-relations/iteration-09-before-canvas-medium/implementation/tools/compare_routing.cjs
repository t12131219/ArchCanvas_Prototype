#!/usr/bin/env node
/* Compare against the archived renderer and exact extracted graph identities. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const R=require('../semantic_studio/publication-renderer.js');
const root=path.resolve(__dirname,'..'),dir='verification/publication/',base=dir+'routing-baseline/';
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const baseline=read(base+'baseline.json'),before=read(base+'corpus-report.json'),after=read(dir+'corpus-report.json');
for(const [f,h]of Object.entries(baseline.implementation_sha256))assert.equal(sha(base+f),h,'archived '+f);
for(const [f,h]of Object.entries(after.implementation_sha256))assert.equal(sha(f),h,'current '+f);
assert.equal(before.audit_digest,baseline.audit_digest);assert.deepEqual(before.extraction_implementation_sha256,after.extraction_implementation_sha256);
assert.equal(before.results.length,after.results.length);
const inspection=read(base+'inspection.json');assert.equal(inspection.audit_digest,before.audit_digest);assert.equal(inspection.inspector_sha256,sha('tools/inspect_publication_snapshot.cjs'));assert.deepEqual(inspection.implementation_sha256,baseline.implementation_sha256);
const snapshot=inspection.rows;
const extraction=read('verification/architecture/corpus/extraction.json');
const key=r=>JSON.stringify([r.id,r.focus]),old=new Map(before.results.map(r=>[key(r),r])),changed=[],regressions=[],projectionChanges=[],crossingIncreases=[],snapshotRows=new Map(snapshot.map(r=>[key(r),r]));
for(const row of after.results){
 const prior=old.get(key(row));assert.ok(prior);assert.equal(prior.canonical_digest,row.canonical_digest);
 if(row.routing.baseline_crossings!==prior.line_geometry.crossings)projectionChanges.push({id:row.id,focus:row.focus,archived_crossings:prior.line_geometry.crossings,current_canonical_order_crossings:row.routing.baseline_crossings});
 const a=row.line_geometry.crossings,b=prior.line_geometry.crossings;
 if(a!==b)changed.push({id:row.id,entry:row.entry,focus:row.focus,before:b,after:a,strategy:row.route_strategy,
   min_print_font_pt:[prior.min_print_font_pt,row.min_print_font_pt],height_mm:[prior.height_mm,row.height_mm]});
 if(a>b){
  const item=extraction.results.find(i=>i.id===row.id),ir=read('verification/architecture/corpus/'+item.ir),g=R.render(ir,{paperFocus:row.focus}).graph;
  const oldVisible=new Set(snapshotRows.get(key(row)).visible),restored=g.edge_accounting.visible.filter(id=>!oldVisible.has(id));
  const increase={id:row.id,focus:row.focus,crossings:[b,a],restored_visible_dependencies:restored};crossingIncreases.push(increase);
  if(!restored.length)regressions.push(increase);
 }
 if(row.issues.some(i=>!prior.issues.includes(i))||row.min_print_font_pt<Math.min(8,prior.min_print_font_pt))regressions.push({id:row.id,focus:row.focus,issues:row.issues});
}
const report={schema:'publication-routing-comparison/1',baseline_digest:before.audit_digest,current_digest:after.audit_digest,panels:after.panels,
 before_crossings:before.results.reduce((s,r)=>s+r.line_geometry.crossings,0),after_crossings:after.results.reduce((s,r)=>s+r.line_geometry.crossings,0),
 improved_panels:changed.filter(r=>r.after<r.before).length,regressions,route_strategies:after.route_strategies,changed,projection_changes:projectionChanges,crossing_increases:crossingIncreases,
 before_orphan_boundary_ports:snapshot.reduce((s,r)=>s+r.orphan_boundary_ports.length,0),after_orphan_boundary_ports:after.orphan_boundary_ports,
 implementation_sha256:{...after.implementation_sha256,'tools/compare_routing.cjs':sha('tools/compare_routing.cjs'),'tools/inspect_publication_snapshot.cjs':sha('tools/inspect_publication_snapshot.cjs')},
 limits:['Segment crossings, physical font gates and route validity; no claim of global optimality or semantic completeness.','Canonical-short remains a candidate. Header anchors apply only to control relations involving an expanded ancestor.','Crossing increases with restored canonical dependencies are reported separately; they remain a visual limitation.','Current projection repairs focused pass-through aliases and considers a compact 32-unit row gap; comparisons cover the complete change, not isolated routing.']};
fs.writeFileSync(path.join(root,dir+'routing-comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,changed:undefined,projection_changes:undefined,crossing_increases:crossingIncreases.length,limits:undefined,implementation_sha256:undefined}));if(regressions.length)process.exitCode=1;

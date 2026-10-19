#!/usr/bin/env node
/* Reproduce before/after routing using our archived code and data-only IRs. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir='verification/publication/',snapshot=dir+'reroute-baseline/';
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file))),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const baseline=read(snapshot+'baseline.json'),before=read(snapshot+'corpus-report.json'),after=read(dir+'corpus-report.json');
const diagnosisDir=dir+'contact-diagnosis/',prototype=read(diagnosisDir+'baseline.json');
const repairDir=dir+'contact-repair-baseline/',repairBaseline=read(repairDir+'baseline.json'),repairBefore=read(repairDir+'corpus-report.json');
const separationDir=dir+'contact-separation-baseline/',separationBaseline=read(separationDir+'baseline.json'),separationBefore=read(separationDir+'corpus-report.json');
for(const [file,hash]of Object.entries(baseline.implementation_sha256))assert.equal(sha(snapshot+file),hash,'archived '+file);
for(const [file,hash]of Object.entries(prototype.implementation_sha256))assert.equal(sha(diagnosisDir+file),hash,'rejected prototype '+file);
for(const [file,hash]of Object.entries(repairBaseline.implementation_sha256))assert.equal(sha(repairDir+file),hash,'contact repair baseline '+file);
for(const [file,hash]of Object.entries(separationBaseline.implementation_sha256))assert.equal(sha(separationDir+file),hash,'contact separation baseline '+file);
for(const [file,hash]of Object.entries(after.implementation_sha256))assert.equal(sha(file),hash,'current '+file);
assert.deepEqual(before.extraction_implementation_sha256,after.extraction_implementation_sha256);
assert.equal(before.audit_digest,baseline.audit_digest);assert.equal(before.results.length,after.results.length);
const loadRenderer=require('./load_publication_renderer.cjs');
const B=loadRenderer(path.join(root,snapshot,'semantic_studio')),R=loadRenderer(path.join(root,'semantic_studio'));
const D=loadRenderer(path.join(root,diagnosisDir,'semantic_studio'));
const C=loadRenderer(path.join(root,repairDir,'semantic_studio'));
const S=loadRenderer(path.join(root,separationDir,'semantic_studio'));
const plain=value=>JSON.parse(JSON.stringify(value));
// Captions can evolve independently of physical node positions. Compare the
// complete placement geometry, not the copied label fields on each box.
const positions=map=>[...map].map(([id,p])=>[id,Object.fromEntries(['x','y','w','h','header','expanded','symbol','cyclic','topological_rank','arrangement'].filter(k=>Object.hasOwn(p,k)).map(k=>[k,p[k]]))]);
const extraction=read('verification/architecture/corpus/extraction.json'),irs=new Map(),old=new Map(before.results.map(r=>[JSON.stringify([r.id,r.focus]),r]));
const repairOld=new Map(repairBefore.results.map(r=>[JSON.stringify([r.id,r.focus]),r])),repairChanges=[],repairRegressions=[];
const separationOld=new Map(separationBefore.results.map(r=>[JSON.stringify([r.id,r.focus]),r])),separationChanges=[],separationRegressions=[],tradeoffs=[];
assert.equal(separationBefore.audit_digest,separationBaseline.audit_digest);assert.equal(separationBefore.results.length,after.results.length);
assert.deepEqual(separationBefore.extraction_implementation_sha256,after.extraction_implementation_sha256);
assert.equal(repairBefore.audit_digest,repairBaseline.audit_digest);assert.equal(repairBefore.results.length,after.results.length);
assert.deepEqual(repairBefore.extraction_implementation_sha256,after.extraction_implementation_sha256);
const changes=[],regressions=[],longer=[],contactIncreases=[];let attempts=0,accepted=0,beforeContacts=0,afterContacts=0,prototypeContacts=0,prototypeCrossings=0;
for(const row of after.results){
  const prior=old.get(JSON.stringify([row.id,row.focus]));assert.ok(prior);assert.equal(prior.canonical_digest,row.canonical_digest);
  if(!irs.has(row.id)){const item=extraction.results.find(i=>i.id===row.id);irs.set(row.id,read('verification/architecture/corpus/'+item.ir));}
  const ir=irs.get(row.id),state={paperFocus:row.focus},a=B.render(ir,state),b=R.render(ir,state);
  assert.deepEqual(plain(positions(a.graph.positions)),plain(positions(b.graph.positions)),'node positions changed');
  for(const key of ['node_accounting','edge_accounting','representatives'])assert.deepEqual(plain(a.graph[key]),plain(b.graph[key]),key+' changed');
  assert.equal(a.prepared.quality.line_geometry.crossings,prior.line_geometry.crossings);
  assert.deepEqual(plain(b.prepared.quality.line_geometry),row.line_geometry);
  const refinement=b.prepared.routing.refinement;attempts+=refinement.attempts;accepted+=refinement.accepted.length;
  const separating=refinement.accepted.filter(a=>a.tradeoff==='contacts-to-crossings');
  assert.ok(refinement.attempts<=112);
  for(const step of separating){assert.equal(step.phase,'separation');assert.ok(step.crossings[1]>step.crossings[0]);assert.ok(step.contacts[0]-step.contacts[1]>step.crossings[1]-step.crossings[0]);}
  const justified=(from,to,ca,cb)=>to>from&&to-from<=1&&ca-cb>to-from&&separating.length>0;
  const from=prior.line_geometry.crossings,to=row.line_geometry.crossings;
  const contactsA=R.lineGeometry(a.prepared.routes).unrelated_contacts,contactsB=b.prepared.quality.line_geometry.unrelated_contacts;
  const ca=contactsA.length,cb=contactsB.length,allowedPairs=new Set(contactsA.map(c=>JSON.stringify(c.edges)));
  const newPairs=contactsB.filter(c=>!allowedPairs.has(JSON.stringify(c.edges)));
  beforeContacts+=ca;afterContacts+=cb;
  const diagnosed=D.render(ir,state),dc=R.lineGeometry(diagnosed.prepared.routes).unrelated_contacts.length;
  prototypeContacts+=dc;prototypeCrossings+=diagnosed.prepared.quality.line_geometry.crossings;
  if(dc>ca)contactIncreases.push({id:row.id,entry:row.entry,focus:row.focus,contacts:[ca,dc],corrected_contacts:cb});
  if(row.wire_length>prior.wire_length)longer.push({id:row.id,focus:row.focus,wire_length:[prior.wire_length,row.wire_length],ratio:row.wire_length/prior.wire_length});
  if(from!==to)changes.push({id:row.id,entry:row.entry,focus:row.focus,crossings:[from,to],accepted:refinement.accepted,
    min_print_font_pt:[prior.min_print_font_pt,row.min_print_font_pt],height_mm:[prior.height_mm,row.height_mm],wire_length:[prior.wire_length,row.wire_length],contacts:[ca,cb]});
  if(to>from&&!justified(from,to,ca,cb)||cb>ca||newPairs.length||row.issues.some(issue=>!prior.issues.includes(issue))||row.min_print_font_pt<Math.min(8,prior.min_print_font_pt))regressions.push({id:row.id,focus:row.focus,crossings:[from,to],contacts:[ca,cb],new_contact_pairs:newPairs,issues:row.issues});
  const repairPrior=repairOld.get(JSON.stringify([row.id,row.focus])),recent=C.render(ir,state),recentGeometry=recent.prepared.quality.line_geometry;
  assert.deepEqual(plain(recentGeometry),repairPrior.line_geometry);assert.deepEqual(plain(positions(recent.graph.positions)),plain(positions(b.graph.positions)));
  for(const key of ['node_accounting','edge_accounting','representatives'])assert.deepEqual(plain(recent.graph[key]),plain(b.graph[key]));
  const recentPairs=new Set(recentGeometry.unrelated_contacts.map(c=>JSON.stringify(c.edges))),added=contactsB.filter(c=>!recentPairs.has(JSON.stringify(c.edges)));
  if(recentGeometry.crossings!==to||recentGeometry.unrelated_contacts.length!==cb)repairChanges.push({id:row.id,entry:row.entry,focus:row.focus,
    crossings:[recentGeometry.crossings,to],contacts:[recentGeometry.unrelated_contacts.length,cb],accepted:refinement.accepted.filter(a=>a.phase!=='crossings')});
  if(to>recentGeometry.crossings&&!justified(recentGeometry.crossings,to,recentGeometry.unrelated_contacts.length,cb)||cb>recentGeometry.unrelated_contacts.length||added.length||row.issues.some(issue=>!repairPrior.issues.includes(issue))||row.min_print_font_pt<Math.min(8,repairPrior.min_print_font_pt))repairRegressions.push({id:row.id,focus:row.focus,crossings:[recentGeometry.crossings,to],contacts:[recentGeometry.unrelated_contacts.length,cb],new_contact_pairs:added,issues:row.issues});
  const sp=separationOld.get(JSON.stringify([row.id,row.focus])),s=S.render(ir,state),sg=s.prepared.quality.line_geometry;
  assert.deepEqual(plain(sg),sp.line_geometry);assert.deepEqual(plain(positions(s.graph.positions)),plain(positions(b.graph.positions)));
  for(const key of ['node_accounting','edge_accounting','representatives'])assert.deepEqual(plain(s.graph[key]),plain(b.graph[key]));
  const priorPairs=new Set(sg.unrelated_contacts.map(c=>JSON.stringify(c.edges))),newPairsS=contactsB.filter(c=>!priorPairs.has(JSON.stringify(c.edges)));
  const change={id:row.id,entry:row.entry,focus:row.focus,crossings:[sg.crossings,to],contacts:[sg.unrelated_contacts.length,cb],accepted:refinement.accepted.filter(a=>a.phase==='separation')};
  if(to!==sg.crossings||cb!==sg.unrelated_contacts.length)separationChanges.push(change);
  if(to>sg.crossings&&justified(sg.crossings,to,sg.unrelated_contacts.length,cb))tradeoffs.push(change);
  if(to>sg.crossings&&!justified(sg.crossings,to,sg.unrelated_contacts.length,cb)||cb>sg.unrelated_contacts.length||newPairsS.length||row.issues.some(issue=>!sp.issues.includes(issue))||row.min_print_font_pt<Math.min(8,sp.min_print_font_pt))separationRegressions.push(change);
}
const report={schema:'publication-refinement-comparison/1',baseline_digest:before.audit_digest,current_digest:after.audit_digest,panels:after.panels,
  before_crossings:before.results.reduce((s,r)=>s+r.line_geometry.crossings,0),after_crossings:after.results.reduce((s,r)=>s+r.line_geometry.crossings,0),
  improved_panels:changes.filter(r=>r.crossings[1]<r.crossings[0]).length,attempts,accepted,
  same_node_positions:true,same_accounting:true,regressions,changes,contact_separation_tradeoffs:tradeoffs,
  before_contacts:beforeContacts,after_contacts:afterContacts,
  rejected_prototype:{crossings:prototypeCrossings,contacts:prototypeContacts,panels_with_more_contacts:contactIncreases.length,evidence:'contact-diagnosis/contacts.json'},
  longer_wire_panels:longer.length,largest_wire_detour:longer.sort((a,b)=>b.ratio-a.ratio)[0]||null,
  implementation_sha256:{...after.implementation_sha256,'tools/compare_refinement.cjs':sha('tools/compare_refinement.cjs'),'tools/load_publication_renderer.cjs':sha('tools/load_publication_renderer.cjs')},
  limits:['Crossing and contact repair each revisit at most eight edges per pass over two passes. A final four-edge separation pass may replace contacts with at most one extra crossing, only when combined conflicts strictly decrease. At most 112 attempts. Graphs above 64 visible edges keep greedy routes.',
    'Font/label/path gates and segment crossings do not establish global optimality, algorithm semantics or arbitrary-model publication quality.']};
fs.writeFileSync(path.join(root,dir+'refinement-comparison.json'),JSON.stringify(report,null,2)+'\n');
const repair={schema:'publication-contact-repair-comparison/1',baseline_digest:repairBefore.audit_digest,current_digest:after.audit_digest,panels:after.panels,
  before_crossings:repairBaseline.corpus_crossings,after_crossings:report.after_crossings,before_contacts:repairBaseline.corpus_contacts,after_contacts:afterContacts,
  improved_panels:repairChanges.filter(r=>r.contacts[1]<r.contacts[0]).length,same_node_positions:true,same_accounting:true,
  regressions:repairRegressions,changes:repairChanges,contact_separation_tradeoffs:tradeoffs,implementation_sha256:report.implementation_sha256};
fs.writeFileSync(path.join(root,dir+'contact-repair-comparison.json'),JSON.stringify(repair,null,2)+'\n');
const separation={schema:'publication-contact-separation-comparison/1',baseline_digest:separationBefore.audit_digest,current_digest:after.audit_digest,panels:after.panels,
  before_crossings:separationBaseline.crossings,after_crossings:report.after_crossings,before_contacts:separationBaseline.contacts,after_contacts:afterContacts,
  same_node_positions:true,same_accounting:true,regressions:separationRegressions,changes:separationChanges,contact_separation_tradeoffs:tradeoffs,implementation_sha256:report.implementation_sha256};
fs.writeFileSync(path.join(root,dir+'contact-separation-comparison.json'),JSON.stringify(separation,null,2)+'\n');
fs.writeFileSync(path.join(root,diagnosisDir+'contacts.json'),JSON.stringify({schema:'publication-contact-diagnosis/1',
  baseline_digest:before.audit_digest,rejected_digest:prototype.audit_digest,current_digest:after.audit_digest,
  before_contacts:beforeContacts,rejected_contacts:prototypeContacts,after_contacts:afterContacts,contact_increases:contactIncreases,
  implementation_sha256:report.implementation_sha256},null,2)+'\n');
console.log(JSON.stringify({...report,changes:undefined,implementation_sha256:undefined}));
console.log(JSON.stringify({...repair,changes:undefined,implementation_sha256:undefined}));
console.log(JSON.stringify({...separation,changes:undefined,implementation_sha256:undefined}));if(regressions.length||repairRegressions.length||separationRegressions.length)process.exitCode=1;

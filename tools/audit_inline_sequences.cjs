#!/usr/bin/env node
'use strict';
// Model names below select evaluation inputs only, never production behavior.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/inline-sequences/current',out=path.join(root,folder);
const R=require('../semantic_studio/publication-renderer.js');
const frozenPath='verification/local-relations/iteration-10-before-inline-sequences',frozen=require('./load_publication_renderer.cjs')(path.join(root,frozenPath,'implementation/semantic_studio'));
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const snapshot=read(frozenPath+'/snapshot.json');for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(frozenPath+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
 'semantic_studio/index.html','semantic_studio/style.css','tools/audit_inline_sequences.cjs','tools/load_publication_renderer.cjs'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
function render(name,input,state,version='current'){
 const ir=read(input),before=JSON.stringify(ir),r=(version==='before'?frozen:R).render(ir,state);assert.equal(JSON.stringify(ir),before);
 for(const [bucket,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const all=Object.values(r.graph[bucket]).flat();assert.equal(new Set(all).size,all.length);assert.deepEqual(all.slice().sort(),items.map(v=>v.id).sort());}
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 rows.push({name,input,input_sha256:sha(input),version,state,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,selected:r.graph.publication.granularity,quality:r.prepared.quality,
  inline_sequences:r.graph.publication.inline_sequences||null,compound_alignments:r.document.layout.compound_alignments||[],representative:r.graph.publication.representative});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,issues:r.prepared.quality.issues}));return r;
}
const state={paperMedium:'canvas',paperGranularity:'semantic'},struct='verification/local-relations/current/structural-repeats/';
for(const name of ['EquivalentSteps','MixedSteps','UnknownSteps','MutableSteps'])render(name+'-semantic',struct+name+'.json',state);
const eq=rows[0].input,eqOut=R.render(read(eq),state),suffix=eqOut.graph.publication.inline_sequences.sequences[0].remainders[0];
render('EquivalentSteps-suffix-open',eq,{...state,paperAuto:false,open:[...eqOut.graph.publication.open,suffix.node]});
render('EquivalentSteps-later-call',eq,{...state,paperFocus:suffix.instances[0]});
const coupled=folder+'/CoupledRuns.json';
render('coupled-source-before',folder+'/CoupledRuns-before.json',{paperMedium:'canvas',paperGranularity:'detailed'},'before');
render('coupled-renderer-before',coupled,{paperMedium:'canvas',paperGranularity:'detailed'},'before');
render('coupled-semantic',coupled,state);
render('coupled-detailed',coupled,{...state,paperGranularity:'detailed'});
for(const name of ['MixedCircuit','ForeignComposition','UnknownFusion'])render(name+'-semantic','verification/local-relations/current/'+name+'.json',state);
const transformer='verification/symbolic-values/current/transformer-current.json';
render('transformer-before',transformer,{paperMedium:'canvas',paperGranularity:'detailed'},'before');
render('transformer-overview',transformer,{...state,paperGranularity:'overview'});
render('transformer-semantic',transformer,state);
render('transformer-detailed',transformer,{...state,paperGranularity:'detailed'});
const referenceFolder='verification/generic-convergence/current/',reference=['collapsed','expanded'].map(view=>{
 const svg=referenceFolder+'reference-'+view+'.svg',dom=referenceFolder+'reference-'+view+'.dom.svg',graph=referenceFolder+'reference-'+view+'.graph.json';
 return{view,svg,svg_sha256:sha(svg),raw_dom:dom,raw_dom_sha256:sha(dom),graph,graph_sha256:sha(graph),scope:'Actual reference editor DOM normalized for standalone CSS and graph bounds; evaluation only. Raw expand-all states are not equated.'};
});
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest);
const report={schema:'inline-sequence-audit/1',implementation_sha256:implementation,frozen_snapshot:frozenPath+'/snapshot.json',frozen_snapshot_sha256:sha(frozenPath+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),reference,rows,
 runtime_executed:false,goal_complete:false,reference_frontier_match:false,
 scope:'Development inputs. Proved concrete first calls unfold in their original sequence. Contiguous subsequent calls retain separate identity, exact cuts and deeper expansion. Local budgets and visible endpoint layout do not assert numerical equality, purity, parameter stability or execution scheduling.',
 unresolved:rows.filter(r=>r.quality.issues.length).map(r=>({name:r.name,issues:r.quality.issues})),
 remaining:['No verified node/role correspondence to the dedicated reference frontier yet.','Semantic frontier keeps certified modules folded; the reference exposes more internal roles.','Source wrapper nesting and cross-frame context paths remain visually verbose.','Dense further-expanded views can exceed canvas budgets.','Python digests preserve JSON number spelling while JS normalizes e.g. 1.0 to 1; source certificates pass but saved document digests need a cross-language contract.']};
fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');

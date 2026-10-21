/* Compare complete automatic selection, preserving the old receipt discrepancy
 * rather than rewriting its metrics to match the SVG. */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/measured-frontiers/current',frozen='/tmp/archcanvas-joint-frontiers-before';fs.mkdirSync(out,{recursive:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
const baseline=read(frozen+'/snapshot.json'),load=require('./load_publication_renderer.cjs'),current=load(root+'/semantic_studio'),before=load(frozen);
for(const [f,h]of Object.entries(baseline.files))assert.equal(sha(frozen+'/'+path.basename(f)),h);
const producers=[...fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),'tests/measured-frontier-fixtures.cjs','tests/context-source-fixtures.cjs','tools/audit_measured_frontiers.cjs'];
const implementation_sha256=Object.fromEntries(producers.map(f=>[f,sha(root+'/'+f)]));
const rows=[],comparisons=[],replays=[],state={paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:true,paperAdaptivePolicy:'structure'};
const metrics=r=>{const q=r.prepared?.quality||r.document.diagnostics.publication;return {nodes:r.graph?.nodes.length||r.document.layout.nodes.length,
 edges:r.graph?.edges.length||r.document.layout.edges.length,width:q.native_width_px,height:q.native_height_px,area:q.native_width_px*q.native_height_px,
 crossings:q.line_geometry.crossings,contacts:q.line_geometry.unrelated_contacts.length,overlaps:q.line_geometry.overlapping_paths.filter(p=>!p.same_value).length,
 route_failures:q.route_failures.length,unplaced_labels:q.unplaced_port_labels.length,font:q.min_canvas_font_px,issues:q.issues};};
function save(name,input,s,renderer,reuse){
 const ir=read(root+'/'+input),original=JSON.stringify(ir),started=performance.now();console.log('START '+name);
 const result=reuse?{svg:fs.readFileSync(reuse.svg,'utf8'),document:read(reuse.document)}:renderer.render(ir,s);
 assert.equal(JSON.stringify(ir),original);assert.deepEqual(result.document.ir,ir);
 fs.writeFileSync(out+'/'+name+'.svg',result.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(result.document));
 const actual=metrics(result),adaptive=result.document.publication.adaptive_frontier||null;
 const row={name,input,input_sha256:sha(root+'/'+input),state:s,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(out+'/'+name+'.svg'),document_sha256:sha(out+'/'+name+'.layout.json'),
 nodes:actual.nodes,edges:actual.edges,quality:result.document.diagnostics.publication,actual_metrics:actual,adaptive,
 selected_metrics_match:adaptive?JSON.stringify(adaptive.selected)===JSON.stringify(actual):null,elapsed_ms:reuse?reuse.elapsed_ms:performance.now()-started,
 ...(reuse?{reuse:reuse.provenance}:{})};
 rows.push(row);console.log(JSON.stringify({name,...actual,selected_metrics_match:row.selected_metrics_match,elapsed_ms:row.elapsed_ms}));return result;
}
if(process.argv.includes('--current-large')){
 save('Transformer-current','verification/helper-contracts/current/Transformer-current.json',state,current);
}else if(process.argv.includes('--large')){
 const input='verification/helper-contracts/current/Transformer-current.json',prior=read('/tmp/archcanvas-joint-baseline/report.json');
 assert.ok(prior.terminal);assert.deepEqual(prior.frozen,baseline);assert.equal(prior.input,input);assert.equal(prior.input_sha256,sha(root+'/'+input));assert.deepEqual(prior.state,state);
 assert.equal(sha('/tmp/archcanvas-joint-baseline/Transformer-before.svg'),prior.svg_sha256);assert.equal(sha('/tmp/archcanvas-joint-baseline/Transformer-before.layout.json'),prior.document_sha256);
 fs.copyFileSync('/tmp/archcanvas-joint-baseline/report.json',out+'/baseline-run.json');
 save('Transformer-before',input,state,before,{svg:'/tmp/archcanvas-joint-baseline/Transformer-before.svg',document:'/tmp/archcanvas-joint-baseline/Transformer-before.layout.json',
 elapsed_ms:prior.elapsed_ms,provenance:{report:'baseline-run.json',report_sha256:sha(out+'/baseline-run.json'),scope:'Completed isolated full automatic run with exact frozen Git producer.'}});
 const completed=read(out+'/current-large-render-report.json');assert.deepEqual(completed.implementation_sha256,implementation_sha256);
 const row=completed.rows[0];assert.equal(sha(out+'/'+row.svg),row.svg_sha256);assert.equal(sha(out+'/'+row.document),row.document_sha256);
 rows.push(row);comparisons.push({name:'Transformer',before:'Transformer-before',current:'Transformer-current'});
}else{
 const {fixture,state:s}=require('../tests/measured-frontier-fixtures.cjs');
 for(const [name,alter]of [['CrossedBranches',()=>{}],['UnknownOutput',ir=>{ir.nodes.find(n=>n.id==='out').kind='opaque';}]]){
  const ir=fixture();alter(ir);const file='verification/measured-frontiers/current/'+name+'.json';fs.writeFileSync(root+'/'+file,JSON.stringify(ir,null,2));
  save(name+'-before',file,s,before);const r=save(name+'-current',file,s,current);comparisons.push({name,before:name+'-before',current:name+'-current'});
  if(name==='CrossedBranches'){
   fs.writeFileSync(out+'/ui-import.json',JSON.stringify({schema:'semantic-canvas/1',ir,state:{...s,view:'publication',mode:'source'}},null,2));
   save(name+'-folded',file,{...s,paperAuto:false,open:['root','left']},current);
  }
 }
 for(const [name,folder]of [['MixedWeave','coverage-selection'],['InterruptedWeave','coverage-selection'],['UncertifiedWeave','coverage-selection'],['FiberBlend','diagram-set'],['CoherentMosaic','coherent-frontiers'],['GuardedInputs','input-docks'],['SourceMosaic','summary-coverage']]){
  const input='verification/'+folder+'/current/'+name+'.json';save(name+'-before',input,state,before);const r=save(name+'-current',input,state,current);comparisons.push({name,before:name+'-before',current:name+'-current'});
  // Replay every small MixedWeave candidate, including the safe unselected one,
  // to check final SVG paths independently of the planning receipt.
  if(name==='MixedWeave')for(const [i,t]of r.document.publication.adaptive_frontier.attempts.entries()){
   const candidate=save(name+'-trial-'+i,input,{...state,...t.requested_state,paperAdaptive:false},current);
   assert.equal(JSON.stringify(metrics(candidate)),JSON.stringify(t.candidate));replays.push({name:name+'-trial-'+i,attempt:i,selected:t.accepted,eligible:t.eligible});
  }
 }
}
for(const [f,h]of Object.entries(implementation_sha256))assert.equal(sha(root+'/'+f),h);
const suffix=process.argv.includes('--current-large')?'current-large':process.argv.includes('--large')?'large':'small';
fs.writeFileSync(out+'/'+suffix+'-render-report.json',JSON.stringify({schema:'measured-frontier-render/1',implementation_sha256,baseline,rows,comparisons,replays,
 goal_complete:false,scope:'Complete bounded local automatic selection. Small candidates replayed with actual final SVG; large rejected candidate metrics remain producer receipts.'},null,2)+'\n');

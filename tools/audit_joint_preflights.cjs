/* Capture every actual trial once, including rejected diagrams; no re-rendering
 * from a receipt is needed to obtain a candidate's SVG. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/joint-preflights/current',frozen='/tmp/archcanvas-joint-preflights-before';
fs.mkdirSync(out,{recursive:true});const read=f=>JSON.parse(fs.readFileSync(f)),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const load=require('./load_publication_renderer.cjs'),current=load(root+'/semantic_studio',{diagramSet:true}),before=load(frozen,{diagramSet:true}),baseline=read(frozen+'/snapshot.json');
for(const [f,h]of Object.entries(baseline.files))assert.equal(sha(frozen+'/'+path.basename(f)),h);
const producers=[...fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f),
 ...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),'tools/audit_joint_preflights.cjs','tools/load_publication_renderer.cjs'];
const implementation_sha256=Object.fromEntries(producers.map(f=>[f,sha(root+'/'+f)])),rows=[],sets=[],comparisons=[];
const defaults={paperMedium:'canvas',paperGranularity:'roles'},config=(name,folder,extra={},limits={maxPanels:3,maxTrials:4})=>({name,input:`verification/${folder}/${name}.json`,state:{...defaults,...extra},limits});
const cases=process.argv.includes('--large')?[{...config('Transformer','helper-contracts/current',{}, {maxPanels:3,maxTrials:2}),input:'verification/helper-contracts/current/Transformer-current.json'}]:[
 config('SourceMosaic','summary-coverage/current'),config('MixedWeave','coverage-selection/current'),
 config('NestedWorkshop','detail-alternatives/experiment',{paperBudget:4}),config('BrokenWorkshop','detail-alternatives/experiment',{paperBudget:4}),
 config('ConditionalWorkshop','detail-alternatives/experiment',{paperBudget:4}),config('RefactoredCurve','serial-paths/experiment',{paperCanvasLimits:{height_px:900}}),
 config('LongCurve','serial-paths/experiment',{paperCanvasLimits:{height_px:600}}),config('FiberBlend','diagram-set/current'),
 ...['RelayWorkshop','BrokenRelayWorkshop','GuardedRelayWorkshop'].map(n=>config(n,'joint-expressions/current',{paperBudget:4}))];
for(const c of cases){
 const ir=read(root+'/'+c.input),original=JSON.stringify(ir),pair={name:c.name};
 for(const [variant,producer]of [['before',before],['current',current]]){
  console.log('START '+c.name+'-'+variant);const captures=[],started=performance.now();
  const main=producer.renderer.render(ir,c.state);captures.push({state:c.state,result:main});
  const renderer={render:(ir,state)=>{const result=producer.renderer.render(ir,state);captures.push({state,result});return result;}};
  const set=producer.diagrams.render(ir,c.state,renderer,{...c.limits,main,policy:'joint'}),names=new Map();
  for(const [i,capture]of captures.entries()){
   const r=capture.result,name=c.name+'-'+variant+(i?'-trial-'+i:'-initial'),svg=name+'.svg',document=name+'.layout.json';
   names.set(r,name);fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
   rows.push({name,input:c.input,input_sha256:sha(root+'/'+c.input),state:capture.state,svg,document,
    svg_sha256:sha(out+'/'+svg),document_sha256:sha(out+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality,
    qualified:producer.diagrams.acceptable(r),selected:set.panels.some(p=>p.result===r),
    contract_stages:r.document.publication.contract_stages,local_pipelines:r.document.publication.local_pipelines});
  }
  const panels=set.panels.map(p=>({id:p.id,anchor:p.anchor,state:p.state,row:names.get(p.result)}));
  const key=s=>JSON.stringify(s),attempts=set.attempts.map((t,i)=>({...t,row:names.get(captures.find(c=>key(c.state)===key(t.state)).result)}));
  const entry={name:c.name+'-'+variant,input:c.input,input_sha256:sha(root+'/'+c.input),state:c.state,limits:c.limits,plan:set.plan,panels,attempts,coverage:set.coverage,
   baseline_coverage:set.baseline_coverage||producer.diagrams.coverage(ir,set.plan,[{id:'main',result:main}]),
   ...(set.preflights?{preflights:set.preflights,preflight_deferred:set.preflight_deferred,projected_trials:set.projected_trials}:{}),
   deferred_goals:set.deferred_goals,complete:set.complete,main_unchanged:set.main_unchanged,
   ...(set.rendered_trials!==undefined?{rendered_trials:set.rendered_trials}:{}),elapsed_ms:performance.now()-started};
  sets.push(entry);pair[variant]=entry.name;
  console.log(JSON.stringify({name:entry.name,panels:panels.length,fulfilled:set.coverage.filter(r=>r.status==='fulfilled').length,goals:set.coverage.length,main_unchanged:set.main_unchanged,elapsed_ms:entry.elapsed_ms}));
  assert.equal(JSON.stringify(ir),original);
 }
 comparisons.push(pair);
}
for(const [f,h]of Object.entries(implementation_sha256))assert.equal(sha(root+'/'+f),h);
fs.writeFileSync(out+'/'+(process.argv.includes('--large')?'large':'small')+'-render-report.json',JSON.stringify({schema:'joint-preflights-render/1',implementation_sha256,baseline,rows,sets,comparisons,goal_complete:false},null,2)+'\n');

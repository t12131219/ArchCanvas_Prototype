'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),assert=require('node:assert/strict'),load=require('./load_publication_renderer.cjs');
const root=path.resolve(__dirname,'..'),out=root+'/verification/cohort-folds/current',frozen='/tmp/archcanvas-cohort-folds-before';
const {renderer:R,diagrams:D}=load(root+'/semantic_studio',{diagramSet:true}),{renderer:B,diagrams:Old}=load(frozen,{diagramSet:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f),...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),'tools/load_publication_renderer.cjs',path.relative(root,__filename)];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),snapshot=JSON.parse(fs.readFileSync(frozen+'/snapshot.json'));
const large=process.argv.includes('--large'),rows=[],comparisons=[];
const reportFile=out+'/'+(large?'large':'small')+'-render-report.json';
const cached=process.argv.includes('--reuse-previous')?JSON.parse(fs.readFileSync(reportFile)):null;
if(cached)assert.deepEqual(cached.baseline,snapshot,'different historical implementation');
const state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
function save(name,input,result){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),state:result.document.state,svg,svg_sha256:sha(out+'/'+svg),document,document_sha256:sha(out+'/'+document),nodes:result.graph.nodes.length,edges:result.graph.edges.length,
  quality:result.prepared.quality,role_path_stages:result.graph.publication.role_path_stages||null});return name;
}
const inputs=large?[{name:'Transformer',input:'verification/helper-contracts/current/Transformer-current.json'}]:JSON.parse(fs.readFileSync(out+'/extraction.json')).rows;
for(const {name,input}of inputs){
 const ir=JSON.parse(fs.readFileSync(root+'/'+input)),before=JSON.stringify(ir),main=R.render(ir,state),old=B.render(ir,state);
 const identity=g=>({nodes:g.nodes.map(n=>n.id).sort(),edges:g.edges.map(({id,source,target,source_port,target_port,kind,condition,originals,bundle_members})=>
  ({id,source,target,source_port,target_port,kind,condition,originals,bundle_members})).sort((a,b)=>a.id.localeCompare(b.id))});
 assert.equal(JSON.stringify(identity(main.graph)),JSON.stringify(identity(old.graph)),'default geometry must retain canonical display bindings');
 const mainName=save(name+'-baseline',input,main);
 const previousBaseline=save(name+'-previous-baseline',input,old);
 const solve=(label,renderer,diagrams,policy)=>{
  const captures=[{name:label==='current'?mainName:previousBaseline,result:label==='current'?main:old}];let seq=0;
  const wrapped={render:(ir,s)=>{const r=renderer.render(ir,s);captures.push({name:save(name+'-'+label+'-trial-'+(++seq),input,r),result:r});return r;}};
  const set=diagrams.render(ir,state,wrapped,{main:label==='current'?main:old,maxPanels:3,maxTrials:6,policy});
  const panels=set.panels.map(p=>({id:p.id,anchor:p.anchor,state:p.state,capture:captures.find(c=>c.result.svg===p.result.svg).name}));
  return {policy,panels,plan:JSON.parse(JSON.stringify(set.plan)),coverage:set.coverage,baseline_coverage:set.baseline_coverage,attempts:set.attempts,rendered_trials:set.rendered_trials,
   preflights:set.preflights,summary_deferred:set.summary_deferred,main_unchanged:set.main_unchanged,deferred_goals:set.deferred_goals,complete:set.complete,limits:set.limits};
 };
 let previous;
 if(cached){
  const c=cached.comparisons.find(c=>c.name===name&&c.input===input);assert.ok(c,'missing historical case');previous=structuredClone(c.previous);
  const historicalRows=cached.rows.filter(r=>r.name.startsWith(name+'-old-trial-'));
  for(const row of historicalRows){
   assert.equal(row.input,input);assert.equal(row.input_sha256,sha(root+'/'+input));
   assert.equal(row.svg_sha256,sha(out+'/'+row.svg));assert.equal(row.document_sha256,sha(out+'/'+row.document));
   assert.deepEqual(JSON.parse(fs.readFileSync(out+'/'+row.document)).ir,ir);rows.push(row);
  }
  for(const p of previous.panels)if(p.capture===c.baseline||p.capture===c.previous.baseline)p.capture=previousBaseline;
 }else previous=solve('old',B,Old,'compact');
 previous.baseline=previousBaseline;
 const current=solve('current',R,D,'compact');assert.equal(before,JSON.stringify(ir));
 comparisons.push({name,input,baseline:mainName,previous,current});
 console.log(JSON.stringify({name,old:previous.coverage.filter(c=>c.status==='fulfilled').length,current:current.coverage.filter(c=>c.status==='fulfilled').length,main_changed:!current.main_unchanged,summary:current.attempts.filter(t=>t.form==='summary-set').map(t=>({accepted:t.accepted,reasons:t.reasons}))}));
 if(large){fs.writeFileSync(out+'/Transformer-editor-input.json',JSON.stringify({schema:main.document.schema,ir,state}));}
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'producer changed');
fs.writeFileSync(reportFile,JSON.stringify({schema:'cohort-folds-render/1',implementation_sha256:hashes,baseline:snapshot,historical_artifacts_reused:!!cached,rows,comparisons,goal_complete:false},null,2)+'\n');

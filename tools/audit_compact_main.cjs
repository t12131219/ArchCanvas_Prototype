'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),assert=require('node:assert/strict'),load=require('./load_publication_renderer.cjs');
const root=path.resolve(__dirname,'..'),out=root+'/verification/compact-main/current',frozen='/tmp/archcanvas-compact-main-before';
const {renderer:R,diagrams:D}=load(root+'/semantic_studio',{diagramSet:true}),{renderer:B,diagrams:Old}=load(frozen,{diagramSet:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),files=[...fs.readdirSync(root+'/semantic_studio').filter(f=>/\.(js|html|css)$/.test(f)).map(f=>'semantic_studio/'+f),...fs.readdirSync(root+'/semantic_adapter').filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),'tools/load_publication_renderer.cjs',path.relative(root,__filename)];
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),snapshot=JSON.parse(fs.readFileSync(frozen+'/snapshot.json'));
const large=process.argv.includes('--large'),rows=[],comparisons=[];
const state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
function save(name,input,result){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,result.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(result.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),state:result.document.state,svg,svg_sha256:sha(out+'/'+svg),document,document_sha256:sha(out+'/'+document),nodes:result.graph.nodes.length,edges:result.graph.edges.length,
  quality:result.prepared.quality,role_path_stages:result.graph.publication.role_path_stages||null});return name;
}
const inputs=large?[{name:'Transformer',input:'verification/helper-contracts/current/Transformer-current.json'}]:JSON.parse(fs.readFileSync(out+'/extraction.json')).rows;
for(const {name,input}of inputs){
 const ir=JSON.parse(fs.readFileSync(root+'/'+input)),before=JSON.stringify(ir),main=R.render(ir,state),old=B.render(ir,state);assert.equal(main.svg,old.svg,'unchanged default main');
 const mainName=save(name+'-baseline',input,main);
 const solve=(label,renderer,diagrams,policy)=>{
  const captures=[{name:mainName,result:main}];let seq=0;
  const wrapped={render:(ir,s)=>{const r=renderer.render(ir,s);captures.push({name:save(name+'-'+label+'-trial-'+(++seq),input,r),result:r});return r;}};
  const set=diagrams.render(ir,state,wrapped,{main:policy==='compact'?main:old,maxPanels:3,maxTrials:4,policy});
  const panels=set.panels.map(p=>({id:p.id,anchor:p.anchor,state:p.state,capture:captures.find(c=>c.result.svg===p.result.svg).name}));
  return {policy,panels,plan:JSON.parse(JSON.stringify(set.plan)),coverage:set.coverage,baseline_coverage:set.baseline_coverage,attempts:set.attempts,rendered_trials:set.rendered_trials,
   preflights:set.preflights,summary_deferred:set.summary_deferred,main_unchanged:set.main_unchanged,deferred_goals:set.deferred_goals,complete:set.complete,limits:set.limits};
 };
 const previous=solve('old',B,Old,'joint'),current=solve('current',R,D,'compact');assert.equal(before,JSON.stringify(ir));
 comparisons.push({name,input,baseline:mainName,previous,current});
 console.log(JSON.stringify({name,old:previous.coverage.filter(c=>c.status==='fulfilled').length,current:current.coverage.filter(c=>c.status==='fulfilled').length,main_changed:!current.main_unchanged,summary:current.attempts.filter(t=>t.form==='summary-set').map(t=>({accepted:t.accepted,reasons:t.reasons}))}));
 if(large){fs.writeFileSync(out+'/Transformer-editor-input.json',JSON.stringify({schema:main.document.schema,ir,state}));}
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'producer changed');
fs.writeFileSync(out+'/'+(large?'large':'small')+'-render-report.json',JSON.stringify({schema:'compact-main-render/1',implementation_sha256:hashes,baseline:snapshot,rows,comparisons,goal_complete:false},null,2)+'\n');

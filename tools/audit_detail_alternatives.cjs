'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/detail-alternatives/experiment',out=path.join(root,folder),read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const snapshot=read(folder+'/snapshot.json');for(const [f,h]of Object.entries(snapshot.files))assert.equal(sha(folder+'/before/'+path.basename(f)),h);
const oldR=require('./load_publication_renderer.cjs')(out+'/before'),context=vm.createContext({});
for(const f of ['expression-goals.js','diagram-set.js'])vm.runInContext(fs.readFileSync(out+'/before/'+f,'utf8'),context);
const oldD=context.SemanticDiagramSet,R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js');
const files=[...Object.keys(snapshot.files),'semantic_studio/index.html','tests/detail-alternatives.test.cjs','tests/semantic_fixtures/detail_alternatives.py','tools/audit_detail_alternatives.cjs','tools/audit_local_svg.py','tools/audit_diagram_assignments.py'];
const hashes=Object.fromEntries(files.map(f=>[f,sha(f)])),state={paperMedium:'canvas',paperGranularity:'roles'},sets=[],rows=[],comparisons=[];
const inputs=[...read(folder+'/extraction.json').rows.map(r=>[r.entry,r.input,'folded']),
 ['LongCurve','verification/serial-paths/experiment/LongCurve.json','bounded'],['RefactoredCurve','verification/serial-paths/experiment/RefactoredCurve.json','nested'],
 ['FiberBlend','verification/diagram-set/current/FiberBlend.json','normal'],['Transformer-fixed','verification/helper-contracts/current/Transformer-current.json','normal']];
for(const [name,input,policy]of inputs){
 const ir=read(input),original=JSON.stringify(ir),s={...state,...(policy==='folded'?{paperAuto:false,open:[ir.nodes.find(n=>!n.parent).id],paperCanvasLimits:{height_px:1100}}:
 policy==='bounded'?{paperCanvasLimits:{height_px:600}}:policy==='nested'?{paperCanvasLimits:{height_px:900}}:{})};
 const mainBefore=oldR.render(ir,s),main=R.render(ir,s);assert.equal(main.svg,mainBefore.svg,'main changed '+name);const pair=[];
 for(const [variant,planner,renderer,m]of [['before',oldD,oldR,mainBefore],['current',D,R,main]]){
  const key=name+'-'+variant,dir=out+'/'+key;fs.mkdirSync(dir,{recursive:true});const maxPanels=name==='Transformer-fixed'?4:5,maxTrials=8;
  console.log('START '+key);const set=planner.render(ir,s,renderer,{main:m,maxPanels,maxTrials}),panels=[];
  fs.writeFileSync(dir+'/baseline.svg',mainBefore.svg);
  for(const [i,p]of set.panels.entries()){
   const r=p.result,svg=String(i)+'.svg',document=String(i)+'.layout.json';assert.equal(JSON.stringify(ir),original);assert.equal(JSON.stringify(r.document.ir),original);
   fs.writeFileSync(dir+'/'+svg,r.svg);fs.writeFileSync(dir+'/'+document,JSON.stringify(r.document));
   const entry={id:p.id,anchor:p.anchor,state:p.state,label:i?set.plan.candidates.find(c=>c.id===p.id).label:name,svg,document,
    svg_sha256:sha(folder+'/'+key+'/'+svg),document_sha256:sha(folder+'/'+key+'/'+document),nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality};panels.push(entry);
   rows.push({...entry,name:key+'-'+i,input,input_sha256:sha(input),state:r.document.state,selected:r.graph.publication.granularity,
    svg:key+'/'+svg,document:key+'/'+document,local_pipelines:r.document.publication.local_pipelines,role_frontier:r.document.publication.role_frontier,
    frame_ownership:r.document.publication.frame_ownership||[],contract_stages:r.document.publication.contract_stages,local_expressions:r.document.publication.local_expressions,
    context_lanes:r.document.layout.context_lanes||[],branch_columns:r.document.layout.branch_columns||[],compound_alignments:r.document.layout.compound_alignments||[]});
  }
  const manifest={schema:set.schema,limits:{max_panels:maxPanels,max_trials:maxTrials},plan:set.plan,panels,attempts:set.attempts,coverage:set.coverage,deferred_goals:set.deferred_goals,complete:set.complete};
  fs.writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  const entry={name:key,input,input_sha256:sha(input),manifest:key+'/manifest.json',manifest_sha256:sha(folder+'/'+key+'/manifest.json'),baseline:key+'/baseline.svg',baseline_sha256:sha(folder+'/'+key+'/baseline.svg'),main_svg:key+'/0.svg',
   main_unchanged:true,panels:panels.length,goals:set.coverage.length,fulfilled:set.coverage.filter(c=>c.status==='fulfilled').length,main_fulfilled:set.coverage.filter(c=>c.panels.includes('main')).length,
   deferred:set.deferred_goals.length,complete:set.complete};sets.push(entry);pair.push(entry);console.log(JSON.stringify(entry));
  if(name==='NestedWorkshop'&&variant==='current')fs.writeFileSync(out+'/ui-import.json',JSON.stringify({schema:'semantic-canvas/1',ir,state:{...s,view:'publication',mode:'source'}},null,2)+'\n');
 }
 comparisons.push({name,before:pair[0],current:pair[1],main_svg_equal:true});
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(f),h,'producer changed '+f);
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'detail-alternatives-render/1',implementation_sha256:hashes,baseline:folder+'/snapshot.json',baseline_sha256:sha(folder+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),sets,rows,comparisons,goal_complete:false,
 scope:'Bounded alternatives for exact nested source scopes, local relationships and individual calls; measured canonical direct-path coverage only. Main figures unchanged; no dedicated reference convergence claim.'},null,2)+'\n');

'use strict';
// Case names locate evaluation artifacts; production refinement uses certificate IDs only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/role-details/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
fs.mkdirSync(out,{recursive:true});
const frozen='verification/local-relations/iteration-22-before-role-details/snapshot.json',snapshot=read(frozen),prior=read(snapshot.prior_report);
assert.equal(sha(snapshot.prior_report),snapshot.prior_report_sha256);for(const [file,digest]of Object.entries(snapshot.files))assert.equal(sha(path.dirname(frozen)+'/implementation/'+file),digest);
const files=[...fs.readdirSync(path.join(root,'semantic_adapter')).filter(f=>f.endsWith('.py')).map(f=>'semantic_adapter/'+f),
 ...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html','semantic_studio/style.css','tools/audit_role_details.cjs','tools/audit_local_svg.py'];
const implementation=Object.fromEntries(files.sort().map(f=>[f,sha(f)])),rows=[];
const state={paperMedium:'canvas',paperGranularity:'roles'};
function render(name,input,s=state,baselineName=null){
 const ir=read(input),before=JSON.stringify(ir),r=R.render(ir,s);assert.equal(JSON.stringify(ir),before);
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(path.join(out,svg),r.svg);fs.writeFileSync(path.join(out,document),JSON.stringify(r.document,null,2)+'\n');
 if(baselineName){const old=prior.rows.find(r=>r.name===baselineName);assert.ok(old);assert.equal(sha(input),old.input_sha256);assert.deepEqual(s,old.state);assert.equal(sha(folder+'/'+svg),old.svg_sha256);}
 rows.push({name,input,input_sha256:sha(input),state:s,svg,document,svg_sha256:sha(folder+'/'+svg),document_sha256:sha(folder+'/'+document),baseline_svg:baselineName,
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,selected:r.graph.publication.granularity,quality:r.prepared.quality,
  frame_ownership:r.graph.frame_ownership||[],role_frontier:r.graph.publication.role_frontier,local_expressions:r.graph.publication.local_expressions,
  local_pipelines:r.graph.publication.local_pipelines,contract_stages:r.graph.publication.contract_stages,configuration_paths:r.graph.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1')});
 console.log(JSON.stringify({name,nodes:r.graph.nodes.length,edges:r.graph.edges.length,issues:r.prepared.quality.issues,details:r.graph.publication.role_frontier?.detail_requests}));return r;
}
for(const name of ['MixedCircuit','ForeignComposition','UnknownFusion','BrokenCell','ConditionalCarry','SharedMismatch']){
 const input='verification/local-relations/current/'+name+'.json',r=render(name+'-default',input,state,name+'-roles');
 const targets=r.graph.nodes.filter(n=>n.kind==='composite'&&n.semantic_contracts?.length&&!r.graph.positions.get(n.id).expanded).map(n=>n.id);
 if(targets.length)render(name+'-selected',input,{...state,paperRoleDetails:targets});
}
const same='verification/semantic-design/current/after/SameSource.json',base=render('SameSource-default',same,state,'SameSource-roles'),id=base.graph.nodes.find(n=>n.contract_roles?.projections).contract_roles.attention;
const selected=render('SameSource-selected',same,{...state,paperRoleDetails:[id]});
render('SameSource-budget',same,{...state,paperRoleDetails:[id],paperBudget:4});
render('SameSource-detail',same,{...state,paperRoleDetails:[id],paperAuto:false,open:[...selected.graph.idx.children.keys()].filter(Boolean)});
render('SameSource-refolded',same,{...state,paperRoleDetails:[]});
const transformer='verification/symbolic-values/current/transformer-current.json',t=render('transformer-default',transformer,state,'transformer-roles');
const targets=t.graph.nodes.filter(n=>n.kind==='composite'&&n.semantic_contracts?.length&&!t.graph.positions.get(n.id).expanded).map(n=>n.id);
assert.equal(targets.length,3);
render('transformer-local',transformer,{...state,paperRoleDetails:targets.slice(0,1)});
render('transformer-selected',transformer,{...state,paperRoleDetails:targets});
render('transformer-local-panel',transformer,{...state,paperFocus:targets[0]});
for(const [file,digest]of Object.entries(implementation))assert.equal(sha(file),digest);
const report={schema:'role-details-audit/1',implementation_sha256:implementation,frozen_snapshot:frozen,frozen_snapshot_sha256:sha(frozen),
 prior_report:snapshot.prior_report,prior_report_sha256:snapshot.prior_report_sha256,extraction:prior.extraction,extraction_sha256:prior.extraction_sha256,
 rows,goal_complete:false};fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify(report,null,2)+'\n');

'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),folder='verification/role-paths/current',out=path.join(root,folder),R=require('../semantic_studio/publication-renderer.js'),F=require('../semantic_studio/role-frontier.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),sha=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const checkpoint='verification/local-relations/iteration-38-before-role-paths',snap=read(checkpoint+'/snapshot.json');for(const [f,h]of Object.entries(snap.files))assert.equal(sha(checkpoint+'/implementation/'+f),h);
const old=require('./load_publication_renderer.cjs')(path.join(root,checkpoint,'implementation/semantic_studio'));
const producers=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),'semantic_studio/index.html',
 'tools/audit_role_paths.cjs','tools/extract_role_paths.py','tools/audit_local_svg.py','tools/audit_role_path_receipts.py','tests/role-paths.test.cjs','tests/semantic_fixtures/role_paths.py'];
const implementation=Object.fromEntries(producers.map(f=>[f,sha(f)])),rows=[],comparisons=[],base={paperMedium:'canvas',paperGranularity:'roles'};
function render(name,input,state,renderer=R){
 const ir=read(input),before=JSON.stringify(ir),r=renderer.render(ir,state);assert.equal(JSON.stringify(ir),before);
 const d=r.document;fs.writeFileSync(out+'/'+name+'.svg',r.svg);fs.writeFileSync(out+'/'+name+'.layout.json',JSON.stringify(d));
 const row={name,input,input_sha256:sha(input),state,svg:name+'.svg',document:name+'.layout.json',svg_sha256:sha(folder+'/'+name+'.svg'),document_sha256:sha(folder+'/'+name+'.layout.json'),
 nodes:d.layout.nodes.length,edges:d.layout.edges.length,selected:d.publication.granularity,quality:d.diagnostics.publication,
 role_frontier:d.publication.role_frontier,frame_ownership:d.layout.frame_ownership||[],local_pipelines:d.publication.local_pipelines,
 contract_stages:d.publication.contract_stages,local_expressions:d.publication.local_expressions,configuration_paths:d.publication.configuration_arithmetic.filter(p=>p.rule_version==='dimension-paths/1'),
 context_lanes:d.layout.context_lanes||[],branch_columns:d.layout.branch_columns||[],compound_alignments:d.layout.compound_alignments||[],input_docks:d.layout.input_docks||[]};
 rows.push(row);console.log(JSON.stringify({name,nodes:row.nodes,edges:row.edges,width:row.quality.native_width_px,height:row.quality.native_height_px,crossings:row.quality.line_geometry.crossings,issues:row.quality.issues}));return r;
}
const firstNested=r=>r.document.ir.semantic_contracts.find(c=>r.graph.positions.has(c.node)&&!r.graph.positions.get(c.node).expanded&&F.references(c.roles,r.graph.idx.nodes).some(ref=>r.graph.idx.nodes.get(ref.node)?.kind==='compute'));
const request=(c,keys)=>({node:c.node,certificate:c.id,role:keys});
for(const [name,input]of [['SeparateStages',folder+'/SeparateStages.json'],['SameSource','verification/semantic-design/current/after/SameSource.json']]){
 const before=render(name+'-before',input,base,old),main=render(name+'-main',input,base);assert.equal(before.svg,main.svg);
 const c=firstNested(main);assert.ok(c);const pathState={...base,paperRolePaths:[request(c,['scores'])]};
 const partial=render(name+'-path',input,pathState),full=render(name+'-all-roles',input,{...base,paperRoleDetails:[c.node]});
 const folded=render(name+'-refolded',input,{...base,paperRolePaths:[]});assert.equal(folded.svg,main.svg);
 if(name==='SeparateStages'){
  assert.ok(main.graph.nodes.length<partial.graph.nodes.length&&partial.graph.nodes.length<full.graph.nodes.length);
  assert.ok(!partial.graph.positions.has(c.roles.softmax)&&full.graph.positions.has(c.roles.softmax));
  render(name+'-source-detail',input,{...pathState,paperAuto:false,open:[...partial.graph.idx.children.keys()].filter(Boolean)});
 }
 comparisons.push({name,default_svg_unchanged:true,refold_svg_identical:true,main:rows.find(r=>r.name===name+'-main').nodes,path:partial.graph.nodes.length,all_roles:full.graph.nodes.length});
}
for(const name of ['UnknownFusion','BrokenCell','ConditionalCarry']){
 const input='verification/local-relations/current/'+name+'.json',before=render(name+'-before',input,base,old),after=render(name+'-current',input,base);assert.equal(before.svg,after.svg);
 comparisons.push({name,default_svg_unchanged:true});
}
const input='verification/symbolic-values/current/transformer-current.json',main=render('transformer-main',input,base);
assert.equal(main.svg,fs.readFileSync(path.join(root,'verification/input-docks/current/transformer-current.svg'),'utf8'));
// An explicit ordinary geometry profile isolates local semantic selection from
// full automatic policy reselection. These are user-facing supported options,
// used equally before/after; no production case lookup or reference coordinates.
const profile={...main.prepared.routing.input_dock_refinement.configuration,paperLabelSpacing:main.graph.publication.label_clearance?.mode||'global'};
const fixed=render('transformer-fixed-main',input,profile),c=firstNested(main);
const single=render('transformer-fixed-path',input,{...profile,paperRolePaths:[request(c,['scores'])]});
const core=render('transformer-fixed-core',input,{...profile,paperRolePaths:['scores','softmax','output'].map(k=>request(c,[k]))});
comparisons.push({name:'transformer',default_svg_unchanged:true,fixed_profile:true,main:main.graph.nodes.length,path:single.graph.nodes.length,core:core.graph.nodes.length,
 scope:'Explicit fixed geometry profile; not evidence of default automatic path-selection quality or performance.'});
for(const [f,h]of Object.entries(implementation))assert.equal(sha(f),h,'producer changed: '+f);
const reference='verification/generic-convergence/current/reference-expanded.svg';
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'role-paths-render/1',implementation_sha256:implementation,checkpoint:checkpoint+'/snapshot.json',checkpoint_sha256:sha(checkpoint+'/snapshot.json'),
 extraction:folder+'/extraction.json',extraction_sha256:sha(folder+'/extraction.json'),rows,comparisons,reference:{file:reference,sha256:sha(reference)},goal_complete:false},null,2)+'\n');

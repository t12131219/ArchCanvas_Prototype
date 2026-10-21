'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=root+'/verification/panel-refinement/current';fs.mkdirSync(out,{recursive:true});
const {renderer:R,diagrams:D}=require('./load_publication_renderer.cjs')(root+'/semantic_studio',{diagramSet:true});
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=fs.readdirSync(root+'/semantic_studio').filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f).concat(['tools/audit_panel_refinement.cjs','tools/load_publication_renderer.cjs']);
const hashes=Object.fromEntries(files.map(f=>[f,sha(root+'/'+f)])),rows=[],cases=[],columns=[];
function save(name,input,r){
 const svg=name+'.svg',document=name+'.layout.json';fs.writeFileSync(out+'/'+svg,r.svg);fs.writeFileSync(out+'/'+document,JSON.stringify(r.document));
 rows.push({name,input,input_sha256:sha(root+'/'+input),state:r.document.state,svg,svg_sha256:sha(out+'/'+svg),document,document_sha256:sha(out+'/'+document),
  nodes:r.graph.nodes.length,edges:r.graph.edges.length,quality:r.prepared.quality});return name;
}
for(const [name,input,roles]of [
 ['NestedWorkshop','verification/detail-alternatives/experiment/NestedWorkshop.json',false],
 ['SameSource','verification/semantic-design/current/after/SameSource.json',true]
]){
 const ir=JSON.parse(fs.readFileSync(root+'/'+input)),original=JSON.stringify(ir),s={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false,...(!roles?{paperBudget:4}:{})};
 const base=R.render(ir,s),state={...s,paperAuto:false,open:base.graph.publication.open},main=R.render(ir,state);
 const scope=roles?base.graph.nodes.find(n=>n.contract_roles?.attention).id:D.plan(ir,main,state).candidates.find(c=>c.kind==='computation-paths').state.paperFocus;
 const localState={...s,paperFocus:scope,paperAuto:false,open:[scope]},local=R.render(ir,localState);
 const mainName=save(name+'-main',input,main),localName=save(name+'-before',input,local),captures=[{name:mainName,result:main},{name:localName,result:local}];
 const initialPanels=[{id:'main',state,result:main},{id:'local',anchor:scope,label:'Exact local scope',state:localState,result:local,refinable:true}];let seq=0;
 const renderer={render:(ir,s)=>{const r=R.render(ir,s);captures.push({name:save(name+'-trial-'+(++seq),input,r),result:r});return r;}};
 const set=D.joint(ir,state,renderer,{main,initialPanels,maxPanels:2,maxTrials:2});
 const panels=set.panels.map(({result,...p})=>({...p,capture:captures.find(c=>c.result===result).name}));
 assert.equal(set.panels[0].result,main);assert.equal(set.panels.length,2);assert.ok(set.attempts.some(t=>t.accepted&&t.target_panel==='local'));
 assert.equal(original,JSON.stringify(ir));
 cases.push({name,input,scope,initial_panels:[{id:'main',capture:mainName},{id:'local',capture:localName}],panels,
  plan:set.plan,attempts:set.attempts,baseline_coverage:set.baseline_coverage,coverage:set.coverage,rendered_trials:set.rendered_trials,limits:set.limits});
 console.log(JSON.stringify({name,before:local.graph.nodes.length,after:set.panels[1].result.graph.nodes.length,
  old_direct:set.baseline_coverage.filter(c=>c.status==='fulfilled').length,current_direct:set.coverage.filter(c=>c.status==='fulfilled').length}));
}
{
 const name='InterruptedPaths',input='verification/branch-columns/current/InterruptedPaths.json',ir=JSON.parse(fs.readFileSync(root+'/'+input)),original=JSON.stringify(ir);
 const state={mode:'source',view:'publication',paperMedium:'canvas',paperGranularity:'roles',paperAdaptive:false};
 const before=R.render(ir,{...state,paperBranchColumns:false}),after=R.render(ir,{...state,paperBranchColumns:true});
 const beforeName=save(name+'-columns-before',input,before),afterName=save(name+'-columns-after',input,after),plan=D.plan(ir,before,state);
 assert.equal(original,JSON.stringify(ir));assert.deepEqual(after.graph.nodes.map(n=>n.id),before.graph.nodes.map(n=>n.id));
 const unknowns=ir.nodes.filter(n=>n.kind==='opaque').map(n=>n.id);assert.ok(unknowns.length&&unknowns.every(id=>after.graph.positions.has(id)));
 columns.push({name,input,before:beforeName,after:afterName,unknowns,plan,before_coverage:D.coverage(ir,plan,[{id:'local',result:before}]),after_coverage:D.coverage(ir,plan,[{id:'local',result:after}])});
}
for(const [f,h]of Object.entries(hashes))assert.equal(sha(root+'/'+f),h,'stale implementation');
fs.writeFileSync(out+'/render-report.json',JSON.stringify({schema:'panel-refinement/1',implementation_sha256:hashes,rows,cases,columns,goal_complete:false},null,2)+'\n');
const panel=(title,capture)=>'<section data-panel="'+capture+'"><h3>'+title+'</h3><div class="viewport">'+fs.readFileSync(out+'/'+capture+'.svg','utf8')+'</div></section>';
fs.writeFileSync(out+'/review.html','<!doctype html><meta charset="utf-8"><title>已有详图的继续展开</title><style>body{font:16px system-ui;margin:24px;color:#24384a;background:#f5f7fb}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}section{min-width:0;background:white;border:1px solid #ccd4df;padding:16px}.viewport{overflow:auto;max-height:800px}svg{max-width:none}h2{margin-top:36px}</style><h1>已有详图的继续展开</h1><p>两张图的名额已用满：固定主图，细化规划器选中的已有详图。独立检查原始操作数、作用域和已表达目标；手工固定的图不参与自动替换。</p>'+cases.map(c=>'<h2>'+c.name+'</h2><p>原生 SVG；图组直接目标 '+c.baseline_coverage.filter(r=>r.status==='fulfilled').length+' → '+c.coverage.filter(r=>r.status==='fulfilled').length+'。主图保持原样，详图作用域保持原样。</p><div class="grid">'+panel('原详图',c.initial_panels[1].capture)+panel('继续展开后的详图',c.panels[1].capture)+'</div>').join('')+columns.map(c=>'<h2>'+c.name+'：展开的未知调用外框</h2><p>只调整独立依赖路径的列布局。未知调用保留真实输入输出和来源外框，不推断其内部行为。</p><div class="grid">'+panel('普通布局',c.before)+panel('按依赖路径排列',c.after)+'</div>').join(''));

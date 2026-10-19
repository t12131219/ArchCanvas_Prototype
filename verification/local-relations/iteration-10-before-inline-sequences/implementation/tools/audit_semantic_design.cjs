#!/usr/bin/env node
/* Matched extraction + drawing comparisons across independently written models.
 * The baseline and current renderers have isolated VM registries. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'verification/semantic-design/current');
const read=file=>JSON.parse(fs.readFileSync(file)),save=(name,value)=>{const p=path.join(out,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
const load=require('./load_publication_renderer.cjs'),B=load(path.join(root,'verification/semantic-design/baseline/semantic_studio')),R=require('../semantic_studio/publication-renderer.js');
const analysis=read(path.join(out,'analysis-report.json')),results=[],comparisons=[],cards=[];
const json=value=>JSON.parse(JSON.stringify(value));
function accounting(ir,g){
  for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
    const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length,key);assert.deepEqual(ids.slice().sort(),items.map(x=>x.id).sort());
  }
  for(const node of ir.nodes)assert.ok(g.architecture.nodes.some(n=>n.id===node.id),'canonical node absent');
  const visible=g.edges.flatMap(e=>(e.bundle_members||[e]).map(m=>m.id));
  assert.deepEqual(visible.slice().sort(),g.edge_accounting.visible.slice().sort());
}
const metrics=o=>({nodes:o.graph.nodes.length,edges:o.graph.edges.length,font_pt:o.prepared.quality.min_print_font_pt,
  width_mm:o.prepared.quality.width_mm,height_mm:o.prepared.quality.height_mm,crossings:o.prepared.quality.line_geometry.crossings,
  contacts:o.prepared.quality.line_geometry.unrelated_contacts.length,wire_length:o.prepared.quality.wire_length,issues:o.prepared.quality.issues});
function record(name,ir,state,engine=R){
  console.log('render '+name);
  const canonical=JSON.stringify(ir),o=engine.render(ir,state);accounting(ir,o.graph);
  assert.equal(JSON.stringify(ir),canonical,'canonical input changed');
  const filename='figures/'+name;
  save(filename+'.svg',o.svg);save(filename+'.layout.json',o.document);
  const siblings=new Map();for(const node of o.graph.nodes){const p=o.graph.positions.get(node.id);if(!siblings.has(node.parent))siblings.set(node.parent,[]);siblings.get(node.parent).push(p);}
  let overlap=0;for(const ps of siblings.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const a=ps[i],b=ps[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)overlap++;
  }
  const row={name,svg:filename+'.svg',document:filename+'.layout.json',state,metrics:metrics(o),overlap,
    failures:o.prepared.quality.route_failures,granularity:o.graph.publication.granularity,
    granularity_refinement:o.prepared.routing.granularity_refinement,representative:o.graph.publication.representative,
    certified_bypass_edges:o.graph.edges.filter(e=>e.design_route?.kind==='bypass').map(e=>e.id)};
  results.push(row);return {o,row};
}
for(const item of analysis.cases){
  const name=item.name,old=read(path.join(out,'before',name+'.json')),ir=read(path.join(out,'after',name+'.json'));
  const before=record(name+'-before',old,{},B),after=record(name+'-overview',ir,{}),layoutOnly=record(name+'-drawing-only',old,{});
  comparisons.push({name,before:before.row.metrics,after:after.row.metrics,baseline_ir_current_drawing:layoutOnly.row.metrics,
    note:'before/after use matched source and constructor; node IDs and extraction granularity may differ'});
  cards.push({name,before:before.row.svg,after:after.row.svg});
  for(const paperGranularity of ['modules','detailed'])record(name+'-'+paperGranularity,ir,{paperGranularity});
  for(const sequence of ir.nodes.filter(n=>n.repeat_contract?.homogeneous)){
    const representative=record(name+'-representative-'+sequence.id.split('/').at(-1).replaceAll(':','-'),ir,
      {paperFocus:sequence.id,paperRepresentative:true,paperGranularity:'modules'});
    assert.equal(representative.o.graph.publication.representative?.sequence,sequence.id);
    assert.equal(representative.o.graph.publication.representative?.count,sequence.repeat_contract.count);
    assert.equal(representative.o.graph.publication.representative?.parameter_sharing,sequence.repeat_contract.parameter_sharing);
  }
  // Each locally certified computation receives its own detailed panel. This
  // avoids equating a whole-model detail request with an unreadable full graph.
  for(const c of ir.semantic_contracts||[])if(['feed-forward','multihead-attention'].includes(c.rule)){
    if(ir.nodes.filter(n=>n.repeat_index!=null).length>2)continue;
    record(name+'-contract-'+c.id.replaceAll(':','-'),ir,{paperFocus:c.node,paperGranularity:'detailed'});
  }
}
for(const name of ['comparison-small','ForeignComposition','SharedStack','IndependentStack']){
  const file=path.join(out,'after',name+'-runtime.json');if(!fs.existsSync(file))continue;
  const ir=read(file);if(!ir.nodes.some(n=>n.id==='runtime-observations'))continue;
  for(const mode of ['source','runtime','merged'])record(name+'-'+mode,ir,{mode});
  for(const group of ir.observation_index?.trace_groups||[])if(group.runs.length>1){
    const overview=R.render(ir,{mode:'runtime'});assert.ok(overview.graph.architecture.nodes.some(n=>n.observation_group?.id===group.id));
    const scope=record(name+'-representative-trace',ir,{mode:'runtime',paperFocus:group.representative});
    assert.equal(scope.o.graph.publication.focus,group.representative);
  }
}
const files=['semantic_studio/architecture.js','semantic_studio/architecture-layout.js','semantic_studio/semantic-engine.js','semantic_studio/branch-regions.js','semantic_studio/publication.js','semantic_studio/publication-renderer.js','semantic_studio/app.js','semantic_studio/index.html','tools/audit_semantic_design.cjs'];
const report={schema:'semantic-design-render-audit/1',cases:analysis.cases.length,panels:results.length,
  results,comparisons,canonical_ir_unchanged:true,complete_accounting:true,
  current_issues:results.filter(r=>!r.name.endsWith('-before')&&!r.name.endsWith('-drawing-only')&&(r.overlap||r.failures.length||r.metrics.issues.length)),
  implementation_sha256:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),
  limits:['Automated quality is not semantic completeness or visual acceptance.',
    'Detail is measured at print scale; deferred modules remain available in focused panels.',
    'Transformer is a comparison only; no case name or source hash selects semantic/layout rules.']};
save('render-report.json',report);
save('comparison.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>通用语义与绘图审核</title><style>body{font:16px Arial;color:#293746;background:#edf1f5;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{background:white;padding:20px;margin:20px 0}object{width:100%;height:600px}a{color:#365e8b}</style><h1>同源码、同配置的通用适配比较</h1><p>左：冻结的抽取器与绘图器；右：当前实现。每图另有模块、细节、代表实例及完整原始连接记录。CPU 复用与新执行记录分别保留。</p>${cards.map(c=>`<section><h2>${c.name}</h2><div class="pair"><div>修改前<object data="${c.before}" type="image/svg+xml"></object></div><div>当前<object data="${c.after}" type="image/svg+xml"></object></div></div><a href="${c.after}">打开当前 SVG</a></section>`).join('')}</html>`);
console.log(JSON.stringify({cases:report.cases,panels:report.panels,current_issues:report.current_issues.map(r=>({name:r.name,issues:r.metrics.issues,failures:r.failures.length,overlap:r.overlap}))}));
if(report.current_issues.length)process.exitCode=1;

#!/usr/bin/env node
/* Bounded semantic main/detail set; the browser uses the same pure planner. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const R=require('../semantic_studio/publication-renderer.js'),D=require('../semantic_studio/diagram-set.js');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function exportSet(ir,output,{state={paperMedium:'canvas',paperGranularity:'roles'},maxPanels=6,maxTrials=8,main,policy}={}){
  fs.mkdirSync(output,{recursive:true});const before=JSON.stringify(ir),set=D.render(ir,state,R,{maxPanels,maxTrials,main,policy});
  if(JSON.stringify(ir)!==before)throw Error('Diagram planning changed canonical IR');
  const panels=set.panels.map((p,i)=>{
    const base=String(i).padStart(3,'0')+(i?'-detail':'-main'),svg=base+'.svg',document=base+'.layout.json';
    fs.writeFileSync(path.join(output,svg),p.result.svg);fs.writeFileSync(path.join(output,document),JSON.stringify(p.result.document,null,2)+'\n');
    return {id:p.id,anchor:p.anchor,label:i?(p.label||set.plan.candidates.find(r=>r.id===p.id)?.label||p.id):ir.title,svg,document,
      svg_sha256:sha(p.result.svg),document_sha256:sha(fs.readFileSync(path.join(output,document))),state:p.state,
      nodes:p.result.graph.nodes.length,edges:p.result.graph.edges.length,quality:p.result.prepared.quality,
      boundary:p.result.graph.publication.boundary};
  });
  const files=[...fs.readdirSync(path.resolve(__dirname,'../semantic_studio')).filter(f=>f.endsWith('.js')).map(f=>'semantic_studio/'+f),
    'tools/export_diagram_set.cjs'];
  const manifest={schema:D.VERSION,canonical_sha256:sha(before),state,limits:{max_panels:maxPanels,max_trials:maxTrials},
    scope:set.scope,plan:set.plan,panels,attempts:set.attempts,coverage:set.coverage,deferred_goals:set.deferred_goals,
    complete:set.complete,main_unchanged:set.main_unchanged,policy:set.policy||'sequential',
    ...(set.policy==='joint'?{baseline_coverage:set.baseline_coverage,rendered_trials:set.rendered_trials,selection_scope:set.scope}:{}),
    quality_pass:panels.every(p=>!p.quality.issues.length),
    implementation_sha256:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.resolve(__dirname,'..',f)))]))};
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const links=panels.map((p,i)=>`<a href="#panel-${i}">${esc(p.label)}</a>`).join(' · ');
  const cards=panels.map((p,i)=>`<article id="panel-${i}" data-panel="${esc(p.id)}"><h2>${i?'局部详图 · ':'主图 · '}${esc(p.label)}</h2>
<p>${p.nodes} 图元 / ${p.edges} 边 · ${p.quality.native_width_px} × ${p.quality.native_height_px} px · ${p.quality.line_geometry.crossings} 交叉</p>
${i?'<p><a href="#panel-0">返回主图</a> · 主图对应区域：<code>'+esc(p.anchor)+'</code></p>':''}
<object type="image/svg+xml" data="${p.svg}" aria-label="${esc(p.label)}"></object><p><a href="${p.svg}">SVG</a> · <a href="${p.document}">可继续展开的图文档</a></p>
<details><summary>本图承担的表达与精确边界</summary><pre>${esc(JSON.stringify({goals:set.coverage.filter(r=>r.panels.includes(p.id)),boundary:p.boundary},null,2))}</pre></details></article>`).join('');
  fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(ir.title)} · 主图与局部详图</title>
<style>body{font:16px Arial;color:#293746;max-width:1200px;margin:24px auto;padding:0 20px}article{border:1px solid #bfcbd6;padding:20px;margin:24px 0}object{display:block;width:100%;height:720px}pre,code{overflow-wrap:anywhere;white-space:pre-wrap}nav{line-height:2}</style>
<h1>${esc(ir.title)} · 主图与局部详图</h1><p>主图保留语义摘要；局部详图展示更多角色和计算，可从图文档继续展开。原始实例分别记录，不因结构相似合并。</p>
<p>${set.coverage.filter(r=>r.status==='fulfilled').length} / ${set.coverage.length} 项直接表达 · ${set.deferred_goals.length} 项待展开。图组尚未表达的内容不会计为完成。</p><nav>${links}</nav>${cards}
<details><summary>尚未表达的内容与资源限制</summary><pre>${esc(JSON.stringify({limits:manifest.limits,deferred_goals:set.deferred_goals,attempts:set.attempts.map(a=>({request:a.request,accepted:a.accepted,reason:a.reason}))},null,2))}</pre></details></html>\n`);
  return {manifest,set};
}
if(require.main===module){
  const [input,output,...args]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node tools/export_diagram_set.cjs INPUT OUTPUT [--max-panels N] [--max-trials N]');
  const option=(key,fallback)=>args.includes(key)?Number(args[args.indexOf(key)+1]):fallback,value=JSON.parse(fs.readFileSync(input));
  const {manifest:m}=exportSet(value.ir||value,output,{state:value.state||{paperMedium:'canvas',paperGranularity:'roles'},maxPanels:option('--max-panels',6),maxTrials:option('--max-trials',8),policy:args.includes('--joint')?'joint':undefined});
  console.log(JSON.stringify({panels:m.panels.length,fulfilled:m.coverage.filter(c=>c.status==='fulfilled').length,goals:m.coverage.length,deferred:m.deferred_goals.length,complete:m.complete}));
}
module.exports={exportSet};

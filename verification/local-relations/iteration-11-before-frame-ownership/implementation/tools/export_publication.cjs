#!/usr/bin/env node
/* Source-backed overview + recursive module panels. No model-family templates. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const Goals=require('../semantic_studio/expression-goals.js');
const Representatives=require('./representative_atlas.cjs');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readInput(input){const value=JSON.parse(fs.readFileSync(input));if(['semantic-canvas/1','archcanvas-architecture-document/1'].includes(value.schema))return {ir:value.ir,state:value.state||{}};return {ir:value,state:{}};}
function exportAtlas(ir,output,options={}){
  E.validate(ir);fs.mkdirSync(output,{recursive:true});
  const state={mode:'source',...(options.state||{}),view:'publication',paperAuto:true,offsets:{},paperFocus:null};
  const plan=P.plan(ir),idx=E.index(plan),source=n=>{let id=n.id;while(id){if(id==='runtime-observations'||id.startsWith('runtime:'))return false;id=idx.nodes.get(id)?.parent;}return true;};
  const focus=plan.nodes.filter(n=>n.kind==='composite'&&n.parent&&(idx.children.get(n.id)||[]).length&&(state.mode!=='source'||source(n)));
  const goalSet=Goals.build(ir,plan),eligibleGoal=goal=>{const n=idx.nodes.get(goal.focus_node);return n&&(state.mode!=='source'||source(n))&&(state.mode!=='runtime'||!source(n));};
  goalSet.goals=goalSet.goals.filter(eligibleGoal);
  const representatives=Representatives.plan(ir,goalSet.goals);
  goalSet.goals.push(...representatives.boundaries);
  const representedScopes=representatives.sequences.flatMap(s=>s.rows.filter(r=>r.status==='proved').map(r=>s.closure(r.instance)));
  const represented=id=>{while(id){if(representedScopes.some(s=>s.has(id)))return true;id=idx.nodes.get(id)?.parent;}return false;};
  const pages=[{id:null,label:ir.title||'Overview'},...focus.filter(n=>!represented(n.id)).map(n=>({id:n.id,label:n.module_path||n.label})),...representatives.pages],panels=[],textCards=[],fulfilled=new Map();
  const supplemental=goalSet.goals.slice().sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  const requestedRelations=new Set();
  const limits=options.maxPanels==null?Infinity:Math.max(1,Math.floor(options.maxPanels));
  for(let i=0;i<pages.length&&i<limits;i++){
    const p=pages[i];
    const base=String(i).padStart(3,'0')+'-'+(i===0?'overview':p.label.replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,60)||'module');
    const out=R.render(ir,{...state,paperFocus:p.id,paperRelation:p.relation||null,paperRepresentative:p.group!=null,paperRepresentativeGroup:p.group??null,paperGranularity:p.relation||p.group!=null?'detailed':state.paperGranularity}),g=out.graph;
    const boundaryCoverage=Goals.evaluate({goals:representatives.boundaries},g,out.prepared);
    const receipts=new Map([...g.expression_coverage.filter(c=>goalSet.goals.some(g=>g.id===c.goal)).map(c=>({...c,method:'direct'})),...boundaryCoverage.map(c=>({...c,method:'direct'}))].map(c=>[c.goal,c]));
    for(const c of Representatives.coverage(representatives,out))if(receipts.get(c.goal)?.status!=='fulfilled')receipts.set(c.goal,c);
    const coverage=[...receipts.values()];
    out.document.atlas_expression_coverage=coverage;
    fs.writeFileSync(path.join(output,base+'.svg'),out.svg);
    fs.writeFileSync(path.join(output,base+'.layout.json'),JSON.stringify(out.document,null,2)+'\n');
    if(options.textQA)textCards.push(`<article data-case="${esc(ir.title)}" data-focus="${esc(p.id||'')}"><h2>${esc(p.label)}</h2>${out.svg}</article>`);
    for(const c of coverage)if(c.status==='fulfilled'&&!out.prepared.quality.issues.length){if(!fulfilled.has(c.goal))fulfilled.set(c.goal,[]);fulfilled.get(c.goal).push(base+'.svg');}
    panels.push({id:p.group!=null?p.id+':structure-group:'+p.group:p.relation||p.id||g.publication.focus,label:p.label,overview:i===0,relation:p.relation||null,representative:g.publication.representative,svg:base+'.svg',document:base+'.layout.json',expression_coverage:coverage,
      nodes:g.nodes.length,edges:g.edges.length,boundary:g.publication.boundary,wire_bundles:g.publication.wire_bundles,quality:out.prepared.quality,
      node_accounting:g.node_accounting,edge_accounting:g.edge_accounting,
      canonical_members:g.nodes.filter(n=>!g.positions.get(n.id).expanded).map(n=>({id:n.id,members:n.canonical_members||[n.id],unknowns:n.paper.unknown_count}))});
    if(i===pages.length-1)for(const goal of supplemental)if(!fulfilled.has(goal.id)){
      const relation=goal.relation||'node:'+goal.focus_node;if(requestedRelations.has(relation))continue;requestedRelations.add(relation);
      pages.push({id:null,relation,label:goal.kind+' · '+(idx.nodes.get(goal.focus_node)?.label||goal.focus_node),goals:[goal.id]});
    }
  }
  const implementations=['semantic_studio/symbolic-values.js','semantic_studio/structural-representatives.js','semantic_studio/sequence-frontier.js','semantic_studio/presentation-regions.js','semantic_studio/local-relations.js','semantic_studio/relation-constraints.js','semantic_studio/expression-goals.js','semantic_studio/branch-regions.js','semantic_studio/publication.js','semantic_studio/publication-renderer.js','semantic_studio/architecture.js','semantic_studio/architecture-layout.js','semantic_studio/semantic-engine.js','tools/representative_atlas.cjs','tools/symbolic_values.cjs','tools/export_publication.cjs'];
  const expressionGoals=goalSet.goals.map(g=>({...g,panels:fulfilled.get(g.id)||[],status:fulfilled.has(g.id)?'fulfilled':'unfulfilled',coverage_methods:[...new Set(panels.flatMap(p=>p.quality.issues.length?[]:p.expression_coverage.filter(c=>c.goal===g.id&&c.status==='fulfilled').map(c=>c.method)))]}));
  const manifest={schema:'archcanvas-publication-atlas/1',title:ir.title,canonical_digest:ir.ir_digest||null,
    canonical_nodes:ir.nodes.length,canonical_edges:ir.edges.length,unknown_operations:ir.nodes.filter(n=>n.kind==='opaque').map(n=>({id:n.id,label:n.label,reason:n.reason})),
    complete:pages.length===panels.length&&expressionGoals.every(g=>g.status==='fulfilled'),omitted_panels:pages.slice(limits),expression_goals:expressionGoals,
    unfulfilled_goals:expressionGoals.filter(g=>g.status!=='fulfilled').map(g=>g.id),
    structural_representatives:{diagnostics:representatives.diagnostics,groups:representatives.pages,scope:'Common local computations only; instance boundaries and identity remain direct obligations.'},
    implementation_sha256:Object.fromEntries(implementations.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',file))).digest('hex')])),
    panels,quality_pass:panels.every(p=>p.quality.issues.length===0)};
  manifest.audit_digest=crypto.createHash('sha256').update(JSON.stringify({ir,state,implementation:manifest.implementation_sha256,panels:panels.map(p=>p.id)})).digest('hex');
  if(options.textQA){
    manifest.text_qa='text-qa.html';
    fs.writeFileSync(path.join(output,manifest.text_qa),`<!doctype html><html><meta charset="utf-8"><meta name="publication-audit-digest" content="${manifest.audit_digest}"><title>Publication text QA · ${esc(ir.title)}</title><style>body{font:16px Arial;margin:24px}article{border:1px solid #ccc;padding:20px;margin:20px 0}svg{display:block;max-width:100%;height:auto}</style>${textCards.join('')}`);
  }
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const ids=new Map(panels.map((p,i)=>[p.id,i]));
  const cards=panels.map((p,i)=>{const n=idx.nodes.get(p.id),parent=ids.get(n?.parent),children=panels.filter(c=>idx.nodes.get(c.id)?.parent===p.id);return `<article id="panel-${i}"><h2>${esc(p.label)}</h2><p>${p.overview?'模型总览':'模块详图'} · ${p.quality.min_print_font_pt} pt · ${Number(p.quality.width_mm.toFixed(1))} × ${p.quality.height_mm} mm · ${p.quality.issues.length?'需调整：'+esc(p.quality.issues.join(', ')):'通过当前几何与字号检查'}</p><nav>${parent!=null?`<a href="#panel-${parent}">上层模块</a> · `:''}${children.map(c=>`<a href="#panel-${ids.get(c.id)}">${esc(c.label)}</a>`).join(' · ')}</nav><object type="image/svg+xml" data="${p.svg}" aria-label="${esc(p.label)}"></object><p><a href="${p.svg}">矢量 SVG</a> · <a href="${p.document}">布局、源码证据与完整节点/边记录</a></p><details><summary>${p.boundary.length} 条原始边界依赖</summary><pre>${esc(JSON.stringify(p.boundary,null,2))}</pre></details></article>`;}).join('');
  fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(ir.title)} · 架构图册</title><style>body{font:16px Arial,sans-serif;line-height:1.5;color:#293746;background:#eef1f5;margin:24px auto;max-width:1120px;padding:0 20px}article{background:#fff;border:1px solid #d7dfe8;border-radius:8px;padding:24px;margin:24px 0}object{display:block;width:100%;height:720px;margin-top:20px}a{color:#365e8b}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}nav{display:flex;gap:12px;flex-wrap:wrap}@media print{body{background:white}article{break-before:page}object{height:230mm}}</style><h1>${esc(ir.title)} · 架构图册</h1><p>按实际依赖生成总览与模块详图。无节点的线条交叉表示跨越；未知操作保留虚线边框和来源。字号和路径检查仅衡量已提取结构的部分绘图质量。</p><p>${ir.nodes.length} 个原始节点 · ${ir.edges.length} 条原始依赖 · ${manifest.unknown_operations.length} 个未知操作 · ${panels.length}/${pages.length} 个图面</p><nav>${panels.map((p,i)=>`<a href="#panel-${i}">${esc(p.label)}</a>`).join('')}</nav>${cards}</html>\n`);
  return manifest;
}
if(require.main===module){
  const [input,output,...args]=process.argv.slice(2);
  if(!input||!output){console.error('Usage: node tools/export_publication.cjs input.json output-directory [--width-mm 180] [--mode source|runtime|merged] [--max-panels N] [--exact-width] [--strict] [--text-qa]');process.exit(2);}
  const option=(name,fallback)=>{const at=args.indexOf(name);if(at<0)return fallback;if(!args[at+1])throw Error('missing '+name);return args[at+1];};
  const {ir,state}=readInput(input),mode=option('--mode','source'),width=Number(option('--width-mm',state.paperWidthMm||180)),limit=Number(option('--max-panels','Infinity'));
  if(!['source','runtime','merged'].includes(mode)||!Number.isFinite(width)||width<80||width>400||!(limit>=1))throw Error('invalid mode, width or panel limit');
  const manifest=exportAtlas(ir,path.resolve(output),{state:{...state,mode,paperWidthMm:width,paperFitPage:!args.includes('--exact-width')},maxPanels:limit,textQA:args.includes('--text-qa')});
  console.log(JSON.stringify({atlas:path.resolve(output,'index.html'),panels:manifest.panels.length,complete:manifest.complete,quality_pass:manifest.quality_pass,issues:manifest.panels.filter(p=>p.quality.issues.length).map(p=>({id:p.id,issues:p.quality.issues}))}));
  if(args.includes('--strict')&&(!manifest.quality_pass||!manifest.complete))process.exitCode=1;
}
module.exports={exportAtlas,readInput};

#!/usr/bin/env node
/* Read extraction artifacts, never execute or modify the external notebooks. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const root=path.resolve(__dirname,'..'),output=path.join(root,'verification/publication'),corpus=path.join(root,'verification/architecture/corpus');
const extraction=JSON.parse(fs.readFileSync(path.join(corpus,'extraction.json'))),results=[],textCards=[],textQA=process.argv.includes('--text-qa');
fs.mkdirSync(output,{recursive:true});
const errors=[],branchRegions=[],dependencyBands=[],contentInventories=[];
for(const item of extraction.results){
  if(!item.ir)continue;
  const ir=JSON.parse(fs.readFileSync(path.join(corpus,item.ir))),canonical=JSON.stringify(ir),plan=P.plan(ir),idx=E.index(plan);
  for(const finding of plan.findings.filter(f=>f.rule==='branch-region'))branchRegions.push({id:item.id,finding:finding.id,paths:finding.roles.paths.length});
  for(const finding of plan.findings.filter(f=>f.rule==='dependency-band'))dependencyBands.push({id:item.id,finding:finding.id,units:finding.roles.units.length});
  for(const n of plan.nodes.filter(n=>n.content_inventory)){
    const c=n.content_inventory,f=plan.findings.find(f=>f.id===n.finding);
    assert.equal(c.multiplicity,'extracted-units');assert.equal(c.execution_order,'not-asserted');assert.equal(c.parameter_sharing,'not-asserted');assert.equal(c.tensor_equality,'not-asserted');
    assert.deepEqual(c.units.map(u=>u.id),f.roles.units);assert.equal(new Set(c.units.map(u=>u.id)).size,c.units.length);
    assert.deepEqual(c.terms.flatMap(t=>{assert.equal(t.count,t.units.length);return t.units;}).sort(),c.units.map(u=>u.id).sort());
    for(const u of c.units){const source=idx.nodes.get(u.id);assert.equal(u.label,source.label);assert.equal(u.mutable,!!source.mutable);if(source.kind==='opaque')assert.equal(u.origin,'unresolved');}
    contentInventories.push({id:item.id,node:n.id,units:c.units.length,caption:n.paper.caption_scope==='unit-inventory'});
  }
  const focuses=[null,...plan.nodes.filter(n=>n.kind==='composite'&&n.parent&&(idx.children.get(n.id)||[]).length).map(n=>n.id)];
  for(const focus of focuses){
    try{
      const out=R.render(ir,{paperFocus:focus}),g=out.graph;
      for(const [key,items]of [['edge_accounting',ir.edges],['node_accounting',ir.nodes]]){const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length,key);assert.deepEqual(ids.sort(),items.map(x=>x.id).sort());}
      const rows=new Map();for(const n of g.nodes){if(!rows.has(n.parent))rows.set(n.parent,[]);rows.get(n.parent).push(g.positions.get(n.id));}
      let overlap=0;for(const ps of rows.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)if(R.overlap(ps[i],ps[j]))overlap++;
      const missing=g.publication.boundary.filter(e=>!g.positions.has(e.visible_node));
      const orphan=g.nodes.filter(n=>n.boundary_edge&&!g.edges.some(e=>e.source===n.id||e.target===n.id));
      const shared=g.nodes.filter(n=>n.boundary_uses?.length>1);
      for(const port of shared){
        assert.equal(port.boundary_value.tensor_equality,'not-asserted');
        for(const use of port.boundary_uses){
          assert.deepEqual(use,ir.edges.find(e=>e.id===use.id));
          assert.equal(g.publication.boundary.find(e=>e.id===use.id)?.port_node,port.id);
        }
      }
      assert.deepEqual(g.edges.flatMap(e=>(e.bundle_members||[e]).map(m=>m.id)).sort(),g.edge_accounting.visible.slice().sort());
      assert.ok(out.prepared.quality.line_geometry.crossings<=out.prepared.routing.baseline_crossings);
      const row={id:item.id,entry:item.entry,file:path.relative(extraction.source_root,item.file),cell:item.cell,focus,
        canonical_digest:ir.ir_digest,
        routing:out.prepared.routing,
        shared_result_terminals:shared.length,shared_result_uses:shared.reduce((s,n)=>s+n.boundary_uses.length,0),
        nodes:g.nodes.length,edges:g.edges.length,unknown:g.publication.unknowns,overlap,missing_boundary_ports:missing.map(e=>e.id),orphan_boundary_ports:orphan.map(n=>n.id),...out.prepared.quality};
      results.push(row);
      if(textQA)textCards.push(`<article data-case="${item.id}" data-focus="${String(focus||'').replaceAll('"','&quot;')}"><h2>${item.entry}</h2>${out.svg}</article>`);
      if(!focus){const dir=path.join(output,'corpus');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,item.id+'.svg'),out.svg);}
      assert.equal(JSON.stringify(ir),canonical,'canonical IR mutated');
    }catch(error){errors.push({id:item.id,focus,error:error.stack});}
  }
}
const implementation=['semantic_studio/branch-regions.js','semantic_studio/publication.js','semantic_studio/publication-renderer.js','semantic_studio/semantic-engine.js','semantic_studio/architecture.js','semantic_studio/architecture-layout.js','tools/audit_publication.cjs'];
const issueCounts={};for(const r of results)for(const issue of r.issues)issueCounts[issue]=(issueCounts[issue]||0)+1;
const report={schema:'publication-corpus-audit/2',models:extraction.extracted,panels:results.length,overview:results.filter(r=>!r.focus).length,
  quality_pass:results.filter(r=>!r.issues.length).length,overlap:results.reduce((s,r)=>s+r.overlap,0),
  missing_boundary_ports:results.reduce((s,r)=>s+r.missing_boundary_ports.length,0),issue_counts:issueCounts,
  orphan_boundary_ports:results.reduce((s,r)=>s+r.orphan_boundary_ports.length,0),
  overlapping_paths:results.reduce((s,r)=>s+r.line_geometry.overlapping_paths.length,0),
  unrelated_contacts:results.reduce((s,r)=>s+r.line_geometry.unrelated_contacts.length,0),
  complete_accounting:errors.length===0,errors,external_sources_read_only:extraction.sources_read_only,external_models_executed:false,
  branch_regions:branchRegions.length,models_with_branch_regions:new Set(branchRegions.map(r=>r.id)).size,
  dependency_bands:dependencyBands.length,models_with_dependency_bands:new Set(dependencyBands.map(r=>r.id)).size,
  content_inventories:contentInventories.length,content_captions:contentInventories.filter(r=>r.caption).length,
  models_with_content_inventories:new Set(contentInventories.map(r=>r.id)).size,
  shared_result_terminals:results.reduce((s,r)=>s+r.shared_result_terminals,0),
  shared_result_uses:results.reduce((s,r)=>s+r.shared_result_uses,0),
  route_strategies:results.reduce((counts,r)=>{counts[r.route_strategy]=(counts[r.route_strategy]||0)+1;return counts;},{}),
  limitations:['A successful geometry/font check does not prove semantic completeness or publication quality.','Text widths require browser measurements; dense crossings can still impair reading.','Source templates and opaque regions are not inferred implementations.'],
  extraction_implementation_sha256:extraction.implementation_sha256,
  implementation_sha256:Object.fromEntries(implementation.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')])),results};
report.audit_digest=crypto.createHash('sha256').update(JSON.stringify({implementation:report.implementation_sha256,extraction:report.extraction_implementation_sha256,panels:results.map(r=>[r.id,r.focus,r.canonical_digest])})).digest('hex');
fs.writeFileSync(path.join(output,'corpus-report.json'),JSON.stringify(report,null,2)+'\n');
if(textQA){
  const dir=path.join(output,'text-qa');fs.mkdirSync(dir,{recursive:true});
  const pageSize=100,pages=[];
  for(let start=0;start<textCards.length;start+=pageSize){
    const file=String(pages.length).padStart(3,'0')+'.html',cards=textCards.slice(start,start+pageSize);
    pages.push({file:'text-qa/'+file,panels:cards.length});
    fs.writeFileSync(path.join(dir,file),`<!doctype html><html><meta charset="utf-8"><meta name="publication-audit-digest" content="${report.audit_digest}"><title>Publication font QA ${pages.length}</title><style>body{font:16px Arial;margin:24px}article{border:1px solid #ccc;padding:20px;margin:20px 0}svg{display:block;max-width:100%;height:auto}</style><h1>Rendered text QA · panels ${start+1}–${start+cards.length}</h1>${cards.join('')}`);
  }
  fs.writeFileSync(path.join(output,'text-qa-manifest.json'),JSON.stringify({schema:'publication-browser-qa-pages/1',audit_digest:report.audit_digest,panels:report.panels,pages},null,2)+'\n');
  fs.writeFileSync(path.join(output,'text-qa.html'),`<!doctype html><html><meta charset="utf-8"><meta name="publication-audit-digest" content="${report.audit_digest}"><title>Publication font QA</title><h1>Rendered text QA · ${textCards.length} figures</h1><p>100 panels per page; measure node titles, captions and port-label text against their actual SVG boundaries.</p>${pages.map(p=>`<p><a href="${p.file}">${p.file} · ${p.panels} panels</a></p>`).join('')}`);
}
const esc=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
fs.writeFileSync(path.join(output,'corpus.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>论文视图 · 只读案例审计</title><style>body{font:15px Arial;color:#293746;margin:24px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.bad{background:#fff1e7}</style><h1>论文视图：真实案例审计</h1><p>${report.models} 个静态候选 · ${report.panels} 个图面 · ${report.quality_pass} 个通过当前字号/高度/路径/标签检查。原始模型未执行。几何通过不代表语义完整或达到论文质量。</p><p><a href="corpus-report.json">完整报告与实现哈希</a></p><table><tr><th>来源与模型</th><th>最小字号</th><th>毫米</th><th>未知操作</th><th>需调整</th></tr>${results.filter(r=>!r.focus).map(r=>`<tr class="${r.issues.length?'bad':''}"><td><a href="corpus/${r.id}.svg">${esc(r.entry)}</a><br>${esc(r.file)} · cell ${r.cell}</td><td>${r.min_print_font_pt} pt</td><td>${r.width_mm} × ${r.height_mm}</td><td>${r.unknown}</td><td>${esc(r.issues.join(', '))}</td></tr>`).join('')}</table></html>`);
console.log(JSON.stringify({...report,results:undefined,implementation_sha256:undefined,limitations:undefined}));
if(errors.length||report.overlap||report.missing_boundary_ports||report.orphan_boundary_ports||process.argv.includes('--strict')&&report.quality_pass!==report.panels)process.exitCode=1;

#!/usr/bin/env node
/* Original shared-result DAGs. No external model code is imported or run. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {woven}=require('../tests/publication-fixtures.cjs'),E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const root=path.resolve(__dirname,'..'),outputAt=process.argv.indexOf('--output');
if(outputAt>=0&&!process.argv[outputAt+1])throw Error('missing --output directory');
const dir=path.resolve(root,outputAt>=0?process.argv[outputAt+1]:'verification/publication'),results=[],failures=[];
let panels=0,bundles=0;
for(let width=2;width<=12;width++)for(let depth=2;depth<=8;depth++){
  const ir=woven(width,depth),before=JSON.stringify(ir),plan=P.plan(ir),idx=E.index(plan);
  const bands=plan.findings.filter(f=>f.rule==='dependency-band');
  const row={width,depth,dependency_bands:bands.length,panels:0,min_print_font_pt:Infinity,wire_bundles:0};
  assert.ok(!plan.findings.some(f=>f.rule==='branch-region'),'shared interiors cannot be separate paths');
  if(width>=3&&width*depth>=9)assert.equal(bands.length,depth);
  for(const focus of [null,...plan.nodes.filter(n=>n.kind==='composite').map(n=>n.id)]){
    panels++;row.panels++;
    try{
      const out=R.render(ir,{paperFocus:focus}),g=out.graph,q=out.prepared.quality;
      row.min_print_font_pt=Math.min(row.min_print_font_pt,q.min_print_font_pt);
      bundles+=g.publication.wire_bundles.length;row.wire_bundles+=g.publication.wire_bundles.length;
      assert.deepEqual(q.issues,[]);
      for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
        const ids=Object.values(g[key]).flat();assert.equal(new Set(ids).size,ids.length,key);
        assert.deepEqual(ids.sort(),items.map(x=>x.id).sort());
      }
      assert.deepEqual(g.edges.flatMap(e=>(e.bundle_members||[e]).map(m=>m.id)).sort(),g.edge_accounting.visible.slice().sort());
      for(const cut of g.publication.boundary)assert.ok(g.positions.has(cut.visible_node));
      for(const a of g.nodes)for(const b of g.nodes)if(a.id<b.id&&a.parent===b.parent)assert.ok(!R.overlap(g.positions.get(a.id),g.positions.get(b.id)));
      const node=idx.nodes.get(focus);
      if(['dependency-band','dependency-panel'].includes(node?.semantic_type))assert.ok((idx.children.get(focus)||[]).length<=3);
      if(focus===null&&bands.length)assert.equal(q.line_geometry.crossings,0);
      assert.equal(JSON.stringify(ir),before);
    }catch(error){failures.push({width,depth,focus,error:error.message});}
  }
  results.push(row);
}
const implementation=['tests/publication-fixtures.cjs','semantic_studio/branch-regions.js','semantic_studio/publication.js','semantic_studio/publication-renderer.js','semantic_studio/semantic-engine.js','semantic_studio/architecture.js','semantic_studio/architecture-layout.js','tools/audit_publication_weave.cjs'];
const report={schema:'publication-weave-stress/1',cases:results.length,panels,wire_bundles:bundles,failures,
  source:'Original cyclic-neighbor DAGs: width 2–12, depth 2–8; each intermediate output feeds two next-depth operands; one opaque operation.',
  limits:['Geometry, accounting and print-size checks; no browser text measurements for this full sweep.','This topology family does not cover arbitrary dense graphs, dynamic programs or novel algorithm semantics.'],
  implementation_sha256:Object.fromEntries(implementation.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),results};
report.audit_digest=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'weave-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined,limits:undefined,implementation_sha256:undefined}));
if(failures.length)process.exitCode=1;

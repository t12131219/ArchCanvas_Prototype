#!/usr/bin/env node
/* Original topology sweep, with no imports or execution of external models. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {branches}=require('../tests/publication-fixtures.cjs'),E=require('../semantic_studio/semantic-engine.js'),P=require('../semantic_studio/publication.js'),R=require('../semantic_studio/publication-renderer.js');
const root=path.resolve(__dirname,'..'),outputAt=process.argv.indexOf('--output');
if(outputAt>=0&&!process.argv[outputAt+1])throw Error('missing --output directory');
const dir=path.resolve(root,outputAt>=0?process.argv[outputAt+1]:'verification/publication'),results=[],failures=[];
let panels=0,bundles=0;
for(let count=2;count<=48;count++){
  const ir=branches(count),before=JSON.stringify(ir),plan=P.plan(ir),idx=E.index(plan),region=plan.findings.find(f=>f.rule==='branch-region');
  assert.equal(region.roles.paths.length,count);
  const row={paths:count,panels:0,min_print_font_pt:Infinity,wire_bundles:0};
  for(const n of plan.nodes.filter(n=>n.kind==='composite')){
    const out=R.render(ir,{paperFocus:n.id}),g=out.graph,q=out.prepared.quality;
    panels++;row.panels++;row.min_print_font_pt=Math.min(row.min_print_font_pt,q.min_print_font_pt);
    bundles+=g.publication.wire_bundles.length;row.wire_bundles+=g.publication.wire_bundles.length;
    try{
      assert.deepEqual(q.issues,[]);
      for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]])assert.deepEqual(Object.values(g[key]).flat().sort(),items.map(x=>x.id).sort());
      assert.deepEqual(g.edges.flatMap(e=>(e.bundle_members||[e]).map(m=>m.id)).sort(),g.edge_accounting.visible.slice().sort());
      for(const cut of g.publication.boundary)assert.ok(g.positions.has(cut.visible_node));
      for(const a of g.nodes)for(const b of g.nodes)if(a.id<b.id&&a.parent===b.parent)assert.ok(!R.overlap(g.positions.get(a.id),g.positions.get(b.id)));
      if(['branch-region','branch-panel'].includes(n.semantic_type))assert.ok((idx.children.get(n.id)||[]).length<=3);
      assert.equal(JSON.stringify(ir),before);
    }catch(error){failures.push({paths:count,panel:n.label,error:error.message});}
  }
  results.push(row);
}
const implementation=['tests/publication-fixtures.cjs','semantic_studio/branch-regions.js','semantic_studio/publication.js','semantic_studio/publication-renderer.js','semantic_studio/semantic-engine.js','semantic_studio/architecture.js','semantic_studio/architecture-layout.js','tools/audit_publication_stress.cjs'];
const report={schema:'publication-topology-stress/1',cases:results.length,panels,wire_bundles:bundles,failures,
  source:'Original generated DAGs; 2–48 separate paths, two operations per path, one opaque operation.',
  limits:['Geometry and print-size checks; no browser text measurements for this sweep.','These graphs cover separated fork/join paths, not arbitrary dense graphs or novel algorithm semantics.'],
  implementation_sha256:Object.fromEntries(implementation.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),results};
report.audit_digest=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'stress-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined,limits:undefined,implementation_sha256:undefined}));
if(failures.length)process.exitCode=1;

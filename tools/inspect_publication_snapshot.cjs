#!/usr/bin/env node
/* Run only our archived renderer in an isolated process; model IR stays data. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),snapshot=path.resolve(process.argv[2]);
const R=require(path.join(snapshot,'semantic_studio/publication-renderer.js'));
const report=JSON.parse(fs.readFileSync(path.join(snapshot,'corpus-report.json'))),extraction=JSON.parse(fs.readFileSync(path.join(root,'verification/architecture/corpus/extraction.json'))),irs=new Map(),rows=[];
for(const row of report.results){
 if(!irs.has(row.id)){const item=extraction.results.find(i=>i.id===row.id);irs.set(row.id,JSON.parse(fs.readFileSync(path.join(root,'verification/architecture/corpus',item.ir))));}
 const out=R.render(irs.get(row.id),{paperFocus:row.focus}),g=out.graph;
 assert.equal(out.prepared.quality.line_geometry.crossings,row.line_geometry.crossings,'archived render must reproduce archived crossings');
 rows.push({id:row.id,focus:row.focus,visible:g.edge_accounting.visible,
  orphan_boundary_ports:g.nodes.filter(n=>n.boundary_edge&&!g.edges.some(e=>e.source===n.id||e.target===n.id)).map(n=>n.id)});
}
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const baseline=JSON.parse(fs.readFileSync(path.join(snapshot,'baseline.json')));
for(const [f,h]of Object.entries(baseline.implementation_sha256))assert.equal(sha(path.join(snapshot,f)),h);
const result={schema:'publication-snapshot-inspection/1',audit_digest:report.audit_digest,inspector_sha256:sha(__filename),implementation_sha256:baseline.implementation_sha256,rows};
if(process.argv[3]){fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({panels:rows.length,orphan_boundary_ports:rows.reduce((s,r)=>s+r.orphan_boundary_ports.length,0)}));}
else process.stdout.write(JSON.stringify(result));

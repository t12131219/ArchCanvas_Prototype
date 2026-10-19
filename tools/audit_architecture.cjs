#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../semantic_studio/semantic-engine.js'),{openToDepth,render}=require('./export_architecture.cjs');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'data/semantic/catalog.json'))),results=[];
for(const item of catalog.models){
  const file=path.join(root,'data/semantic',item.ir),ir=JSON.parse(fs.readFileSync(file)),before=JSON.stringify(ir);E.validate(ir);
  for(const view of ['source','architecture'])for(const mode of ['source','runtime','merged']){
    if(mode==='runtime'&&!ir.nodes.some(n=>n.id==='runtime-observations'))continue;
    for(const depth of [1,2,Infinity]){
      const start=performance.now(),state={view,mode,details:depth===Infinity,offsets:{}};state.open=openToDepth(ir,state,depth);
      const g=E.project(ir,state),account=Object.values(g.edge_accounting).flat();assert.equal(new Set(account).size,account.length);assert.equal(account.length,ir.edges.length);
      const siblings=new Map();for(const n of g.nodes){const p=g.positions.get(n.id);assert.ok(['x','y','w','h'].every(k=>Number.isFinite(p[k])));if(!siblings.has(n.parent))siblings.set(n.parent,[]);siblings.get(n.parent).push(p);}
      let overlap=0;for(const ps of siblings.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],b=ps[j];if(a.x+a.w>b.x&&b.x+b.w>a.x&&a.y+a.h>b.y&&b.y+b.h>a.y)overlap++;}
      const failed=[];for(const e of g.edges){const r=E.route(e,g.positions);assert.ok(r.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));if(!r.ok)failed.push({id:e.id,reason:r.reason});}
      assert.equal(JSON.stringify(ir),before);
      results.push({model:item.title,file:item.ir,view,mode,depth:depth===Infinity?'all':depth,nodes:g.nodes.length,edges:g.edges.length,overlap,failed_routes:failed,ms:Math.round(performance.now()-start)});
    }
  }
}
const outputAt=process.argv.indexOf('--output');if(outputAt>=0&&!process.argv[outputAt+1])throw Error('missing --output directory');
const dir=path.resolve(root,outputAt>=0?process.argv[outputAt+1]:'verification/architecture');fs.mkdirSync(dir,{recursive:true});
const hashes=Object.fromEntries(['semantic_studio/architecture.js','semantic_studio/architecture-layout.js','semantic_studio/semantic-engine.js','semantic_adapter/analyzer.py','semantic_adapter/motifs.py','semantic_adapter/merge.py','semantic_studio/app.js','semantic_studio/index.html','semantic_studio/style.css','tools/export_architecture.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const summary={schema:'architecture-audit/1',models:catalog.models.length,states:results.length,overlap:results.reduce((s,r)=>s+r.overlap,0),failed_routes:results.reduce((s,r)=>s+r.failed_routes.length,0),canonical_ir_unchanged:true,complete_edge_accounting:true,implementation_sha256:hashes,results};
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(summary,null,2)+'\n');
for(const [name,depth]of [['ForeignComposition',2],['BrokenCell',3],['BeforeNorm',3],['RepeatedFragments',2],['UnknownFusion',3]]){
  const ir=JSON.parse(fs.readFileSync(path.join(root,'data/semantic/architecture',name+'.json'))),state={view:'architecture',mode:'source',details:false,offsets:{}};state.open=openToDepth(ir,state,depth);
  const out=render(ir,state);fs.writeFileSync(path.join(dir,name+'.svg'),out.svg);fs.writeFileSync(path.join(dir,name+'.layout.json'),JSON.stringify(out.document,null,2)+'\n');
}
console.log(JSON.stringify({models:summary.models,states:summary.states,overlap:summary.overlap,failed_routes:summary.failed_routes,worst_ms:Math.max(...results.map(r=>r.ms))}));
if(summary.overlap||summary.failed_routes)process.exitCode=1;

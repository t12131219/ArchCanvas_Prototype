#!/usr/bin/env node
/* All candidates get geometry checks, including opaque wrappers. Metrics do
 * not establish semantics, visual beauty, or arbitrary-input correctness. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../semantic_studio/semantic-engine.js'),{render,openToDepth}=require('./export_architecture.cjs');
const root=path.resolve(__dirname,'..'),dir=process.argv[2]||path.join(root,'verification/architecture/corpus');
const extraction=JSON.parse(fs.readFileSync(path.join(dir,'extraction.json'))),results=[];
const examples=new Map([
  ['cnn/cnn-vgg16.ipynb#VGG16#10', 'VGG16'],
  ['cnn/nin-cifar10_filter-response-norm.ipynb#NiN#11','NiN-custom'],
  ['cnn/resnet-ex-1.ipynb#ResidualBlock#25','Projected-branches'],
  ['cnn/resnet-ex-1.ipynb#ConvNet#26','Local-residual-composition'],
  ['rnn/rnn_lstm_bi_imdb.ipynb#RNN#17','LSTM-wrapper'],
  ['autoencoder/ae-conv-var.ipynb#ConvVariationalAutoencoder#9','Conv-VAE'],
  ['gnn/gnn-basic-graph-spectral-1.ipynb#GraphNet#16','Spectral-GNN'],
  ['transformer/distilbert-v0.ipynb#DistilBERTClass#13','DistilBERT-boundary'],
]);
const catalogPath=path.join(root,'data/semantic/catalog.json'),catalog=JSON.parse(fs.readFileSync(catalogPath));
for(const item of extraction.results){
  if(!item.ir)continue;
  const ir=JSON.parse(fs.readFileSync(path.join(dir,item.ir))),canonical=JSON.stringify(ir);E.validate(ir);
  for(const depth of [1,2,Infinity]){
    const state={view:'architecture',mode:'source',details:false,offsets:{}};state.open=openToDepth(ir,state,depth);
    const g=E.project(ir,state),account=Object.values(g.edge_accounting).flat();
    assert.deepEqual(account.slice().sort(),ir.edges.map(e=>e.id).sort());
    const siblings=new Map();for(const n of g.nodes){if(!siblings.has(n.parent))siblings.set(n.parent,[]);const p=g.positions.get(n.id);assert.ok(['x','y','w','h'].every(k=>Number.isFinite(p[k])));siblings.get(n.parent).push(p);}
    let overlap=0;for(const ps of siblings.values())for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],b=ps[j];if(a.x+a.w>b.x&&b.x+b.w>a.x&&a.y+a.h>b.y&&b.y+b.h>a.y)overlap++;}
    const routes=g.edges.map(e=>({id:e.id,...E.route(e,g.positions)})),failures=routes.filter(r=>!r.ok).map(r=>({id:r.id,reason:r.reason}));
    assert.equal(JSON.stringify(ir),canonical);
    const linear=E.project(ir,{...state,foldSerial:false});
    const fit=b=>Math.max(b.w/1.5,b.h);
    results.push({id:item.id,depth:depth===Infinity?'all':depth,nodes:g.nodes.length,edges:g.edges.length,overlap,failed_routes:failures,
      bounds:g.bounds,vertical_bounds:linear.bounds,fit_gain:Number((fit(linear.bounds)/fit(g.bounds)).toFixed(3)),
      folded_nodes:[...g.positions.values()].filter(p=>p.arrangement==='folded-ranks').length});
    const relative=path.relative(extraction.source_root,item.file).replaceAll(path.sep,'/');
    const name=relative.startsWith('pytorch_ipynb/')&&examples.get(relative.slice('pytorch_ipynb/'.length)+'#'+item.entry+'#'+item.cell);
    if(depth===2&&name){
      const out=render(ir,state);fs.writeFileSync(path.join(dir,name+'.svg'),out.svg);
      fs.writeFileSync(path.join(dir,name+'.layout.json'),JSON.stringify(out.document,null,2)+'\n');
      const irFile='corpus/'+item.id+'.json',target=path.join(root,'data/semantic',irFile);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(ir,null,2)+'\n');
      const model={corpus_suite:'deeplearning-models-static-v1',id:'corpus-'+item.id,title:item.entry+' · corpus '+path.basename(item.file,'.ipynb'),ir:irFile,source:ir.entry,digest:ir.ir_digest,nodes:ir.nodes.length,edges:ir.edges.length,motifs:ir.motifs.length,runtime:ir.runtime.status,coverage:ir.coverage.status};
      const at=catalog.models.findIndex(m=>m.id===model.id);if(at<0)catalog.models.push(model);else catalog.models[at]=model;
    }
  }
}
fs.writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
const report={schema:'architecture-corpus-layout/1',models:extraction.extracted,states:results.length,
  overlap:results.reduce((s,r)=>s+r.overlap,0),failed_routes:results.reduce((s,r)=>s+r.failed_routes.length,0),
  canonical_ir_unchanged:true,complete_edge_accounting:true,
  implementation_sha256:Object.fromEntries(['semantic_studio/architecture.js','semantic_studio/architecture-layout.js','semantic_studio/semantic-engine.js','tools/export_architecture.cjs','tools/audit_model_corpus.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')])),results};
fs.writeFileSync(path.join(dir,'layout-report.json'),JSON.stringify(report,null,2)+'\n');
const escape=x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const comparisons=[['VGG16','VGG16'],['NiN','NiN-custom'],['ResidualBlock','Projected-branches'],['RNN','LSTM-wrapper']];
const cards=comparisons.filter(([before])=>fs.existsSync(path.join(dir,'before-'+before+'.svg'))).map(([before,after])=>
  `<h2>${escape(before)}</h2><div class="pair"><div><b>修改前</b><object data="before-${before}.svg" type="image/svg+xml"></object></div><div><b>当前代码</b><object data="${after}.svg" type="image/svg+xml"></object><a href="${after}.svg">打开 SVG</a></div></div>`).join('');
fs.writeFileSync(path.join(dir,'comparison.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>真实模型：架构图前后对比</title><style>body{font:16px Arial;background:#eef2f7;color:#263b55;margin:24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}.pair div{background:white;padding:15px}object{display:block;width:100%;height:520px}h2{margin:22px 0 10px}</style><h1>同一展开深度的实际效果</h1><p>前后均为 depth=2 的紧凑架构视图。原 Notebook 只读解析，未执行训练或模型。折行后沿箭头阅读。</p><p>提取 ${extraction.extracted} 个候选，${extraction.without_opaque} 个无 opaque；这些数字不代表语义完整或运行验证。</p>${cards}</html>`);
console.log(JSON.stringify({models:report.models,states:report.states,overlap:report.overlap,failed_routes:report.failed_routes}));
if(report.overlap||report.failed_routes)process.exitCode=1;

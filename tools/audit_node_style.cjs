/* A style migration must preserve every catalog frontier, measured position,
 * exact binding and accounting bucket. Freeze sources during this capture.
 * Usage: node tools/audit_node_style.cjs BASELINE_STUDIO OUTPUT_DIRECTORY
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),before=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const E=require('../semantic_studio/semantic-engine'),P=require('../semantic_studio/publication'),C=require('../semantic_studio/composition-layout'),R=require('../semantic_studio/publication-renderer');
const oldE=require('./load_publication_renderer.cjs')(before,{engine:true});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const read=p=>JSON.parse(fs.readFileSync(p)),hash=v=>crypto.createHash('sha256').update(v).digest('hex'),plain=x=>JSON.parse(JSON.stringify(x));
const files=[...fs.readdirSync(path.join(root,'semantic_studio')).filter(n=>/\.(js|css|html)$/.test(n)).map(n=>'semantic_studio/'+n),'tools/audit_node_style.cjs',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.cjs')).map(n=>'tests/'+n)];
const frozen=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]));
fs.mkdirSync(out,{recursive:true});const rows=[],sheets=[],kinds=new Set(),models=read(path.join(root,'data/semantic/catalog.json')).models;let glyphs=0;
const baseline_sha256=Object.fromEntries(fs.readdirSync(before).filter(n=>n.endsWith('.js')).map(n=>[n,hash(fs.readFileSync(path.join(before,n)))]));
for(const m of models){
 const ir=read(path.join(root,'data/semantic',m.ir)),raw=JSON.stringify(ir),overview=C.frontier({mode:'source'},'overview'),detail=C.certifiedDetails(ir,C.frontier(overview,'detail'));
 const sample=[],states=[['F0',overview],['F1',detail],['full',P.fullyExpanded(ir,detail,E)]];
 for(const [name,state]of states){
  const g=E.project(ir,state),old=oldE.project(plain(ir),plain(state));
  const signature=g=>({nodes:g.nodes,edges:g.edges,positions:[...g.positions],bounds:g.bounds,nodes_accounted:g.node_accounting,edges_accounted:g.edge_accounting});
  assert.deepEqual(plain(signature(g)),plain(signature(old)),m.title+' '+name);
  for(const [key,items]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){const ids=Object.values(g[key]).flat();assert.equal(ids.length,new Set(ids).size);assert.deepEqual(ids.sort(),items.map(n=>n.id).sort());}
  // Every raw node is rendered in a compact native-scale glyph sheet. Also
  // include synthetic F0/F1 summaries, whose captions differ from raw atoms.
  for(const n of g.nodes){const p=g.positions.get(n.id);kinds.add(n.kind);const h=p.expanded?(p.header||80):p.h,body=R.nodeBody(n,{...p,h});sample.push({id:n.id,w:p.w,h,body});glyphs++;}
  rows.push({model:m.id,title:m.title,state:name,nodes:g.nodes.length,edges:g.edges.length,projection_sha256:hash(JSON.stringify(signature(g)))});
 }
 assert.equal(JSON.stringify(ir),raw);
 let y=25,body='';for(const n of sample){body+=`<g class="node" data-id="${esc(n.id)}" transform="translate(20,${y})">${n.body}</g>`;y+=n.h+20;}
 const sheet=`<svg xmlns="http://www.w3.org/2000/svg" class="publication" width="${Math.max(700,...sample.map(n=>n.w+40))}" height="${y}" viewBox="0 0 ${Math.max(700,...sample.map(n=>n.w+40))} ${y}"><style>${R.css}</style>${body}</svg>`;
 const file=m.id+'-glyphs.svg';fs.writeFileSync(path.join(out,file),sheet);sheets.push({title:m.title,file});
 console.log(JSON.stringify({model:m.title,states:3,glyphs:sample.length}));
}
for(const [p,h]of Object.entries(frozen))assert.equal(hash(fs.readFileSync(path.join(root,p))),h,'changed during capture');
fs.writeFileSync(path.join(out,'catalog-report.json'),JSON.stringify({complete:true,baseline:before,baseline_sha256,implementation_sha256:frozen,models:models.length,states:rows.length,glyphs,kinds:[...kinds].sort(),rows},null,2)+'\n');
fs.writeFileSync(path.join(out,'glyphs.html'),'<!doctype html><meta charset="utf-8"><title>通用节点样式 · 全目录审核</title><style>body{font:14px Arial;margin:20px}svg{display:block;border:1px solid #ddd}</style><h1>'+models.length+' 模型 / F0、F1、原子层：节点文字审核</h1>'+sheets.map(s=>`<h2>${esc(s.title)}</h2><section data-file="${s.file}">${fs.readFileSync(path.join(out,s.file),'utf8')}</section>`).join(''));

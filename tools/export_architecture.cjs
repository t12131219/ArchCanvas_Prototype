#!/usr/bin/env node
/* The CLI and browser use the same grouping, projection, layout and router. */
const fs=require('node:fs'),path=require('node:path'),E=require('../semantic_studio/semantic-engine.js');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function openToDepth(ir,state,depth){
  const idx=E.viewIndex(ir,state),open=[];
  function visit(id,level){if(level>=depth)return;if((idx.children.get(id)||[]).length)open.push(id);for(const c of idx.children.get(id)||[])visit(c,level+1);}
  for(const id of idx.children.get(null)||[])visit(id,0);return open;
}
function render(ir,state){
  E.validate(ir);const g=E.project(ir,state),routes=g.edges.map(e=>({...e,route:E.route(e,g.positions)})),b={...g.bounds};
  // Routing corridors may extend beyond the node bounds (feedback in particular).
  for(const e of routes)for(const p of e.route.points){const right=b.x+b.w,bottom=b.y+b.h;b.x=Math.min(b.x,p.x-24);b.y=Math.min(b.y,p.y-24);b.w=Math.max(right,p.x+24)-b.x;b.h=Math.max(bottom,p.y+24)-b.y;}
  const frames=[],leaves=[];
  for(const n of g.nodes){const p=g.positions.get(n.id),fill=n.glyph?.fill||'#edf2fa',limit=Math.floor((p.w-40)/7.5),label=n.label.length>limit?n.label.slice(0,limit-1)+'…':n.label;
    const shape=n.kind==='control'&&!p.expanded?`<polygon points="16,0 ${p.w-16},0 ${p.w},${p.h/2} ${p.w-16},${p.h} 16,${p.h} 0,${p.h/2}" fill="${fill}" stroke="#92a8c4"/>`:p.symbol?`<circle cx="${p.w/2}" cy="${p.h/2}" r="${p.w/2}" fill="${fill}" stroke="#92a8c4"/>`:`<rect width="${p.w}" height="${p.h}" rx="${p.expanded?12:n.kind==='interface'?28:8}" fill="${p.expanded?'#f7f9fd':fill}" stroke="${n.kind==='opaque'?'#bf6b6b':'#92a8c4'}" ${n.kind==='opaque'?'stroke-dasharray="5 4"':''}/>`;
    const body=`<g data-node-id="${esc(n.id)}" transform="translate(${p.x},${p.y})"><title>${esc(n.label)}</title>${shape}<text x="${p.symbol?p.w/2:12}" y="${p.symbol?p.h/2+8:22}" text-anchor="${p.symbol?'middle':'start'}" font-size="${p.symbol?28:p.h<60?12:14}" font-weight="600">${esc(p.symbol||label)}</text>${p.h>=58&&!p.symbol?`<text x="12" y="46" font-size="10" fill="#7385a0">${esc((n.semantic_type||n.operator||n.kind).slice(0,35))}</text>`:''}</g>`;
    (p.expanded?frames:leaves).push(body);
  }
  const edges=routes.map(e=>`<path data-edge-id="${esc(e.id)}" data-route-valid="${e.route.ok}" data-canonical-source="${esc(e.canonical_source)}" data-canonical-target="${esc(e.canonical_target)}" d="${e.route.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')}" stroke="${!e.route.ok?'#cf7930':e.kind==='parameter-read'?'#ac72a0':e.evidence==='runtime-tensor'?'#288765':'#6b89b8'}" ${e.evidence==='runtime-tensor'?'':'stroke-dasharray="5 4"'} marker-end="url(#arrow)"/>`);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h}" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" role="img" aria-label="${esc(ir.title)}"><title>${esc(ir.title)} · ${esc(state.view)}</title><style>text{font-family:Arial,'Noto Sans SC',sans-serif;fill:#263b55}path[data-edge-id]{fill:none;stroke-width:1.6}</style><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#6b89b8" stroke="none"/></marker></defs><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="white"/>${frames.join('')}${edges.join('')}${leaves.join('')}</svg>\n`;
  return {svg,graph:g,document:{schema:'archcanvas-architecture-document/1',ir,state,architecture:g.architecture,
    layout:{bounds:b,nodes:[...g.positions.values()],edges:routes,edge_accounting:g.edge_accounting},
    diagnostics:{route_failures:routes.filter(e=>!e.route.ok).map(e=>({id:e.id,reason:e.route.reason}))}}};
}
if(require.main===module){
  const [input,output,...options]=process.argv.slice(2);
  if(!input||!output){console.error('Usage: node tools/export_architecture.cjs input.json output.svg [--mode source|runtime|merged] [--depth 2] [--details] [--view architecture|source]');process.exit(2);}
  const option=(name,fallback)=>{const i=options.indexOf(name);if(i<0)return fallback;if(!options[i+1])throw Error('missing '+name+' value');return options[i+1];};
  const state={mode:option('--mode','source'),view:option('--view','architecture'),details:options.includes('--details'),offsets:{}},depth=Number(option('--depth','2'));
  if(!['source','runtime','merged'].includes(state.mode)||!['architecture','source'].includes(state.view)||!Number.isInteger(depth)||depth<0)throw Error('invalid view/mode/depth');
  const ir=JSON.parse(fs.readFileSync(input));state.open=openToDepth(ir,state,depth);
  const result=render(ir,state);fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,result.svg);
  const document=output.replace(/\.svg$/i,'')+'.layout.json';fs.writeFileSync(document,JSON.stringify(result.document,null,2)+'\n');
  console.log(JSON.stringify({svg:output,document,nodes:result.graph.nodes.length,edges:result.graph.edges.length,route_failures:result.document.diagnostics.route_failures.length}));
  if(result.document.diagnostics.route_failures.length)process.exitCode=1;
}
module.exports={render,openToDepth};

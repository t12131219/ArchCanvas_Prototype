/* Render the actual saved editable graph, including its placed route captions. */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const R=require('../yworks_edge_router_lab/router.js'),E=require('../yworks_edge_router_lab/graph-engine.js'),C=require('../yworks_edge_router_lab/semantic-constraints.js');
const cat=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'))),out=path.join(root,'verification/source-glyphs');
const escape=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
for(const title of ['highway','mixhop layer','mixhop dense']){
 const c=cat.cases.find(c=>!c.historical&&c.title===title),v=c.views.find(v=>v.key==='detailed'),g=C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))));
 const captions=E.routeLabelPlacements(g),parts=[];
 parts.push(g.definitions||'',g.extras||'');
 for(const n of g.nodes)parts.push(`<g transform="translate(${n.x-n.base[0]} ${n.y-n.base[1]})">${n.html}</g>`);
 for(const e of g.edges){const points=E.displayed(g,e);parts.push(`<path d="${R.polylinePath(points)}" fill="none" stroke="#263b4b" stroke-width="${e.width||2.2}" stroke-linecap="butt"${e.dashed?' stroke-dasharray="7 5"':''}/>`);
  if(e.arrow!=='none'&&points.length>1)parts.push(`<path d="${E.arrow(points.at(-1),points.at(-2),e.arrow==='open')}" fill="${e.arrow==='open'?'none':'#263b4b'}" stroke="#263b4b" stroke-width="${e.arrow==='open'?1.7:0}"/>`);
  if(e.arrow==='both'&&points.length>1)parts.push(`<path d="${E.arrow(points[0],points[1])}" fill="#263b4b"/>`);
 }
 for(const a of g.routeLabels||[]){const p=captions.get(a.id);if(p){const [x,y,w,h]=a.bbox;parts.push(`<g transform="translate(${p.x} ${p.y})"><rect x="${x-2}" y="${y-1}" width="${w+4}" height="${h+2}" fill="white" fill-opacity=".9"/>${a.html}</g>`);}}
 fs.writeFileSync(path.join(out,title.replaceAll(' ','-')+'-after.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${g.canvas[0]}" height="${g.canvas[1]}" viewBox="0 0 ${g.canvas.join(' ')}"><title>${escape(title)}: saved editor routes</title><rect width="100%" height="100%" fill="white"/>${parts.join('')}</svg>`);
}

// Use the editor's current frontier, caption transforms and wire geometry.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const R=require('../yworks_edge_router_lab/router.js'),E=require('../yworks_edge_router_lab/graph-engine.js'),F=require('../yworks_edge_router_lab/recursive-graph.js'),C=globalThis.SummaryConstraints;
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'))),out=path.join(root,'verification/recursive-expansion');
for(const [id,name,open] of [['01093cc06a87b35a','transformer-mixed',['enc.self','enc.self.sdpa']],['e40ad1504991acea','highway-mixed',['highway.layer0','highway.layer0.gate']],['39ca17212a8004c5','timemixer-mixed',['tm.embedding','tm.input_scale0']]]){
  const c=catalog.cases.find(c=>c.id===id),sources=Object.fromEntries(c.views.filter(v=>v.json).map(v=>[v.key,C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))))])),doc=F.create(sources);
  doc.state.open.push(...open);const g=F.build(doc),result=F.route(g),check=E.validateView(g);if(result.failed||!check.source.ok||!check.layout.ok||check.edges.some(([,v])=>!v.ok))throw new Error('invalid evidence frontier');
  const parts=[g.definitions||'',g.extras||''];
  const glyph=n=>{let html=n.html;if(n.expanded)html=html.replace(/<rect\b[^>]*>/,r=>r.replace(/width="[^"]*"/,'width="'+n.w+'"').replace(/height="[^"]*"/,'height="'+n.h+'"'));return `<g transform="translate(${n.x-n.base[0]} ${n.y-n.base[1]})">${html}</g>`;};
  parts.push(...g.nodes.filter(n=>n.expanded).map(glyph));
  for(const e of g.edges){const ps=E.displayed(g,e);parts.push(`<path d="${R.polylinePath(ps)}" fill="none" stroke="#263b4b" stroke-width="${e.width||2.2}" stroke-linecap="butt" stroke-linejoin="round"${e.dashed?' stroke-dasharray="7 5"':''}/>`);
    if(e.arrow!=='none')parts.push(`<path d="${E.arrow(ps.at(-1),ps.at(-2),e.arrow==='open')}" fill="${e.arrow==='open'?'none':'#263b4b'}" stroke="#263b4b" stroke-width="${e.arrow==='open'?1.7:0}"/>`);
  }
  parts.push(...g.nodes.filter(n=>!n.expanded&&!n.junction).map(glyph));
  const captions=E.routeLabelPlacements(g);
  for(const a of g.routeLabels){const p=captions.get(a.id);if(p){const [x,y,w,h]=a.bbox;parts.push(`<g transform="translate(${p.x} ${p.y})"><rect x="${x-2}" y="${y-1}" width="${w+4}" height="${h+2}" fill="white" fill-opacity=".9"/>${a.html}</g>`);}}
  // The application places node attachments in labelLayer, above glyphs.
  for(const a of g.attachments){const p=E.attachmentTransform(g,a);parts.push(`<g transform="translate(${p.x} ${p.y})">${a.html}</g>`);}
  for(const m of g.junctionMarkers){const p=E.junctionPoint(g,m);if(p)parts.push(`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#263b4b"/>`);}
  fs.writeFileSync(path.join(out,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${g.canvas[0]}" height="${g.canvas[1]}" viewBox="0 0 ${g.canvas.join(' ')}"><title>${name}: recursive frontier from current editor</title><rect width="100%" height="100%" fill="white"/>${parts.join('')}</svg>`);
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(g,null,2));
  console.log(name,g.nodes.length,g.edges.length,g.attachments.length);
}

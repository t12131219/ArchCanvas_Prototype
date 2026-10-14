const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
require(root+'/yworks_edge_router_lab/router.js');const E=require(root+'/yworks_edge_router_lab/graph-engine.js'),C=globalThis.SummaryConstraints,R=globalThis.EdgeRouterLabRouting;
const cat=JSON.parse(fs.readFileSync(root+'/data/catalog.json')),reports=[];
for(const c of cat.cases.filter(c=>!c.historical))for(const v of c.views){if(!v.json)continue;const g=C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json)))),issues=globalThis.SummarySourceContracts.validateGraph(g).violations.map(reason=>({reason})),counts={canonical:0,octilinear:0,curved:0};
issues.push(...C.validateJunctions(g).violations.map(reason=>({reason})));
for(const n of g.nodes)if(n.parent){const p=g.nodes.find(p=>p.id===n.parent);if(n.x<p.x-1e-5||n.y<p.y-1e-5||n.x+n.w>p.x+p.w+1e-5||n.y+n.h>p.y+p.h+1e-5)issues.push({node:n.id,reason:'child outside parent'});}
for(const e of g.edges){for(const [style,points] of [['canonical',e.route],['octilinear',E.displayed(g,{...e,style:'octilinear'})],['curved',E.curvePoints(e.route,E.curveRadius(g,{...e,style:'curved'},e.route))]]){let check=C.validate(g,{...e,style:style==='canonical'?'orthogonal':'octilinear'},points);counts[style]++;if(!check.ok)issues.push({edge:e.id,style,violations:check.violations});}}
let overlaps=0;for(let i=0;i<g.edges.length;i++)for(let j=0;j<i;j++){const a=g.edges[i],b=g.edges[j];if(a.contract.wire===b.contract.wire)continue;let sum=0;for(let k=1;k<a.route.length;k++)for(let l=1;l<b.route.length;l++)sum+=R.overlap(a.route[k-1],a.route[k],b.route[l-1],b.route[l]);if(sum>1e-5){overlaps++;issues.push({edge:a.id,other:b.id,reason:'distinct tensor wires overlap',pixels:sum});}}
reports.push({case:c.id,title:c.title,view:v.key,edges:g.edges.length,counts,overlaps,issues});}
const result={views:reports.length,edges:reports.reduce((a,b)=>a+b.edges,0),issues:reports.flatMap(x=>x.issues).length,overlaps:reports.reduce((a,b)=>a+b.overlaps,0),reports};fs.writeFileSync(root+'/verification/semantic-display-validation.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,reports:reports.filter(x=>x.issues.length).slice(0,10)}));

if(result.issues)process.exitCode=1;

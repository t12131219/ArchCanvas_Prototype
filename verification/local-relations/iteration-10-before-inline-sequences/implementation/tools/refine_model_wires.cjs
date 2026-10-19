/* Bounded visual optimization. No endpoint identities or model facts change. */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const R=require('../yworks_edge_router_lab/router.js'),E=require('../yworks_edge_router_lab/graph-engine.js'),C=require('../yworks_edge_router_lab/semantic-constraints.js');
const cat=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'))),reports=[];
const options={margin:6,stub:16,bendCost:35,crossingCost:450,edgeSpacing:12,overlapCost:2,sides:'any',style:'orthogonal'};
const score=s=>s.length+s.bends*35+s.crossings*450;
for(const c of cat.cases.filter(c=>!c.historical))for(const v of c.views){
 if(!v.json)continue;const file=path.join(root,v.json),g=C.initialize(JSON.parse(fs.readFileSync(file)));
 if(!g.nodes.some(n=>n.glyphPresentation))continue;
 const crossed=new Set();
 for(let i=0;i<g.edges.length;i++)for(let j=i+1;j<g.edges.length;j++){
  const a=g.edges[i],b=g.edges[j];if(a.contract.wire===b.contract.wire)continue;
  if(a.route.slice(1).some((p,u)=>b.route.slice(1).some((q,w)=>R.crossing(a.route[u],p,b.route[w],q)))){crossed.add(a.id);crossed.add(b.id);}
 }
 if(!crossed.size)continue;
 const candidate=E.clone(g),before=R.stats(g.edges),begin=Date.now();
 const result=E.routeBatch(candidate,[...crossed],options),after=R.stats(candidate.edges);
 const valid=!result.failed&&C.validateSource(candidate).ok&&C.validateJunctions(candidate).ok&&candidate.edges.every(e=>C.validate(candidate,e,e.route).ok&&!E.conflicts(candidate,e,{...options,margin:0}));
 const accepted=valid&&after.crossings<=before.crossings&&score(after)<score(before);
 if(accepted){fs.writeFileSync(file,JSON.stringify(candidate,null,2)+'\n');fs.writeFileSync(path.join(root,v.asset),'window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+JSON.stringify(c.id+':'+v.key)+']='+JSON.stringify(candidate)+';\n');}
 reports.push({case:c.id,title:c.title,view:v.key,targets:crossed.size,accepted,before,after:accepted?after:before,ms:Date.now()-begin});
 console.log(c.title,v.key,accepted?'improved':'retained',before.crossings,'->',accepted?after.crossings:before.crossings,Date.now()-begin+'ms');
}
fs.writeFileSync(path.join(root,'verification/source-glyphs/wire-refinement.json'),JSON.stringify(reports,null,2)+'\n');
console.log(JSON.stringify({views:reports.length,improved:reports.filter(r=>r.accepted).length,crossingsBefore:reports.reduce((a,r)=>a+r.before.crossings,0),crossingsAfter:reports.reduce((a,r)=>a+r.after.crossings,0)}));

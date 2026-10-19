/* Audit the generic policies in every active source projection. */
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');require('../yworks_edge_router_lab/graph-engine.js');
const C=globalThis.SummaryConstraints,P=globalThis.SummaryPhysicalPorts,R=globalThis.EdgeRouterLabRouting;
const cat=JSON.parse(fs.readFileSync(root+'/data/catalog.json')),collections={},issues=[];
let views=0,edges=0,free=0,gates=0,stems=0,registeredJunctions=0,visibleJunctions=0;
for(const c of cat.cases.filter(c=>!c.historical))for(const v of c.views){
  if(!v.json)continue;
  const g=C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))));views++;
  const count=collections[c.collection]||={views:0,edges:0,freeEndpoints:0,followingGates:0,sharedStems:0};count.views++;
  for(const e of g.edges){edges++;count.edges++;
    if(!e.portPolicy?.source||!e.portPolicy?.target)issues.push(c.id+': '+e.id+' unregistered policy');
    for(const side of ['source','target']){
      const p=P.policy(g,e,side);
      if(p.mode!=='fixed'){free++;count.freeEndpoints++;}
      gates+=(p.gates||[]).length;count.followingGates+=(p.gates||[]).length;
    }
    if(e.portPolicy?.source.sharedStem){stems++;count.sharedStems++;
      const check=C.validate(g,e,e.route);if(!check.ok)issues.push(c.id+': '+e.id+': '+check.violations.join('; '));
      const s=e.portPolicy.source.sharedStem;
      if(!g.edges.some(other=>other!==e&&other.source===e.source&&other.contract.wire===e.contract.wire))issues.push(c.id+': '+e.id+' stem lacks canonical peer');
    }
  }
  if(!C.validateSource(g).ok)issues.push(c.id+': source integrity failed');
  count.registeredJunctions||=0;count.visibleJunctions||=0;
  for(const marker of g.junctionMarkers||[]){registeredJunctions++;count.registeredJunctions++;
    const point=globalThis.SummaryEngine.junctionPoint(g,marker);
    if(point){visibleJunctions++;count.visibleJunctions++;
      if(!marker.edges.every(id=>globalThis.SummaryJunctionMarkers.contains(g.edges.find(e=>e.id===id).route,point)))issues.push(c.id+': detached junction '+marker.id);
    }
    else issues.push(c.id+': source fork has no connected junction '+marker.id);
    for(const fragment of marker.fragments||[]){const html=fragment.owner?g.nodes.find(n=>n.id===fragment.owner)?.html:g.extras;
      if(html?.includes(fragment.html)||fragment.legacyHtml&&html?.includes(fragment.legacyHtml))issues.push(c.id+': stale SVG junction '+marker.id);
    }
  }
}
const report={passed:!issues.length,views,edges,freeEndpoints:free,followingGates:gates,sharedStems:stems,registeredJunctions,visibleJunctions,collections,issues,
  authority:'model source/IR selects tensor identities; recorded SVG supplies only physical corridor evidence',model_executed:false};
fs.mkdirSync(root+'/verification/shortest-routing',{recursive:true});
fs.writeFileSync(root+'/verification/shortest-routing/policy-coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(issues.length)process.exitCode=1;

/* Inspect paint clearance, including one-pixel segments, in every active view. */
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),C=globalThis.SummaryConstraints;
const catalog=JSON.parse(fs.readFileSync(root+'/data/catalog.json')),report={passed:true,views:0,edges:0,frameSegments:0,issues:[],model_executed:false,
  policy:'shaft half-width + frame half-width + 2 px; normal named-interface crossing allowed; corner gates and same-tensor shared forks adapt'};
for(const c of catalog.cases.filter(c=>!c.historical))for(const v of c.views){if(!v.json)continue;
  const g=C.initialize(JSON.parse(fs.readFileSync(root+'/'+v.json)));report.views++;report.edges+=g.edges.length;
  for(const e of g.edges)for(const n of g.nodes.filter(n=>n.expanded)){
    report.frameSegments+=e.route.length-1;
    for(const hit of C.borderContacts(e,n,e.route))report.issues.push({case:c.title,view:v.key,edge:e.id,...hit});
  }
}
report.passed=!report.issues.length;fs.writeFileSync(root+'/verification/route-labels/border-clearance.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;

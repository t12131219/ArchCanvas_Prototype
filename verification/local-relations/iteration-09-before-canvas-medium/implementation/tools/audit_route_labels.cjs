/* Exercise actual caption placement and source guards across current imports. */
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),C=globalThis.SummaryConstraints,L=globalThis.SummaryRouteLabels;
const catalog=JSON.parse(fs.readFileSync(root+'/data/catalog.json')),report={passed:true,views:0,labels:0,collections:{},issues:[],model_executed:false};
for(const c of catalog.cases.filter(c=>!c.historical))for(const v of c.views){if(!v.json)continue;
  const g=C.initialize(JSON.parse(fs.readFileSync(root+'/'+v.json))),ps=E.routeLabelPlacements(g);report.views++;
  for(const a of g.routeLabels||[]){report.labels++;report.collections[c.collection]=(report.collections[c.collection]||0)+1;const p=ps.get(a.id);
    if(!p||p.score>=1e6||L.project(E.labelPath(g,a),p.point).distance>1e-6)report.issues.push({case:c.title,view:v.key,label:a.id,reason:'missing, colliding or detached caption'});
  }
}
report.passed=!report.issues.length;fs.mkdirSync(root+'/verification/route-labels',{recursive:true});
fs.writeFileSync(root+'/verification/route-labels/audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;

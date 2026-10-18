const fs=require('fs'),root=require('path').resolve(__dirname,'..')+'/',R=require(root+'semantic_studio/publication-renderer.js'),E=require(root+'semantic_studio/semantic-engine.js'),doc=JSON.parse(fs.readFileSync(root+'DenseBlock-overview.layout.json')),out=R.render(doc.ir,doc.state),g=out.graph,ctx=g.positions.context,base=out.prepared.routes;
const geometry=rs=>R.lineGeometry(rs),segments=rs=>rs.flatMap(e=>e.route.points.slice(1).map((p,i)=>[e.route.points[i],p]));
function trial(routes,id,cost,stub){ctx.routeCache=new Map();ctx.reserved=segments(routes.filter(e=>e.id!==id));ctx.crossingCost=ctx.contactCost=cost;ctx.stubLength=stub;const edge=routes.find(e=>e.id===id),route=E.route(edge,g.positions);return route.ok?routes.map(e=>e.id===id?{...e,route}:e):null;}
let wins=[];
for(const id of ['e00006','e00011'])for(const cost of [180,540])for(const stub of [16,12,8]){
 const a=trial(base,id,cost,stub);if(!a)continue;const ag=geometry(a);console.log('first',id,cost,stub,ag.crossings,ag.unrelated_contacts.length);
 for(const other of base.filter(e=>e.id!==id))for(const cost2 of [180,540])for(const stub2 of [16,12,8]){
 const b=trial(a,other.id,cost2,stub2);if(!b)continue;const bg=geometry(b);if(bg.crossings<=1&&!bg.unrelated_contacts.length&&!bg.overlapping_paths.some(o=>!o.same_value))wins.push({ids:[id,other.id],cost,stub,cost2,stub2,geom:bg,routes:b.filter(e=>[id,other.id].includes(e.id)).map(e=>({id:e.id,points:e.route.points}))});
 }
}
console.log(JSON.stringify(wins.slice(0,6),null,2));

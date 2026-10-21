'use strict';
function scene({side='left',selected=true,crowded=true,entryBand=false}={}){
 const entries=[{id:'source',x:520,y:0,w:80,h:40},{id:'region',x:100,y:100,w:400,h:600,expanded:true,header:80,context_gutter:48},
  {id:'target',parent:'region',x:300,y:600,w:100,h:40}];
 if(side==='right')for(const p of entries)p.x=700-p.x-p.w;
 const edge={id:'external-use',source:'source',target:'target',source_port:'result:2',target_port:'kw:aux',kind:'data',evidence:'source-dependency',
  context_lane:{owner:'region',index:0,side}};
 const positions=new Map(entries.map(p=>[p.id,{...p}])),rail=side==='left'?116:584;
 positions.context={idx:{nodes:new Map(entries.map(p=>[p.id,{...p,parent:p.parent||null}]))},edges:[edge],
  reserved:crowded?[[{x:0,y:300},{x:700,y:300}],[{x:rail,y:100},{x:rail,y:550}]]:[],crossingCost:540,feedback:new Set(),
  entryBandRouting:entryBand,preserveContextEdges:selected?[edge.id]:[]};
 return {edge,positions};
}
function inGutter(route,positions,edge){
 const p=positions.get(edge.context_lane.owner),lo=edge.context_lane.side==='left'?p.x:p.x+p.w-p.context_gutter,hi=lo+p.context_gutter;
 return route.points.some((p,i,a)=>i&&p.x===a[i-1].x&&p.y!==a[i-1].y&&p.x>lo&&p.x<hi);
}
module.exports={scene,inGutter};

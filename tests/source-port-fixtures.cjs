'use strict';
const E=require('../semantic_studio/semantic-engine.js'),R=require('../semantic_studio/publication-renderer.js');
const state={mode:'source',paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,paperAdaptive:false,paperPipelineSummaries:false,open:['root']};
function fixture(side='bottom'){
 const nodes=[['root',null,'composite'],['s','root','compute'],['a','root','opaque'],['b','root','compute']].map(([id,parent,kind])=>({id,parent,kind,label:id,operator:'foreign',source:[],runtime_evidence:[]}));
 const edges=['a','b'].map((target,i)=>({id:'e'+i,source:'s',target,source_port:'output:'+i,target_port:'arg:'+i,kind:'data',evidence:'source-dependency'}));
 const ir={schema:'archcanvas-source-semantic/2',title:'Nested outward leads',nodes,edges,motifs:[]};
 const g=E.project(ir,{...state,view:'publication'}),slots={root:[0,0,900,900],s:[600,100,200,64],a:[270,500,150,64],b:[360,700,180,64]};
 // Orthogonal rotations/reflections keep this an unnamed geometry fixture.
 const turn=({x,y})=>side==='bottom'?{x,y}:side==='top'?{x,y:900-y}:side==='right'?{x:y,y:x}:{x:900-y,y:x};
 const rect=([x,y,w,h])=>{const ps=[turn({x,y}),turn({x:x+w,y:y+h})];return {x:Math.min(...ps.map(p=>p.x)),y:Math.min(...ps.map(p=>p.y)),w:Math.abs(ps[1].x-ps[0].x),h:Math.abs(ps[1].y-ps[0].y)};};
 g.nodes=g.nodes.filter(n=>slots[n.id]);g.edges=g.edges.filter(e=>['e0','e1'].includes(e.id));
 g.idx=E.index({nodes:g.nodes,edges:g.edges});g.positions.context.idx=g.idx;g.positions.context.edges=g.edges;
 for(const id of [...g.positions.keys()])if(!slots[id])g.positions.delete(id);
 for(const [id,s]of Object.entries(slots))Object.assign(g.positions.get(id),rect(s));
 // Rotate the routes, but keep enough horizontal room for the opaque caption.
 // Anchor its receiving boundary so no consumer terminal needs to move.
 if(side==='left'||side==='right'){
  const p=g.positions.get('a'),extra=150-p.w;
  if(side==='left')p.x-=extra;
  p.w+=extra;
 }
 g.bounds={x:-24,y:-24,w:948,h:948};
 const ps=[[[740,164],[740,180],[400,180],[400,500]],[[660,164],[660,220],[450,220],[450,700]]];
 const target={bottom:'top',top:'bottom',left:'right',right:'left'}[side];
 const routes=g.edges.map((e,i)=>({...e,route:{ok:true,points:ps[i].map(([x,y])=>turn({x,y})),source_side:side,target_side:target,feedback:false}}));
 return {ir,state,baseline:{graph:g,prepared:R.evaluateRoutes(g,routes,'canonical-short')}};
}
module.exports={fixture,state};

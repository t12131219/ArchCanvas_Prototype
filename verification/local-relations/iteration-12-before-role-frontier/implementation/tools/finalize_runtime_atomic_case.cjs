/* Presentation-only dual lanes; canonical CPU evidence stays immutable. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),id='01093cc06a87b35c';
require('../yworks_edge_router_lab/router.js');
const E=require('../yworks_edge_router_lab/graph-engine.js'),F=require('../yworks_edge_router_lab/recursive-graph.js'),T=require('../yworks_edge_router_lab/runtime-layout.js'),C=globalThis.SummaryConstraints;
const read=view=>JSON.parse(fs.readFileSync(`${root}/data/cases/${id}-${view}.json`));
const write=(view,g)=>{fs.writeFileSync(`${root}/data/cases/${id}-${view}.json`,JSON.stringify(g,null,2)+'\n');fs.writeFileSync(`${root}/data/cases/${id}-${view}.js`,'window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+JSON.stringify(id+':'+view)+']='+JSON.stringify(g)+';\n');};
const full=read('source-atomic'),by=new Map(full.nodes.map(n=>[n.id,n])),wires=new Map();
const chain=id=>{const out=[];while(id){out.push(id);id=by.get(id)?.parent;}return out;};
for(const e of full.edges){const target=chain(e.target),owner=chain(e.source).find(id=>target.includes(id)),list=wires.get(owner)||new Set();list.add(JSON.stringify(e.binding.wire_identity));wires.set(owner,list);}
for(const n of full.nodes){n.runtimeWireCount=wires.get(n.id)?.size||0;if(!n.expanded){n.w=290;n.h=72;}n.labelObstacles=[{x:12,y:10,w:266,h:46}];}
full.runtimePresentation=T.VERSION;T.place(full.nodes);
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function markup(n){const x=n.x,y=n.y;n.base=[x,y];let label=n.label;if(label.length>34)label=label.slice(0,31)+'…';const subtitle=n.expanded?n.semantic.module_type||n.semantic.kind:n.semantic.output_shapes?JSON.stringify(n.semantic.output_shapes):n.atomicity==='observed-identity-call'?'eval identity · no ATen':n.semantic.resource?.shape?JSON.stringify(n.semantic.resource.shape):n.semantic.kind;n.html=`<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="10" fill="${n.fill}" stroke="#345168" stroke-width="2"/><text x="${x+14}" y="${y+28}" font-size="16" fill="#172d40">${escape(label)}</text><text x="${x+14}" y="${y+50}" font-size="11" fill="#546879">${escape(String(subtitle).slice(0,44))}</text>`;}
for(const n of full.nodes)markup(n);
for(const e of full.edges)for(const side of ['source','target']){const k=side==='source'?'Source':'Target',f=e['fixed'+k],n=by.get(e[side]);e['fixed'+k]={side:'right',fraction:f.fraction,offset:{x:n.w,y:n.h*f.fraction},inward:false};}
const planned=T.seeds(full);for(const e of full.edges)e.route=planned.get(e.id);
full.canvas=[by.get('runtime:call0').x+by.get('runtime:call0').w+60,by.get('runtime:call0').y+by.get('runtime:call0').h+60];
C.initialize(full);
for(const e of full.edges){e.portPolicy={};for(const side of ['source','target']){const n=by.get(e[side]);e.portPolicy[side]={mode:'perimeter',shape:'rectangle',spacing:12,sharedStem:side==='source'?e.contract.sharedStem:null,gates:e.contract.gates.filter(g=>C.ancestors(full,n.id).includes(g.frame)).map(g=>({...g,anchor:side}))};}}
full.semanticBaseline={schema:'imported-source-baseline/1',irSha256:full.irSha256,nodes:Object.fromEntries(full.nodes.map(n=>[n.id,{parent:n.parent,semantic:n.semantic,visualBinding:null}])),edges:Object.fromEntries(full.edges.map(e=>[e.id,Object.fromEntries(['binding','source','target','fixedSource','fixedTarget','portPolicy'].map(k=>[k,e[k]]))])),attachments:{},junctionMarkers:[],routeLabels:{}};
function verify(g,name){const v=E.validateView(g);console.log(name,g.canvas,v.source.ok,v.layout.ok,v.edges.filter(([,r])=>!r.ok).map(([id,r])=>[id,r.violations]).slice(0,10),v.layout.violations.slice(0,4));if(!v.source.ok||!v.layout.ok||v.edges.some(([,r])=>!r.ok))throw Error('Illegal '+name);}
verify(full,'full');write('source-atomic',full);
const compact=E.clone(full);compact.edges=[];compact.nodes=compact.nodes.filter(n=>n.expanded).map(n=>{n.w=330;n.h=84;n.expanded=false;n.routingObstacle=true;n.labelObstacles=[];markup(n);return n;});write('compact-templates',compact);
let g=F.build(F.create({'source-atomic':full,'compact-templates':compact}));
console.log('initial nodes',g.nodes.length);const result=F.route(g);console.log('initial routes',result.failed,result.routed);verify(g,'overview');
const overview=E.clone(g);delete overview.recursive;delete overview.recursiveReceipt;delete overview.semanticBaseline;overview.viewKey='overview';overview.view='overview';
// Main folded stages use vertical arrows; masks/buffer stay in side channels.
const ob=new Map(overview.nodes.map(n=>[n.id,n]));
const main=overview.edges.filter(e=>ob.get(e.source).runtimeColumn===ob.get(e.target).runtimeColumn&&ob.get(e.source).runtimeColumn<2);
for(const e of main){
 const targets=main.filter(v=>v.target===e.target),fraction=(targets.indexOf(e)+1)/(targets.length+1);
 e.fixedSource={side:'top',fraction:.5,inward:false};e.fixedTarget={side:'bottom',fraction,inward:false};
 delete e.physicalSource;delete e.physicalTarget;delete e.contract;
 e.portPolicy={source:{mode:'perimeter',shape:'rectangle',spacing:12,gates:[],sharedStem:null},target:{mode:'perimeter',shape:'rectangle',spacing:12,gates:[],sharedStem:null}};
 const s=E.endpoint(overview,e,'source'),t=E.endpoint(overview,e,'target'),y=(s.y+t.y)/2;e.route=[s,{x:s.x,y},{x:t.x,y},t];
}
C.initialize(overview);
const routed=E.routeBatch(overview,overview.edges.map(e=>e.id),{margin:6,stub:14,bendCost:40,edgeSpacing:10,groupByWire:true,preserve:true,optimizeCrossings:false,preferCurrentPorts:true});
console.log('vertical overview routing',routed.failed,routed.routed);verify(overview,'vertical overview');write('overview',overview);

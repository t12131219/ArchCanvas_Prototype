/* Exercise semantic guards across every current imported view, including reinitialization. */
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
require('../yworks_edge_router_lab/router.js');const E=require('../yworks_edge_router_lab/graph-engine.js'),C=globalThis.SummaryConstraints,S=globalThis.SummarySourceContracts;
const cat=JSON.parse(fs.readFileSync(root+'/data/catalog.json')),report={passed:true,views:0,negative_cases:0,models:[],model_executed:false};
for(const c of cat.cases.filter(c=>!c.historical))for(const v of c.views){
  if(!v.json)continue;const g=C.initialize(JSON.parse(fs.readFileSync(path.join(root,v.json))));
  if(!g.semanticBaseline)continue;
  const positive=S.validateGraph(g);if(!positive.ok)throw Error(c.title+' '+v.key+': '+positive.violations.join('; '));
  const negative=[];
  function reject(name,change){const bad=E.clone(g);change(bad);for(const e of bad.edges)delete e.contract;C.initialize(bad);const result=S.validateGraph(bad);if(result.ok)throw Error('Accepted '+c.title+' '+v.key+' '+name);negative.push({case:name,rejected:true,reason:result.violations[0]});}
  const n=g.nodes.find(n=>!n.junction&&Object.keys(n.semantic||{}).length);
  if(n){
    reject('source node metadata tampered',b=>b.nodes.find(x=>x.id===n.id).semantic.kind='forged');
    reject('source containment dropped or forged',b=>b.nodes.find(x=>x.id===n.id).parent=n.parent?null:'forged-parent');
  }
  if(g.edges.length){
    reject('canonical trace tampered',b=>b.edges[0].binding.semantic_trace=['forged-edge']);
    reject('required semantic connection removed',b=>b.edges.shift());
    reject('unapproved endpoint swap after reinitialization',b=>b.edges[0].target='forged-consumer');
    reject('fixed physical port changed',b=>b.edges[0].fixedTarget.offset.x+=4);
    reject('registered routing policy changed',b=>b.edges[0].portPolicy.target.mode='unrestricted');
    reject('physical endpoint detached from node perimeter',b=>b.edges[0].physicalTarget={side:'left',fraction:.5,inward:false,offset:{x:999,y:999}});
    const draft=E.clone(g),edge=draft.edges[0],binding=JSON.stringify(edge.binding);
    E.reconnect(draft,edge,'target',edge.target,E.clone(edge.fixedTarget));
    const draftCheck=S.validateGraph(draft);
    if(!edge.draft||binding!==JSON.stringify(edge.binding)||!draftCheck.ok)throw Error(c.title+' '+v.key+' explicit draft broke canonical evidence: '+draftCheck.violations.join('; '));
  }
  const a=g.nodes.find(n=>n.visualBinding);
  const shared=g.edges.find(e=>e.portPolicy?.source.sharedStem);
  if(shared)reject('source-authorized shared tensor trunk removed',b=>b.edges.find(e=>e.id===shared.id).portPolicy.source.sharedStem=null);
  const gated=g.edges.find(e=>e.portPolicy?.source.gates?.length||e.portPolicy?.target.gates?.length);
  if(gated)reject('source-authorized gate follow identity changed',b=>{const e=b.edges.find(e=>e.id===gated.id),side=e.portPolicy.source.gates.length?'source':'target';e.portPolicy[side].gates[0].anchor='forged';});
  if(a)reject('tensor value alias owner replaced',b=>b.nodes.find(n=>n.id===a.id).visualBinding.canonical='forged:out');
  if(g.attachments?.length){
    reject('presentation label ownership changed',b=>b.attachments[0].owner=g.nodes.find(n=>n.id!==g.attachments[0].owner).id);
    reject('required presentation label removed',b=>b.attachments.shift());
    reject('presentation source identity forged',b=>b.attachments[0].source_owner='forged');
  }
  if(g.routeLabels?.length){
    reject('caption reattached to different semantic edge',b=>b.routeLabels[0].edge=b.edges.find(e=>e.id!==b.routeLabels[0].edge).id);
    reject('source caption content forged',b=>b.routeLabels[0].html='<text>forged</text>');
    reject('source caption removed',b=>b.routeLabels.shift());
    reject('caption anchor is nonfinite',b=>b.routeLabels[0].anchor.ratio=null);
  }
  if(g.junctionMarkers?.length){
    reject('junction source ownership forged',b=>b.junctionMarkers[0].owner='forged-source');
    reject('junction registered route references changed',b=>b.junctionMarkers[0].edges=['forged-edge']);
    reject('required source fork annotation removed',b=>b.junctionMarkers.shift());
  }
  report.views++;report.negative_cases+=negative.length;report.models.push({case:c.id,title:c.title,collection:c.collection,view:v.key,negative});
}
fs.writeFileSync(root+'/verification/source-contract-negative-checks.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,models:undefined}));

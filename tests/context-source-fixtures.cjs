'use strict';
function fixture({balanced=false,unknown=false,guarded=false}={}){
  const right=balanced?['x','y','z']:['x','y','u','v','z'];
  const nodes=[['root',null,'composite'],['left','root','composite'],['right','root','composite'],
    ...['a','b','c'].map(id=>[id,'left','compute']),...right.map(id=>[id,'right','compute']),
    ['i','root','interface'],['j','root','interface'],['out','root','interface']].map(([id,parent,kind])=>({id,parent,kind,
      label:id,operator:kind==='compute'?'linear':undefined,role:kind==='interface'?(id==='out'?'output':'input'):undefined,source:[],runtime_evidence:[]}));
  if(unknown){const n=nodes.find(n=>n.id==='c');n.kind='opaque';n.operator='unfamiliar_bridge';}
  const pairs=[['i','a'],['a','b'],['b','c'],['j',right[0]],...right.slice(1).map((id,i)=>[right[i],id]),['c','z'],['c','z'],['z','out']];
  const edges=pairs.map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'arg'+i,kind:'data',evidence:'source-dependency',
    ...(guarded&&source==='c'?{condition:{branch:'if',outcome:'true'}}:{})}));
  return {schema:'archcanvas-source-semantic/2',title:'Foreign fork',nodes,edges,motifs:[]};
}
const state={paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:['root','left','right'],paperPipelineSummaries:false,
  paperContextLanes:'left',paperEntryBand:true,paperFlowAlignment:'entries'};
module.exports={fixture,state};

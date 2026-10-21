'use strict';
// Synthetic IR: this tests generic topology, not Python source recovery.
function fixture({left=6,right=4,branches=2,unknown=false,guarded=false}={}){
 const nodes=[['root',null,'composite'],['left','root','composite'],['right','root','composite'],['i','root','interface'],['j','root','interface'],['out','root','interface'],
 ...Array.from({length:left},(_,i)=>['l'+i,'left','compute']),...Array.from({length:right},(_,i)=>['r'+i,'right','compute']),...Array.from({length:branches},(_,i)=>['b'+i,'right','compute']),['join','right','compute']].map(([id,parent,kind])=>({id,parent,kind,label:id,operator:kind==='compute'?'foreign_step':undefined,role:kind==='interface'?(id==='out'?'output':'input'):undefined,source:[],runtime_evidence:[]}));
 if(unknown)nodes.find(n=>n.id==='l'+(left-1)).kind='opaque';
 const pairs=[['i','l0'],...Array.from({length:left-1},(_,i)=>['l'+i,'l'+(i+1)]),['j','r0'],...Array.from({length:right-1},(_,i)=>['r'+i,'r'+(i+1)]),...Array.from({length:branches},(_,i)=>['l'+(left-1),'b'+i]),['r'+(right-1),'join'],...Array.from({length:branches},(_,i)=>['b'+i,'join']),['join','out']];
 const edges=pairs.map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'arg:'+i,kind:'data',evidence:'source-dependency',...(guarded&&source==='l'+(left-1)?{condition:{branch:'foreign',outcome:'true'}}:{})}));
 return {schema:'archcanvas-source-semantic/2',title:'Unfamiliar reconvergence',nodes,edges,motifs:[]};
}
const state={paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:['root','left','right'],paperPipelineSummaries:false,paperInputDocks:false,paperEntryBand:true,paperFlowAlignment:'entries',paperContextLanes:false,paperBranchColumns:false,paperFrameView:'source'};
module.exports={fixture,state};

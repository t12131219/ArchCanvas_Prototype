/* Foreign computations with conditional parallel uses and an unknown stage.
 * Names are deliberately unrelated to any known model family. */
'use strict';
function fixture(){
 const nodes=[['root',null,'composite'],['signals','root','composite'],['other','root','composite'],
  ['x','signals','interface'],['a','signals','compute'],['b','signals','compute'],
  ['u','other','compute'],['v','other','opaque'],['w','other','compute'],['z','other','compute']]
  .map(([id,parent,kind])=>({id,parent,kind,label:id,source:[]}));
 const pairs=[['x','a'],['a','b'],['a','b'],['u','v'],['v','w'],['w','z']];
 const edges=pairs.map(([source,target],i)=>({id:'e'+i,source,target,source_port:'out',target_port:'arg:'+i,
  kind:'data',evidence:'source-dependency',...(i===1||i===2?{condition:{branch:'choice',outcome:String(i)}}:{})}));
 return {schema:'archcanvas-source-semantic/2',title:'Foreign signals and unknown helper',nodes,edges};
}
const state={paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:['root','signals','other'],
 paperFrameView:'source',paperContextLanes:false,paperBranchColumns:false,paperFlowAlignment:false,paperRankStrategy:'earliest'};
module.exports={fixture,state};

'use strict';
// Synthetic IR for geometry and exact conditional-slot preservation.
function fixture(){return {schema:'archcanvas-source-semantic/2',title:'Unfamiliar alternatives',
 nodes:[{id:'root',kind:'composite',parent:null,label:'Outer',source:[]},
 ...['a','b','sink'].map(id=>({id,parent:'root',kind:'compute',label:id,source:[]}))],
 edges:[['e0','a','b','0','value'],['e1','b','sink','out','0'],['e2','a','sink','1','1'],['e3','b','sink','out','in']]
 .map(([id,source,target,source_port,target_port])=>({id,source,target,source_port,target_port,kind:'data',evidence:'source-dependency',
 ...(id==='e1'||id==='e2'?{condition:{branch:'choice',outcome:'true'}}:id==='e3'?{condition:{branch:'choice',outcome:'false'}}:{})})),motifs:[]};}
const state={paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:['root'],paperPipelineSummaries:false};
module.exports={fixture,state};

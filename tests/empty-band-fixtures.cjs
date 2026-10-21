'use strict';
// Explicit synthetic IR; this is not evidence of Python source recovery.
function fixture(){return {schema:'archcanvas-source-semantic/2',title:'Unfamiliar conditional passage',
 nodes:[{id:'root',parent:null,kind:'composite',label:'Outer',source:[]},
  ...['a','b'].map(id=>({id,parent:'root',kind:'compute',label:id,source:[]}))],
 edges:[1,2].map(i=>({id:'e'+i,source:'a',target:'b',source_port:'out',target_port:'arg:'+i,
  kind:'data',evidence:'source-dependency',condition:{branch:'choice',outcome:String(i)}})),motifs:[]};}
const state={paperMedium:'canvas',paperGranularity:'roles',paperAuto:false,open:['root'],paperPipelineSummaries:false};
module.exports={fixture,state};

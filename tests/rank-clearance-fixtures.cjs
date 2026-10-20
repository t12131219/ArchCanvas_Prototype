'use strict';
// Hand-authored geometry only: these graphs make no extraction/recognition claim.
const {fixture,state:base}=require('./label-clearance-fixtures.cjs');
function fixtureForRank(){
 const ir=fixture();ir.nodes=ir.nodes.filter(n=>['root','x','a','b'].includes(n.id));
 for(const n of ir.nodes)if(n.id!=='root')n.parent='root';
 ir.nodes.push({id:'unknown',parent:'root',kind:'opaque',label:'Foreign call',source:[]},
  {id:'result',parent:'root',kind:'compute',label:'Result',source:[]});
 ir.edges=ir.edges.filter(e=>['e0','e1','e2'].includes(e.id));
 for(const [id,source,target]of [['e3','b','unknown'],['e4','unknown','result']])ir.edges.push({id,source,target,source_port:'out',target_port:'arg:0',kind:'data',evidence:'source-dependency'});
 ir.title='Conditional uses with an unresolved computation';return ir;
}
const state={...base,open:['root'],foldSerial:false};
module.exports={fixtureForRank,state};

'use strict';
const base=require('./context-source-fixtures.cjs');
function fixture(){
 const ir=base.fixture();
 const side={id:'side',parent:'root',kind:'interface',role:'output',label:'side',source:[],runtime_evidence:[]};
 ir.nodes.splice(ir.nodes.findIndex(n=>n.id==='out'),0,side);
 ir.edges.push({id:'side-edge',source:'a',target:'side',kind:'data',source_port:'out',target_port:'return',evidence:'source-dependency'});
 return ir;
}
const state={...base.state,paperAuto:true,paperBudget:28,paperAdaptive:true,paperAdaptivePolicy:'structure'};
module.exports={fixture,state};

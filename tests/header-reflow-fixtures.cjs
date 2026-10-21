'use strict';
const {fixture:base,state}=require('./cross-scope-fixtures.cjs');
// Topology fixture, not a claim about source extraction or a model family.
function fixture(options={}){
 const ir=base(options);
 for(const n of ir.nodes.filter(n=>n.kind==='composite')){
  n.label='Independent computation with separately retained inputs and outputs';
  n.semantic_type='Known local dependency facts with original source ownership retained';
 }
 return ir;
}
module.exports={fixture,state};

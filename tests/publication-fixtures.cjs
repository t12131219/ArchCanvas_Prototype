/* Original topology fixtures; they make no claim about a model algorithm. */
'use strict';
function branches(count=8){
  const ir={schema:'archcanvas-source-semantic/2',title:'Unfamiliar wide branches',nodes:[
    {id:'root',kind:'composite',label:'UnfamiliarComposition',parent:null,source:[]},
    {id:'input',parent:'root',kind:'interface',role:'input',label:'x',source:[]},
    {id:'join',parent:'root',kind:'compute',operator:'structure',structure_kind:'tuple',label:'packed results',source:[]},
    {id:'output',parent:'root',kind:'interface',role:'output',label:'result',source:[]}
  ],edges:[]};
  for(let i=0;i<count;i++){
    ir.nodes.push({id:'a'+i,parent:'root',kind:'compute',operator:'foreign',label:'ForeignProjectionStage',source:[]},
      {id:'b'+i,parent:'root',kind:i===0?'opaque':'compute',operator:'foreign',label:'UnfamiliarFeatureTransform',source:[]});
    for(const [source,target,target_port]of [['input','a'+i,'arg:0'],['a'+i,'b'+i,'arg:0'],['b'+i,'join',String(i)]])
      ir.edges.push({id:'e'+ir.edges.length,source,target,source_port:'out',target_port,kind:'data',evidence:'source-dependency'});
  }
  ir.edges.push({id:'return',source:'join',target:'output',source_port:'out',target_port:'return',kind:'data',evidence:'source-dependency'});
  return ir;
}
// Shared intermediate results and cross-links prevent independent-path
// decomposition. This original graph is deliberately not a model template.
function woven(width=3,depth=3){
  const ir={schema:'archcanvas-source-semantic/2',title:'WovenFeatures',ir_digest:`woven-${width}-${depth}`,motifs:[],
    nodes:[{id:'root',kind:'composite',label:'WovenFeatures',parent:null,source:[]},
      {id:'x',kind:'interface',role:'input',label:'x',parent:'root',source:[]},
      {id:'out',kind:'interface',role:'output',label:'out',parent:'root',source:[]}],edges:[]};
  const edge=(source,target,target_port)=>ir.edges.push({id:'e'+ir.edges.length,source,target,source_port:'out',target_port,kind:'data',evidence:'source-dependency'});
  for(let layer=0;layer<depth;layer++)for(let i=0;i<width;i++){
    const id=`n${layer}_${i}`;
    ir.nodes.push({id,parent:'root',kind:i===0&&layer===1?'opaque':'compute',operator:'foreign',label:`FusionStage${layer}Unit${i}`,source:[]});
    if(layer===0)edge('x',id,'arg:0');else{
      edge(`n${layer-1}_${i}`,id,'arg:0');edge(`n${layer-1}_${(i+1)%width}`,id,'arg:1');
    }
    if(layer===depth-1)edge(id,'out',String(i));
  }
  return ir;
}
module.exports={branches,woven};

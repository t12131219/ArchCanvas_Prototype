/* Source literal configurations, not inferred tensor shapes or axis meanings. */
(function(root){
  'use strict';
  const VERSION='transform-configurations/1';
  const recipes={transpose:{operator:'transpose',count:[2,2],keys:['dim0','dim1']},
    permute:{operator:'transpose',count:[1,16],keys:['dims']},
    view:{operator:'reshape',count:[1,16],keys:['size']},reshape:{operator:'reshape',count:[1,16],keys:['shape']},
    flatten:{operator:'reshape',count:[1,2],keys:['start_dim','end_dim']},
    squeeze:{operator:'reshape',count:[1,1],keys:['dim']},unsqueeze:{operator:'reshape',count:[1,1],keys:['dim']},
    expand:{operator:'expand',count:[1,16],keys:['size']}};
  const flow=e=>['data','alias','interface-binding'].includes(e.kind);
  function literal(s,depth=0){
    if(depth>2||!s)return undefined;
    if(s.literal_type==='int'&&/^-?\d+$/.test(s.literal||'')){
      const value=Number(s.literal);return Number.isSafeInteger(value)?value:undefined;
    }
    const signed=/^UnaryOp\(op=(USub|UAdd)\(\), operand=Constant\(value=(\d+)\)\)$/.exec(s.literal_expression||'');
    if(signed){const value=Number(signed[2])*(signed[1]==='USub'?-1:1);return Number.isSafeInteger(value)?value:undefined;}
    if(['Tuple','List'].includes(s.type)&&Array.isArray(s.fields?.elts)&&s.fields.elts.length<=16){
      const values=s.fields.elts.map(v=>literal(v,depth+1));return values.every(v=>Number.isSafeInteger(v))?values:undefined;
    }
    return undefined;
  }
  function compile(ir){
    const by=new Map(ir.nodes.map(n=>[n.id,n])),incoming=new Map(),result=new Map();
    for(const e of ir.edges){if(!incoming.has(e.target))incoming.set(e.target,[]);incoming.get(e.target).push(e);}
    const safe=n=>{const seen=new Set();while(n){
      if(seen.has(n.id)||n.evidence_status!=='static-only'||n.mutable||n.condition||n.runtime_evidence?.length||
        n.observed_calls||n.identity_display||['opaque','control'].includes(n.kind))return false;
      seen.add(n.id);if(n.parent&&!by.has(n.parent))return false;n=by.get(n.parent);
    }return true;};
    const format=value=>Array.isArray(value)?'['+value.join(', ')+']':String(value);
    for(const n of ir.nodes){
      const name=n.function_target?.split('.').at(-1),recipe=Object.hasOwn(recipes,name)?recipes[name]:null,s=n.syntax?.fields;
      if(!recipe||n.kind!=='compute'||n.operator!==recipe.operator||n.syntax?.type!=='Call'||!safe(n)||
        !Array.isArray(s?.args)||!Array.isArray(s.keywords)||!Array.isArray(n.arguments?.args)||!n.arguments.kwargs)continue;
      const edges=incoming.get(n.id)||[],method=edges.some(e=>e.target_port==='receiver');
      // A chained expression beginning with a framework call is still a
      // receiver method. The actual input port determines the call convention.
      const functional=!method&&!!n.source_framework_function&&n.source_framework_function===n.function_target&&
        /^[A-Za-z_]\w*(\.[A-Za-z_]\w*)*$/.test(n.function_target);
      if(!method&&!functional)continue;
      const offset=functional?1:0,receiver=functional?'arg:0':'receiver';
      if(edges.length!==1||edges.filter(e=>e.target_port===receiver&&flow(e)&&!e.condition&&!e.iteration).length!==1||
        edges.some(e=>e.condition||e.iteration||e.design_route||!flow(e)||!['source-dependency','static-source'].includes(e.evidence)))continue;
      const args=s.args.slice(offset),values=n.arguments.args.slice(offset),slots=[];
      if(s.args.length!==n.arguments.args.length||args.length>recipe.count[1]||s.keywords.length!==Object.keys(n.arguments.kwargs).length)continue;
      let valid=true;
      for(let i=0;i<args.length;i++){
        const value=literal(args[i]),port='arg:'+(i+offset);
        if(value===undefined||JSON.stringify(value)!==JSON.stringify(values[i])||edges.some(e=>e.target_port===port))valid=false;
        slots.push({port,syntax:args[i],value});
      }
      const keys=new Set();
      for(const k of s.keywords){
        const key=k.fields?.arg,value=literal(k.fields?.value),port='kw:'+key;
        if(!recipe.keys.includes(key)||keys.has(key)||recipe.keys.indexOf(key)<args.length||value===undefined||
          !Object.hasOwn(n.arguments.kwargs,key)||JSON.stringify(value)!==JSON.stringify(n.arguments.kwargs[key])||edges.some(e=>e.target_port===port))valid=false;
        keys.add(key);slots.push({port,syntax:k.fields?.value,value});
      }
      if(!valid||slots.length<recipe.count[0]||slots.length>recipe.count[1]||
        recipe.count[0]===2&&slots.length!==2)continue;
      const text=name+'('+slots.map(r=>(r.port.startsWith('kw:')?r.port.slice(3)+'=':'')+format(r.value)).join(', ')+')';
      result.set(n.id,{rule_version:VERSION,node:n.id,operator:n.operator,method:name,slots,text,
        receiver_edge:edges.find(e=>e.target_port===receiver).id,
        scope:'Exact source literal call configuration; no tensor rank, valid shape, axis role, value equivalence or execution assertion.'});
    }
    return result;
  }
  const api={VERSION,compile};root.SemanticTransformConfigurations=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

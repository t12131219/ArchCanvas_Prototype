/* Canonical evidence stays immutable; semantic grouping and layout are views. */
(function(root){
  'use strict';
  const A=root.SemanticArchitecture||(typeof require==='function'?require('./architecture.js'):null);
  const L=root.SemanticLayout||(typeof require==='function'?require('./architecture-layout.js'):null);
  const clone=x=>JSON.parse(JSON.stringify(x)),plans=new WeakMap();
  function index(ir){
    const nodes=new Map(ir.nodes.map(n=>[n.id,n])),children=new Map();
    for(const n of ir.nodes){if(!children.has(n.parent||null))children.set(n.parent||null,[]);children.get(n.parent||null).push(n.id);}
    return {nodes,children};
  }
  function architecture(ir){if(!plans.has(ir))plans.set(ir,A.build(ir));return plans.get(ir);}
  function viewIndex(ir,state={}){return index(state.view==='architecture'?architecture(ir):ir);}
  function validate(ir){
    if(ir.schema!=='archcanvas-source-semantic/2'||!Array.isArray(ir.nodes)||!Array.isArray(ir.edges))throw Error('不是通用语义 IR v2');
    if(ir.nodes.length>16000||ir.edges.length>50000)throw Error('超过画布导入预算');
    const idx=index(ir);if(idx.nodes.size!==ir.nodes.length)throw Error('重复节点 ID');
    for(const n of ir.nodes){if(n.parent&&!idx.nodes.has(n.parent))throw Error('父节点不存在');const seen=new Set();let p=n;while(p){if(seen.has(p.id))throw Error('层级成环');seen.add(p.id);p=idx.nodes.get(p.parent);}}
    const edgeIds=new Set();
    for(const e of ir.edges){if(edgeIds.has(e.id))throw Error('重复连接 ID');edgeIds.add(e.id);if(!idx.nodes.has(e.source)||!idx.nodes.has(e.target))throw Error('连接端点不存在');}
    return true;
  }
  function project(ir,state){
    const plan=state.view==='architecture'?architecture(ir):ir,idx=index(plan),mode=state.mode||'source',open=new Set(state.open),visible=new Set();
    const roots=mode==='runtime'&&idx.nodes.has('runtime-observations')?['runtime-observations']:idx.children.get(null)||[];
    const compact=state.view==='architecture'&&!state.details,bindings=new Map(),resources=new Set(),insBy=new Map(),usesBy=new Map();
    for(const e of ir.edges){if(!insBy.has(e.target))insBy.set(e.target,[]);insBy.get(e.target).push(e);if(!usesBy.has(e.source))usesBy.set(e.source,[]);usesBy.get(e.source).push(e);}
    if(compact)for(const n of ir.nodes){
      const ins=insBy.get(n.id)||[],uses=usesBy.get(n.id)||[];
      if(n.kind==='value-alias'&&n.slot==null&&!n.operator&&ins.length===1&&!ins[0].condition&&['alias','interface-binding'].includes(ins[0].kind))bindings.set(n.id,ins[0]);
      if(n.kind==='parameter'&&!ins.length&&uses.length&&uses.every(e=>['data','parameter-read'].includes(e.kind)))resources.add(n.id);
    }
    function eligible(id){if(mode!=='source')return true;while(id){if(id==='runtime-observations'||id.startsWith('runtime:'))return false;id=idx.nodes.get(id)?.parent;}return true;}
    function visit(id){if(!eligible(id)||bindings.has(id)||resources.has(id))return;visible.add(id);if(open.has(id))for(const c of idx.children.get(id)||[])visit(c);}
    roots.forEach(visit);
    function rep(id){const seen=new Set();while(id&&!visible.has(id)&&!seen.has(id)){if(!eligible(id))return null;seen.add(id);id=idx.nodes.get(id)?.parent;}return visible.has(id)?id:null;}
    const projected=[],internal=[],excluded=[],contracted=[],attached=[],annotations=new Map();
    for(const raw of ir.edges){
      if(!eligible(raw.source)||!eligible(raw.target)){excluded.push(raw.id);continue;}
      if(resources.has(raw.source)){attached.push(raw.id);const id=rep(raw.target);if(id){if(!annotations.has(id))annotations.set(id,[]);annotations.get(id).push({edge:clone(raw),resource:idx.nodes.get(raw.source)});}continue;}
      if(bindings.has(raw.target)){contracted.push(raw.id);continue;}
      let resolved=raw.source,port=raw.source_port;const via=[],seen=new Set();
      while(bindings.has(resolved)&&!seen.has(resolved)){seen.add(resolved);const binding=bindings.get(resolved);via.push(binding.id);resolved=binding.source;port=binding.source_port;}
      const s=rep(resolved),t=rep(raw.target);
      if(!s||!t){excluded.push(raw.id);continue;}
      if(s===t&&!(raw.source===raw.target&&raw.source===s)){internal.push(raw.id);continue;}
      // Do not bundle by module pair: distinct values, operands and conditional
      // alternatives must keep their individual boundary identities.
      projected.push({...clone(raw),id:raw.id,source:s,target:t,source_port:port,originals:[...via,raw.id],canonical_source:raw.source,canonical_target:raw.target,resolved_source:resolved});
    }
    const positions=L.layout(idx,roots,visible,projected,state.offsets||{}),ps=[...positions.values()];
    const left=Math.min(0,...ps.map(p=>p.x-60)),top=Math.min(0,...ps.map(p=>p.y-60));
    return {nodes:plan.nodes.filter(n=>visible.has(n.id)),edges:projected,positions,idx,annotations,architecture:state.view==='architecture'?plan:null,
      edge_accounting:{visible:projected.map(e=>e.id),internal,excluded,contracted,attached},
      bounds:{x:left,y:top,w:Math.max(900,...ps.map(p=>p.x+p.w+60))-left,h:Math.max(600,...ps.map(p=>p.y+p.h+60))-top}};
  }
  const api={clone,index,viewIndex,architecture,validate,project,path:L.path,route:L.route};root.SemanticEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

/* Source/runtime facts are immutable. Frontiers and positions are presentation. */
(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  function index(ir){
    const nodes=new Map(ir.nodes.map(n=>[n.id,n])),children=new Map();
    for(const n of ir.nodes){if(!children.has(n.parent||null))children.set(n.parent||null,[]);children.get(n.parent||null).push(n.id);}
    return {nodes,children};
  }
  function validate(ir){
    if(ir.schema!=='archcanvas-source-semantic/2'||!Array.isArray(ir.nodes)||!Array.isArray(ir.edges))throw Error('不是通用语义 IR v2');
    if(ir.nodes.length>16000||ir.edges.length>50000)throw Error('超过画布导入预算');
    const idx=index(ir);if(idx.nodes.size!==ir.nodes.length)throw Error('重复节点 ID');
    for(const n of ir.nodes){if(n.parent&&!idx.nodes.has(n.parent))throw Error('父节点不存在');const seen=new Set();let p=n;while(p){if(seen.has(p.id))throw Error('层级成环');seen.add(p.id);p=idx.nodes.get(p.parent);}}
    for(const e of ir.edges)if(!idx.nodes.has(e.source)||!idx.nodes.has(e.target))throw Error('连接端点不存在');
    return true;
  }
  function project(ir,state){
    const idx=index(ir),mode=state.mode||'source',open=new Set(state.open),visible=new Set(),positions=new Map();
    const roots=mode==='runtime'&&idx.nodes.has('runtime-observations')?['runtime-observations']:idx.children.get(null)||[];
    function eligible(id){return mode!=='source'||!id.startsWith('runtime:')&&id!=='runtime-observations';}
    function visit(id){if(!eligible(id))return;visible.add(id);if(open.has(id))for(const c of idx.children.get(id)||[])visit(c);}
    roots.forEach(visit);
    function rep(id){const seen=new Set();while(id&&!visible.has(id)&&!seen.has(id)){if(!eligible(id))return null;seen.add(id);id=idx.nodes.get(id)?.parent;}return visible.has(id)?id:null;}
    const projected=[];const bundles=new Map();
    for(const raw of ir.edges){const s=rep(raw.source),t=rep(raw.target);if(!s||!t||s===t)continue;const key=[s,t,raw.kind,raw.evidence].join('|');let e=bundles.get(key);if(!e){e={id:key,source:s,target:t,kind:raw.kind,evidence:raw.evidence,originals:[]};bundles.set(key,e);projected.push(e);}e.originals.push(raw.id);}
    function layout(id){
      const n=idx.nodes.get(id),kids=(idx.children.get(id)||[]).filter(c=>visible.has(c)),p={id,x:0,y:0,w:248,h:74,expanded:!!kids.length};positions.set(id,p);
      if(kids.length){
        kids.forEach(layout);
        const kidSet=new Set(kids),owner=id=>{while(id&&!kidSet.has(id)){if(id===n.id)return null;id=idx.nodes.get(id)?.parent;}return id;};
        const rank=new Map(kids.map(k=>[k,0])),adj=new Map(kids.map(k=>[k,new Set()])),degree=new Map(kids.map(k=>[k,0]));
        for(const e of projected){const a=owner(e.source),b=owner(e.target);if(a&&b&&a!==b&&!adj.get(a).has(b)){adj.get(a).add(b);degree.set(b,degree.get(b)+1);}}
        const queue=kids.filter(k=>!degree.get(k));for(let i=0;i<queue.length;i++){const a=queue[i];for(const b of adj.get(a)){rank.set(b,Math.max(rank.get(b),rank.get(a)+1));degree.set(b,degree.get(b)-1);if(!degree.get(b))queue.push(b);}}
        const rows=new Map();for(const k of kids){const r=rank.get(k);if(!rows.has(r))rows.set(r,[]);rows.get(r).push(k);}
        let y=60,width=0;for(const r of [...rows.keys()].sort((a,b)=>a-b)){let x=24,height=0;for(const k of rows.get(r)){const q=positions.get(k);q.x=x;q.y=y;x+=q.w+40;height=Math.max(height,q.h);}width=Math.max(width,x);y+=height+48;}
        p.w=Math.max(330,width-16);p.h=Math.max(130,y-20);
      }
      return p;
    }
    let x=32;for(const id of roots){if(!visible.has(id))continue;const p=layout(id);p.x=x;p.y=30;x+=p.w+50;}
    function absolute(id,dx,dy){const p=positions.get(id),offset=state.offsets?.[id]||{x:0,y:0};p.x+=dx+offset.x;p.y+=dy+offset.y;for(const c of idx.children.get(id)||[])if(positions.has(c))absolute(c,p.x,p.y);}
    for(const id of roots)if(positions.has(id))absolute(id,0,0);
    const ps=[...positions.values()],left=Math.min(0,...ps.map(p=>p.x-32)),top=Math.min(0,...ps.map(p=>p.y-32));
    return {nodes:ir.nodes.filter(n=>visible.has(n.id)),edges:projected,positions,idx,
      bounds:{x:left,y:top,w:Math.max(900,...ps.map(p=>p.x+p.w+32))-left,h:Math.max(600,...ps.map(p=>p.y+p.h+32))-top}};
  }
  function path(e,positions){const a=positions.get(e.source),b=positions.get(e.target);if(!a||!b)return'';
    if(b.y>=a.y+a.h-1){const x=a.x+a.w/2,y=a.y+a.h,tx=b.x+b.w/2,ty=b.y,m=(y+ty)/2;return`M${x},${y} V${m} H${tx} V${ty}`;}
    if(b.x>=a.x+a.w-1){const x=a.x+a.w,y=a.y+a.h/2,tx=b.x,ty=b.y+b.h/2,m=(x+tx)/2;return`M${x},${y} H${m} V${ty} H${tx}`;}
    const x=a.x+a.w/2,y=a.y,tx=b.x+b.w/2,ty=b.y+b.h,m=Math.min(y,ty)-20;return`M${x},${y} V${m} H${tx} V${ty}`;
  }
  const api={clone,index,validate,project,path};root.SemanticEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

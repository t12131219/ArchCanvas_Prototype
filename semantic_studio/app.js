(function(){
  'use strict';
  const $=id=>document.getElementById(id),E=window.SemanticEngine,svg=$('canvas'),NS='http://www.w3.org/2000/svg';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
  let catalog=[],ir=null,state=null,projection=null,selected=null,history=[],future=[],camera={x:0,y:0,w:1000,h:700},drag=null,loadRevision=0;
  let renderedNodes=new Map(),renderedEdges=new Map(),pendingFrame=0,dragPoint=null;
  const storeKey=()=> 'summary-semantic:architecture-v1:'+ir.ir_digest;
  const message=x=>$('status').textContent=x;
  function snapshot(){history.push(E.clone(state));if(history.length>40)history.shift();future=[];}
  function persist(){try{localStorage.setItem(storeKey(),JSON.stringify(state));}catch(_){message('浏览器存储已满；可保存图文档到文件。');}}
  function setCamera(){svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);}
  function fit(){const b=projection.bounds,r=$('stage').clientWidth/$('stage').clientHeight,w=b.w+40,h=b.h+40;camera=w/h>r?{x:b.x-20,y:b.y-(w/r-h)/2-20,w,h:w/r}:{x:b.x-(h*r-w)/2-20,y:b.y-20,w:h*r,h};setCamera();}
  function library(){const q=$('search').value.toLowerCase();$('catalog').replaceChildren();for(const m of catalog.filter(m=>m.title.toLowerCase().includes(q))){const b=document.createElement('button');b.className='case'+(ir?.ir_digest===m.digest?' active':'');b.innerHTML=`<strong>${esc(m.title)}</strong><small>${m.nodes} 节点 · ${esc(m.runtime==='passed'?'CPU 已观测':'静态源码')}</small>`;b.onclick=()=>loadModel(m);$('catalog').append(b);}}
  async function loadModel(m){const ticket=++loadRevision;try{const response=await fetch('../data/semantic/'+m.ir);if(!response.ok)throw Error('IR 文件读取失败');const value=await response.json();if(ticket!==loadRevision)return;open(value);$('irLink').href='../data/semantic/'+m.ir;$('irLink').hidden=false;}catch(error){message(error.message);}}
  function open(value,saved){E.validate(value);ir=value;history=[];future=[];selected=null;
    const roots=ir.nodes.filter(n=>!n.parent).map(n=>n.id);state={open:roots,offsets:{},mode:'source',view:'architecture'};
    try{const disk=saved||JSON.parse(localStorage.getItem(storeKey()));if(disk&&Array.isArray(disk.open)&&disk.offsets)state=disk;}catch(_){}
    state.view=state.view||'architecture';$('view').value=state.view;$('detailsToggle').checked=!!state.details;$('mode').value=state.mode;$('mode').options[1].disabled=!ir.nodes.some(n=>n.id==='runtime-observations');
    if(state.mode==='runtime'&&$('mode').options[1].disabled)state.mode='source';$('mode').value=state.mode;$('nodeTitle').textContent='选择图元';$('details').textContent='单击节点查看源码与运行证据。';
    $('title').textContent=ir.title;$('summary').textContent=`${ir.nodes.length} 个语义单位 · ${ir.edges.length} 个关系 · ${(ir.motifs||[]).length} 个组合模式`;
    const c=ir.coverage||{status:'not-verified'},r=ir.runtime||{status:'not-requested'},branches=c.branches||[];
    $('coverage').innerHTML=`<strong>验证范围</strong> <span class="badge">${esc(c.status)}</span><p>${esc(ir.coverage_contract)}</p><div>当前输入：${esc(c.scope||'静态分析')}；CPU：${esc(r.status)}；源码分支：${branches.filter(b=>b.kind!=='loop'&&!b.missing.length).length}/${(ir.branches||[]).filter(b=>b.kind!=='loop').length} 个 if / 条件表达式已覆盖两个结果；循环与短路路径另列为限制。</div><div>${esc(c.reason||'')}</div>${r.reason?'<pre>'+esc(r.reason)+'</pre>':''}<details><summary>分支、限制和模式证据</summary><pre>${esc(JSON.stringify({coverage:c,motifs:ir.motifs,limitations:ir.limitations},null,2))}</pre></details>`;
    render();fit();library();message($('status').textContent+'；双击模块展开，单击查看证据');
  }
  function inspect(id){selected=id;for(const[key,g]of renderedNodes)g.classList.toggle('selected',key===id);const n=projection.idx.nodes.get(id);if(!n)return;
    $('nodeTitle').textContent=n.label;
    $('details').innerHTML=`<span class="badge">${esc(n.kind)}</span><span class="badge">${esc(n.evidence_status)}</span>${n.semantic_type?'<p>'+esc(n.semantic_type)+'</p>':''}${n.reason?'<p>'+esc(n.reason)+'</p>':''}${n.presentation_only?'<p>架构摘要 · '+n.canonical_members.length+' 个原始节点 · '+n.boundary_ports.length+' 个边界端口</p><pre>'+esc(JSON.stringify(projection.architecture.findings.find(f=>f.id===n.finding),null,2))+'</pre>':''}${(n.source||[]).slice(0,10).map(s=>`<div class="source">${esc(s.file.split('/').slice(-2).join('/'))}:${s.line}<code>${esc(s.symbol)}</code><pre>${esc(s.expression)}</pre></div>`).join('')}${n.inputs?'<p>输入 / 输出张量</p><pre>'+esc(JSON.stringify({inputs:n.inputs,outputs:n.outputs},null,2))+'</pre>':''}${projection.annotations.get(id)?.length?'<details><summary>附属参数资源</summary><pre>'+esc(JSON.stringify(projection.annotations.get(id),null,2))+'</pre></details>':''}<details><summary>完整语义与证据</summary><pre>${esc(JSON.stringify(n,null,2))}</pre></details>`;
  }
  function toggle(id){if(!(projection.idx.children.get(id)||[]).length)return;snapshot();const open=new Set(state.open);if(open.has(id))open.delete(id);else open.add(id);state.open=[...open];render();persist();}
  function render(){if(!ir)return;projection=E.project(ir,state);renderedNodes=new Map();renderedEdges=new Map();for(const id of ['frames','edges','nodes'])$(id).replaceChildren();
    const frameFragment=document.createDocumentFragment(),nodeFragment=document.createDocumentFragment(),edgeFragment=document.createDocumentFragment();
    for(const n of projection.nodes){const p=projection.positions.get(n.id),g=el('g',{class:'node'+(n.id===selected?' selected':''),'data-id':n.id,transform:`translate(${p.x},${p.y})`});const fill=n.glyph?.fill||'#edf2fa',color=n.kind==='opaque'?'#bf6b6b':'#92a8c4';let shape;
      if(p.symbol){shape=el('circle',{cx:p.w/2,cy:p.h/2,r:p.w/2,fill,stroke:color});}
      else if(n.kind==='control'&&!p.expanded){shape=el('polygon',{points:`16,0 ${p.w-16},0 ${p.w},${p.h/2} ${p.w-16},${p.h} 16,${p.h} 0,${p.h/2}`,fill,stroke:color});}
      else shape=el('rect',{x:0,y:0,width:p.w,height:p.h,rx:p.expanded?12:n.kind==='interface'?28:8,fill:p.expanded?'#f7f9fd':fill,stroke:color,'stroke-width':p.expanded?1.6:1.2,...(n.kind==='opaque'?{'stroke-dasharray':'5 4'}:{})});
      g.append(shape,el('title',{},n.label+' | '+n.kind+' | '+n.evidence_status));
      const limit=Math.floor((p.w-40)/7.5),label=n.label.length>limit?n.label.slice(0,limit-1)+'…':n.label;
      g.append(el('text',{x:p.symbol?p.w/2:12,y:p.symbol?p.h/2+8:22,'text-anchor':p.symbol?'middle':'start','font-size':p.symbol?28:p.h<60?12:14,'font-weight':600,fill:'#263b55'},p.symbol||label));
      const caption=p.expanded?(n.semantic_type||'composite'):(n.semantic_type||n.operator||n.kind);
      if(p.h>=58&&!p.symbol)g.append(el('text',{x:12,y:46,'font-size':10,fill:'#7385a0'},caption.length>32?caption.slice(0,30)+'…':caption));
      const kids=projection.idx.children.get(n.id)||[];
      if(kids.length){const plus=el('text',{x:p.w-22,y:25,'font-size':18,fill:'#47618a'},p.expanded?'−':'+');plus.style.pointerEvents='auto';plus.style.cursor='pointer';plus.addEventListener('pointerdown',e=>e.stopPropagation());plus.addEventListener('click',e=>{e.stopPropagation();toggle(n.id);});g.append(plus);}
      g.addEventListener('dblclick',e=>{e.stopPropagation();toggle(n.id);});
      g.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();inspect(n.id);const point=world(e),ids=new Set([n.id]),todo=[n.id];for(let i=0;i<todo.length;i++)for(const child of projection.idx.children.get(todo[i])||[])if(projection.positions.has(child)){ids.add(child);todo.push(child);}drag={kind:'node',id:n.id,start:point,ids,origins:new Map([...ids].map(id=>[id,{...projection.positions.get(id)}])),offset:E.clone(state.offsets[n.id]||{x:0,y:0}),moved:false,edges:projection.edges.filter(edge=>ids.has(edge.source)||ids.has(edge.target))};g.setPointerCapture(e.pointerId);});
      renderedNodes.set(n.id,g);(p.expanded?frameFragment:nodeFragment).append(g);
    }
    let failedRoutes=0;
    for(const e of projection.edges){const route=E.route(e,projection.positions);if(!route.ok)failedRoutes++;
      const path=el('path',{class:'edge '+(e.kind==='parameter-read'?'resource':e.evidence==='runtime-tensor'?'runtime':'source')+(route.ok?'':' route-failed'),d:route.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),'marker-end':'url(#arrow)','data-edge-id':e.id,'data-route-valid':String(route.ok)});
      path.append(el('title',{},`${e.id} · ${e.kind} · ${e.evidence} · ${e.source_port} → ${e.target_port}${route.ok?'':' · '+route.reason}`));edgeFragment.append(path);renderedEdges.set(e.id,path);
    }
    $('frames').append(frameFragment);$('edges').append(edgeFragment);$('nodes').append(nodeFragment);
    $('undo').disabled=!history.length;$('redo').disabled=!future.length;message(`${projection.nodes.length} 个图元 · ${projection.edges.length} 条连接${projection.architecture?' · '+projection.nodes.filter(n=>n.presentation_only).length+' 个架构摘要':''}${failedRoutes?' · '+failedRoutes+' 条路径待调整':''}`);
  }
  function world(e){const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;return point.matrixTransform(svg.getScreenCTM().inverse());}
  function move(){pendingFrame=0;if(!drag||!dragPoint)return;const point=dragPoint;if(drag.kind==='pan'){camera.x=drag.camera.x-(point.clientX-drag.client.x)*camera.w/svg.clientWidth;camera.y=drag.camera.y-(point.clientY-drag.client.y)*camera.h/svg.clientHeight;setCamera();return;}
    const p=world(point),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(Math.abs(dx)+Math.abs(dy)<1&&!drag.moved)return;
    if(!drag.moved){snapshot();drag.moved=true;}for(const id of drag.ids){const old=drag.origins.get(id),position=projection.positions.get(id);position.x=old.x+dx;position.y=old.y+dy;renderedNodes.get(id).setAttribute('transform',`translate(${position.x},${position.y})`);}for(const e of drag.edges)renderedEdges.get(e.id).setAttribute('d',E.path(e,projection.positions));state.offsets[drag.id]={x:drag.offset.x+dx,y:drag.offset.y+dy};
  }
  svg.addEventListener('pointerdown',e=>{if(e.button===1){e.preventDefault();drag={kind:'pan',client:{x:e.clientX,y:e.clientY},camera:{...camera}};svg.setPointerCapture(e.pointerId);}});
  svg.addEventListener('pointermove',e=>{if(!drag)return;dragPoint={clientX:e.clientX,clientY:e.clientY};if(!pendingFrame)pendingFrame=requestAnimationFrame(move);});
  function endDrag(){if(!drag)return;if(pendingFrame){cancelAnimationFrame(pendingFrame);move();}const moved=drag.moved;drag=null;dragPoint=null;if(moved){persist();render();}}
  svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);svg.addEventListener('auxclick',e=>e.preventDefault());
  svg.addEventListener('wheel',e=>{e.preventDefault();const at=world(e),f=Math.exp(Math.max(-.4,Math.min(.4,e.deltaY*.001)));const w=Math.max(200,Math.min(100000,camera.w*f)),ratio=w/camera.w;camera={x:at.x-(at.x-camera.x)*ratio,y:at.y-(at.y-camera.y)*ratio,w,h:camera.h*ratio};setCamera();},{passive:false});
  $('collapse').onclick=()=>{snapshot();state.open=[];render();fit();persist();};
  $('expand').onclick=()=>{snapshot();state.details=true;$('detailsToggle').checked=true;state.open=[...E.viewIndex(ir,state).children.keys()].filter(Boolean);render();fit();persist();};
  $('detailsToggle').onchange=()=>{snapshot();state.details=$('detailsToggle').checked;render();fit();persist();};
  $('view').onchange=()=>{snapshot();state.view=$('view').value;render();fit();persist();};
  $('relayout').onclick=()=>{snapshot();state.offsets={};render();fit();persist();};
  $('fit').onclick=fit;$('search').oninput=library;
  $('mode').onchange=()=>{snapshot();state.mode=$('mode').value;if(state.mode==='runtime'&&!state.open.includes('runtime-observations'))state.open.push('runtime-observations');render();fit();persist();};
  $('undo').onclick=()=>{if(!history.length)return;future.push(E.clone(state));state=history.pop();$('mode').value=state.mode;$('view').value=state.view||'architecture';$('detailsToggle').checked=!!state.details;render();persist();};
  $('redo').onclick=()=>{if(!future.length)return;history.push(E.clone(state));state=future.pop();$('mode').value=state.mode;$('view').value=state.view||'architecture';$('detailsToggle').checked=!!state.details;render();persist();};
  let exportUrl=null;
  function download(content,name,type){if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(new Blob([content],{type}));$('exportTitle').textContent=name;$('exportDownload').href=exportUrl;$('exportDownload').download=name;$('exportText').value=content;$('exportDialog').showModal();}
  $('exportClose').onclick=()=>$('exportDialog').close();
  $('save').onclick=()=>download(JSON.stringify({schema:'semantic-canvas/1',ir,state},null,2),ir.title+'-semantic.json','application/json');
  $('export').onclick=()=>{const copy=svg.cloneNode(true);copy.setAttribute('xmlns',NS);copy.setAttribute('viewBox',`${projection.bounds.x} ${projection.bounds.y} ${projection.bounds.w} ${projection.bounds.h}`);copy.setAttribute('width',projection.bounds.w);copy.setAttribute('height',projection.bounds.h);const style=el('style',{},'.edge{fill:none;stroke-width:1.8}.edge.source{stroke:#6b89b8;stroke-dasharray:5 4}.edge.runtime{stroke:#288765}.edge.resource{stroke:#ac72a0}.edge.route-failed{stroke:#cf7930;stroke-dasharray:3 3}text{font-family:Arial,sans-serif}');copy.prepend(style);download(new XMLSerializer().serializeToString(copy),ir.title+'.svg','image/svg+xml');};
  $('import').onclick=()=>$('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;const ticket=++loadRevision;try{if(file.size>20_000_000)throw Error('文件超过 20MB');const value=JSON.parse(await file.text());if(ticket!==loadRevision)return;open(['semantic-canvas/1','archcanvas-architecture-document/1'].includes(value.schema)?value.ir:value,value.state);$('irLink').hidden=true;}catch(error){message(error.message);}finally{$('file').value='';}};
  Promise.all([fetch('../data/semantic/catalog.json').then(r=>r.json()),fetch('../data/semantic/source-inventory.json').then(r=>r.json())]).then(([data,inventory])=>{catalog=data.models;$('inventory').textContent=`已只读扫描 ${inventory.files.length} 个文件，发现 ${inventory.models.length} 个模型候选。Awesome 列表登记 ${inventory.github_links.length} 个 GitHub 来源链接，尚未下载。Notebook 仅静态解析。`;library();const id=new URLSearchParams(location.search).get('model');loadModel(catalog.find(m=>m.id===id)||catalog[0]);}).catch(error=>message('读取失败：'+error.message));
})();

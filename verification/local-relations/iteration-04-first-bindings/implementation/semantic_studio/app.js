(function(){
  'use strict';
  const $=id=>document.getElementById(id),E=window.SemanticEngine,P=window.SemanticPublication,R=window.SemanticPublicationRenderer,svg=$('canvas'),NS='http://www.w3.org/2000/svg';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
  let catalog=[],ir=null,state=null,projection=null,selected=null,history=[],future=[],camera={x:0,y:0,w:1000,h:700},drag=null,loadRevision=0;
  let renderedNodes=new Map(),renderedEdges=new Map(),pendingFrame=0,dragPoint=null,inspectedBundle=null;
  const storeKey=()=> 'summary-semantic:architecture-v1:'+ir.ir_digest;
  const message=x=>$('status').textContent=x;
  function snapshot(){history.push(E.clone(state));if(history.length>40)history.shift();future=[];}
  function persist(){try{localStorage.setItem(storeKey(),JSON.stringify(state));}catch(_){message('浏览器存储已满；可保存图文档到文件。');}}
  function setCamera(){svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);}
  function fit(){const b=projection.bounds,r=$('stage').clientWidth/$('stage').clientHeight,w=b.w+40,h=b.h+40;camera=w/h>r?{x:b.x-20,y:b.y-(w/r-h)/2-20,w,h:w/r}:{x:b.x-(h*r-w)/2-20,y:b.y-20,w:h*r,h};setCamera();}
  function library(){const q=$('search').value.toLowerCase();$('catalog').replaceChildren();for(const m of catalog.filter(m=>m.title.toLowerCase().includes(q))){const b=document.createElement('button');b.className='case'+(ir?.ir_digest===m.digest?' active':'');b.innerHTML=`<strong>${esc(m.title)}</strong><small>${m.nodes} 节点 · ${esc(m.runtime==='passed'?'CPU 已观测':'静态源码')}</small>`;b.onclick=()=>loadModel(m);$('catalog').append(b);}}
  async function loadModel(m){const ticket=++loadRevision;try{const response=await fetch('../data/semantic/'+m.ir,{cache:'no-store'});if(!response.ok)throw Error('IR 文件读取失败');const value=await response.json();if(ticket!==loadRevision)return;open(value);$('irLink').href='../data/semantic/'+m.ir;$('irLink').hidden=false;}catch(error){message(error.message);}}
  function open(value,saved){E.validate(value);ir=value;history=[];future=[];selected=null;inspectedBundle=null;
    const roots=ir.nodes.filter(n=>!n.parent).map(n=>n.id);state={open:roots,offsets:{},mode:'source',view:'publication'};
    try{const disk=saved||JSON.parse(localStorage.getItem(storeKey()));if(disk&&typeof disk==='object'&&!Array.isArray(disk))state={...state,...disk,open:Array.isArray(disk.open)?disk.open:roots,offsets:disk.offsets&&typeof disk.offsets==='object'&&!Array.isArray(disk.offsets)?disk.offsets:{}};}catch(_){}
    state.view=state.view||'publication';$('view').value=state.view;$('detailsToggle').checked=!!state.details;$('foldToggle').checked=state.foldSerial!==false;optionalFold();$('mode').value=state.mode;$('mode').options[1].disabled=!ir.nodes.some(n=>n.id==='runtime-observations');
    if(state.mode==='runtime'&&$('mode').options[1].disabled)state.mode='source';$('mode').value=state.mode;$('nodeTitle').textContent='选择图元';$('details').textContent='单击节点查看源码与运行证据。';
    $('title').textContent=ir.title;$('summary').textContent=`${ir.nodes.length} 个语义单位 · ${ir.edges.length} 个关系 · ${(ir.motifs||[]).length} 个组合模式`;
    const c=ir.coverage||{status:'not-verified'},r=ir.runtime||{status:'not-requested'},branches=c.branches||[];
    $('coverage').innerHTML=`<strong>验证范围</strong> <span class="badge">${esc(c.status)}</span><p>目标契约（当前验证结果见状态与限制）：${esc(ir.coverage_contract)}</p><div>当前输入：${esc(c.scope||'静态分析')}；CPU：${esc(r.status)}；源码分支：${branches.filter(b=>b.kind!=='loop'&&!b.missing.length).length}/${(ir.branches||[]).filter(b=>b.kind!=='loop').length} 个 if / 条件表达式已覆盖两个结果；循环与短路路径另列为限制。</div><div>${esc(c.reason||'')}</div>${r.reason?'<pre>'+esc(r.reason)+'</pre>':''}<details><summary>分支、限制和模式证据</summary><pre>${esc(JSON.stringify({coverage:c,motifs:ir.motifs,limitations:ir.limitations},null,2))}</pre></details>`;
    render();fit();library();message($('status').textContent+'；双击模块展开，单击查看证据');
  }
  function inspect(id){selected=id;inspectedBundle=null;for(const[key,g]of renderedNodes)g.classList.toggle('selected',key===id);const n=projection.idx.nodes.get(id);if(!n)return;
    $('nodeTitle').textContent=n.label;
    $('details').innerHTML=`<span class="badge">${esc(n.kind)}</span><span class="badge">${esc(n.evidence_status)}</span>${n.semantic_type?'<p>'+esc(n.semantic_type)+'</p>':''}${n.reason?'<p>'+esc(n.reason)+'</p>':''}${n.presentation_only?'<p>架构摘要 · '+n.canonical_members.length+' 个原始节点 · '+n.boundary_ports.length+' 个边界端口</p><pre>'+esc(JSON.stringify(projection.architecture.findings.find(f=>f.id===n.finding),null,2))+'</pre>':''}${(n.source||[]).slice(0,10).map(s=>`<div class="source">${esc(s.file.split('/').slice(-2).join('/'))}:${s.line}<code>${esc(s.symbol)}</code><pre>${esc(s.expression)}</pre></div>`).join('')}${n.inputs?'<p>输入 / 输出张量</p><pre>'+esc(JSON.stringify({inputs:n.inputs,outputs:n.outputs},null,2))+'</pre>':''}${projection.annotations.get(id)?.length?'<details><summary>附属资源与配置</summary><pre>'+esc(JSON.stringify(projection.annotations.get(id),null,2))+'</pre></details>':''}<details><summary>完整语义与证据</summary><pre>${esc(JSON.stringify(n,null,2))}</pre></details>`;
    if(n.content_inventory)$('details').insertAdjacentHTML('afterbegin','<h3>摘要内容</h3><p>按当前语义单元计数，包含操作、调用和已确认的局部组合；不表示重复堆叠、执行并发或参数共享。</p>'+n.content_inventory.terms.map(t=>'<div class="source"><strong>'+esc(t.label)+' × '+t.count+'</strong><br>'+t.units.map(id=>esc(projection.idx.nodes.get(id)?.label||id)).join(' · ')+'</div>').join(''));
    if(n.semantic_contracts?.length)$('details').insertAdjacentHTML('beforeend','<details open><summary>语义契约与证据范围</summary><pre>'+esc(JSON.stringify((ir.semantic_contracts||[]).filter(c=>n.semantic_contracts.includes(c.id)),null,2))+'</pre></details>');
    const relations=projection.architecture?.relation_graph?.relations||[],receipts=projection.constraint_receipts||[];
    const local=relations.filter(r=>r.node===id||r.members.includes(id));
    if(local.length)$('details').insertAdjacentHTML('beforeend','<details><summary>局部关系与未证明属性</summary><pre>'+esc(JSON.stringify(local,null,2))+'</pre></details>');
    for(const relation of local.filter(r=>['gated-product','gated-join','state-interface','unknown-boundary','conditional-join','selection'].includes(r.type))){const button=document.createElement('button');button.textContent='查看关系详图 · '+relation.type;button.onclick=()=>{snapshot();state.view='publication';$('view').value=state.view;state.paperRelation=relation.id;state.paperAuto=true;state.paperGranularity='detailed';state.offsets={};render();fit();persist();syncPaperControls();};$('details').append(button);}
    const constraints=receipts.filter(r=>r.visible_node===id||r.mapping.some(b=>b.visible_source===id||b.visible_target===id));
    if(constraints.length)$('details').insertAdjacentHTML('beforeend','<details><summary>当前画面的关系约束</summary><pre>'+esc(JSON.stringify(constraints,null,2))+'</pre></details>');
    if(n.observed_calls)$('details').insertAdjacentHTML('beforeend','<details><summary>对应的运行观测</summary><pre>'+esc(JSON.stringify(n.observed_calls,null,2))+'</pre></details>');
    if(n.repeat_contract?.homogeneous){const button=document.createElement('button');button.textContent='查看一个代表实例';button.onclick=()=>{snapshot();state.paperFocus=n.id;state.paperRepresentative=true;state.paperGranularity='modules';state.paperAuto=true;state.offsets={};syncPaperControls();render();fit();persist();};$('details').append(button);}
    if(n.observation_group){const button=document.createElement('button');button.textContent='查看一条代表轨迹';button.onclick=()=>{snapshot();state.paperFocus=n.observation_group.representative;state.paperRepresentative=false;state.paperAuto=true;state.offsets={};syncPaperControls();render();fit();persist();};$('details').append(button);}
    if(n.boundary_uses?.length>1)$('details').insertAdjacentHTML('beforeend','<h3>外部使用</h3><p>同一源码结果的 '+n.boundary_uses.length+' 次使用；逐条保留目标与操作数。</p>'+n.boundary_uses.map(e=>'<div class="source"><strong>'+esc(projection.idx.nodes.get(e.target)?.label||e.target)+'</strong> ['+esc(e.target_port)+']<br>'+esc(e.id)+' · '+esc(e.evidence)+'</div>').join(''));
  }
  function inspectBundle(edge){
    inspectedBundle=edge.id;
    selected=null;for(const g of renderedNodes.values())g.classList.remove('selected');
    $('nodeTitle').textContent=edge.bundle_members.length+' 条依赖';
    $('details').innerHTML='<span class="badge">合绘连线</span><p>展开相邻分组可查看逐条连接。合绘保留每个值和操作数，不声明张量相同或执行并发。</p>'+
      edge.bundle_members.map(m=>`<div class="source"><strong>${esc(projection.idx.nodes.get(m.canonical_source)?.label||m.canonical_source)}</strong> [${esc(m.source_port)}] → <strong>${esc(projection.idx.nodes.get(m.canonical_target)?.label||m.canonical_target)}</strong> [${esc(m.target_port)}]<br>${esc(m.id)} · ${esc(m.evidence)}</div>`).join('');
    const groups=[edge.source,edge.target].filter(id=>['branch-region','branch-panel','dependency-band','dependency-panel'].includes(projection.idx.nodes.get(id)?.semantic_type));
    for(const id of groups){const button=document.createElement('button');button.textContent='展开 '+projection.idx.nodes.get(id).label;button.onclick=()=>toggle(id);$('details').append(button);}
  }
  function refreshBundleInspector(){
    if(!inspectedBundle){
      if(!selected)return;
      if(projection.positions.has(selected)){inspect(selected);return;}
      selected=null;$('nodeTitle').textContent='选择图元';$('details').textContent='单击节点或合绘连线查看当前图面的证据。';return;
    }
    const edge=state.view==='publication'&&projection.edges.find(e=>e.id===inspectedBundle&&e.bundle_members);
    if(edge){inspectBundle(edge);return;}
    inspectedBundle=null;$('nodeTitle').textContent='选择图元';$('details').textContent='单击节点或合绘连线查看当前图面的证据。';
  }
  function toggle(id){if(!(projection.idx.children.get(id)||[]).length)return;snapshot();if(state.view==='publication'){state.open=projection.publication.open;state.paperAuto=false;$('paperAuto').checked=false;}const open=new Set(state.open);if(open.has(id))open.delete(id);else open.add(id);state.open=[...open];render();if(state.view==='publication')fit();persist();}
  function bindNode(g,n,p){
      const kids=projection.idx.children.get(n.id)||[];
      if(kids.length){const plus=el('text',{x:p.w-22,y:25,'font-size':18,fill:'#47618a'},p.expanded?'−':'+');plus.style.pointerEvents='auto';plus.style.cursor='pointer';plus.addEventListener('pointerdown',e=>e.stopPropagation());plus.addEventListener('click',e=>{e.stopPropagation();toggle(n.id);});g.append(plus);}
      g.addEventListener('dblclick',e=>{e.stopPropagation();toggle(n.id);});
      g.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();inspect(n.id);const point=world(e),ids=new Set([n.id]),todo=[n.id];for(let i=0;i<todo.length;i++)for(const child of projection.idx.children.get(todo[i])||[])if(projection.positions.has(child)){ids.add(child);todo.push(child);}drag={kind:'node',id:n.id,start:point,ids,origins:new Map([...ids].map(id=>[id,{...projection.positions.get(id)}])),offset:E.clone(state.offsets[n.id]||{x:0,y:0}),moved:false,edges:projection.edges.filter(edge=>ids.has(edge.source)||ids.has(edge.target))};g.setPointerCapture(e.pointerId);});
  }
  function render(){if(!ir)return;$('legend').innerHTML=state.view==='publication'?'<span>蓝灰实线：源码依赖</span><span>绿色：实际张量流</span><span>黄虚线：控制</span><span>虚框：未知操作</span><span>无节点交叉：跨越</span><span>粗线与数量：合绘的独立依赖，可单击查看</span>':'<span>蓝色虚线：源码依赖</span><span>绿色实线：实际张量流</span><span>紫色：参数</span><span>黄色：控制</span><span>红色虚框：未知边界</span>';svg.classList.toggle('publication',state.view==='publication');if(state.view!=='publication')document.getElementById('paperLabels')?.remove();if(state.view==='publication'){renderPaper();return;}projection=E.project(ir,state);renderedNodes=new Map();renderedEdges=new Map();for(const id of ['frames','edges','nodes'])$(id).replaceChildren();
    const frameFragment=document.createDocumentFragment(),nodeFragment=document.createDocumentFragment(),edgeFragment=document.createDocumentFragment();
    for(const n of E.drawingOrder(projection.nodes,projection.idx)){const p=projection.positions.get(n.id),g=el('g',{class:'node'+(n.id===selected?' selected':''),'data-id':n.id,transform:`translate(${p.x},${p.y})`});const fill=n.glyph?.fill||'#edf2fa',color=n.kind==='opaque'?'#bf6b6b':'#92a8c4';let shape;
      if(p.symbol){shape=el('circle',{cx:p.w/2,cy:p.h/2,r:p.w/2,fill,stroke:color});}
      else if(n.kind==='control'&&!p.expanded){shape=el('polygon',{points:`16,0 ${p.w-16},0 ${p.w},${p.h/2} ${p.w-16},${p.h} 16,${p.h} 0,${p.h/2}`,fill,stroke:color});}
      else shape=el('rect',{x:0,y:0,width:p.w,height:p.h,rx:p.expanded?12:n.kind==='interface'?28:8,fill:p.expanded?'#f7f9fd':fill,stroke:color,'stroke-width':p.expanded?1.6:1.2,...(n.kind==='opaque'?{'stroke-dasharray':'5 4'}:{})});
      g.append(shape,el('title',{},n.label+' | '+n.kind+' | '+n.evidence_status));
      const limit=Math.floor((p.w-40)/7.5),label=n.label.length>limit?n.label.slice(0,limit-1)+'…':n.label;
      g.append(el('text',{x:p.symbol?p.w/2:12,y:p.symbol?p.h/2+8:22,'text-anchor':p.symbol?'middle':'start','font-size':p.symbol?28:p.h<60?12:14,'font-weight':600,fill:'#263b55'},p.symbol||label));
      const caption=p.expanded?(n.semantic_type||'composite'):(n.semantic_type||n.operator||n.kind);
      if(p.h>=58&&!p.symbol)g.append(el('text',{x:12,y:46,'font-size':10,fill:'#7385a0'},caption.length>32?caption.slice(0,30)+'…':caption));
      bindNode(g,n,p);
      renderedNodes.set(n.id,g);(p.expanded?frameFragment:nodeFragment).append(g);
    }
    let failedRoutes=0;
    for(const e of projection.edges){const route=E.route(e,projection.positions);if(!route.ok)failedRoutes++;
      const path=el('path',{class:'edge '+(e.kind==='parameter-read'?'resource':e.evidence==='runtime-tensor'?'runtime':'source')+(route.ok?'':' route-failed'),d:route.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),'marker-end':'url(#arrow)','data-edge-id':e.id,'data-route-valid':String(route.ok)});
      path.append(el('title',{},`${e.id} · ${e.kind} · ${e.evidence} · ${e.source_port} → ${e.target_port}${route.ok?'':' · '+route.reason}`));edgeFragment.append(path);renderedEdges.set(e.id,path);
    }
    $('frames').append(frameFragment);$('edges').append(edgeFragment);$('nodes').append(nodeFragment);
    refreshBundleInspector();$('undo').disabled=!history.length;$('redo').disabled=!future.length;message(`${projection.nodes.length} 个图元 · ${projection.edges.length} 条连接${projection.architecture?' · '+projection.nodes.filter(n=>n.presentation_only).length+' 个架构摘要':''}${failedRoutes?' · '+failedRoutes+' 条路径待调整':''}`);
  }
  function syncPaperControls(){
    if(!ir||!state)return;
    $('paperAuto').checked=state.paperAuto!==false;$('paperWidth').value=state.paperWidthMm||180;$('paperGranularity').value=state.paperGranularity||'overview';$('paperGranularity').disabled=state.paperAuto===false;
    const plan=P.plan(ir),idx=E.index(plan),select=$('paperFocus');select.replaceChildren(new Option('模型总览',''));
    const source=id=>{while(id){if(id==='runtime-observations'||id.startsWith('runtime:'))return false;id=idx.nodes.get(id)?.parent;}return true;};
    for(const n of plan.nodes)if(n.parent&&(idx.children.get(n.id)||[]).length&&(state.mode==='source'?source(n.id):state.mode==='runtime'?!source(n.id):true)){const option=new Option((n.module_path||n.label)+(n.paper.unknown_count?' · '+n.paper.unknown_count+' 未知边界':''),n.id);select.add(option);}
    if(state.paperRelation){select.add(new Option('局部关系详图',':relation'));select.value=':relation';}else select.value=state.paperFocus||'';
  }
  $('paperFocus').onchange=()=>{if($('paperFocus').value===':relation')return;snapshot();state.paperRelation=null;state.paperFocus=$('paperFocus').value||null;state.paperRepresentative=false;state.paperAuto=true;state.offsets={};render();fit();persist();syncPaperControls();};
  $('paperAuto').onchange=()=>{snapshot();state.open=projection.publication?.open||state.open;state.paperAuto=$('paperAuto').checked;state.offsets={};syncPaperControls();render();fit();persist();};
  $('paperGranularity').onchange=()=>{snapshot();state.paperGranularity=$('paperGranularity').value;state.paperAuto=true;state.offsets={};render();fit();persist();};
  $('paperWidth').onchange=()=>{snapshot();state.paperWidthMm=Math.max(80,Math.min(400,Number($('paperWidth').value)||180));render();fit();persist();};
  function renderPaper(){
    const figure=R.prepareFigure(ir,state);projection=figure.graph;const prepared=figure.prepared;projection.bounds=prepared.bounds;
    renderedNodes=new Map();renderedEdges=new Map();for(const id of ['frames','edges','nodes'])$(id).replaceChildren();
    let style=document.getElementById('paperStyle');if(!style){style=el('style',{id:'paperStyle'},R.css);svg.prepend(style);svg.querySelector('defs').insertAdjacentHTML('beforeend',R.defs);}
    document.getElementById('paperLabels')?.remove();const labels=el('g',{id:'paperLabels'});
    for(const n of E.drawingOrder(projection.nodes,projection.idx)){const p=projection.positions.get(n.id),g=el('g',{class:'node'+(n.id===selected?' selected':''),'data-id':n.id,transform:`translate(${p.x},${p.y})`});g.innerHTML=R.nodeBody(n,p);g.append(el('title',{},R.nodeTitle(n,projection.idx)));bindNode(g,n,p);(p.expanded?$('frames'):$('nodes')).append(g);renderedNodes.set(n.id,g);}
    for(const edge of prepared.routes){
      const g=el('g');g.innerHTML=R.edgeBody(edge);
      if(edge.bundle_members){
        g.style.cursor='pointer';g.setAttribute('role','button');g.setAttribute('tabindex','0');
        g.setAttribute('aria-label','查看 '+edge.bundle_members.length+' 条合绘依赖');
        // Rectangles also give a perfectly horizontal/vertical SVG edge a
        // nonzero accessible box, while keeping hit areas on its segments.
        for(let i=1;i<edge.route.points.length;i++){
          const a=edge.route.points[i-1],b=edge.route.points[i];
          g.append(el('rect',{x:Math.min(a.x,b.x)-8,y:Math.min(a.y,b.y)-8,width:Math.abs(a.x-b.x)+16,height:Math.abs(a.y-b.y)+16,fill:'transparent','pointer-events':'all','aria-hidden':'true'}));
        }
        g.addEventListener('click',e=>{e.stopPropagation();inspectBundle(edge);});
        g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();inspectBundle(edge);}});
      }
      $('edges').append(g);renderedEdges.set(edge.id,g);
    }
    labels.innerHTML=prepared.labeling.placed.map(R.labelBody).join('');svg.append(labels);refreshBundleInspector();
    const q=prepared.quality;$('paperQuality').textContent=`${q.min_print_font_pt} pt 最小字号 · ${Number(q.width_mm.toFixed(1))} × ${q.height_mm} mm${q.issues.length?' · 需调整：'+q.issues.map(s=>({'font-below-8pt':'字号偏小','figure-taller-than-245mm':'图过高','route-failure':'连线路径','port-label-requires-note':'端口标签见导出附注','edge-path-overlap':'路径重合'})[s]).join('、'):''}`;
    $('paperQuality').className=q.issues.length?'needs-adjustment':'quality-ok';
    $('paperAuto').checked=state.paperAuto!==false;$('paperGranularity').disabled=state.paperAuto===false;$('undo').disabled=!history.length;$('redo').disabled=!future.length;
    const limited=prepared.routing.granularity_refinement;
    message(`${projection.nodes.length} 个图元 · ${projection.edges.length} 条连接${projection.publication.wire_bundles.length?'（'+projection.edge_accounting.visible.length+' 条依赖）':''} · ${projection.publication.unknowns} 个未知操作${prepared.quality.route_failures.length?' · 存在待调整路径':''}${limited&&(limited.selected!==limited.requested||limited.selected_budget<limited.requested_budget)?' · 受图宽限制，部分细节请打开模块详图':''}`);
  }
  function world(e){const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;return point.matrixTransform(svg.getScreenCTM().inverse());}
  function move(){pendingFrame=0;if(!drag||!dragPoint)return;const point=dragPoint;if(drag.kind==='pan'){camera.x=drag.camera.x-(point.clientX-drag.client.x)*camera.w/svg.clientWidth;camera.y=drag.camera.y-(point.clientY-drag.client.y)*camera.h/svg.clientHeight;setCamera();return;}
    const p=world(point),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(Math.abs(dx)+Math.abs(dy)<1&&!drag.moved)return;
    if(!drag.moved){snapshot();drag.moved=true;}for(const id of drag.ids){const old=drag.origins.get(id),position=projection.positions.get(id);position.x=old.x+dx;position.y=old.y+dy;renderedNodes.get(id).setAttribute('transform',`translate(${position.x},${position.y})`);}if(projection.positions.context){projection.positions.context.routeCache=null;projection.positions.context.reserved=[];}for(const e of drag.edges){const element=renderedEdges.get(e.id),d=E.path(e,projection.positions);if(element.tagName==='g')element.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));else element.setAttribute('d',d);}if(state.view==='publication')document.getElementById('paperLabels')?.setAttribute('visibility','hidden');state.offsets[drag.id]={x:drag.offset.x+dx,y:drag.offset.y+dy};
  }
  svg.addEventListener('pointerdown',e=>{if(e.button===1){e.preventDefault();drag={kind:'pan',client:{x:e.clientX,y:e.clientY},camera:{...camera}};svg.setPointerCapture(e.pointerId);}});
  svg.addEventListener('pointermove',e=>{if(!drag)return;dragPoint={clientX:e.clientX,clientY:e.clientY};if(!pendingFrame)pendingFrame=requestAnimationFrame(move);});
  function endDrag(){if(!drag)return;if(pendingFrame){cancelAnimationFrame(pendingFrame);move();}const moved=drag.moved;drag=null;dragPoint=null;if(moved){persist();render();}}
  svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);svg.addEventListener('auxclick',e=>e.preventDefault());
  svg.addEventListener('wheel',e=>{e.preventDefault();const at=world(e),f=Math.exp(Math.max(-.4,Math.min(.4,e.deltaY*.001)));const w=Math.max(200,Math.min(100000,camera.w*f)),ratio=w/camera.w;camera={x:at.x-(at.x-camera.x)*ratio,y:at.y-(at.y-camera.y)*ratio,w,h:camera.h*ratio};setCamera();},{passive:false});
  $('collapse').onclick=()=>{snapshot();if(state.view==='publication'){state.paperAuto=false;$('paperAuto').checked=false;}state.open=[];render();fit();persist();};
  $('expand').onclick=()=>{snapshot();state.paperAuto=false;state.details=state.view!=='publication';$('detailsToggle').checked=state.details;$('paperAuto').checked=false;state.open=[...E.viewIndex(ir,state).children.keys()].filter(Boolean);render();fit();persist();};
  function optionalFold(){$('foldToggle').disabled=state.view==='source';$('detailsToggle').disabled=state.view==='publication';$('paperTools').hidden=state.view!=='publication';syncPaperControls();}
  $('foldToggle').onchange=()=>{snapshot();state.foldSerial=$('foldToggle').checked;state.offsets={};render();fit();persist();};
  $('detailsToggle').onchange=()=>{snapshot();state.details=$('detailsToggle').checked;render();fit();persist();};
  $('view').onchange=()=>{snapshot();state.view=$('view').value;if(state.view==='publication')state.details=false;optionalFold();render();fit();persist();};
  $('relayout').onclick=()=>{snapshot();state.offsets={};render();fit();persist();};
  $('fit').onclick=fit;$('search').oninput=library;
  $('mode').onchange=()=>{snapshot();state.mode=$('mode').value;state.paperFocus=null;syncPaperControls();if(state.mode==='runtime'&&!state.open.includes('runtime-observations'))state.open.push('runtime-observations');render();fit();persist();};
  $('undo').onclick=()=>{if(!history.length)return;future.push(E.clone(state));state=history.pop();$('mode').value=state.mode;$('view').value=state.view||'architecture';$('detailsToggle').checked=!!state.details;$('foldToggle').checked=state.foldSerial!==false;optionalFold();render();fit();persist();};
  $('redo').onclick=()=>{if(!future.length)return;history.push(E.clone(state));state=future.pop();$('mode').value=state.mode;$('view').value=state.view||'architecture';$('detailsToggle').checked=!!state.details;$('foldToggle').checked=state.foldSerial!==false;optionalFold();render();fit();persist();};
  let exportUrl=null;
  function download(content,name,type){if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(new Blob([content],{type}));$('exportTitle').textContent=name;$('exportDownload').href=exportUrl;$('exportDownload').download=name;$('exportText').value=content;$('exportDialog').showModal();}
  $('exportClose').onclick=()=>$('exportDialog').close();
  $('save').onclick=()=>download(JSON.stringify({schema:'semantic-canvas/1',ir,state},null,2),ir.title+'-semantic.json','application/json');
  $('export').onclick=()=>{if(state.view==='publication'){download(R.render(ir,state).svg,ir.title+'-figure.svg','image/svg+xml');return;}const copy=svg.cloneNode(true);copy.setAttribute('xmlns',NS);copy.setAttribute('viewBox',`${projection.bounds.x} ${projection.bounds.y} ${projection.bounds.w} ${projection.bounds.h}`);copy.setAttribute('width',projection.bounds.w);copy.setAttribute('height',projection.bounds.h);const style=el('style',{},'.edge{fill:none;stroke-width:1.8}.edge.source{stroke:#6b89b8;stroke-dasharray:5 4}.edge.runtime{stroke:#288765}.edge.resource{stroke:#ac72a0}.edge.route-failed{stroke:#cf7930;stroke-dasharray:3 3}text{font-family:Arial,sans-serif}');copy.prepend(style);download(new XMLSerializer().serializeToString(copy),ir.title+'.svg','image/svg+xml');};
  $('import').onclick=()=>$('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;const ticket=++loadRevision;try{if(file.size>20_000_000)throw Error('文件超过 20MB');const value=JSON.parse(await file.text());if(ticket!==loadRevision)return;open(['semantic-canvas/1','archcanvas-architecture-document/1'].includes(value.schema)?value.ir:value,value.state);$('irLink').hidden=true;}catch(error){message(error.message);}finally{$('file').value='';}};
  Promise.all([fetch('../data/semantic/catalog.json',{cache:'no-store'}).then(r=>r.json()),fetch('../data/semantic/source-inventory.json',{cache:'no-store'}).then(r=>r.json())]).then(([data,inventory])=>{catalog=data.models;$('inventory').textContent=`已只读扫描 ${inventory.files.length} 个文件，发现 ${inventory.models.length} 个模型候选。Awesome 列表登记 ${inventory.github_links.length} 个 GitHub 来源链接，尚未下载。Notebook 仅静态解析。`;library();const id=new URLSearchParams(location.search).get('model');loadModel(catalog.find(m=>m.id===id)||catalog[0]);}).catch(error=>message('读取失败：'+error.message));
})();

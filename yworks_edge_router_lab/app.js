(function() {
  'use strict';
  const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const catalog=window.SummaryCatalog,R=window.EdgeRouterLabRouting,E=window.SummaryEngine,C=window.SummaryConstraints,M=window.SummaryInteractionMode,F=window.SummaryRecursive,G=window.SummaryNativeSemantic,svg=$('graph');
  const names={transformer_programmatic_guide:'Transformer'};
  let genericCatalog={models:[]},genericUi=null;
  let factsDigest=null;
  let current=null,view=null,graph=null,original=null,tool='select',selectedNodes=new Set(),selectedEdges=new Set();
  // Every model is edited as one detailed graph. The compact source views are
  // used only as the initial projection and summary routing reference.
  let unifiedSources=null,unifiedState=null;
  let history=[],future=[],ghost=[],drag=null,connection=null,busy=false,dirty=false,loadToken=0,epoch=0;
  let sourceCheck={ok:true,violations:[]},dragFrame=0,dragPoint=null,worker=null,workerId=0,persistTimer=0;
  let interactionMode=(()=>{try{return M.normalize(localStorage.getItem(M.key));}catch(_){return 'compat';}})();
  const pendingTasks=new Map();let geometryTransport=G.transport('main');
  const LIVE_REALTIME_LIMIT=60;
  let camera={x:0,y:0,w:1100,h:720},metrics={routed:0,time:0},timer,sessions=new Map();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const element=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
  const key=()=>current.id+(current.collection==='generic'?':native-semantic-v1':':unified');
  let visibleCacheGraph=null,visibleCache=null;
  const unifiedVisible=()=>{if(visibleCacheGraph!==graph){visibleCacheGraph=graph;visibleCache=new Set(graph?.nodes?.map(n=>n.id)||[]);}return visibleCache;};
  const unifiedChildren=id=>graph?.generic?G.children(graph,id):graph?.recursive?F.children(graph.recursive.authority,id):[];
  const unifiedHasChildren=id=>!graph?.nodes.find(n=>n.id===id)?.modelHeading&&unifiedChildren(id).length>0&&(graph.generic||!graph.recursive.authority.mandatory.includes(id));
  const unifiedDisplayEdges=()=>graph.edges;
  function syncUnifiedState(){unifiedState=graph?.generic||graph?.recursive?{expandedIds:graph.nodes.filter(n=>n.expanded).map(n=>n.id)}:null;}
  function updateUnifiedStatus(){
    syncUnifiedState();if(!graph)return;if(graph.generic){const total=graph.generic.ir.nodes.length,opened=graph.nodes.filter(n=>n.expanded).length;$('recursiveStatus').textContent=`通用语义 · ${graph.generic.state.paperCanonical?'源码原子层':'可逆语义切面'} · ${graph.nodes.length}/${total} 节点 · ${graph.generic.ir.edges.length} 条原始依赖${graph.nativeRouting?.pending?' · '+graph.nativeRouting.pending+' 条路线待布线':''}`;$('collapseAll').disabled=busy||!!drag||!opened;$('expandAll').disabled=busy||!!drag||graph.nodes.length===total;genericUi?.sync();return;}const a=graph.recursive.authority,total=a.detail.nodes.filter(n=>!n.junction).length,opened=graph.nodes.filter(n=>n.expanded&&!a.mandatory.includes(n.id)).length;
    $('recursiveStatus').textContent=`递归图：已展开 ${opened} 个模块 · 显示 ${graph.nodes.filter(n=>!n.junction).length}/${total} 个节点`;
    $('collapseAll').disabled=busy||!!drag||!opened;$('expandAll').disabled=busy||!!drag||graph.nodes.length===a.detail.nodes.length;
  }
  async function changeFrontier(operation){
    if(busy||drag||!graph)return;save();const start=performance.now();busy=true;let committedValidation=null;
    try{
      // The recursive projection/build is part of the frontier transaction.
      // Send it to the same worker as routing so a large expansion never
      // blocks pointer input on the main thread before the route starts.
      render({presentationOnly:true});$('dirtyBadge').textContent='正在展开与整理边界连接…';
      const result=await runGraphTask({task:'frontier',graph,operation,options:options()});if(!result.ok)throw new Error(result.error);
      graph=result.graph;syncUnifiedState();selectedNodes=new Set([...selectedNodes].filter(id=>node(id)));selectedEdges.clear();ghost=[];dirty=true;
      metrics={routed:result.routed||0,time:Math.round(performance.now()-start)};committedValidation=result.validation;
      if(graph.generic&&['frontier','focus','back','all'].includes(operation.kind))fit();
      persist();toast('展开状态与局部布局已保存；可继续选择内部模块。');
    }catch(error){graph=history.pop()||graph;toast('展开未提交：'+error.message);}finally{busy=false;render({validation:committedValidation});}
  }
  const toggleUnifiedNode=(id,force)=>changeFrontier({kind:'toggle',id,force});
  const collapseUnifiedAll=()=>changeFrontier({kind:'all',open:false});
  const expandUnifiedAll=()=>changeFrontier({kind:'all',open:true});
  function restoreSourceBaseline(){} // Recursive receipts derive from registered source snapshots.
  const stageScale=()=>$('stage').clientWidth/camera.w;
  const point=event=>{const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
  const node=id=>graph.nodes.find(n=>n.id===id);
  // One delegated, delayed hover for the whole retained scene. Formatting is
  // lazy and cached by immutable semantic records, never repeated during drag.
  const evidenceHover=document.createElement('div'),hoverCache=new WeakMap();
  evidenceHover.id='semanticHover';evidenceHover.setAttribute('role','tooltip');
  evidenceHover.hidden=true;document.body.append(evidenceHover);
  let hoverTimer=0,hoverId=null,hoverTarget=null;
  function hideEvidence(){clearTimeout(hoverTimer);hoverTimer=0;hoverId=null;evidenceHover.hidden=true;
    hoverTarget?.removeAttribute('aria-describedby');hoverTarget=null;}
  function evidenceTarget(target){return target?.closest?.('.scene-node[data-node-id]');}
  function offerEvidence(ev){
    const target=evidenceTarget(ev.target),id=target?.getAttribute('data-node-id');
    if(!$('showSemanticEvidence').checked||!graph?.generic||busy||drag||ev.buttons||!id||target.getAttribute('data-model-heading')==='true'){hideEvidence();return;}
    if(hoverId===id)return;hideEvidence();hoverId=id;
    const captured=graph,x=ev.clientX,y=ev.clientY;
    hoverTimer=setTimeout(()=>{
      if(graph!==captured||busy||drag||hoverId!==id)return;
      const n=node(id);if(!n?.semantic)return;
      let text=hoverCache.get(n.semantic);if(text===undefined){text=G.nodeEvidence(graph,id);hoverCache.set(n.semantic,text);}
      evidenceHover.replaceChildren();const title=document.createElement('strong'),body=document.createElement('pre'),hint=document.createElement('small');
      title.textContent=label(n);body.textContent=text;hint.textContent='单击节点，在右侧检查器查看完整证据。';
      evidenceHover.append(title,body,hint);evidenceHover.hidden=false;
      const box=evidenceHover.getBoundingClientRect(),left=x+16+box.width>innerWidth-12?x-box.width-16:x+16;
      evidenceHover.style.left=Math.max(12,Math.min(innerWidth-box.width-12,left))+'px';
      evidenceHover.style.top=Math.max(12,Math.min(innerHeight-box.height-12,y+16))+'px';
      target.setAttribute('aria-describedby','semanticHover');hoverTarget=target;
    },800);
  }
  svg.addEventListener('pointerover',offerEvidence);
  // A new pointer position restarts the dwell; motion never formats evidence.
  svg.addEventListener('pointermove',ev=>{if(evidenceHover.hidden&&hoverId){hideEvidence();offerEvidence(ev);}});
  $('showSemanticEvidence').onchange=hideEvidence;
  svg.addEventListener('pointerout',ev=>{if(evidenceTarget(ev.target)!==evidenceTarget(ev.relatedTarget))hideEvidence();});
  svg.addEventListener('pointerdown',hideEvidence,true);
  svg.addEventListener('wheel',hideEvidence,{passive:true});
  window.addEventListener('blur',hideEvidence);
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.remove('visible'),4500);}
  function updateInteractionModeUi(){
    const select=$('interactionMode'),badge=$('interactionModeBadge'),description=$('interactionModeDescription'),hint=$('interactionHint');
    if(select)select.value=interactionMode;
    if(badge){badge.textContent=M.label(interactionMode);badge.classList.toggle('realtime',interactionMode==='realtime');}
    if(description)description.textContent=M.description(interactionMode);
    if(hint)hint.textContent=interactionMode==='realtime'
      ? '双击模块或使用检查器逐级展开；收起会记住内部状态。拖动节点时会实时重算箭头、端点、分支和连线路径；每一帧都从拖动前快照执行语义安全移动，非法位置自动保留上一合法状态。模块文字与连线文字跟随。直接拖动连线文字可沿所属路径吸附。Apply 可优化所选范围的布线。'
      : '双击模块或使用检查器逐级展开；收起会记住内部状态。拖动节点时，模块文字与连线文字分别跟随；兼容模式按帧轻量预览，松开后在后台完成完整约束校验。直接拖动连线文字可沿所属路径吸附。Apply 可优化所选范围的布线。按住鼠标滚轮拖动画布。';
    if(svg)svg.setAttribute('data-interaction-mode',interactionMode);
  }
  function setInteractionMode(value,notify=true){
    const next=M.normalize(value);if(drag||busy){if($('interactionMode'))$('interactionMode').value=interactionMode;toast('当前正在处理操作，完成后再切换交互模式。');return;}
    interactionMode=next;try{localStorage.setItem(M.key,interactionMode);}catch(_){}
    updateInteractionModeUi();
    if(notify)toast(interactionMode==='realtime'?'已切换到实时模式：拖动中同步更新箭头与连线。':'已切换到兼容模式：拖动结束后后台校验并整理连线。');
  }
  // Geometry transactions never mutate semantic evidence. Share those immutable
  // records between undo snapshots; keep positions, routes, drafts and state
  // independent. Authoring replaces the complete evidence document atomically.
  function cloneGraph(value){
    return value?.generic?G.cloneGeometry(value):E.clone(value);
  }
  function save(){history.push(cloneGraph(graph));if(history.length>30)history.shift();future=[];}
  function flushPersist(){clearTimeout(persistTimer);persistTimer=0;if(!graph||!current||busy||drag)return;if(graph.generic)G.remember(graph);else F.remember(graph);const state={graph:cloneGraph(graph),history:history.slice(),future:future.slice(),dirty};sessions.set(key(),state);
    const payload={version:5,ir:original.irSha256||null,graph:cloneGraph(graph),dirty};if(payload.graph.recursive)delete payload.graph.recursive.authority;
    const modelKey=key();window.SummaryRecursiveStorage.put(modelKey,payload).then(()=>{if(current&&key()===modelKey){svg.setAttribute('data-storage-status','saved');$('recursiveStatus').title='展开树、局部布局和当前图已保存到浏览器。';}}).catch(error=>{svg.setAttribute('data-storage-status','error');toast('自动保存失败，请导出 JSON 保留当前状态：'+error.message);});
  }
  function persist(){clearTimeout(persistTimer);persistTimer=setTimeout(flushPersist,180);}
  function options(){const values={margin:+$('clearance').value,stub:28,bendCost:40,crossingCost:$('crossings').checked?450:0,overlapCost:$('crossings').checked?2:0,edgeSpacing:$('crossings').checked?12:0,preserve:$('keepBends').checked,sides:$('portSides').value,grid:$('gridEnabled').checked?24:0,style:$('routingStyle').value};return graph?.generic?G.routeOptions(values):values;}
  function label(n){return n.label||n.id;}
  function renderCatalog(){
    const query=($('modelSearch')?.value||'').toLowerCase(),filtered=catalog.cases.filter(c=>c.title.toLowerCase().includes(query));
    $('catalogCount').textContent=`显示 ${filtered.length+genericCatalog.models.length} 个案例 · 每个模型独立保存展开状态`;
    const list=$('caseList');list.replaceChildren();const heading=document.createElement('div');heading.className='collection-label';heading.textContent='通用语义 · 原生画布';list.append(heading);for(const c of genericCatalog.models.filter(c=>c.title.toLowerCase().includes(query))){const b=document.createElement('button');b.className='case-button'+(current?.id==='generic:'+c.id?' active':'');b.dataset.modelId=c.id;b.innerHTML=`<strong>${esc(c.title)}</strong><small>${c.nodes} 原始单位 · ${c.edges} 精确依赖</small>`;b.onclick=()=>openGeneric(c);list.append(b);}let previous='';
    for(const c of filtered){if(c.collection!==previous){const h=document.createElement('div');h.className='collection-label';h.textContent=names[c.collection]||c.collection;list.append(h);previous=c.collection;}
      const b=document.createElement('button');b.className='case-button'+(current?.id===c.id?' active':'');b.dataset.caseId=c.id;
      b.innerHTML=`<strong>${esc(c.title)}</strong><small>${c.historical?'历史 · ':c.sourceAtomic?'源码原子图 · ':''}递归模型图</small>`;
      b.onclick=()=>openCase(c,c.views[0]);list.append(b);
    }
  }
  function asset(descriptor,c){return new Promise((resolve,reject)=>{const id=descriptor.dataKey||c.id+':'+descriptor.key;if(window.SummaryCaseData?.[id])return resolve(window.SummaryCaseData[id]);const script=document.createElement('script');script.src='../'+descriptor.asset;script.onload=()=>resolve(window.SummaryCaseData[id]);script.onerror=()=>reject(new Error('无法读取 '+descriptor.asset));document.head.append(script);});}
  async function openCase(c,v){
    if(busy){toast('正在重新布线，完成后可切换示例。');return;}
    flushPersist();const token=++loadToken;current=c;view={key:'unified',label:'递归图'};
    try{
      const descriptors=c.routeTemplates?[...c.views,...c.routeTemplates]:c.sourceAtomic?[...c.views,
        {key:'overview',asset:'data/cases/01093cc06a87b35a-overview.js',dataKey:'01093cc06a87b35a:overview'},
        {key:'modules',asset:'data/cases/01093cc06a87b35a-modules.js',dataKey:'01093cc06a87b35a:modules'},
        {key:'detailed',asset:'data/cases/01093cc06a87b35a-detailed.js',dataKey:'01093cc06a87b35a:detailed'}]:c.views;
      const sources=Object.fromEntries(await Promise.all(descriptors.map(async d=>[d.key,await asset(d,c)])));
      if(token!==loadToken)return;
      unifiedSources=Object.fromEntries(Object.entries(sources).map(([k,g])=>[k,C.initialize(E.clone(g))]));
      const base=F.build(F.create(unifiedSources));
      const initial=F.route(base);if(initial.failed)throw new Error('初始递归图存在无法布线的边界连接');
      original=E.clone(base);let saved=sessions.get(key());
      if(!saved){const stored=await window.SummaryRecursiveStorage.get(key());if(token!==loadToken)return;if(stored?.version===5&&stored.ir===(base.irSha256||null))saved={graph:stored.graph,history:[],future:[],dirty:stored.dirty};}
      if(!saved)try{const disk=JSON.parse(localStorage.getItem('summary-merge:'+key()));if(disk?.version===4&&disk.ir===(base.irSha256||null))saved={graph:disk.graph,history:[],future:[],dirty:disk.dirty};
        else if(disk?.version){localStorage.setItem('summary-merge:archived:'+key()+':'+Date.now(),JSON.stringify(disk));toast('早期递归草稿已保留归档，当前使用新的递归文档。');}
      }catch(_){}
      if(saved&&base.runtimePresentation&&saved.graph.runtimePresentation!==base.runtimePresentation){
        // Layout versions are independent of the semantic IR. Archive the
        // complete prior document before presenting the new lane geometry.
        await window.SummaryRecursiveStorage.put('archived:'+key()+':'+Date.now(),{version:5,ir:base.irSha256,graph:saved.graph,dirty:saved.dirty,reason:'runtime presentation migration'});
        if(token!==loadToken)return;saved=null;
        toast('旧布局草稿已完整归档，当前显示新的双泳道布局。');
      }
      graph=E.clone(saved?.graph||base);
      if(saved){graph.recursive.authority=E.clone(base.recursive.authority);const prior=graph;graph=F.upgrade(graph);if(graph!==prior){const updated=F.route(graph);if(updated.failed)throw new Error('保存的展开图无法恢复合法连接');saved.history=[];saved.future=[];}if(!C.validateSource(graph).ok){
        const archiveKey='archived:'+key()+':'+Date.now();await window.SummaryRecursiveStorage.put(archiveKey,{version:5,ir:base.irSha256,graph:saved.graph,dirty:saved.dirty,reason:'source presentation contract migration'});if(token!==loadToken)return;graph=cloneGraph(base);saved=null;toast('旧草稿不符合当前层级契约，已保留归档。');}}
      syncUnifiedState();history=saved?.history||[];future=saved?.future||[];dirty=saved?.dirty||false;ghost=[];selectedNodes.clear();selectedEdges.clear();connection=null;drag=null;metrics={routed:0,time:0};
      $('routingStyle').value='orthogonal';$('keepBends').checked=false;$('showPorts').checked=false;$('clearance').value=6;$('clearanceValue').value=$('clearance').value+' px';
      $('modelTitle').textContent=c.title;$('modelCollection').textContent=names[c.collection]||c.collection;$('modelOrigin').textContent=(c.historical?'历史快照 / ':'')+c.origin;
      
      const data=unifiedSources.overview||Object.values(unifiedSources)[0];
      const docs=Object.entries(data.sourceDocs||{}).map(([name,url])=>[name==='source_map.md'?'源码映射':name==='source_evidence.json'?'源码证据':'案例说明',url]);
      $('sourceLinks').innerHTML=[['原始 SVG',data.source],['布局与接口',data.layoutSource],['语义 IR',data.irSource],...docs,['原始案例',c.sourceIndex]].filter(([,url])=>url).map(([name,url])=>`<a href="../${esc(url)}" target="_blank">${name} ↗</a>`).join('');
      $('semanticEvidenceControl').hidden=true;hideEvidence();$('genericControls').hidden=true;$('genericInspector').replaceChildren();
      $('sourceFacts').innerHTML=data.sourceFacts?.length?'<ul>'+data.sourceFacts.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul>':'<p>保留原始图元、层次和连接映射。点击容器逐级展开，视觉编辑可撤销，源模型未执行。</p>';
      if(c.sourceAtomic&&!data.runtimeExpansion){const standard=c.sourceAtomic,counts=standard.counts||{};const rules=(standard.unit_rules||[]).map(f=>'<li>'+esc(f)+'</li>').join('');$('sourceFacts').innerHTML='<p><strong>源码原子粒度</strong>：展开只改变可见投影，不改变源码、IR 或 canonical binding。</p><p>当前 authority：'+esc(counts.atomicNodes||0)+' 个源码原子节点；源码 IR：'+esc(counts.sourceIrNodes||0)+' 个单位；折叠的源码单位：'+esc(counts.foldedSourceUnits||0)+'。</p><ul>'+rules+'</ul>';}
      if(Object.keys(data.sourceProfile||{}).length)$('sourceFacts').innerHTML+='<pre>'+esc(JSON.stringify(data.sourceProfile,null,2))+'</pre>';
      const url=new URL(location.href);url.searchParams.set('case',c.id);url.searchParams.delete('view');url.searchParams.delete('model');window.history.replaceState(null,'',url);
      renderCatalog();fit();render();persist();
    }catch(error){toast(error.message);$('modelTitle').textContent='示例加载失败';}
  }
  function cameraUpdate(){svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);$('zoomLabel').textContent=Math.round(stageScale()*100)+'%';}
  function fit(widthOnly=false){if(!graph)return;const ratio=$('stage').clientWidth/$('stage').clientHeight,w=graph.canvas[0],h=graph.canvas[1];camera=widthOnly?{x:0,y:0,w,h:w/ratio}:w/h>ratio?{x:0,y:(h-w/ratio)/2,w,h:w/ratio}:{x:(w-h*ratio)/2,y:0,w:h*ratio,h};cameraUpdate();}
  function zoom(factor,at){const p=at||{x:camera.x+camera.w/2,y:camera.y+camera.h/2},newWidth=Math.min(graph.canvas[0]*8,Math.max(120,camera.w/factor)),f=newWidth/camera.w;camera={x:p.x-(p.x-camera.x)*f,y:p.y-(p.y-camera.y)*f,w:newWidth,h:camera.h*f};cameraUpdate();render({cameraOnly:true});}
  const scene={key:null,nodes:new Map(),edges:new Map(),labels:new Map(),attachments:new Map(),junctions:new Map(),obstacles:new Map(),checks:new Map(),placements:null};
  const setAttrs=(el,attrs)=>{for(const [k,v] of Object.entries(attrs))if(el.getAttribute(k)!==String(v))el.setAttribute(k,v);};
  function prune(map,ids){for(const [id,v] of map)if(!ids.has(id)){(v.g||v).remove();v.leader?.remove();map.delete(id);}}
  function refreshHandles(scale){
    const layer=$('handleLayer'),handle=Math.min(28,5/scale);layer.replaceChildren();
    for(const id of selectedNodes){const n=node(id);if(!n||n.junction)continue;
      layer.append(element('rect',{x:n.x-4,y:n.y-4,width:n.w+8,height:n.h+8,rx:9,fill:'none',stroke:'#d99160','stroke-width':2/scale,'stroke-dasharray':`${4/scale} ${3/scale}`,'pointer-events':'none','data-editor-only':'selection'}));
    }
    if($('showPorts').checked)for(const n of graph.nodes){if(n.junction||!unifiedVisible().has(n.id))continue;
      const ports=graph.edges.flatMap(e=>[['source','fixedSource'],['target','fixedTarget']].filter(([side])=>e[side]===n.id).map(([side])=>({fixed:window.SummaryPhysicalPorts.active(e,side)||{side:E.endpoint(graph,e,side).side,fraction:E.endpoint(graph,e,side).fraction},p:E.endpoint(graph,e,side),field:e.binding?.[side==='source'?'src':'dst']||'视觉草稿'})));
      const seen=new Set();for(const {p,fixed,field} of ports){const key=p.x+':'+p.y;if(seen.has(key))continue;seen.add(key);
        const c=element('circle',{cx:p.x,cy:p.y,r:handle*.65,fill:'#fff',stroke:'#3ca1a3','stroke-width':1/scale,class:'port-handle','data-port':n.id+':'+fixed.side});c.append(element('title',{},field));c.onpointerdown=ev=>tool==='connect'?startConnection(ev,n,fixed):nodeDown(ev,n);layer.append(c);
      }
    }
    for(const id of selectedEdges){const e=graph.edges.find(e=>e.id===id);if(!e)continue;const ps=e.route;if(ps.length<2)continue;
      for(const [side,index] of [['source',0],['target',ps.length-1]]){const p=ps[index],c=element('circle',{cx:p.x,cy:p.y,r:handle*1.3,fill:'#fff4e6',stroke:'#d77944','stroke-width':1.5/scale,class:'endpoint-handle','data-endpoint':e.id+':'+side});c.onpointerdown=ev=>begin(ev,{kind:'endpoint',edge:e,side});layer.append(c);layer.append(element('text',{x:p.x,y:p.y+3/scale,'text-anchor':'middle','font-size':8/scale,fill:'#b86e36','pointer-events':'none'},side==='source'?'S':'T'));}
      e.waypoints.forEach((p,i)=>{const h=element('rect',{x:p.x-handle,y:p.y-handle,width:handle*2,height:handle*2,fill:'#fff',stroke:'#d77944','stroke-width':1.5/scale,class:'bend-handle','data-bend':e.id+':'+i});h.onpointerdown=ev=>begin(ev,{kind:'bend',edge:e,index:i});layer.append(h);});
    }
  }
  function refreshSelectionHandles(scale){
    const handles=[...$('handleLayer').querySelectorAll('[data-editor-only="selection"]')];let i=0;
    for(const id of selectedNodes){const n=node(id);if(!n||n.junction)continue;const h=handles[i++];if(h)setAttrs(h,{x:n.x-4,y:n.y-4,width:n.w+8,height:n.h+8,'stroke-width':2/scale,'stroke-dasharray':`${4/scale} ${3/scale}`});}
    for(;i<handles.length;i++)handles[i].remove();
  }
  function render({interactive=false,presentationOnly=false,cameraOnly=false,validation=null,validationOrigin='worker'}={}){
    if(busy||drag||!presentationOnly)hideEvidence();
    const measuredStart=performance.now();if(!graph)return;syncUnifiedState();
    if(cameraOnly){const scale=stageScale();for(const v of scene.edges.values())setAttrs(v.hit,{'stroke-width':Math.min(45,12/scale)});refreshHandles(scale);svg.setAttribute('data-camera-ms',(performance.now()-measuredStart).toFixed(2));return;}
    if(graph.generic&&factsDigest!==graph.generic.ir.ir_digest){
      const ir=graph.generic.ir;factsDigest=ir.ir_digest;
      $('modelOrigin').textContent=ir.coverage?.reason||'保留源码、调用身份、精确槽位与证据边界';
      $('sourceFacts').innerHTML='<p>'+esc(ir.nodes.length)+' 个原始单位 / '+esc(ir.edges.length)+' 条依赖；当前切面可继续展开至源码单位。</p><pre>'+esc(JSON.stringify({coverage:ir.coverage,runtime:{status:ir.runtime?.status,model_executed:ir.runtime?.model_executed},cpu_assistance:ir.probe_assistance?{runs:ir.probe_assistance.runs,unknowns:ir.probe_assistance.boundaries.length,associated:ir.probe_assistance.boundaries.filter(b=>b.observations.length).length,scope:ir.probe_assistance.scope}:null},null,2))+'</pre>';
    }
    if(scene.key!==key()){
      for(const name of ['frameLayer','obstacleLayer','ghostLayer','edgeLayer','nodeLayer','labelLayer','handleLayer'])$(name).replaceChildren();
      for(const name of ['nodes','edges','labels','attachments','junctions','obstacles','checks'])scene[name].clear();scene.key=key();scene.placements=null;
    }
    if(!interactive&&!presentationOnly){const validationStart=performance.now();
      const checked=validation||E.validateView(graph);sourceCheck=checked.source;scene.checks=new Map(checked.edges);
      svg.setAttribute('data-layout-constraint-valid',String(checked.layout.ok));svg.setAttribute('data-layout-constraint-reason',checked.layout.violations.join('; '));
      svg.setAttribute('data-validation-ms',(performance.now()-validationStart).toFixed(2));
      svg.setAttribute('data-validation-origin',validation?validationOrigin:'main');
      if(checked.certification)svg.setAttribute('data-semantic-certification',checked.certification.reused?'reused':'full');
    }
    const realtimeDrag=drag?.kind==='node'&&drag.saved&&drag.liveRealtime;
    setAttrs(svg,{'data-source-constraint-valid':String(sourceCheck.ok),'data-source-constraint-reason':sourceCheck.violations.join('; '),'data-interaction-mode':interactionMode,'data-interaction-phase':realtimeDrag?'realtime':interactive?'preview':busy?'settling':'committed'});
    if(scene.definitions!==graph.definitions){$('definitions').innerHTML=graph.definitions||'';scene.definitions=graph.definitions;}
    if(scene.extras!==graph.extras){$('annotationLayer').innerHTML=graph.extras||'';scene.extras=graph.extras;}
    const scale=stageScale(),visible=unifiedVisible(),visibleNodes=graph.nodes.filter(n=>!n.junction&&visible.has(n.id));
    for(const n of visibleNodes){if(n.junction)continue;let v=scene.nodes.get(n.id);
      if(!v){const g=element('g',{class:'scene-node','data-render-instance':++epoch}),content=element('g'),hit=element('rect',{rx:8});g.append(content,hit);v={g,content,hit};scene.nodes.set(n.id,v);$(n.expanded?'frameLayer':'nodeLayer').append(g);}v.previewPosition=null;
      setAttrs(v.g,{'data-node-id':n.id,'data-parent':n.parent||'','data-model-heading':String(!!n.modelHeading),'data-expanded':String(!!n.expanded),'data-recursive-children':unifiedChildren(n.id).length,'data-unified-expanded':String(!!unifiedState?.expandedIds?.includes(n.id)),'data-unified-collapsed':String(unifiedHasChildren(n.id)&&!unifiedState?.expandedIds?.includes(n.id)),'data-visual-binding':JSON.stringify(n.visualBinding||{}),'aria-label':`节点 ${n.id} ${label(n)}`});
      $(n.expanded?'frameLayer':'nodeLayer').append(v.g);
      setAttrs(v.content,{transform:`translate(${n.x-n.base[0]} ${n.y-n.base[1]})`});if(v.html!==n.html){v.content.innerHTML=n.html;v.html=n.html;}if(n.expanded&&!n.modelHeading){const rect=v.content.querySelector('rect');if(rect){rect.setAttribute('width',n.w);rect.setAttribute('height',n.h);}}
      setAttrs(v.hit,{x:n.x,y:n.y,width:n.modelHeading?0:n.w,height:n.modelHeading?0:n.h,class:n.expanded?'frame-hit':'node-hit'});setAttrs(v.g,{'pointer-events':n.modelHeading?'none':'auto'});v.g.onpointerdown=ev=>nodeDown(ev,n);v.g.ondblclick=ev=>{if(unifiedHasChildren(n.id)){ev.preventDefault();ev.stopPropagation();toggleUnifiedNode(n.id);}};
      if(unifiedHasChildren(n.id)){if(!v.toggle){v.toggle=element('g',{class:'expansion-control',role:'button',tabindex:'0'});v.toggle.append(element('rect',{width:22,height:22,rx:5,fill:'#fff',stroke:'#198e90'}),element('text',{x:11,y:16,'text-anchor':'middle','font-size':18,fill:'#198e90'}));v.g.append(v.toggle);}setAttrs(v.toggle,{transform:`translate(${n.x+n.w-28} ${n.y+5})`,'aria-label':`${n.expanded?'收起':'展开'} ${label(n)}`});v.toggle.querySelector('text').textContent=n.expanded?'−':'＋';v.toggle.onpointerdown=ev=>ev.stopPropagation();v.toggle.onclick=ev=>{ev.preventDefault();ev.stopPropagation();toggleUnifiedNode(n.id);};v.toggle.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();toggleUnifiedNode(n.id);}};}else if(v.toggle){v.toggle.remove();v.toggle=null;}
      if($('showObstacles').checked&&n.routingObstacle!==false){const b=R.expand(n,+$('clearance').value);let obstacle=scene.obstacles.get(n.id);if(!obstacle){obstacle=element('rect',{fill:'none',stroke:'#c9925680','pointer-events':'none'});scene.obstacles.set(n.id,obstacle);$('obstacleLayer').append(obstacle);}setAttrs(obstacle,{x:b.x,y:b.y,width:b.w,height:b.h,'stroke-width':1/scale,'stroke-dasharray':`${4/scale} ${4/scale}`});}
    }
    prune(scene.nodes,new Set(visibleNodes.map(n=>n.id)));
    prune(scene.obstacles,new Set($('showObstacles').checked?visibleNodes.filter(n=>n.routingObstacle!==false).map(n=>n.id):[]));
    const labelStart=performance.now(),labelPlacements=(interactive||presentationOnly)&&scene.placements?scene.placements:(interactive||presentationOnly)?new Map():E.routeLabelPlacements(graph,interactive);
    if(!interactive&&!presentationOnly)scene.placements=labelPlacements;svg.setAttribute('data-label-ms',(performance.now()-labelStart).toFixed(2));
    const displayEdges=unifiedDisplayEdges(),displayEdgeIds=new Set(displayEdges.map(e=>e.id));
    for(const a of graph.routeLabels||[]){if(unifiedState&&!displayEdgeIds.has(a.edge))continue;const offset=labelPlacements.get(a.id);if(!offset)continue;let v=scene.labels.get(a.id);
      if(!v){const leader=element('path',{stroke:'#a6adb5','stroke-width':.8,'stroke-dasharray':'2 3',fill:'none','pointer-events':'none','data-label-leader':a.id}),g=element('g',{class:'scene-attachment route-caption',style:'cursor:grab'}),bg=element('rect',{rx:2,fill:'white','fill-opacity':.9}),text=element('g');g.append(bg,text,element('title',{},'拖动文字沿所属连线吸附；模型连接保持绑定。'));v={g,bg,text,leader};scene.labels.set(a.id,v);$('labelLayer').append(leader,g);}
      v.previewPosition=null;setAttrs(v.g,{'data-route-label-id':a.id,'data-follow-edge':a.edge,'data-label-anchor':`${offset.point.x},${offset.point.y}`,transform:`translate(${offset.x} ${offset.y})`});
      const [x,y,w,h]=a.bbox;setAttrs(v.bg,{x:x-2,y:y-1,width:w+4,height:h+2});if(v.html!==a.html){v.text.innerHTML=a.html;v.html=a.html;}
      v.leader.setAttribute('display',offset.leader?'inline':'none');if(offset.leader){const b=offset.box,q=offset.point,tx=Math.max(b.x,Math.min(b.x+b.w,q.x)),ty=Math.max(b.y,Math.min(b.y+b.h,q.y));setAttrs(v.leader,{d:`M ${q.x} ${q.y} L ${tx} ${ty}`});}
      v.g.onpointerdown=ev=>{if(busy||ev.button!==0)return;ev.stopPropagation();selectedNodes.clear();selectedEdges=new Set([a.edge]);const p=point(ev),center={x:offset.box.x+offset.box.w/2,y:offset.box.y+offset.box.h/2};begin(ev,{kind:'route-label',label:a,grab:{x:center.x-p.x,y:center.y-p.y}});render({presentationOnly:true});};
    }
    prune(scene.labels,new Set([...labelPlacements.keys()].filter(id=>{const a=(graph.routeLabels||[]).find(v=>v.id===id);return !unifiedState||a&&displayEdgeIds.has(a.edge);}))); 
    for(const a of graph.attachments||[]){const owner=node(a.owner);if(!owner||!visible.has(a.owner))continue;let v=scene.attachments.get(a.id);if(!v){const g=element('g',{class:'scene-attachment'});v={g};scene.attachments.set(a.id,v);$('labelLayer').append(g);}const offset=E.attachmentTransform(graph,a);setAttrs(v.g,{'data-attachment-id':a.id,'data-follow-owner':a.owner,'data-follow-kind':a.kind,transform:`translate(${offset.x} ${offset.y})`});if(v.html!==a.html){v.g.innerHTML=a.html;v.html=a.html;}v.g.onpointerdown=ev=>nodeDown(ev,owner);}
    prune(scene.attachments,new Set((graph.attachments||[]).filter(a=>visible.has(a.owner)).map(a=>a.id)));
    if(scene.ghost!==ghost||scene.showGhost!==$('showGhost').checked){$('ghostLayer').replaceChildren();if($('showGhost').checked)for(const e of ghost)$('ghostLayer').append(element('path',{d:E.path(e.route,e.style),fill:'none',stroke:'#a7babb','stroke-width':1.5,'stroke-dasharray':'6 7',opacity:.6,'pointer-events':'none'}));scene.ghost=ghost;scene.showGhost=$('showGhost').checked;}
    for(const e of displayEdges){let v=scene.edges.get(e.id);const edgeGraph=graph;const ps=interactive?R.simplify(e.route):presentationOnly&&v?.points?v.points:E.displayed(edgeGraph,e);if(ps.length<2)continue;const check=scene.checks.get(e.id)||{ok:true,violations:[]},selected=selectedEdges.has(e.id),color=e.failed||!check.ok?'#d54c60':selected?'#d77944':e.stroke||'#263b4b',start=e.arrow==='both',end=e.arrow!=='none';
      if(!v){const g=element('g',{'data-render-instance':++epoch}),shaft=element('path',{fill:'none',class:'wire-path','stroke-linecap':'butt'}),head=element('path',{class:'arrow-shape','pointer-events':'none'}),tail=element('path',{class:'arrow-shape','pointer-events':'none'}),hit=element('path',{class:'wire-hit','data-edge-hit':e.id});g.append(shaft,head,tail,hit);v={g,shaft,head,tail,hit};scene.edges.set(e.id,v);$('edgeLayer').append(g);}
      setAttrs(v.g,{'data-edge-id':e.id,'data-source':e.source,'data-target':e.target,'data-role':e.role||'tensor','data-relation-style':e.relationStyle||'','data-draft':String(!!e.draft),'data-physical-source':JSON.stringify(E.endpoint(edgeGraph,e,'source')),'data-physical-target':JSON.stringify(E.endpoint(edgeGraph,e,'target')),'data-constraint-valid':interactive?'pending':String(check.ok&&!e.failed),'data-constraint-reason':interactive?'drag preview':e.reason||check.violations.join('; '),'data-semantic-binding':JSON.stringify(e.binding),'data-boundary-gates':JSON.stringify(e.contract?.gates||[]),'aria-label':`边 ${e.id} ${e.source} 到 ${e.target}`});
      const d=interactive?R.polylinePath(ps):presentationOnly&&v.path?v.path:E.path(ps,e.style,edgeGraph,e);
      if(!interactive&&!presentationOnly){v.points=ps;v.path=d;}setAttrs(v.shaft,{d,stroke:color,'stroke-width':selected?2.8:e.width||2.2,'stroke-dasharray':e.dashed?(e.dashPattern||'7 5'):'none'});
      setAttrs(v.head,{display:end?'inline':'none',d:end?E.arrow(ps.at(-1),ps.at(-2),e.arrow==='open'):'',fill:e.arrow==='open'?'none':color,stroke:e.arrow==='open'?color:'none','stroke-width':e.arrow==='open'?1.7:0});
      setAttrs(v.tail,{display:start?'inline':'none',d:start?E.arrow(ps[0],ps[1]):'',fill:color,stroke:'none'});
      setAttrs(v.hit,{d,'stroke-width':Math.min(45,12/scale)});v.hit.onpointerdown=ev=>edgeDown(ev,e);
    }
    prune(scene.edges,new Set(displayEdges.map(e=>e.id)));
    renderJunctions();if(interactive)refreshSelectionHandles(scale);else refreshHandles(scale);
    if(!interactive&&!presentationOnly){const stats=R.stats(displayEdges.filter(e=>!e.pendingRouting)),count=visibleNodes.length;$('graphCount').textContent=`${count} nodes / ${displayEdges.length} edges`;$('metricNodes').textContent=count+' / '+displayEdges.length;$('metricLength').textContent=stats.length.toLocaleString()+(graph.nativeRouting?.pending?'（已布线）':'');$('metricBends').textContent=stats.bends+' / '+stats.crossings;$('metricRouted').textContent=metrics.routed;$('metricTime').textContent=metrics.time;}
    if(!interactive)renderInspector();
    updateUnifiedStatus();$('dirtyBadge').textContent=realtimeDrag?(graph.lastMove?.blocked?'保留上一合法位置':'实时布线'):interactive?'拖动预览':!sourceCheck.ok?'源码语义校验失败':busy?'正在布线…':graph.nativeRouting?.pending?'部分路线待布线':dirty?'待 Apply · 已编辑':'布局已就绪';$('dirtyBadge').title=sourceCheck.violations.join('; ');$('dirtyBadge').classList.toggle('dirty',dirty||!sourceCheck.ok);$('undo').disabled=busy||!!drag||!history.length;$('redo').disabled=busy||!!drag||!future.length;$('applyLayout').disabled=busy||!!drag||!sourceCheck.ok;$('interactionMode').disabled=busy||!!drag;
    $('cancelTask').hidden=!busy;$('exportSvg').disabled=busy||interactive;$('exportJson').disabled=busy||interactive;
    svg.setAttribute('data-render-ms',(performance.now()-measuredStart).toFixed(2));
    if(interactive)svg.setAttribute('data-preview-ms',(performance.now()-measuredStart).toFixed(2));
  }
  // Fast path for compatibility-mode module dragging. `render()` intentionally
  // remains the committed renderer, but calling it for every pointer frame
  // makes a large expanded module pay for unrelated nodes, edges, labels and
  // inspectors. The move session already records the complete affected
  // sub-tree, so update only those retained SVG instances here. Pointerup
  // immediately returns to the full renderer and worker-guarded validation.
  function renderMovePreviewFrame(session,stepDx,stepDy){
    if(!graph||!session)return;
    const started=performance.now(),scale=stageScale(),visible=unifiedVisible();
    for(const n of session.moving){
      const v=scene.nodes.get(n.id);if(!v||!visible.has(n.id))continue;
      setAttrs(v.content,{transform:`translate(${n.x-n.base[0]} ${n.y-n.base[1]})`});
      setAttrs(v.hit,{x:n.x,y:n.y,width:n.w,height:n.h});
      if(n.expanded&&!n.modelHeading){const rect=v.content.querySelector('rect');if(rect)setAttrs(rect,{width:n.w,height:n.h});}
      if(v.toggle)setAttrs(v.toggle,{transform:`translate(${n.x+n.w-28} ${n.y+5})`});
    }
    const movingIds=session.ids;
    for(const e of session.edges){
      const v=scene.edges.get(e.id),ps=R.simplify(e.route||[]);if(!v||ps.length<2)continue;
      const d=R.polylinePath(ps),selected=selectedEdges.has(e.id),color=e.failed?'#d54c60':selected?'#d77944':e.stroke||'#263b4b',start=e.arrow==='both',end=e.arrow!=='none';
      setAttrs(v.g,{'data-physical-source':JSON.stringify(E.endpoint(graph,e,'source')),'data-physical-target':JSON.stringify(E.endpoint(graph,e,'target')),'data-constraint-valid':'pending','data-constraint-reason':'drag preview'});
      setAttrs(v.shaft,{d,stroke:color,'stroke-width':selected?2.8:e.width||2.2,'stroke-dasharray':e.dashed?(e.dashPattern||'7 5'):'none'});
      setAttrs(v.head,{display:end?'inline':'none',d:end?E.arrow(ps.at(-1),ps.at(-2),e.arrow==='open'):'',fill:e.arrow==='open'?'none':color,stroke:e.arrow==='open'?color:'none','stroke-width':e.arrow==='open'?1.7:0});
      setAttrs(v.tail,{display:start?'inline':'none',d:start?E.arrow(ps[0],ps[1]):'',fill:color,stroke:'none'});
      setAttrs(v.hit,{d,'stroke-width':Math.min(45,12/scale)});
    }
    // Captions attached to a fully moving edge translate exactly. For a
    // boundary edge the endpoint motion is only a preview hint; the committed
    // renderer recomputes its obstacle-aware placement after release.
    for(const id of session.labelIds||[]){
      const a=(graph.routeLabels||[]).find(v=>v.id===id),v=scene.labels.get(id),e=a&&graph.edges.find(x=>x.id===a.edge);if(!a||!v||!e)continue;
      const both=movingIds.has(e.source)&&movingIds.has(e.target),shift=both?{x:stepDx,y:stepDy}:{x:stepDx*.5,y:stepDy*.5};
      const current=v.previewPosition||{x:Number((v.g.getAttribute('transform')||'translate(0 0)').match(/translate\(([-\d.]+)\s+([-\d.]+)/)?.[1]||0),y:Number((v.g.getAttribute('transform')||'translate(0 0)').match(/translate\(([-\d.]+)\s+([-\d.]+)/)?.[2]||0)};
      current.x+=shift.x;current.y+=shift.y;v.previewPosition=current;setAttrs(v.g,{transform:`translate(${current.x} ${current.y})`});v.leader.setAttribute('display','none');
    }
    for(const id of session.attachmentIds||[]){const a=(graph.attachments||[]).find(v=>v.id===id),v=scene.attachments.get(id);if(a&&v)setAttrs(v.g,{transform:`translate(${E.attachmentTransform(graph,a).x} ${E.attachmentTransform(graph,a).y})`});}
    if(graph.generic)renderJunctions();
    for(const id of session.markerIds||[]){const marker=(graph.junctionMarkers||[]).find(v=>v.id===id),dot=scene.junctions.get(id);if(marker&&dot){const p=E.junctionPoint(graph,marker);if(p)setAttrs(dot,{cx:p.x,cy:p.y});}}
    refreshSelectionHandles(scale);
    updateUnifiedStatus();
    svg.setAttribute('data-interaction-phase','preview');svg.setAttribute('data-preview-ms',(performance.now()-started).toFixed(2));
  }
  function renderJunctions(){
    const markers=graph.generic?SummaryFlowOptimizer.markers(graph):(graph.junctionMarkers||[]);
    for(const marker of markers){const p=marker.point||E.junctionPoint(graph,marker);let dot=scene.junctions.get(marker.id);if(!dot){dot=element('circle',{'pointer-events':'none'});scene.junctions.set(marker.id,dot);$('edgeLayer').append(dot);}setAttrs(dot,{display:p?'inline':'none',cx:p?.x||0,cy:p?.y||0,r:marker.radius||2.5,fill:marker.fill||'#263b4b','data-junction-id':marker.id,'data-junction-owner':marker.owner,'data-junction-edges':JSON.stringify(marker.edges),'data-junction-wire':JSON.stringify(marker.wire)});}
    prune(scene.junctions,new Set(markers.map(m=>m.id)));
  }
  function renderInspector(interactive=false){const box=$('selectionInfo');
      if(selectedEdges.size===1){const e=graph.edges.find(e=>selectedEdges.has(e.id));const validation=scene.checks.get(e.id)||C.validate(graph,e,e.route);box.innerHTML=`<p class="eyebrow">SELECTED EDGE</p><h3>${esc(e.id)}</h3><div class="prop">源端 <code>${esc(e.source)}</code></div><div class="prop">目标端 <code>${esc(e.target)}</code></div><div class="prop">端口 <code>${esc(E.endpoint(graph,e,'source').side||'auto')} → ${esc(E.endpoint(graph,e,'target').side||'auto')}</code></div><div class="prop">途经点 <code>${e.waypoints.length}</code></div><p class="micro">${e.draft?'本页编辑草稿':'导入的原图连接'} · ${esc(e.role||'tensor')}</p><pre>${esc(scene.edges.get(e.id)?.path||E.path(E.displayed(graph,e),e.style,graph,e))}</pre><details><summary>容器接口与边界</summary><pre>${esc(JSON.stringify({gates:e.contract?.gates,originalSource:e.contract?.source,originalTarget:e.contract?.target,validation,reason:e.reason||null},null,2))}</pre></details><details><summary>原始语义映射</summary><pre>${esc(JSON.stringify(e.binding,null,2))}</pre></details><button class="secondary" id="releasePorts">释放固定端口</button><button class="secondary" id="clearBends">清除手动折点</button><button class="secondary" id="deleteEdge">删除这条边</button>`;$('arrowStyle').value=e.arrow;
      $('releasePorts').onclick=()=>{save();delete e.fixedSource;delete e.fixedTarget;delete e.physicalSource;delete e.physicalTarget;e.draft=true;delete e.contract;C.initialize(graph);dirty=true;render();persist();toast('已释放物理端口；原始语义映射保留在检查器。');};
      $('clearBends').onclick=()=>{save();e.waypoints=[];dirty=true;render();persist();};$('deleteEdge').onclick=()=>{save();graph.sourceDraftOperations=graph.sourceDraftOperations||[];graph.sourceDraftOperations.push({kind:'remove-connection',id:e.id,binding:E.clone(e.binding)});graph.edges=graph.edges.filter(x=>x!==e);selectedEdges.clear();dirty=true;render();persist();};
    }else if(selectedNodes.size===1){const n=node([...selectedNodes][0]),canExpand=unifiedHasChildren(n.id),isOpen=unifiedState?.expandedIds?.includes(n.id),atomic=graph.sourceAtomic?`<div class="prop">源码原子单位 <code>${esc(n.atomicity||'source-expression')}</code></div><div class="prop">源码证据 <code>${esc((n.source_evidence||n.semantic?.source_evidence||[]).join(', ')||'presentation-only')}</code></div>`:'';box.innerHTML=`<p class="eyebrow">SELECTED NODE</p><h3>${esc(label(n))}</h3><div class="prop">位置 <code>${Math.round(n.x)}, ${Math.round(n.y)}</code></div><div class="prop">尺寸 <code>${Math.round(n.w)} × ${Math.round(n.h)}</code></div><div class="prop">所属容器 <code>${esc(n.parent||"画布")}</code></div>${atomic}${canExpand?`<button class="secondary" id="toggleSelectedNode">${isOpen?'收起子图':'展开子图'} · ${unifiedChildren(n.id).length} 个直接节点</button>`:''}<p class="micro">${canExpand?(isOpen?'已展开；可继续选择内部容器。':'可逐级展开；双击节点也可切换。'):(n.expanded?'展开的容器；移动时携带可见子节点。':'移动时同步更新所属文字与局部连线。')}</p><details><summary>源码 / IR 节点</summary><pre>${esc(JSON.stringify(n.semantic,null,2))}</pre></details>`;if(canExpand)$('toggleSelectedNode').onclick=()=>toggleUnifiedNode(n.id);
    }else box.innerHTML=`<p class="micro">${selectedNodes.size||selectedEdges.size?`已选 ${selectedNodes.size} 个节点 / ${selectedEdges.size} 条边`:'点击节点或连接，检查图元、端口和源码映射。'}<br>Shift + 点击可多选。</p>`;
    if(graph.generic)genericUi?.inspect([...selectedNodes],[...selectedEdges]);else $('genericInspector').replaceChildren();
  }
  function nearestSide(n,p){const sides=[['left',Math.abs(p.x-n.x),(p.y-n.y)/n.h],['right',Math.abs(p.x-n.x-n.w),(p.y-n.y)/n.h],['top',Math.abs(p.y-n.y),(p.x-n.x)/n.w],['bottom',Math.abs(p.y-n.y-n.h),(p.x-n.x)/n.w]],b=sides.sort((a,b)=>a[1]-b[1])[0];return{side:b[0],fraction:Math.max(.02,Math.min(.98,b[2]))};}
  function hitNode(p){const visible=unifiedVisible();return graph.nodes.filter(n=>!n.junction&&visible.has(n.id)&&p.x>=n.x-4&&p.x<=n.x+n.w+4&&p.y>=n.y-4&&p.y<=n.y+n.h+4).sort((a,b)=>a.w*a.h-b.w*b.h)[0];}
  function begin(ev,item){if(busy||(ev.button!==0&&ev.button!==1))return;ev.stopPropagation();ev.preventDefault();drag={...item,start:point(ev),last:point(ev),clientX:ev.clientX,clientY:ev.clientY,saved:false};svg.setPointerCapture(ev.pointerId);}
  function selectEdge(e,additive=false){if(!additive){selectedEdges.clear();selectedNodes.clear();}if(additive&&selectedEdges.has(e.id))selectedEdges.delete(e.id);else selectedEdges.add(e.id);}
  function nodeDown(ev,n){if(busy||ev.button!==0)return;ev.stopPropagation();
    if(tool==='connect'){if(!connection){connection={node:n,fixed:null};selectedNodes=new Set([n.id]);selectedEdges.clear();toast('选择目标节点，或从端口拖动连接。');}else completeConnection(n,nearestSide(n,point(ev)));render();return;}
    if(ev.shiftKey){selectedNodes.has(n.id)?selectedNodes.delete(n.id):selectedNodes.add(n.id);render({presentationOnly:true});return;}
    selectedNodes=new Set([n.id]);selectedEdges.clear();begin(ev,{kind:'node',node:n});if(drag){drag.moveSession=E.movePreviewSession(graph,n.id);drag.liveRealtime=interactionMode==='realtime'&&graph.nodes.length<=LIVE_REALTIME_LIMIT;}render({presentationOnly:true});
  }
  function edgeDown(ev,e){if(busy||ev.button!==0)return;ev.stopPropagation();
    if(tool==='bend'&&selectedEdges.has(e.id)){save();const p=point(ev);let closest=Infinity,index=1;for(let i=1;i<e.route.length;i++){const a=e.route[i-1],b=e.route[i],den=(b.x-a.x)**2+(b.y-a.y)**2,t=den?Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/den)):0,d=Math.hypot(p.x-a.x-(b.x-a.x)*t,p.y-a.y-(b.y-a.y)*t);if(d<closest){closest=d;index=i;}}e.route.splice(index,0,{x:p.x,y:p.y});e.waypoints.push({x:p.x,y:p.y});e.style='orthogonal';dirty=true;toast('已添加折点；启用保留途经点后 Apply。');persist();}
    else selectEdge(e,ev.shiftKey);render({presentationOnly:tool!=='bend'});
  }
  function startConnection(ev,n,fixed){connection={node:n,fixed};begin(ev,{kind:'connection',origin:E.port(n,fixed)});}
  function completeConnection(n,fixed){if(!connection)return;save();const e={id:'draft-'+Date.now().toString(36)+'-'+(++epoch),source:connection.node.id,target:n.id,arrow:$('arrowStyle').value,style:'orthogonal',waypoints:[],route:[],fixedSource:connection.fixed||undefined,fixedTarget:fixed||undefined,draft:true,binding:{evidence:'visual edit draft; no source model writeback'}};e.route=[E.endpoint(graph,e,'source'),E.endpoint(graph,e,'target')];graph.edges.push(e);selectedNodes.clear();selectedEdges=new Set([e.id]);connection=null;dirty=true;persist();toast('连接已创建，Apply 计算避障路径。');}
  svg.addEventListener('pointerdown',ev=>{if(ev.button===1){begin(ev,{kind:'pan',camera:{...camera}});return;}if(ev.button!==0)return;if(busy)return;if(ev.target===svg||ev.target.closest('#annotationLayer')){selectedNodes.clear();selectedEdges.clear();connection=null;render({presentationOnly:true});}});
  function processDragPoint(p){
    if(!drag)return;
    if(Math.hypot(p.x-drag.last.x,p.y-drag.last.y)<.01)return;
    const frameStart=performance.now();
    if((drag.kind==='node'||drag.kind==='bend'||drag.kind==='route-label')&&!drag.saved){save();drag.saved=true;drag.before=history.at(-1);}
    if(drag.kind==='node'){
      const n=drag.node;
      if(drag.liveRealtime){
        // Rebuild each frame from one immutable gesture baseline. This keeps
        // route repair, port gates, shared stems and semantic checks identical
        // to a committed move while still exposing the new arrow direction.
        const candidate=cloneGraph(drag.before),origin=candidate.nodes.find(v=>v.id===n.id);
        const totalDx=Math.max(3-origin.x,Math.min(candidate.canvas[0]-3-origin.x-origin.w,p.x-drag.start.x));
        const totalDy=Math.max(3-origin.y,Math.min(candidate.canvas[1]-3-origin.y-origin.h,p.y-drag.start.y));
        E.move(candidate,n.id,totalDx,totalDy,options());
        if(candidate.lastMove?.blocked){
          graph.lastMove={blocked:true,reason:candidate.lastMove.reason||'位置无法保留合法连接'};
        }else{
          graph=candidate;
        }
      }else{
        const dx=p.x-drag.last.x,dy=p.y-drag.last.y;E.movePreview(graph,n.id,dx,dy,drag.moveSession);
        // The compatibility path only touches the moved subtree and its
        // incident wires. This keeps pointer frames bounded by the local
        // interaction frontier even when the canvas contains many modules.
        renderMovePreviewFrame(drag.moveSession,dx,dy);
      }
      drag.last=p;dirty=true;if(drag.liveRealtime)render({interactive:false});else updateUnifiedStatus();
    }
    else if(drag.kind==='route-label'){E.snapRouteLabel(graph,drag.label,{x:p.x+drag.grab.x,y:p.y+drag.grab.y});drag.last=p;dirty=true;render({interactive:true});}
    else if(drag.kind==='bend'){const e=drag.edge,old=e.waypoints[drag.index],i=e.route.findIndex(v=>R.dist(v,old)<.01);e.waypoints[drag.index]={x:p.x,y:p.y};if(i>=0)e.route[i]={x:p.x,y:p.y};drag.last=p;dirty=true;render({interactive:true});}
    else{const a=drag.kind==='connection'?drag.origin:drag.edge.route[drag.side==='source'?0:drag.edge.route.length-1];$('previewLayer').replaceChildren(element('path',{d:`M ${a.x} ${a.y} L ${p.x} ${p.y}`,stroke:'#d77944',fill:'none','stroke-width':2/stageScale(),'stroke-dasharray':'5 5','pointer-events':'none'}));}
    const samples=drag.samples||(drag.samples=[]);samples.push(performance.now()-frameStart);const sorted=samples.slice().sort((a,b)=>a-b);svg.setAttribute('data-drag-profile',JSON.stringify({count:sorted.length,p50:+sorted[Math.floor((sorted.length-1)*.5)].toFixed(2),p95:+sorted[Math.floor((sorted.length-1)*.95)].toFixed(2),max:+sorted.at(-1).toFixed(2)}));
  }
  svg.addEventListener('pointermove',ev=>{if(!drag)return;const p=point(ev);
    if(drag.kind==='pan'){const dx=(ev.clientX-(drag.clientX??ev.clientX))/stageScale(),dy=(ev.clientY-(drag.clientY??ev.clientY))/stageScale();camera.x-=dx;camera.y-=dy;drag.clientX=ev.clientX;drag.clientY=ev.clientY;cameraUpdate();return;}
    dragPoint=p;if(dragFrame)return;dragFrame=requestAnimationFrame(()=>{dragFrame=0;const q=dragPoint;dragPoint=null;processDragPoint(q);});
  });
  svg.addEventListener('pointerup',async ev=>{if(!drag)return;const p=point(ev),n=hitNode(p),kind=drag.kind,hoverNodeId=kind==='node'?drag.node.id:null;
    if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0;dragPoint=null;processDragPoint(p);}
    else if(drag.saved)processDragPoint(p);
    if(kind==='connection'){if(n)completeConnection(n,nearestSide(n,p));else{connection=null;toast('连接取消：请释放在目标节点或端口上。');}}
    else if(kind==='endpoint'){if(n){save();E.reconnect(graph,drag.edge,drag.side,n.id,nearestSide(n,p));dirty=true;toast('端点已重接；Apply 更新这条路径。');}else toast('端点未落在节点上，保留原连接。');}
    if(kind==='route-label'&&drag.saved)toast('文字已吸附到所属连线；拖动模块与重新布线时自动跟随。');
    if(kind==='node'&&drag.saved&&drag.liveRealtime){
      const gesture=drag,base=gesture.before;
      const validation=E.validateView(graph);
      const valid=validation.source.ok&&validation.layout.ok&&validation.edges.every(([,check])=>check.ok);
      if(!valid){graph=cloneGraph(base);toast('实时移动已恢复：最终位置未通过完整约束校验。');}
      else {if(graph.generic)G.remember(graph);else F.captureMove(base,graph,gesture.node.id);toast(graph.lastMove?.blocked?'此位置无法保留合法连接，已停留在上一合法位置。':'实时更新已提交：节点、箭头、所属文字与连接同步保存。');}
      drag=null;dragPoint=null;$('previewLayer').replaceChildren();if(svg.hasPointerCapture(ev.pointerId))svg.releasePointerCapture(ev.pointerId);
      render({validation:valid?validation:null,validationOrigin:'main'});persist();return;
    }
    if(kind==='node'&&drag.saved){
      const gesture=drag,base=gesture.before,old=base.nodes.find(n=>n.id===gesture.node.id),moved=node(gesture.node.id),dx=moved.x-old.x,dy=moved.y-old.y;
      drag=null;dragPoint=null;$('previewLayer').replaceChildren();if(svg.hasPointerCapture(ev.pointerId))svg.releasePointerCapture(ev.pointerId);
      busy=true;render({interactive:true});svg.setAttribute('data-interaction-phase','settling');$('dirtyBadge').textContent='正在整理连线…';
      let validation=null;try{const start=performance.now(),result=await runGraphTask({task:'move',graph:base,id:old.id,dx,dy,options:options()});if(!result.ok)throw new Error(result.error);
        graph=result.graph;if(graph.generic)G.remember(graph);else F.captureMove(base,graph,old.id);svg.setAttribute('data-move-ms',(performance.now()-start).toFixed(2));toast(graph.lastMove?.blocked?'此位置无法保留合法连接，已限制移动。':'节点、所属文字与连接已同步更新。');
        validation=result.validation;
      }catch(error){graph=cloneGraph(base);toast('移动已恢复：'+error.message);}finally{busy=false;render({validation});persist();}return;
    }
    const changed=drag.saved||kind==='connection'||kind==='endpoint';drag=null;$('previewLayer').replaceChildren();if(svg.hasPointerCapture(ev.pointerId))svg.releasePointerCapture(ev.pointerId);if(changed)persist();render({presentationOnly:!changed});
    if(!changed&&hoverNodeId)offerEvidence({target:scene.nodes.get(hoverNodeId)?.g,clientX:ev.clientX,clientY:ev.clientY,buttons:0});
  });
  svg.addEventListener('pointercancel',()=>{if(dragFrame)cancelAnimationFrame(dragFrame);dragFrame=0;dragPoint=null;if(drag?.saved){graph=cloneGraph(drag.before);history.pop();}drag=null;connection=null;$('previewLayer').replaceChildren();render();});
  svg.addEventListener('wheel',ev=>{if(!graph)return;ev.preventDefault();zoom(ev.deltaY<0?1.15:1/1.15,point(ev));},{passive:false});
  function ensureWorker(){if(worker||location.protocol==='file:'||typeof Worker==='undefined')return worker;
    try{geometryTransport=G.transport('main');worker=new Worker('routing-worker.js?v=native-interaction-9');worker.onmessage=event=>{const resolve=pendingTasks.get(event.data.requestId);if(resolve){pendingTasks.delete(event.data.requestId);try{if(event.data.graph)event.data.graph=geometryTransport.unpack(event.data.graph);resolve(event.data);}catch(error){resolve({ok:false,error:error.message});}}};
      worker.onerror=()=>{worker.terminate();worker=null;for(const resolve of pendingTasks.values())resolve(null);pendingTasks.clear();};
    }catch(_){worker=null;}return worker;
  }
  function cancelGraphTask(reason='操作已取消，当前图已保留。'){
    if(!pendingTasks.size&&busy){loadToken++;busy=false;if(graph)render();else $('dirtyBadge').textContent='加载已取消';$('cancelTask').hidden=true;}
    if(worker){worker.terminate();worker=null;}for(const resolve of pendingTasks.values())resolve({ok:false,error:reason});pendingTasks.clear();
  }
  $('cancelTask').onclick=()=>cancelGraphTask();
  async function runGraphTask(message){const active=ensureWorker();if(active){return new Promise(resolve=>{const requestId=++workerId;
      const timeout=setTimeout(()=>cancelGraphTask('后台计算超过 120 秒，当前图已保留；可分层展开。'),120000);
      pendingTasks.set(requestId,result=>{clearTimeout(timeout);resolve(result||{ok:false,error:'后台计算中断，当前图已保留。'});});
      try{const packet=message.graph?geometryTransport.pack(message.graph):undefined;
        if(packet?.nativeGeometryTransport)svg.setAttribute('data-evidence-transfer',packet.core?'full':'cached');
        active.postMessage({...message,graph:packet,requestId});}catch(error){pendingTasks.get(requestId)({ok:false,error:error.message});pendingTasks.delete(requestId);}
    });}
    await new Promise(resolve=>setTimeout(resolve,0));
    if(message.task==='generic-build'||message.task==='generic-route'||message.task==='frontier'&&message.graph.generic)return G.prepare({...message,graph:message.graph?cloneGraph(message.graph):null});
    const copy=cloneGraph(message.graph);
    if(message.task==='frontier'){const operation=message.operation||{};const candidate=operation.kind==='all'?F.all(copy,!!operation.open):F.toggle(copy,operation.id,operation.force);if(!candidate)return {ok:false,error:'该模块不可展开或收起'};const result=F.route(candidate,message.options),validation=E.validateView(candidate);if(result.failed||!validation.source.ok||!validation.layout.ok||validation.edges.some(([,check])=>!check.ok))return {ok:false,error:[...validation.source.violations,...validation.layout.violations,...validation.edges.filter(([,v])=>!v.ok).map(([id,v])=>id+': '+v.violations.join(', '))].slice(0,4).join('; ')};return {ok:true,graph:candidate,...result,validation};}
    if(message.task==='move'){E.move(copy,message.id,message.dx,message.dy,message.options);const validation=E.validateView(copy);if(!validation.source.ok||!validation.layout.ok||validation.edges.some(([,check])=>!check.ok))return {ok:false,error:'移动后的图未通过完整校验'};return{ok:true,graph:copy,validation};}
    const result=E.routeBatch(copy,message.ids,message.options);return {ok:true,...result,validation:E.validateView(copy)};
  }
  async function runRouting(ids,opts){C.initialize(graph);return runGraphTask({task:'route',graph,ids,options:opts});}
  async function continueNativeRouting(){
    if(busy||drag||!graph?.generic)return;save();busy=true;render({presentationOnly:true});const started=performance.now();
    try{const result=await runGraphTask({task:'generic-route',graph,options:G.routeOptions({...options(),budgetMs:8000})});if(!result.ok)throw Error(result.error);
      graph=result.graph;dirty=!!result.failed;metrics={routed:result.routed,time:Math.round(performance.now()-started)};busy=false;render({validation:result.validation});persist();toast(result.pending?'当前批次完成；剩余 '+result.pending+' 条待布线。':result.failed?'剩余 '+result.failed+' 条路径存在约束冲突。':'全部路线已处理。');
    }catch(error){graph=history.pop()||graph;toast(error.message);}finally{busy=false;render({presentationOnly:true});}
  }
  async function apply(){if(!graph||busy)return;if(graph.generic&&graph.nativeRouting?.pending&&$('scope').value==='all')return continueNativeRouting();restoreSourceBaseline();const sourceCheck=C.validateSource(graph);if(!sourceCheck.ok){render();toast('源码语义校验失败：'+sourceCheck.violations[0]);return;}let targets=$('scope').value==='all'?graph.edges:$('scope').value==='selected'?graph.edges.filter(e=>selectedEdges.has(e.id)):graph.edges.filter(e=>selectedNodes.has(e.source)||selectedNodes.has(e.target));
    if(!targets.length){toast('作用范围为空，请先选择节点或边。');return;}if($('policy').value==='never'){metrics={routed:0,time:0};render();toast('Never：保留当前路径。');return;}
    const opts=options();if($('policy').value==='needed')targets=targets.filter(e=>E.conflicts(graph,e,opts));if(!targets.length){metrics={routed:0,time:0};render();toast('当前路径满足约束，无需重算。');return;}
    save();ghost=graph.edges.map(e=>({route:E.clone(e.route),style:e.style}));busy=true;render({presentationOnly:true});const begin=performance.now(),before=JSON.stringify(graph.nodes.map(n=>[n.id,n.x,n.y]));let validation=null;
    try{const result=await runRouting(targets.map(e=>e.id),opts);if(!result.ok)throw new Error(result.error);graph=result.graph;validation=result.validation;if(before!==JSON.stringify(graph.nodes.map(n=>[n.id,n.x,n.y])))throw new Error('布线不应移动节点');metrics={routed:result.routed,time:Math.round(performance.now()-begin)};dirty=result.failed>0;toast(result.failed?`${result.routed} 条完成，${result.failed} 条约束冲突（红色），原路径保留。请检查容器接口、端口或安全距离。`:`${result.routed} 条边已布线${result.retained?' · '+result.retained+' 段原始合法通道/汇流骨架保留':''} · 节点位置不变`);}catch(error){toast(error.message);}finally{busy=false;render({validation});persist();}
  }
  function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function exportSvg(){const out=svg.cloneNode(true);out.setAttribute('xmlns',NS);out.setAttribute('width',graph.canvas[0]);out.setAttribute('height',graph.canvas[1]);out.setAttribute('viewBox','0 0 '+graph.canvas.join(' '));out.removeAttribute('tabindex');out.querySelector('#previewLayer').remove();out.querySelector('#handleLayer').remove();out.querySelector('#obstacleLayer').remove();out.querySelector('#ghostLayer').remove();out.querySelectorAll('.wire-hit,.node-hit,.frame-hit,.expansion-control,[data-editor-only]').forEach(n=>n.remove());const style=element('style',{},'.wire-path{fill:none;stroke-linecap:butt;stroke-linejoin:round}.scene-node text{font-family:DejaVu Sans,Arial,sans-serif}');out.querySelector('defs').append(style);out.prepend(element('rect',{x:0,y:0,width:graph.canvas[0],height:graph.canvas[1],fill:'white'}));out.prepend(element('metadata',{'id':'summary-merge-binding'},JSON.stringify({case:current.id,view:view.key,interactionMode,...(graph.generic?{semanticDocument:G.document(graph)}:{}),source:graph.source,irSha256:graph.irSha256,edited:dirty,sourceDraftOperations:graph.sourceDraftOperations||[],sourceValidation:C.validateSource?.(graph),attachments:graph.attachments||[],routeLabels:graph.routeLabels||[],junctionMarkers:graph.junctionMarkers||[],nodes:graph.nodes.map(n=>({id:n.id,parent:n.parent,semantic:n.semantic,visualBinding:n.visualBinding,glyphPresentation:n.glyphPresentation,labelObstacles:n.glyphPresentation?n.labelObstacles:undefined})),edges:graph.edges.map(e=>({id:e.id,source:e.source,target:e.target,draft:e.draft,binding:e.binding,portPolicy:e.portPolicy,physicalSource:e.physicalSource,physicalTarget:e.physicalTarget}))})));download(new XMLSerializer().serializeToString(out),'image/svg+xml',current.title+'-'+view.key+'.svg');toast('已生成当前视图 SVG。');}
  $('coverage').textContent=`${catalog.counts.active} 当前案例 / ${catalog.counts.historical} 历史案例`;
  for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>{if(busy)return;tool=b.dataset.tool;connection=null;for(const x of document.querySelectorAll('[data-tool]'))x.classList.toggle('active',x===b);if(tool==='connect')$('showPorts').checked=true;render({presentationOnly:true});};
  $('interactionMode').onchange=()=>setInteractionMode($('interactionMode').value);
  for(const id of ['showGhost','showObstacles','showPorts'])$(id).onchange=()=>render({presentationOnly:true});
  $('clearance').oninput=()=>{$('clearanceValue').value=$('clearance').value+' px';};$('applyLayout').onclick=apply;
  $('setArrow').onclick=()=>{if(!selectedEdges.size){toast('先选择一条或多条边。');return;}save();for(const e of graph.edges)if(selectedEdges.has(e.id))e.arrow=$('arrowStyle').value;render();persist();toast('箭头已更新；路线模型保持不变。');};
  $('undo').onclick=()=>{if(busy||!history.length)return;future.push(cloneGraph(graph));graph=history.pop();selectedNodes.clear();selectedEdges.clear();dirty=true;ghost=[];render();persist();};
  $('redo').onclick=()=>{if(busy||!future.length)return;history.push(cloneGraph(graph));graph=future.pop();selectedNodes.clear();selectedEdges.clear();dirty=true;ghost=[];render();persist();};
  $('reset').onclick=()=>{if(busy)return;save();graph=E.clone(original);syncUnifiedState();selectedNodes.clear();selectedEdges.clear();ghost=[];dirty=false;fit();render();persist();toast('当前模型已恢复到最精简递归状态，仍可撤销。');};
  $('collapseAll').onclick=collapseUnifiedAll;$('expandAll').onclick=expandUnifiedAll;
  $('fit').onclick=()=>{fit();render({cameraOnly:true});};$('fitWidth').onclick=()=>{fit(true);render({cameraOnly:true});};$('zoomIn').onclick=()=>zoom(1.3);$('zoomOut').onclick=()=>zoom(1/1.3);$('exportSvg').onclick=exportSvg;
  $('exportJson').onclick=()=>{const text=JSON.stringify(graph.generic?G.document(graph):{schema:'summary-merge-recursive/1',case:current.id,view:view.key,interactionMode,graph},null,2);download(text,'application/json',current.id+'-'+view.key+'.json');};
  $('closeSourceExport').onclick=()=>$('sourceExportDialog').close();$('downloadSourceDocument').onclick=()=>download($('sourceExportText').value,'application/json',current.id+'-unified.json');
  function evidence(){const q=$('evidenceSearch').value.toLowerCase();$('evidenceList').innerHTML=catalog.evidence.filter(e=>e.title.toLowerCase().includes(q)).map(e=>`<a class="evidence-row" href="../${esc(e.path)}" target="_blank">${esc(e.title)} <small>${Math.round(e.bytes/1024)} KB</small></a>`).join('');}
  $('showEvidence').onclick=()=>{evidence();$('evidenceDialog').showModal();};$('closeEvidence').onclick=()=>$('evidenceDialog').close();$('evidenceSearch').oninput=evidence;
  document.addEventListener('keydown',ev=>{if(ev.target.matches('input,select,textarea'))return;if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter'){ev.preventDefault();apply();}else if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();(ev.shiftKey?$('redo'):$('undo')).click();}else if(ev.key==='Escape'){connection=null;selectedNodes.clear();selectedEdges.clear();render();}else if(ev.key==='Delete'&&selectedEdges.size){save();graph.sourceDraftOperations=graph.sourceDraftOperations||[];for(const e of graph.edges)if(selectedEdges.has(e.id))graph.sourceDraftOperations.push({kind:'remove-connection',id:e.id,binding:E.clone(e.binding)});graph.edges=graph.edges.filter(e=>!selectedEdges.has(e.id));selectedEdges.clear();dirty=true;render();persist();}});
  window.addEventListener('beforeunload',()=>{if(drag?.saved)graph=cloneGraph(drag.before);drag=null;flushPersist();});window.addEventListener('resize',()=>{cameraUpdate();render({cameraOnly:true});});

  async function openGeneric(model,documentValue){
    $('semanticEvidenceControl').hidden=false;
    if(busy||drag){toast('当前操作完成后再打开文档。');return;}
    flushPersist();const ticket=++loadToken;busy=true;$('cancelTask').hidden=false;$('dirtyBadge').textContent='读取通用语义并准备原生画布…';
    const previous={graph,current,original,history,future,dirty};
    try{
      const read=async path=>{const response=await fetch('../data/semantic/'+path,{cache:'no-store'});if(!response.ok)throw Error('无法读取 '+path);return response.json();};
      const payload=documentValue?G.read(documentValue):{ir:await read(model.ir)};
      if(ticket!==loadToken)return;
      if(!payload.state&&model?.presentation){const profile=await read(model.presentation);window.SemanticPresentationProfile.validate(payload.ir,profile);payload.state=profile.default_state;}
      const candidateCurrent={id:'generic:'+(model?.id||payload.ir.ir_digest||'import'),title:model?.title||payload.ir.title,collection:'generic',origin:'通用源码事实 / 原生画布'};
      const storageKey=candidateCurrent.id+':native-semantic-v1';let saved=!documentValue?await window.SummaryRecursiveStorage.get(storageKey):null;
      if(saved?.version===5&&saved.graph?.generic?.ir?.ir_digest===payload.ir.ir_digest){
        try{const doc=G.document(saved.graph);Object.assign(payload,G.read(doc));}catch(error){await window.SummaryRecursiveStorage.put('archived:'+storageKey+':'+Date.now(),{...saved,reason:'native presentation migration: '+error.message});saved=null;toast('旧原生布局已归档，使用当前字形重新构建。');}
      }else saved=null;
      const start=performance.now(),result=await runGraphTask({task:'generic-build',ir:payload.ir,state:payload.state,extra:{authoring:payload.authoring,migration:payload.migration,layouts:payload.layouts},nativeLayout:payload.nativeLayout,options:G.routeOptions(options())});
      if(ticket!==loadToken)return;if(!result?.ok)throw Error(result?.error||'原生语义画布构建失败');
      current=candidateCurrent;view={key:'native-semantic',label:'通用语义'};graph=result.graph;original=cloneGraph(graph);history=[];future=[];ghost=[];dirty=!!saved?.dirty||!!result.failed;selectedNodes.clear();selectedEdges.clear();connection=null;
      $('modelTitle').textContent=current.title;$('modelCollection').textContent='GENERIC SEMANTICS / NATIVE CANVAS';$('modelOrigin').textContent=payload.ir.coverage?.reason||'保留源码、调用身份、精确槽位与证据边界';
      $('sourceLinks').replaceChildren();if(model){const a=document.createElement('a');a.href='../data/semantic/'+model.ir;a.target='_blank';a.textContent='原始 IR ↗';$('sourceLinks').append(a);}
      $('sourceFacts').innerHTML='<p>'+esc(payload.ir.nodes.length)+' 个原始单位 / '+esc(payload.ir.edges.length)+' 条原始依赖；当前切面可继续展开至源码单位。语义编辑与视觉连接草稿分别记录。</p><pre>'+esc(JSON.stringify({coverage:payload.ir.coverage,runtime:payload.ir.runtime,limitations:payload.ir.limitations},null,2))+'</pre>';
      metrics={routed:result.routed||0,time:Math.round(performance.now()-start)};const url=new URL(location.href);url.searchParams.delete('case');url.searchParams.set('model',model?.id||'import');window.history.replaceState(null,'',url);
      busy=false;renderCatalog();fit();render({validation:result.validation});persist();toast(result.failed?`已保留完整语义；${result.failed} 条路径需要调整（红色）`:'通用语义已在原生画布打开。');return true;
    }catch(error){({graph,current,original,history,future,dirty}=previous);busy=false;if(graph)render();toast('文档未替换：'+error.message);return false;}finally{busy=false;$('cancelTask').hidden=true;}
  }
  const host={get graph(){return graph;},get busy(){return busy||!!drag;},get selected(){return [...selectedNodes];},get selectedEdges(){return [...selectedEdges];},get catalog(){return genericCatalog.models;},finishRoutes:continueNativeRouting,toast,esc,change:changeFrontier,openGeneric,
    async api(operation,payload){
      const body=JSON.stringify(payload);let response;
      try{response=await fetch('/api/authoring/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body});if([404,501].includes(response.status))response=null;}catch(_){}
      if(!response)try{response=await fetch('http://127.0.0.1:8767/api/authoring/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body});}catch(_){throw Error('源码解析服务未启动。请运行 python3 tools/serve_semantic_studio.py，再重试。');}
      const value=await response.json();if(!response.ok||!value.ok)throw Error(value.error||'源码服务请求失败');return value;
    },
    async applyProbe(ir,basis){
      if(busy||drag)throw Error('当前操作尚未完成');
      if(graph?.generic?.ir?.ir_digest!==basis)throw Error('当前模型已改变，补证未载入；请打开对应原始 IR 或下载补证结果');
      const previous=graph,start=performance.now();busy=true;
      try{
        const result=await runGraphTask({task:'generic-build',ir,state:{...graph.generic.state,mode:'merged'},options:G.routeOptions(options())});
        if(!result?.ok)throw Error(result?.error||'补证画布构建失败');
        save();graph=result.graph;dirty=true;selectedNodes.clear();selectedEdges.clear();ghost=[];
        metrics={routed:result.routed||0,time:Math.round(performance.now()-start)};
        busy=false;fit();render({validation:result.validation});persist();toast('运行补证已载入；静态未知边界保留，可撤销或切换源码 / CPU 轨迹。');
      }catch(error){graph=previous;throw error;}finally{busy=false;}
    },
    async openDocument(value){if(value.schema==='summary-merge-recursive/1'){
      const c=catalog.cases.find(c=>c.id===value.case);if(!c)throw Error('找不到专用案例');if(!value.graph?.recursive?.authority)throw Error('专用文档缺少 authority');
      const checked=E.validateView(value.graph);if(!checked.source.ok)throw Error(checked.source.violations.join('; '));await openCase(c,c.views[0]);if(current?.id!==c.id)throw Error('专用案例加载失败');save();graph=E.clone(value.graph);dirty=true;fit();render({validation:checked});persist();return true;
    }const ok=await openGeneric(null,value);if(!ok)throw Error('文档未替换，请检查通知中的原因');return true;},
    async edit(document,preview=false,ui={}){
      if(busy||drag)throw Error('当前操作尚未完成');
      save();busy=true;
      try{const ir=window.SemanticAuthoring.sourceIR(document);let certified=ir;
      if(ir.authoring?.edited)try{certified=(await host.api('certify',{ir})).ir;}catch(error){toast('保留未认证编辑：'+error.message);}
      const editing=ui.editing??graph?.generic?.state?.nativeEditing??true;
      const state={...(preview?window.SemanticCompositionLayout.frontier({mode:'merged'},'detail'):{view:'publication',mode:'merged',paperCanonical:true,paperMedium:'canvas',paperGranularity:'detailed',paperAuto:false,open:[...new Set([...document.open,...document.nodes.filter(n=>!n.parent&&n.kind==='composite').map(n=>n.id)])]}),nativeEditing:editing};
        const result=await runGraphTask({task:'generic-build',ir:certified,state,extra:{authoring:document,migration:graph?.generic?.migration},options:G.routeOptions(options())});
        if(!result.ok)throw Error(result.error);graph=result.graph;dirty=true;selectedNodes.clear();selectedEdges.clear();busy=false;fit();render({validation:result.validation});persist();return true;
      }catch(error){graph=history.pop();busy=false;render();throw Error('编辑未提交：'+error.message);}finally{busy=false;}
    }
  };
  window.SummaryNativeHost=host;genericUi=window.SummaryGenericControls?.create(host);
  $('modelSearch').oninput=renderCatalog;
  $('importDocument').onclick=()=>$('documentFile').click();$('documentFile').onchange=async()=>{try{const file=$('documentFile').files[0];if(!file)return;if(file.size>60000000)throw Error('文档超过 60MB');await host.openDocument(JSON.parse(await file.text()));}catch(error){toast(error.message);}finally{$('documentFile').value='';}};

  ensureWorker();
  updateInteractionModeUi();
  async function start(){
    try{const response=await fetch('../data/semantic/catalog.json',{cache:'no-store'});genericCatalog=await response.json();}catch(error){toast('通用模型目录读取失败：'+error.message);}
    const query=new URLSearchParams(location.search),chosen=catalog.cases.find(c=>c.id===query.get('case'));
    renderCatalog();if(chosen)openCase(chosen,chosen.views.find(v=>v.key===query.get('view'))||chosen.views[0]);
    else {const model=window.SemanticPresentationProfile.defaultModel(genericCatalog,query.get('model'));if(model)openGeneric(model);else openCase(catalog.cases[0],catalog.cases[0].views[0]);}
  }
  start();
})();

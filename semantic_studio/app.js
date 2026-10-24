(function(){
  'use strict';
  const $=id=>document.getElementById(id),E=window.SemanticEngine,P=window.SemanticPublication,R=window.SemanticPublicationRenderer,svg=$('canvas'),NS='http://www.w3.org/2000/svg';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
  let catalog=[],ir=null,state=null,presentation=null,projection=null,selected=null,history=[],future=[],camera={x:0,y:0,w:1000,h:700},drag=null,loadRevision=0;
  let renderedNodes=new Map(),renderedEdges=new Map(),pendingFrame=0,dragPoint=null,inspectedBundle=null,canvasQuality=null,displayedFigure=null;
  const paperNodeStamps=new WeakMap(),paperEdgeStamps=new WeakMap();let paperSceneIR=null,renderInstance=0;
  let navigationIndex=[],focusOptions=[],sceneKey=null,busy=false,renderRevision=0,fitRequested=false,persistRequested=false,committed=null,persistTimer=0;
  const I=window.SemanticCanvasInteraction,scene=window.SemanticSceneClient.create(),Runtime=window.SemanticSceneRuntime;
  const disabledBefore=new Map(),storage=window.SemanticStateStorage.create();let pendingPersistence=null;
  function setBusy(value){
    busy=value;svg.setAttribute('aria-busy',String(value));svg.dataset.interactionPhase=value?'settling':'idle';
    const controls=document.querySelectorAll('.toolbar button:not(#fit),.toolbar select,.paper-tools button,.paper-tools input,.paper-tools select,.detail-option input,.inspector button');
    if(value){for(const c of controls){if(!disabledBefore.has(c))disabledBefore.set(c,c.disabled);c.disabled=true;}}
    else {for(const [c,disabled]of disabledBefore)c.disabled=disabled;disabledBefore.clear();}
  }
  function checkpoint(){committed={state:E.clone(state),history:history.map(E.clone),future:future.map(E.clone)};}
  async function render(options={}){
    if(!ir)return;const ticket=++renderRevision,start=performance.now();setBusy(true);delete svg.dataset.moveBlocked;message(options.move?'正在整理连线…':'正在更新语义画布…');
    const result=await scene.request(options.move?{task:'move',baseKey:sceneKey,...options.move}:{task:'render',state:E.clone(state),certify:options.certify,diagramPlan:options.diagramPlan,frontier:options.frontier,baseKey:sceneKey}).catch(error=>({ok:false,error:error.message}));
    if(ticket!==renderRevision||result.stale)return;
    if(!result.ok){
      if(committed){state=E.clone(committed.state);history=committed.history.map(E.clone);future=committed.future.map(E.clone);}
      setBusy(false);restorePreview();$('view').value=state.view;$('mode').value=state.mode;$('detailsToggle').checked=!!state.details;$('foldToggle').checked=state.foldSerial!==false;optionalFold();$('undo').disabled=!history.length;$('redo').disabled=!future.length;persistRequested=false;fitRequested=false;
      message('操作已恢复：'+result.error);return;
    }
    state=result.state;sceneKey=result.key;Runtime.unpack(result);focusOptions=result.focus||[];
    result.geometryOnly=!!options.move;await drawScene(result,()=>ticket===renderRevision);
    if(ticket!==renderRevision)return;setBusy(false);syncPaperControls();checkpoint();
    svg.dataset.execution=result.execution;svg.dataset.sceneKey=String(sceneKey);svg.dataset.computeMs=String(result.metrics.compute_ms);svg.dataset.sceneMs=(performance.now()-start).toFixed(2);svg.dataset.cached=String(result.metrics.cached);
    svg.dataset.incremental=String(!!result.metrics.incremental);
    if(fitRequested){fitRequested=false;fit();}if(persistRequested){persistRequested=false;persist();}
  }
  // Geometry edits and expansion are mutually exclusive. Model loading remains
  // available and invalidates the old worker/gesture before opening its IR.
  document.addEventListener('click',e=>{if((busy&&e.target.closest('.inspector button'))||(drag?.kind==='node'&&e.target.closest('.toolbar,.paper-tools,.detail-option,.inspector button'))){e.preventDefault();e.stopImmediatePropagation();}},true);
  const profiles=window.SemanticPresentationProfile;
  const storeKey=()=>profiles.storageKey(ir,presentation);
  const message=x=>$('status').textContent=x;
  function snapshot(){history.push(E.clone(state));if(history.length>40)history.shift();future=[];}
  function flushPersistence(){
    clearTimeout(persistTimer);if(!pendingPersistence)return;const {key,text}=pendingPersistence;pendingPersistence=null;
    storage.write(key,text).then(result=>{svg.dataset.storage=result.backend;}).catch(()=>message('浏览器存储不可用；可保存图文档到文件。'));
  }
  function persist(){if(busy){persistRequested=true;return;}clearTimeout(persistTimer);pendingPersistence={key:storeKey(),text:JSON.stringify(state)};persistTimer=setTimeout(flushPersistence,180);}
  window.addEventListener('pagehide',flushPersistence);

  function setCamera(){svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);if(canvasQuality&&state?.view==='publication'&&state.paperMedium==='canvas')showPaperQuality(canvasQuality);}
  function fit(){if(busy){fitRequested=true;return;}if(!projection)return;const b=projection.bounds,r=$('stage').clientWidth/$('stage').clientHeight,w=b.w+40,h=b.h+40;camera=w/h>r?{x:b.x-20,y:b.y-(w/r-h)/2-20,w,h:w/r}:{x:b.x-(h*r-w)/2-20,y:b.y-20,w:h*r,h};setCamera();}
  function locate(id){
    if(busy)return;const p=projection?.positions.get(id);if(!p)return;
    const w=svg.clientWidth,h=svg.clientHeight;if(!w||!h)return;
    // Locate the title of an expanded frame rather than fitting its entire
    // subtree. Closed nodes are centered at native scale. No graph mutation.
    const width=p.expanded?Math.min(p.w,Math.max(1,w-48)):p.w;
    const height=p.expanded?Math.min(p.header||64,Math.max(1,h-48)):p.h;
    camera={x:p.x+width/2-w/2,y:p.y+height/2-h/2,w,h};setCamera();inspect(id);
  }
  function refreshNavigation(){
    navigationIndex=projection.nodes.map(n=>{
      const parents=[],seen=new Set([n.id]);let parent=n.parent;
      while(parent&&!seen.has(parent)){seen.add(parent);const p=projection.idx.nodes.get(parent);if(!p)break;parents.unshift(p.module_path||p.label||p.id);parent=p.parent;}
      const locations=[...new Set((n.source||[]).map(s=>[s.file?s.file.split('/').slice(-2).join('/'):'',s.line,s.symbol].filter(v=>v!=null).join(':')))];
      const source=locations.slice(0,2).join(' · ')+(locations.length>2?` · 另 ${locations.length-2} 处来源`:'');
      const title=n.paper?.title||n.label||n.id,scope=parents.join(' › ');
      return {id:n.id,title,scope,source,text:[n.id,n.label,title,n.operator,n.semantic_type,scope,...locations].filter(Boolean).join(' ').toLocaleLowerCase()};
    });
    findNodes();
  }
  function findNodes(){
    const terms=$('nodeFind').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean),box=$('nodeFindResults');box.replaceChildren();box.hidden=!terms.length;
    if(!terms.length)return;
    const matches=navigationIndex.filter(n=>terms.every(t=>n.text.includes(t))),note=document.createElement('p');
    note.textContent=matches.length?`${matches.length} 个当前图元${matches.length>40?'，显示前 40 个；可增加范围或源码位置缩小查找':''}`:'当前图中没有匹配项；可展开相关区域或切换源码层级后再查找。';box.append(note);
    for(const n of matches.slice(0,40)){const button=document.createElement('button');button.type='button';button.dataset.nodeTarget=n.id;
      const title=document.createElement('strong'),detail=document.createElement('small');title.textContent=n.title;detail.textContent=[n.scope,n.source].filter(Boolean).join(' · ');
      button.append(title,detail);button.onclick=()=>locate(n.id);box.append(button);
    }
  }
  function library(){const q=$('search').value.toLowerCase();$('catalog').replaceChildren();for(const m of catalog.filter(m=>m.title.toLowerCase().includes(q))){const b=document.createElement('button');b.className='case'+(ir?.ir_digest===m.digest?' active':'');b.innerHTML=`<strong>${esc(m.title)}</strong><small>${m.nodes} 节点 · ${esc(m.runtime==='passed'?'CPU 已观测':'静态源码')}</small>`;b.onclick=()=>loadModel(m);$('catalog').append(b);}}
  async function loadModel(m){const ticket=++loadRevision;try{
    const read=async path=>{const response=await fetch('../data/semantic/'+path,{cache:'no-store'});if(!response.ok)throw Error('模型或展示配置读取失败');return response.json();};
    const [value,profile]=await Promise.all([read(m.ir),m.presentation?read(m.presentation):null]);
    if(ticket!==loadRevision)return;await open(value,undefined,profile);if(ticket!==loadRevision)return;$('irLink').href='../data/semantic/'+m.ir;$('irLink').hidden=false;
  }catch(error){if(ticket===loadRevision)message(error.message);}}
  async function open(value,saved,profile=null){
    E.validate(value);profiles.validate(value,profile);const ticket=loadRevision;
    const stored=saved?null:await storage.read(profiles.storageKey(value,profile));if(ticket!==loadRevision)return;
    flushPersistence();cancelDrag();++renderRevision;setBusy(false);committed=null;sceneKey=null;focusOptions=[];fitRequested=false;persistRequested=false;
    ir=value;presentation=profile;history=[];future=[];selected=null;inspectedBundle=null;
    state=profiles.initialState(ir,presentation,saved,stored,{deferDetails:true});scene.init(ir);
    state.view=state.view||'publication';$('view').value=state.view;$('detailsToggle').checked=!!state.details;$('foldToggle').checked=state.foldSerial!==false;optionalFold();$('mode').value=state.mode;$('mode').options[1].disabled=!ir.nodes.some(n=>n.id==='runtime-observations');
    if(state.mode==='runtime'&&$('mode').options[1].disabled)state.mode='source';$('mode').value=state.mode;$('nodeTitle').textContent='选择图元';$('details').textContent='单击节点查看源码与运行证据。';
    $('title').textContent=ir.title;$('summary').textContent=`${ir.nodes.length} 个语义单位 · ${ir.edges.length} 个关系 · ${(ir.motifs||[]).length} 个组合模式`;
    const c=ir.coverage||{status:'not-verified'},r=ir.runtime||{status:'not-requested'},branches=c.branches||[];
    $('coverage').innerHTML=`<strong>验证范围</strong> <span class="badge">${esc(c.status)}</span><p>目标契约（当前验证结果见状态与限制）：${esc(ir.coverage_contract)}</p><div>当前输入：${esc(c.scope||'静态分析')}；CPU：${esc(r.status)}；源码分支：${branches.filter(b=>b.kind!=='loop'&&!b.missing.length).length}/${(ir.branches||[]).filter(b=>b.kind!=='loop').length} 个 if / 条件表达式已覆盖两个结果；循环与短路路径另列为限制。</div><div>${esc(c.reason||'')}</div>${r.reason?'<pre>'+esc(r.reason)+'</pre>':''}<details><summary>分支、限制和模式证据</summary><pre>${esc(JSON.stringify({coverage:c,motifs:ir.motifs,limitations:ir.limitations},null,2))}</pre></details>`;
    $('nodeFind').value='';render({certify:!saved&&!stored&&!presentation?.default_state});fit();library();
  }
  function inspect(id){selected=id;inspectedBundle=null;for(const[key,g]of renderedNodes)g.classList.toggle('selected',key===id);const n=projection.idx.nodes.get(id);if(!n)return;
    $('nodeTitle').textContent=n.label;
    $('details').innerHTML=`<span class="badge">${esc(n.kind)}</span><span class="badge">${esc(n.evidence_status)}</span>${n.semantic_type?'<p>'+esc(n.semantic_type)+'</p>':''}${n.reason?'<p>'+esc(n.reason)+'</p>':''}${n.presentation_only?'<p>架构摘要 · '+n.canonical_members.length+' 个原始节点 · '+n.boundary_ports.length+' 个边界端口</p><pre>'+esc(JSON.stringify(projection.architecture.findings.find(f=>f.id===n.finding),null,2))+'</pre>':''}${(n.source||[]).slice(0,10).map(s=>`<div class="source">${esc(s.file.split('/').slice(-2).join('/'))}:${s.line}<code>${esc(s.symbol)}</code><pre>${esc(s.expression)}</pre></div>`).join('')}${n.inputs?'<p>输入 / 输出张量</p><pre>'+esc(JSON.stringify({inputs:n.inputs,outputs:n.outputs},null,2))+'</pre>':''}${projection.annotations.get(id)?.length?'<details><summary>附属资源与配置</summary><pre>'+esc(JSON.stringify(projection.annotations.get(id),null,2))+'</pre></details>':''}<details><summary>完整语义与证据</summary><pre>${esc(JSON.stringify(n,null,2))}</pre></details>`;
    if(n.role_annotations?.length)$('details').insertAdjacentHTML('beforeend','<details open><summary>当前展示的已证明角色</summary><pre>'+esc(JSON.stringify(n.role_annotations,null,2))+'</pre></details>');
    if(n.invocation_binding)$('details').insertAdjacentHTML('beforeend','<details open><summary>本次调用的固定参数</summary><p>此值仅适用于当前源码调用。原输入节点和全部使用关系仍保留；不表示其他调用使用相同值，也不表示条件分支已被删除。</p><pre>'+esc(JSON.stringify(n.invocation_binding,null,2))+'</pre></details>');
    if(n.frame_ownership?.length){
      $('details').insertAdjacentHTML('beforeend','<details open><summary>附注中的源码归属</summary><p>这些已展开外框附注在当前图元上；原始对象及源码归属仍独立保存。</p><pre>'+esc(JSON.stringify(n.frame_ownership,null,2))+'</pre></details>');
      const button=document.createElement('button');button.textContent='恢复源码外框';button.onclick=()=>{snapshot();state.paperFrameView='source';state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};$('details').append(button);
    }
    if(n.content_inventory)$('details').insertAdjacentHTML('afterbegin','<h3>摘要内容</h3><p>按当前语义单元计数，包含操作、调用和已确认的局部组合；不表示重复堆叠、执行并发或参数共享。</p>'+n.content_inventory.terms.map(t=>'<div class="source"><strong>'+esc(t.label)+' × '+t.count+'</strong><br>'+t.units.map(id=>esc(projection.idx.nodes.get(id)?.label||id)).join(' · ')+'</div>').join(''));
    if(n.role_operation_stage)$('details').insertAdjacentHTML('beforeend','<details open><summary>角色阶段与原始运算</summary><p>摘要保留说明中列出的每一步运算。双击可展开；输入输出仍对应原始边界。</p><pre>'+esc(JSON.stringify(n.role_operation_stage,null,2))+'</pre></details>');
    if(n.role_path_stage)$('details').insertAdjacentHTML('beforeend','<details open><summary>角色与相邻路径</summary><p>双击先展开角色与相邻路径；继续双击路径可查看具体运算。</p><pre>'+esc(JSON.stringify(n.role_path_stage,null,2))+'</pre></details>');
    if(n.contract_stage)$('details').insertAdjacentHTML('beforeend','<details open><summary>认证角色阶段与原始绑定</summary><p>摘要保留相加、后置归一化及说明中列出的独占分支末端。双击可展开原始操作。</p><pre>'+esc(JSON.stringify(n.contract_stage,null,2))+'</pre></details>');
    if(n.return_region)$('details').insertAdjacentHTML('beforeend','<details open><summary>条件返回与输出接口</summary><p>这些源码返回点汇入同一个输出接口。双击可查看分支、返回值及槽位；摘要不表示已执行或已选中某个分支。</p><pre>'+esc(JSON.stringify(n.return_region,null,2))+'</pre></details>');
    if(n.normal_return)$('details').insertAdjacentHTML('beforeend','<details open><summary>固定源码调用的正常返回</summary><p>固定布尔实参确定了这次源码调用的正常返回点。当前连线突出其输入依赖，其他源码路径的输入作为下列证据保留；双击展开后恢复全部路径。这不是运行覆盖或实际执行证明。</p><pre>'+esc(JSON.stringify(n.normal_return,null,2))+'</pre></details>');
    const dock=projection.positions?.context?.inputDocks.find(r=>r.node===id);
    if(dock)$('details').insertAdjacentHTML('beforeend','<details open><summary>就近放置的外部输入</summary><p>这是原有的唯一输入接口，放在使用位置附近以减少长连线。位置不表示输入在此处生成或较晚提供；全部使用和参数槽位仍独立保留。</p><pre>'+esc(JSON.stringify(dock,null,2))+'</pre></details>');
    const compositionDock=projection.publication?.composition?.input_docks.find(r=>r.node===id);
    if(compositionDock)$('details').insertAdjacentHTML('beforeend','<details open><summary>输入与消费范围</summary><p>此接口按实际消费范围放置。原始源码归属、唯一输入身份和每个使用槽位保持不变。</p><pre>'+esc(JSON.stringify(compositionDock,null,2))+'</pre></details>');
    if(n.local_pipeline)$('details').insertAdjacentHTML('beforeend','<details open><summary>局部流程摘要与原始绑定</summary><p>依据已提取依赖展示操作路径；符号读取与操作数保留。双击可查看内部节点。</p><pre>'+esc(JSON.stringify(n.local_pipeline,null,2))+'</pre></details>');
    if(n.local_pipeline_binding_rows)$('details').insertAdjacentHTML('beforeend','<details><summary>逐行输入引用</summary><p>readN 标识当前提取图的读取节点，inputN 标识输入接口；#N 标识算子结果。它们不证明运行时读取值相等。每行保留对应输入槽，双击模块可继续展开。</p><pre>'+esc(JSON.stringify(n.local_pipeline_binding_rows,null,2))+'</pre></details>');
    const summaryCheck=projection.summary_coverage?.find(r=>r.node===id);
    if(n.paper?.call_boundary)$('details').insertAdjacentHTML('afterbegin','<details open><summary>调用边界摘要</summary><p>当前显示源码调用、结果算子及读取次数。内部依赖和操作数已折叠；双击展开，或将“摘要内容”切回“运算与绑定”查看。原始读取、调用身份和边界仍保留。</p><pre>'+esc(JSON.stringify(n.paper.call_boundary,null,2))+'</pre></details>');
    if(summaryCheck)$('details').insertAdjacentHTML('afterbegin','<details open data-summary-coverage="'+esc(summaryCheck.status)+'"><summary>依赖结构表达检查</summary><p>'+(
      summaryCheck.status==='fulfilled'?(summaryCheck.form==='summary'?'当前摘要已表达操作及内部依赖结构。双击可继续展开原始操作和路径。':'当前操作与路径已表达这段依赖结构。'):
      '当前状态尚未完整表达这段依赖结构；可展开本区域检查缺少的内容。')+'</p><p>此项不代表所有操作数、参数、配置或运行行为已经验证。</p><details><summary>检查记录</summary><pre>'+esc(JSON.stringify(summaryCheck,null,2))+'</pre></details></details>');
    if(n.semantic_contracts?.length)$('details').insertAdjacentHTML('beforeend','<details open><summary>语义契约与证据范围</summary><pre>'+esc(JSON.stringify((ir.semantic_contracts||[]).filter(c=>n.semantic_contracts.includes(c.id)),null,2))+'</pre></details>');
    if(state.view==='publication'&&state.paperMedium==='canvas'&&state.paperGranularity==='roles'&&n.kind==='composite'&&n.semantic_contracts?.length){
      const adaptive=projection.publication?.adaptive_frontier,requested=adaptive?.selected_role_details||(Array.isArray(state.paperRoleDetails)?state.paperRoleDetails:[]),active=requested.includes(id),selectedPaths=adaptive?.selected_role_paths||(Array.isArray(state.paperRolePaths)?state.paperRolePaths:[]);
      const button=document.createElement('button');button.textContent=active?'收起本区域的角色细化':'展开本区域已证明的角色';
      button.onclick=()=>{snapshot();if(adaptive){state.paperAdaptive=false;state.paperExpressionDetails=adaptive.selected_expression_details;}state.paperRoleDetails=active?requested.filter(node=>node!==id):[...requested,id];state.paperRolePaths=selectedPaths.filter(p=>p.node!==id);state.paperAuto=true;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};$('details').append(button);
      const rolePaths=document.createElement('details'),heading=document.createElement('summary');heading.textContent='选择单条已证明的角色路径';rolePaths.open=selectedPaths.some(p=>p.node===id);rolePaths.append(heading);
      const note=document.createElement('p');note.textContent='只细化选中的路径；同级必要节点仍可见，条件、未知和独立认证边界继续保留。';rolePaths.append(note);
      const by=projection.idx.nodes,certificates=(projection.architecture.semantic_contracts||[]).filter(c=>c.node===id&&n.semantic_contracts.includes(c.id));
      for(const c of certificates)for(const ref of window.SemanticRoleFrontier.references(c.roles,by)){
        let at=ref.node;while(at&&at!==id)at=by.get(at)?.parent;if(ref.node===id||at!==id)continue;
        const key=JSON.stringify([id,c.id,ref.keys]),paths=selectedPaths,on=paths.some(p=>JSON.stringify([p.node,p.certificate,p.role])===key);
        const row=document.createElement('div'),button=document.createElement('button');button.textContent=(on?'收起路径 · ':'细化路径 · ')+ref.path;button.disabled=active;button.dataset.rolePath=JSON.stringify(ref.keys);button.dataset.certificate=c.id;
        button.onclick=()=>{snapshot();if(adaptive){state.paperAdaptive=false;state.paperRoleDetails=adaptive.selected_role_details;state.paperExpressionDetails=adaptive.selected_expression_details;}
          state.paperRolePaths=on?paths.filter(p=>JSON.stringify([p.node,p.certificate,p.role])!==key):[...paths,{node:id,certificate:c.id,role:ref.keys}];
          state.paperAuto=true;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};
        const label=document.createElement('small');label.textContent=' → '+(by.get(ref.node)?.source_label||by.get(ref.node)?.label||ref.node);row.append(button,label);rolePaths.append(row);
      }
      $('details').append(rolePaths);
      const pathChecks=projection.publication?.role_frontier?.path_requests?.filter(r=>r.node===id)||[];
      if(pathChecks.length){
        const statuses={exposed:'端点已显示',boundary:'保留内部边界',contracted:'已映射到实际来源',folded:'当前仍折叠',outside:'当前范围之外',attached:'作为附注保留',deferred:'暂缓'};
        $('details').insertAdjacentHTML('beforeend','<div><strong>所选角色路径</strong>'+pathChecks.map(r=>'<p>'+esc(r.role.join(' → '))+' · '+esc(statuses[r.status]||r.status)+(r.operand_check?.status==='fulfilled'?' · 输入绑定已接线':'')+'</p>').join('')+'<details><summary>路径证据与暂缓原因</summary><pre>'+esc(JSON.stringify(pathChecks,null,2))+'</pre></details></div>');
      }
      const request=projection.publication?.role_frontier?.detail_requests?.find(r=>r.node===id);
      if(request)$('details').insertAdjacentHTML('beforeend','<details open><summary>本区域的角色细化状态</summary><pre>'+esc(JSON.stringify(request,null,2))+'</pre></details>');
    }
    const relations=projection.architecture?.relation_graph?.relations||[],receipts=projection.constraint_receipts||[];
    const local=relations.filter(r=>r.node===id||r.members.includes(id));
    if(local.length)$('details').insertAdjacentHTML('beforeend','<details><summary>局部关系与未证明属性</summary><pre>'+esc(JSON.stringify(local,null,2))+'</pre></details>');
    const expressions=projection.publication?.local_expressions?.requests.filter(r=>r.targets.some(t=>t.visible_node===id)||r.scope===id)||[];
    if(expressions.length)$('details').insertAdjacentHTML('beforeend','<details open><summary>局部表达与暂缓原因</summary><pre>'+esc(JSON.stringify(expressions,null,2))+'</pre></details>');
    for(const relation of local.filter(r=>['gated-product','gated-join','state-interface','unknown-boundary','conditional-join','selection'].includes(r.type))){const button=document.createElement('button');button.textContent='查看关系详图 · '+relation.type;button.onclick=()=>{snapshot();state.view='publication';$('view').value=state.view;state.paperRelation=relation.id;state.paperAuto=true;state.paperGranularity='detailed';state.offsets={};delete state.canvasPlacement;render();fit();persist();syncPaperControls();};$('details').append(button);}
    const constraints=receipts.filter(r=>r.visible_node===id||r.mapping.some(b=>b.visible_source===id||b.visible_target===id));
    if(constraints.length)$('details').insertAdjacentHTML('beforeend','<details><summary>当前画面的关系约束</summary><pre>'+esc(JSON.stringify(constraints,null,2))+'</pre></details>');
    if(n.observed_calls)$('details').insertAdjacentHTML('beforeend','<details><summary>对应的运行观测</summary><pre>'+esc(JSON.stringify(n.observed_calls,null,2))+'</pre></details>');
    if(n.repeat_contract?.structure?.rule_version==='local-structure/1')for(const [groupIndex,group]of n.repeat_contract.structure.groups.entries()){
      if(group.status!=='proved')continue;
      const button=document.createElement('button');button.textContent='查看结构代表 · 位置 '+group.indices.map(i=>i+1).join(', ');
      button.onclick=()=>{snapshot();state.paperFocus=n.id;state.paperRepresentative=true;state.paperRepresentativeGroup=groupIndex;state.paperGranularity='modules';state.paperAuto=true;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};$('details').append(button);
    }
    if(n.observation_group){const button=document.createElement('button');button.textContent='查看一条代表轨迹';button.onclick=()=>{snapshot();state.paperFocus=n.observation_group.representative;state.paperRepresentative=false;state.paperAuto=true;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};$('details').append(button);}
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
  function toggle(id){if(busy||drag)return;if(!(projection.idx.children.get(id)||[]).length)return;snapshot();if(state.view==='publication'){state.open=projection.publication.open;state.paperAuto=false;$('paperAuto').checked=false;}const open=new Set(state.open);if(open.has(id)){
      open.delete(id);
      // Closing this two-level presentation resets its helper expansion too.
      // A leftover explicit helper request would otherwise dissolve the stage.
      if(projection.idx.nodes.get(id)?.role_path_stage){const todo=[id];for(let i=0;i<todo.length;i++)for(const child of projection.idx.children.get(todo[i])||[]){open.delete(child);todo.push(child);}}
    }else open.add(id);state.open=[...open];delete state.canvasPlacement;render({frontier:id});if(state.view==='publication')fit();persist();}
  function bindNode(g,n,p,graph=projection){
      const kids=graph.idx.children.get(n.id)||[];
      if(kids.length){const plus=el('text',{x:p.w-22,y:25,'font-size':18,fill:'#47618a'},p.expanded?'−':'+');plus.style.pointerEvents='auto';plus.style.cursor='pointer';plus.addEventListener('pointerdown',e=>e.stopPropagation());plus.addEventListener('click',e=>{e.stopPropagation();toggle(n.id);});g.append(plus);}
      g.addEventListener('dblclick',e=>{e.stopPropagation();toggle(n.id);});
      g.addEventListener('pointerdown',e=>{
        if(e.button!==0||busy||drag)return;e.stopPropagation();inspect(n.id);const session=I.session(displayedFigure||{graph:projection},n.id);if(!session)return;
        drag={kind:'node',id:n.id,start:world(e),session,moved:false,dx:0,dy:0,pointerId:e.pointerId,capture:g,beforeHistory:history.slice(),beforeFuture:future.slice(),beforeState:E.clone(state),samples:[]};setBusy(true);g.setPointerCapture(e.pointerId);svg.dataset.interactionPhase='dragging';
      });
  }
  async function drawScene(result,isCurrent=()=>true){if(!ir)return;if(result.geometryOnly){patchGeometry(result.figure);return;}$('architectureReturn').hidden=!state.paperFrontierReturn;$('diagramSuggestions').hidden=true;$('diagramBack').hidden=!state.paperDiagramReturn;$('legend').innerHTML=state.view==='publication'?'<span>蓝灰实线：源码依赖</span><span>绿色：实际张量流</span><span>黄虚线：控制</span><span>虚框：未知操作</span><span>无节点交叉：跨越</span><span>粗线与数量：合绘的独立依赖，可单击查看</span>':'<span>蓝色虚线：源码依赖</span><span>绿色实线：实际张量流</span><span>紫色：参数</span><span>黄色：控制</span><span>红色虚框：未知边界</span>';svg.classList.toggle('publication',state.view==='publication');if(state.view!=='publication'){document.getElementById('paperLabels')?.remove();document.getElementById('paperJunctions')?.remove();}if(state.view==='publication'){await renderPaper(result.figure,result.planned,isCurrent);return;}displayedFigure=result.figure;projection=result.figure.graph;renderedNodes=new Map();renderedEdges=new Map();for(const id of ['frames','edges','nodes'])$(id).replaceChildren();
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
    refreshNavigation();refreshBundleInspector();$('undo').disabled=!history.length;$('redo').disabled=!future.length;message(`${projection.nodes.length} 个图元 · ${projection.edges.length} 条连接${projection.architecture?' · '+projection.nodes.filter(n=>n.presentation_only).length+' 个架构摘要':''}${failedRoutes?' · '+failedRoutes+' 条路径待调整':''}`);
  }
  function syncPaperControls(){
    if(!ir||!state)return;
    $('paperAuto').checked=state.paperAuto!==false;$('paperWidth').value=state.paperWidthMm||180;$('paperGranularity').value=state.paperGranularity||'overview';$('paperGranularity').disabled=state.paperAuto===false;
    const canvas=state.paperMedium==='canvas';$('paperMedium').value=canvas?'canvas':'print';$('paperRoleStageTools').hidden=!canvas||state.paperGranularity!=='roles';$('paperRoleOperationStages').checked=state.paperRoleOperationStages===true;$('paperRolePathStageTools').hidden=!canvas||state.paperGranularity!=='roles';$('paperRolePathStages').checked=state.paperRolePathStages===true;$('paperPrintWidth').hidden=canvas;$('nativeScale').hidden=!canvas;$('paperSequenceTools').hidden=!canvas;$('paperSequenceView').value=state.paperSequenceView==='summary'?'summary':'representatives';$('paperFrameTools').hidden=!canvas;$('paperFrameView').value=state.paperFrameView==='source'?'source':'compact';
    const architecture=state.paperComposition==='architecture';
    $('paperCompositionTools').hidden=!canvas;$('paperComposition').value=architecture?'architecture':'dependency';
    $('paperDirectionTools').hidden=!canvas||!architecture;$('paperDirection').value=state.paperDirection==='up'?'up':'down';
    $('paperFrontierTools').hidden=!canvas||!architecture;$('architectureReturn').hidden=!state.paperFrontierReturn;
    $('paperReadSummaryTools').hidden=!canvas||state.paperGranularity!=='stages';$('paperReadSummary').value=state.paperReadSummary==='boundary'?'boundary':'bindings';
    $('planDiagramSet').hidden=!canvas||state.paperGranularity!=='roles';$('paperAdaptiveTools').hidden=!canvas||state.paperGranularity!=='roles';$('paperAdaptive').checked=state.paperAdaptive===true;$('paperAdaptive').disabled=state.paperAuto===false;
    $('paperAdaptivePolicyTools').hidden=!canvas||state.paperGranularity!=='roles';$('paperAdaptivePolicy').value=state.paperAdaptivePolicy||'detail';$('paperAdaptivePolicy').disabled=state.paperAuto===false||state.paperAdaptive!==true;
    const select=$('paperFocus');select.replaceChildren(new Option('模型总览',''));
    for(const n of focusOptions)select.add(new Option(n.label,n.id));
    if(state.paperRelation){select.add(new Option('局部关系详图',':relation'));select.value=':relation';}else select.value=state.paperFocus||'';
  }
  $('paperFocus').onchange=()=>{if($('paperFocus').value===':relation')return;snapshot();state.paperRelation=null;state.paperFocus=$('paperFocus').value||null;state.paperRepresentative=false;state.paperAuto=true;state.offsets={};delete state.canvasPlacement;render();fit();persist();syncPaperControls();};
  $('paperAuto').onchange=()=>{snapshot();state.open=projection.publication?.open||state.open;state.paperAuto=$('paperAuto').checked;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};
  $('paperGranularity').onchange=()=>{snapshot();state.paperGranularity=$('paperGranularity').value;delete state.paperCanonical;state.paperAuto=true;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};
  $('paperAdaptivePolicy').onchange=()=>{snapshot();state.paperAdaptivePolicy=$('paperAdaptivePolicy').value;state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  $('paperAdaptive').onchange=()=>{snapshot();state.paperAdaptive=$('paperAdaptive').checked;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};
  $('paperWidth').onchange=()=>{snapshot();state.paperWidthMm=Math.max(80,Math.min(400,Number($('paperWidth').value)||180));render();fit();persist();};
  $('paperMedium').onchange=()=>{snapshot();state.paperMedium=$('paperMedium').value;state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};
  $('paperSequenceView').onchange=()=>{snapshot();state.paperSequenceView=$('paperSequenceView').value;state.paperAuto=true;state.open=[];state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};
  $('paperRoleOperationStages').onchange=()=>{snapshot();state.paperRoleOperationStages=$('paperRoleOperationStages').checked;state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  $('paperRolePathStages').onchange=()=>{snapshot();state.paperRolePathStages=$('paperRolePathStages').checked;delete state.paperRolePathStageOwners;state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  $('paperFrameView').onchange=()=>{snapshot();state.paperFrameView=$('paperFrameView').value;state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  $('paperComposition').onchange=()=>{snapshot();state.paperComposition=$('paperComposition').value;
    if(state.paperComposition==='architecture'&&!state.paperDirection)state.paperDirection='up';
    state.offsets={};delete state.canvasPlacement;syncPaperControls();render();fit();persist();};
  $('paperDirection').onchange=()=>{snapshot();state.paperDirection=$('paperDirection').value;state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  function architectureFrontier(action){snapshot();state=window.SemanticCompositionLayout.frontier(state,action);delete state.canvasPlacement;selected=null;inspectedBundle=null;
    $('view').value=state.view;optionalFold();render({certify:action==='detail'});fit();persist();}
  $('architectureOverview').onclick=()=>architectureFrontier('overview');
  $('architectureDetail').onclick=()=>architectureFrontier('detail');
  $('architectureReturn').onclick=()=>architectureFrontier('return');
  $('paperReadSummary').onchange=()=>{snapshot();state.paperReadSummary=$('paperReadSummary').value;state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  $('planDiagramSet').onclick=()=>{snapshot();render({diagramPlan:true});fit();persist();};
  $('nativeScale').onclick=()=>{const b=projection.bounds;camera={x:b.x-20,y:b.y-20,w:svg.clientWidth,h:svg.clientHeight};setCamera();};
  function showPaperQuality(q){
    const issues={'font-below-8pt':'打印字号偏小','figure-taller-than-245mm':'打印图过高','canvas-font-below-12px':'原始字号偏小',
      'canvas-width-budget':'画布过宽','canvas-height-budget':'画布过高','canvas-area-budget':'画布面积超限','canvas-node-budget':'图元数量超限','canvas-edge-budget':'连线数量超限',
      'route-failure':'连线路径','port-label-requires-note':'端口标签见导出附注','edge-path-overlap':'路径重合'};
    const scale=Math.min(svg.clientWidth/camera.w,svg.clientHeight/camera.h);
    $('paperQuality').textContent=(q.medium==='canvas'?`原始字号 ${q.min_canvas_font_px} px · 当前 ${(q.min_canvas_font_px*scale).toFixed(1)} px · ${Math.ceil(q.native_width_px)} × ${Math.ceil(q.native_height_px)} px`:
      `${q.min_print_font_pt} pt 最小字号 · ${Number(q.width_mm.toFixed(1))} × ${q.height_mm} mm`)+
      (q.issues.length?' · 需调整：'+q.issues.map(s=>issues[s]||s).join('、'):'');
    $('paperQuality').className=q.issues.length?'needs-adjustment':'quality-ok';
  }
  function renderMarkers(figure){
    document.getElementById('paperJunctions')?.remove();if(!figure.prepared)return;
    const group=el('g',{id:'paperJunctions','pointer-events':'none'});
    for(const r of figure.prepared.routing?.shared_fanout_refinement?.selected||[])for(const p of r.junctions)group.append(el('circle',{cx:p.x,cy:p.y,r:2.6,fill:'#617487','data-fanout-edges':JSON.stringify(r.edges)}));
    $('edges').append(group);
  }
  function patchGeometry(figure){
    const started=performance.now();
    displayedFigure=figure;projection=figure.graph;if(figure.prepared)projection.bounds=figure.prepared.bounds;
    for(const [id,g]of renderedNodes){const p=projection.positions.get(id);g.setAttribute('transform',`translate(${p.x},${p.y})`);}
    const routes=figure.prepared?.routes||projection.edges.map(e=>({...e,route:E.route(e,projection.positions)}));
    for(const e of routes){const g=renderedEdges.get(e.id),d=I.path(e.route.points);g.removeAttribute('transform');paperEdgeStamps.delete(g);
      if(g.tagName==='g'){
        g.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));
        // Bundle hit areas follow the settled segments as well as the ink.
        g.querySelectorAll('rect').forEach(r=>r.remove());
        if(e.bundle_members)for(let i=1;i<e.route.points.length;i++){const a=e.route.points[i-1],b=e.route.points[i];g.append(el('rect',{x:Math.min(a.x,b.x)-8,y:Math.min(a.y,b.y)-8,width:Math.abs(a.x-b.x)+16,height:Math.abs(a.y-b.y)+16,fill:'transparent','pointer-events':'all','aria-hidden':'true'}));}
      }else g.setAttribute('d',d);
    }
    if(figure.prepared){const labels=document.getElementById('paperLabels');labels.innerHTML=figure.prepared.labeling.placed.map(R.labelBody).join('');renderMarkers(figure);canvasQuality=figure.prepared.quality.medium==='canvas'?figure.prepared.quality:null;showPaperQuality(figure.prepared.quality);}
    Object.assign(svg.dataset,{domCreatedNodes:'0',domReusedNodes:String(renderedNodes.size),domCreatedEdges:'0',domReusedEdges:String(renderedEdges.size),domMs:(performance.now()-started).toFixed(2)});
    refreshBundleInspector();$('undo').disabled=!history.length;$('redo').disabled=!future.length;message(`${projection.nodes.length} 个图元 · ${projection.edges.length} 条连接 · 位置与连线已更新`);
  }
  async function renderPaper(figure,planned,isCurrent=()=>true){
    const started=performance.now(),graph=figure.graph,prepared=figure.prepared,nodeMap=new Map(),edgeMap=new Map(),frames=[],nodes=[],edges=[];
    const retain=paperSceneIR===ir&&!!displayedFigure?.prepared,stats={createdNodes:0,reusedNodes:0,createdEdges:0,reusedEdges:0};
    const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));let built=0;
    for(const n of E.drawingOrder(graph.nodes,graph.idx)){const p=graph.positions.get(n.id),body=R.nodeBody(n,p),title=R.nodeTitle(n,graph.idx),kids=(graph.idx.children.get(n.id)||[]).length;
      const stamp=JSON.stringify([body,title,!!kids,p.w,!!p.expanded]);let g=retain&&renderedNodes.get(n.id);
      if(g&&paperNodeStamps.get(g)===stamp)stats.reusedNodes++;else{
        g=el('g',{class:'node','data-id':n.id,'data-render-instance':++renderInstance});g.innerHTML=body;g.append(el('title',{},title));bindNode(g,n,p,graph);paperNodeStamps.set(g,stamp);stats.createdNodes++;
      }
      (p.expanded?frames:nodes).push(g);nodeMap.set(n.id,g);
      if(++built%128===0){await yieldFrame();if(!isCurrent())return;}
    }
    let style=document.getElementById('paperStyle');if(!style){style=el('style',{id:'paperStyle'},R.css);svg.prepend(style);svg.querySelector('defs').insertAdjacentHTML('beforeend',R.defs);}
    const labels=el('g',{id:'paperLabels'});
    for(const edge of prepared.routes){
      const body=R.edgeBody(edge);let g=retain&&renderedEdges.get(edge.id);
      if(g&&paperEdgeStamps.get(g)===body)stats.reusedEdges++;else{
      g=el('g',{'data-render-instance':++renderInstance});g.innerHTML=body;paperEdgeStamps.set(g,body);stats.createdEdges++;
      if(edge.bundle_members){
        g.style.cursor='pointer';g.setAttribute('role','button');g.setAttribute('tabindex','0');
        g.setAttribute('aria-label','查看 '+edge.bundle_members.length+' 条合绘依赖');
        // Rectangles also give a perfectly horizontal/vertical SVG edge a
        // nonzero accessible box, while keeping hit areas on its segments.
        for(let i=1;i<edge.route.points.length;i++){
          const a=edge.route.points[i-1],b=edge.route.points[i];
          g.append(el('rect',{x:Math.min(a.x,b.x)-8,y:Math.min(a.y,b.y)-8,width:Math.abs(a.x-b.x)+16,height:Math.abs(a.y-b.y)+16,fill:'transparent','pointer-events':'all','aria-hidden':'true'}));
        }
        const inspectCurrent=()=>{const current=displayedFigure?.prepared.routes.find(e=>e.id===edge.id);if(current?.bundle_members)inspectBundle(current);};
        g.addEventListener('click',e=>{e.stopPropagation();inspectCurrent();});
        g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();inspectCurrent();}});
      }
      }
      edges.push(g);edgeMap.set(edge.id,g);if(++built%128===0){await yieldFrame();if(!isCurrent())return;}
    }
    if(!isCurrent())return;displayedFigure=figure;projection=graph;projection.bounds=prepared.bounds;renderedNodes=nodeMap;renderedEdges=edgeMap;
    // Retained instances stay in the old committed scene throughout async
    // preparation. Only this guarded commit changes live nodes or ordering.
    for(const [id,g]of nodeMap){const p=graph.positions.get(id);g.setAttribute('transform',`translate(${p.x},${p.y})`);g.classList.toggle('selected',id===selected);}
    const reconcile=(layer,items)=>{let at=layer.firstChild;for(const item of items){if(item===at)at=at.nextSibling;else layer.insertBefore(item,at);}while(at){const next=at.nextSibling;at.remove();at=next;}};
    reconcile($('frames'),frames);reconcile($('nodes'),nodes);reconcile($('edges'),edges);paperSceneIR=ir;
    document.getElementById('paperLabels')?.remove();
    labels.innerHTML=prepared.labeling.placed.map(R.labelBody).join('');svg.append(labels);renderMarkers(figure);refreshNavigation();refreshBundleInspector();
    for(const [key,value]of Object.entries(stats))svg.dataset['dom'+key[0].toUpperCase()+key.slice(1)]=String(value);svg.dataset.domMs=(performance.now()-started).toFixed(2);
    const q=prepared.quality;canvasQuality=q.medium==='canvas'?q:null;showPaperQuality(q);
    $('paperAuto').checked=state.paperAuto!==false;$('paperGranularity').disabled=state.paperAuto===false;$('paperAdaptive').disabled=state.paperAuto===false;$('paperAdaptivePolicy').disabled=state.paperAuto===false||state.paperAdaptive!==true;$('undo').disabled=!history.length;$('redo').disabled=!future.length;
    const limited=prepared.routing.granularity_refinement;
    message(`${projection.nodes.length} 个图元 · ${projection.edges.length} 条连接${projection.publication.wire_bundles.length?'（'+projection.edge_accounting.visible.length+' 条依赖）':''} · ${projection.publication.unknowns} 个未知操作${prepared.quality.route_failures.length?' · 存在待调整路径':''}${projection.publication.composition?.status==='fallback'?' · 架构编排有未解决的布局问题，已保留当前层级的依赖布局':''}${limited&&(limited.selected!==limited.requested||limited.selected_budget<limited.requested_budget)?' · 受图宽限制，部分细节请打开模块详图':''}`);
    if(planned&&state.paperMedium==='canvas'&&state.paperGranularity==='roles'){
      const box=$('diagramSuggestions');box.replaceChildren();
      const currentState=E.clone(state);delete currentState.paperDiagramPlan;
      const selectedPlan=state.paperDiagramPlan&&JSON.stringify(currentState)===JSON.stringify(state.paperDiagramPlan.main_state)?state.paperDiagramPlan:null;
      if(selectedPlan){
        const selectedIds=new Set(selectedPlan.details.map(r=>r.id));
        planned.candidates=[...selectedPlan.details.map(r=>({...r,planned:true})),...planned.candidates.filter(r=>!selectedIds.has(r.id))];
      }
      if(planned.candidates.length){
        box.hidden=false;const label=document.createElement('span');label.textContent=selectedPlan?'已规划 '+(selectedPlan.details.length+1)+' 张图；可继续查看细节：':'可在独立详图中查看：';box.append(label);
        const appendRequest=request=>{
          const button=document.createElement('button');button.textContent=request.label+(request.planned?' · 已规划':'');button.title='查看局部角色和依赖，保留主图展开状态';
          button.onclick=()=>{snapshot();const previous=E.clone(state.paperDiagramReturn||state);delete previous.paperDiagramReturn;state={...E.clone(request.state),paperDiagramReturn:previous};selected=null;syncPaperControls();render();fit();persist();};box.append(button);
        };
        let shown=0;const more=document.createElement('button');more.id='diagramMore';
        const appendPage=()=>{more.remove();for(const request of planned.candidates.slice(shown,shown+6))appendRequest(request);shown=Math.min(planned.candidates.length,shown+6);
          if(shown<planned.candidates.length){more.textContent='更多详图（'+(planned.candidates.length-shown)+'）';box.append(more);}};
        more.onclick=appendPage;appendPage();
      }
    }
  }
  $('diagramBack').onclick=()=>{if(!state.paperDiagramReturn)return;snapshot();state=E.clone(state.paperDiagramReturn);selected=null;$('view').value=state.view;$('mode').value=state.mode;syncPaperControls();render();fit();persist();};
  function world(e){const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;return point.matrixTransform(svg.getScreenCTM().inverse());}
  function restorePreview(){
    if(!projection)return;
    for(const [id,g]of renderedNodes){const p=projection.positions.get(id);g.setAttribute('transform',`translate(${p.x},${p.y})`);}
    for(const e of displayedFigure?.prepared?.routes||projection.edges.map(e=>({...e,route:E.route(e,projection.positions)}))){
      const element=renderedEdges.get(e.id);if(!element)continue;const d=I.path(e.route.points);
      element.removeAttribute('transform');if(element.tagName==='g'){element.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));}else element.setAttribute('d',d);
    }
    document.getElementById('paperLabels')?.removeAttribute('visibility');
  }
  function move(){pendingFrame=0;if(!drag||!dragPoint)return;const point=dragPoint;if(drag.kind==='pan'){camera.x=drag.camera.x-(point.clientX-drag.client.x)*camera.w/svg.clientWidth;camera.y=drag.camera.y-(point.clientY-drag.client.y)*camera.h/svg.clientHeight;setCamera();return;}
    const started=performance.now(),p=world(point),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    if(Math.abs(dx)+Math.abs(dy)<1&&!drag.moved)return;const c=I.constrain(drag.session,dx,dy);svg.dataset.moveBlocked=String(!c.ok);if(!c.ok)return;
    if(!c.dx&&!c.dy&&!drag.moved)return;
    if(!drag.moved){snapshot();drag.moved=true;}
    drag.dx=c.dx;drag.dy=c.dy;drag.session.dx=c.dx;drag.session.dy=c.dy;
    for(const [id,old]of drag.session.origins)renderedNodes.get(id)?.setAttribute('transform',`translate(${old.x+c.dx},${old.y+c.dy})`);
    for(const e of drag.session.edges){const element=renderedEdges.get(e.id);if(!element)continue;
      if(drag.session.ids.has(e.source)&&drag.session.ids.has(e.target))element.setAttribute('transform',`translate(${c.dx},${c.dy})`);
      else {const d=I.path(I.previewRoute(e,drag.session,c.dx,c.dy));if(element.tagName==='g')element.querySelectorAll('path').forEach(p=>p.setAttribute('d',d));else element.setAttribute('d',d);}
    }
    // Labels of unaffected edges remain visible; labels of translated internal
    // routes move with their owner. External labels settle after routing.
    for(const label of drag.labels||[]){if(label.internal)label.element.setAttribute('transform',`translate(${c.dx},${c.dy})`);else label.element.setAttribute('visibility','hidden');}
    for(const marker of drag.markers||[]){if(marker.internal)marker.element.setAttribute('transform',`translate(${c.dx},${c.dy})`);else marker.element.setAttribute('visibility','hidden');}
    drag.samples.push(performance.now()-started);
  }
  svg.addEventListener('pointerdown',e=>{if(e.button===1){e.preventDefault();if(drag)return;drag={kind:'pan',client:{x:e.clientX,y:e.clientY},camera:{...camera},pointerId:e.pointerId,capture:svg};svg.setPointerCapture(e.pointerId);}});
  svg.addEventListener('pointermove',e=>{if(!drag)return;if(drag.kind==='node'&&!drag.labels){const edges=new Map(drag.session.edges.map(e=>[e.id,e]));drag.labels=[...document.querySelectorAll('#paperLabels [data-label-edge]')].filter(n=>edges.has(n.dataset.labelEdge)).map(element=>{const e=edges.get(element.dataset.labelEdge);return {element,internal:drag.session.ids.has(e.source)&&drag.session.ids.has(e.target)};});}
    if(drag.kind==='node'&&!drag.markers)drag.markers=[...document.querySelectorAll('#paperJunctions circle')].map(element=>({element,edges:JSON.parse(element.dataset.fanoutEdges)})).filter(m=>m.edges.some(id=>drag.session.edges.some(e=>e.id===id))).map(m=>({...m,internal:m.edges.every(id=>{const e=drag.session.edges.find(e=>e.id===id);return e&&drag.session.ids.has(e.source)&&drag.session.ids.has(e.target);})}));
    dragPoint={clientX:e.clientX,clientY:e.clientY};if(!pendingFrame)pendingFrame=requestAnimationFrame(move);});
  function release(gesture){if(gesture.capture?.hasPointerCapture(gesture.pointerId))gesture.capture.releasePointerCapture(gesture.pointerId);}
  function cleanLabels(gesture){for(const l of [...(gesture.labels||[]),...(gesture.markers||[])]){l.element.removeAttribute('transform');l.element.removeAttribute('visibility');}}
  function cancelDrag(){if(!drag)return;const gesture=drag;if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=0;drag=null;dragPoint=null;
    if(gesture.moved){state=gesture.beforeState;history=gesture.beforeHistory;future=gesture.beforeFuture;restorePreview();}cleanLabels(gesture);release(gesture);if(gesture.kind==='node')setBusy(false);svg.dataset.interactionPhase=busy?'settling':'idle';}
  function endDrag(e){if(!drag||e.pointerId!==drag.pointerId)return;dragPoint={clientX:e.clientX,clientY:e.clientY};if(pendingFrame)cancelAnimationFrame(pendingFrame);pendingFrame=0;move();
    const gesture=drag;drag=null;dragPoint=null;release(gesture);cleanLabels(gesture);
    if(gesture.kind==='node'&&gesture.moved){
      const samples=gesture.samples.sort((a,b)=>a-b);svg.dataset.dragProfile=JSON.stringify({count:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1)});
      if(!gesture.dx&&!gesture.dy){state=gesture.beforeState;history=gesture.beforeHistory;future=gesture.beforeFuture;restorePreview();setBusy(false);svg.dataset.interactionPhase='idle';return;}
      render({move:{id:gesture.id,dx:gesture.dx,dy:gesture.dy}});persist();
    }else {if(gesture.kind==='node')setBusy(false);svg.dataset.interactionPhase=busy?'settling':'idle';}
  }
  svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',cancelDrag);svg.addEventListener('lostpointercapture',()=>{if(drag)cancelDrag();});svg.addEventListener('auxclick',e=>e.preventDefault());
  window.addEventListener('blur',cancelDrag);document.addEventListener('keydown',e=>{if(e.key==='Escape')cancelDrag();});
  svg.addEventListener('wheel',e=>{e.preventDefault();const at=world(e),f=Math.exp(Math.max(-.4,Math.min(.4,e.deltaY*.001)));const w=Math.max(200,Math.min(100000,camera.w*f)),ratio=w/camera.w;camera={x:at.x-(at.x-camera.x)*ratio,y:at.y-(at.y-camera.y)*ratio,w,h:camera.h*ratio};setCamera();},{passive:false});
  $('collapse').onclick=()=>{snapshot();if(state.view==='publication'){state.paperAuto=false;$('paperAuto').checked=false;}state.open=[];render();fit();persist();};
  $('expand').onclick=()=>{snapshot();state.paperAuto=false;state.details=state.view!=='publication';$('detailsToggle').checked=state.details;$('paperAuto').checked=false;state=P.fullyExpanded(ir,state,E);syncPaperControls();render();fit();persist();};
  function optionalFold(){$('foldToggle').disabled=state.view==='source';$('detailsToggle').disabled=state.view==='publication';$('paperTools').hidden=state.view!=='publication';syncPaperControls();}
  $('foldToggle').onchange=()=>{snapshot();state.foldSerial=$('foldToggle').checked;state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  $('detailsToggle').onchange=()=>{snapshot();state.details=$('detailsToggle').checked;render();fit();persist();};
  $('view').onchange=()=>{snapshot();state.view=$('view').value;if(state.view==='publication')state.details=false;optionalFold();render();fit();persist();};
  $('relayout').onclick=()=>{snapshot();state.offsets={};delete state.canvasPlacement;render();fit();persist();};
  $('fit').onclick=fit;$('search').oninput=library;
  $('nodeFind').oninput=findNodes;
  $('nodeFind').onkeydown=e=>{if(e.key==='Escape'){$('nodeFind').value='';findNodes();}
    else if(e.key==='Enter'){const first=$('nodeFindResults').querySelector('button');if(first){e.preventDefault();locate(first.dataset.nodeTarget);}}};
  $('mode').onchange=()=>{snapshot();state.mode=$('mode').value;state.paperFocus=null;syncPaperControls();if(state.mode==='runtime'&&!state.open.includes('runtime-observations'))state.open.push('runtime-observations');render();fit();persist();};
  $('undo').onclick=()=>{if(!history.length)return;future.push(E.clone(state));state=history.pop();$('mode').value=state.mode;$('view').value=state.view||'architecture';$('detailsToggle').checked=!!state.details;$('foldToggle').checked=state.foldSerial!==false;optionalFold();render();fit();persist();};
  $('redo').onclick=()=>{if(!future.length)return;history.push(E.clone(state));state=future.pop();$('mode').value=state.mode;$('view').value=state.view||'architecture';$('detailsToggle').checked=!!state.details;$('foldToggle').checked=state.foldSerial!==false;optionalFold();render();fit();persist();};
  let exportUrl=null;
  function download(content,name,type){if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(new Blob([content],{type}));$('exportTitle').textContent=name;$('exportDownload').href=exportUrl;$('exportDownload').download=name;$('exportText').value=content;$('exportDialog').showModal();}
  $('exportClose').onclick=()=>$('exportDialog').close();
  $('save').onclick=()=>download(JSON.stringify({schema:'semantic-canvas/1',ir,state},null,2),ir.title+'-semantic.json','application/json');
  $('export').onclick=()=>{if(state.view==='publication'){download(R.renderPrepared(ir,state,displayedFigure).svg,ir.title+'-figure.svg','image/svg+xml');return;}const copy=svg.cloneNode(true);copy.setAttribute('xmlns',NS);copy.setAttribute('viewBox',`${projection.bounds.x} ${projection.bounds.y} ${projection.bounds.w} ${projection.bounds.h}`);copy.setAttribute('width',projection.bounds.w);copy.setAttribute('height',projection.bounds.h);const style=el('style',{},'.edge{fill:none;stroke-width:1.8}.edge.source{stroke:#6b89b8;stroke-dasharray:5 4}.edge.runtime{stroke:#288765}.edge.resource{stroke:#ac72a0}.edge.route-failed{stroke:#cf7930;stroke-dasharray:3 3}text{font-family:Arial,sans-serif}');copy.prepend(style);download(new XMLSerializer().serializeToString(copy),ir.title+'.svg','image/svg+xml');};
  $('import').onclick=()=>$('file').click();$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;const ticket=++loadRevision;try{if(file.size>20_000_000)throw Error('文件超过 20MB');const value=JSON.parse(await file.text());if(ticket!==loadRevision)return;await open(['semantic-canvas/1','archcanvas-architecture-document/1'].includes(value.schema)?value.ir:value,value.state);if(ticket===loadRevision)$('irLink').hidden=true;}catch(error){message(error.message);}finally{$('file').value='';}};
  Promise.all([fetch('../data/semantic/catalog.json',{cache:'no-store'}).then(r=>r.json()),fetch('../data/semantic/source-inventory.json',{cache:'no-store'}).then(r=>r.json())]).then(([data,inventory])=>{catalog=data.models;$('inventory').textContent=`已只读扫描 ${inventory.files.length} 个文件，发现 ${inventory.models.length} 个模型候选。Awesome 列表登记 ${inventory.github_links.length} 个 GitHub 来源链接，尚未下载。Notebook 仅静态解析。`;library();const id=new URLSearchParams(location.search).get('model');loadModel(profiles.defaultModel(data,id));}).catch(error=>message('读取失败：'+error.message));
})();

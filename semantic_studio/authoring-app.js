(function(){
  'use strict';
  const $=id=>document.getElementById(id),A=window.SemanticAuthoring,E=window.SemanticEngine,R=window.SemanticPublicationRenderer,I=window.SemanticCanvasInteraction;
  const NS='http://www.w3.org/2000/svg',svg=$('canvas'),scene=window.SemanticSceneClient.create(),storage=window.SemanticStateStorage.create();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!=null)n.textContent=text;return n;};
  let viewBefore=null,recipeLimit=80;
  let doc=A.empty(),presets=[],catalog=[],reference=null,sourceReference=null,selected=new Set(),selectedEdge=null,scope=null,figure=null,ir=null,sceneKey=null,history=[],future=[],busy=false,revision=0,connection=null,sourceEdit=null,nameAction=null,initialized=false,exportUrl=null;
  const disabledBefore=new Map();
  let camera={x:0,y:0,w:1000,h:600},gesture=null,frame=0,lastPointer=null,storedKey='semantic-authoring:workspace:1',persistTimer=0;
  const status=(text,bad=false)=>{$('status').textContent=text;$('status').classList.toggle('bad',bad);};
  function setBusy(value){busy=value;if(value){for(const button of document.querySelectorAll('button,select,input,textarea'))if(!button.closest('dialog')&&button.id!=='fit'){if(!disabledBefore.has(button))disabledBefore.set(button,button.disabled);button.disabled=true;}}else{for(const [button,disabled]of disabledBefore)if(button.isConnected)button.disabled=disabled;disabledBefore.clear();}updateHistory();}
  function updateHistory(){$('undo').disabled=busy||!history.length;$('redo').disabled=busy||!future.length;}
  function saveLocal(){doc.editorScope=scope;clearTimeout(persistTimer);persistTimer=setTimeout(()=>storage.write(storedKey,JSON.stringify(doc)).catch(()=>status('自动保存失败，请保存编辑文档到文件。',true)),200);}
  function snapshot(){history.push(A.copy(doc));if(history.length>12)history.shift();future=[];}
  async function change(action,message){if(busy)return;const before=A.copy(doc);try{action();A.validate(doc);snapshotFrom(before);doc.serial++;selectedEdge=null;await render();saveLocal();if(message)status(message);return true;}catch(error){doc=before;status(error.message,true);return false;}}
  function snapshotFrom(before){history.push(before);while(history.length>12||history.length>1&&history.reduce((sum,d)=>sum+d.nodes.length,0)>24000)history.shift();future=[];updateHistory();}
  function viewState(){const ids=new Set(doc.open),by=new Map(ir.nodes.map(n=>[n.id,n]));for(const n of ir.nodes.filter(n=>!n.parent))if(n.kind==='composite')ids.add(n.id);let at=scope;while(at){ids.add(at);at=by.get(at)?.parent;}return {view:'publication',mode:'merged',paperCanonical:true,paperMedium:'canvas',paperComposition:'dependency',paperGranularity:'detailed',paperAuto:false,details:true,open:[...ids],offsets:doc.offsets};}
  async function render({fit=true,reinit=true}={}){
    const ticket=++revision;setBusy(true);status('正在更新编辑画布…');try{
      ir=A.sourceIR(doc);if(reinit)scene.init(ir);
      const result=await scene.request({task:'render',state:viewState()});if(ticket!==revision||result.stale)return;if(!result.ok)throw Error(result.error);
      window.SemanticSceneRuntime.unpack(result);figure=result.figure;sceneKey=result.key;
      draw();refreshLibrary();refreshInspector();refreshWires();
      $('modelTitle').value=doc.title;$('counts').textContent=`${doc.nodes.length} 原始单位 · ${doc.edges.length} 连接`;$('empty').hidden=doc.nodes.length>0;
      $('breadcrumb').textContent=scope?doc.nodes.find(n=>n.id===scope)?.label||doc.title:doc.title;
      if(fit)fitAll();status(`已更新 · ${Math.round(result.metrics.compute_ms)} ms${figure.prepared?.quality.route_failures.length?' · 存在待调整路径':''}`);
      svg.dataset.nodes=String(doc.nodes.length);svg.dataset.edges=String(doc.edges.length);svg.dataset.computeMs=String(result.metrics.compute_ms);svg.dataset.execution=result.execution;
    }catch(error){status('更新失败：'+error.message,true);throw error;}finally{if(ticket===revision)setBusy(false);}
  }
  function fitAll(){if(!figure)return;const boxes=figure.graph.nodes.filter(n=>doc.nodes.some(x=>x.id===n.id)).map(n=>figure.graph.positions.get(n.id)),bound=figure.prepared?.bounds||figure.graph.bounds,b=boxes.length?{x:Math.min(...boxes.map(p=>p.x)),y:Math.min(...boxes.map(p=>p.y)),w:Math.max(...boxes.map(p=>p.x+p.w))-Math.min(...boxes.map(p=>p.x)),h:Math.max(...boxes.map(p=>p.y+p.h))-Math.min(...boxes.map(p=>p.y))}:bound,w=$('stage').clientWidth,h=$('stage').clientHeight,r=w/Math.max(1,h),width=Math.max(400,b.w+80),height=Math.max(240,b.h+80);camera=width/height>r?{x:b.x-40,y:b.y-(width/r-b.h)/2,w:width,h:width/r}:{x:b.x-(height*r-b.w)/2,y:b.y-40,w:height*r,h:height};setCamera();}
  function setCamera(){svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);}
  const world=e=>{const b=svg.getBoundingClientRect();return {x:camera.x+(e.clientX-b.left)/b.width*camera.w,y:camera.y+(e.clientY-b.top)/b.height*camera.h};};
  function currentNodes(){return doc.nodes.filter(n=>n.parent===scope||(!scope&&!n.parent));}
  function choose(id,extend=false){if(!extend)selected.clear();if(extend&&selected.has(id))selected.delete(id);else selected.add(id);selectedEdge=null;for(const n of svg.querySelectorAll('[data-edit-node]'))n.classList.toggle('selected',selected.has(n.dataset.editNode));refreshInspector();}
  function routeRows(){return figure.prepared?.routes||[];}
  function draw(){
    $('drawing').replaceChildren();$('handles').replaceChildren();const layers={frames:el('g'),edges:el('g'),nodes:el('g')};$('drawing').append(layers.frames,layers.edges,layers.nodes);const g=figure.graph,drawn=new Map();
    for(const e of routeRows()){
      const group=el('g',{'data-edit-edge':e.id}),d=e.route.points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),path=el('path',{d,class:'edit-edge'+(e.route.ok?'':' failed')+(selectedEdge===e.id?' selected':'')});group.append(path,el('path',{d,class:'edge-hit'}));group.addEventListener('click',event=>{event.stopPropagation();selectedEdge=e.id;selected.clear();draw();refreshInspector();});layers.edges.append(group);
    }
    for(const n of E.drawingOrder(g.nodes,g.idx)){
      if(!doc.nodes.some(x=>x.id===n.id))continue;const p=g.positions.get(n.id),node=el('g',{'data-edit-node':n.id,class:'edit-node'+(selected.has(n.id)?' selected':''),transform:`translate(${p.x},${p.y})`});
      node.innerHTML=R.nodeBody(n,p);node.append(el('title',{},n.label));
      node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',n.label+' · 选择模块');node.addEventListener('click',event=>event.stopPropagation());node.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();choose(n.id,event.shiftKey);}if(event.key==='ArrowRight'&&doc.nodes.some(c=>c.parent===n.id))enter(n.id);});
      node.addEventListener('dblclick',event=>{event.stopPropagation();if(doc.nodes.some(c=>c.parent===n.id))enter(n.id);});
      node.addEventListener('pointerdown',event=>startDrag(event,n.id));drawn.set(n.id,node);
      (p.expanded?layers.frames:layers.nodes).append(node);
      if(doc.nodes.some(c=>c.parent===n.id)){const control=el('text',{x:p.w-22,y:25,'font-size':18,style:'pointer-events:auto;cursor:pointer'},p.expanded?'−':'+');control.addEventListener('pointerdown',event=>event.stopPropagation());control.addEventListener('click',event=>{event.stopPropagation();toggle(n.id);});node.append(control);}
    }
    const candidates=currentNodes().filter(n=>g.positions.has(n.id));
    for(const n of candidates){const p=g.positions.get(n.id);if(p.expanded)continue;const ports=A.ports(doc,n.id);
      for(const direction of ['inputs','outputs'])ports[direction].forEach((port,index)=>{
        const output=direction==='outputs',edge=routeRows().find(e=>(e.bundle_members||[e]).some(m=>output?(m.canonical_source||m.source)===port.node&&String(m.source_port)===port.port:(m.canonical_target||m.target)===port.node&&String(m.target_port)===port.port));
        const point=edge?(output?edge.route.points[0]:edge.route.points.at(-1)):{x:output?p.x+p.w:p.x,y:p.y+Math.min(p.h-12,40+(index+1)*(Math.max(12,p.h-50)/(ports[direction].length+1)))};
        const handle=el('circle',{cx:point.x,cy:point.y,r:7,class:'port '+(output?'output':'input')+(connection?.node===port.node&&connection.port===port.port?' pending':''),'data-port-node':port.node,'data-port':port.port,'data-direction':output?'output':'input',tabindex:0,role:'button','aria-label':n.label+' '+(output?'输出 ':'输入 ')+port.label});
        handle.append(el('title',{},(output?'输出 ':'输入 ')+port.label));handle.addEventListener('pointerdown',event=>event.stopPropagation());
        const action=()=>{if(busy)return;if(output){connection=port;status('已选输出 '+port.label+'，请点击输入端口');draw();}else if(connection){const from=connection;change(()=>{A.connect(doc,from,port,{replace:$('replaceWire').checked});connection=null;},'连接已建立');}else status('请先选择输出端口');};
        handle.addEventListener('click',action);handle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}});$('handles').append(handle);
      });
    }
  }
  async function enter(id){if(busy)return;scope=id;doc.open=[...new Set([...doc.open,id])];selected.clear();await render();saveLocal();}
  function toggle(id){change(()=>{if(doc.open.includes(id)){doc.open=doc.open.filter(x=>x!==id);if(scope===id)scope=doc.nodes.find(n=>n.id===id)?.parent||null;}else doc.open.push(id);});}
  function startDrag(event,id){if(event.button!==0||busy)return;event.stopPropagation();const s=I.session(figure,id);if(!s)return;const node=event.currentTarget;gesture={kind:'node',id,session:s,start:world(event),dx:0,dy:0,moved:false,pointerId:event.pointerId,capture:node};node.setPointerCapture(event.pointerId);}
  function dragFrame(){frame=0;if(!gesture||!lastPointer)return;const e=lastPointer;if(gesture.kind==='pan'){const b=svg.getBoundingClientRect();camera={...gesture.camera,x:gesture.camera.x-(e.clientX-gesture.clientX)/b.width*camera.w,y:gesture.camera.y-(e.clientY-gesture.clientY)/b.height*camera.h};setCamera();return;}
    const p=world(e),check=I.constrain(gesture.session,p.x-gesture.start.x,p.y-gesture.start.y);if(!check.ok){svg.dataset.moveBlocked=check.reason;return;}gesture.dx=check.dx;gesture.dy=check.dy;gesture.moved=Math.abs(check.dx)+Math.abs(check.dy)>2;
    for(const element of svg.querySelectorAll('[data-edit-node]'))if(gesture.session.ids.has(element.dataset.editNode)){const o=gesture.session.origins.get(element.dataset.editNode);element.setAttribute('transform',`translate(${o.x+check.dx},${o.y+check.dy})`);}
    for(const element of svg.querySelectorAll('[data-edit-edge]')){const edge=gesture.session.edges.find(e=>e.id===element.dataset.editEdge);if(edge){const points=I.previewRoute(edge,gesture.session,check.dx,check.dy),d=points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');for(const path of element.children)path.setAttribute('d',d);}}
    $('handles').setAttribute('visibility','hidden');
  }
  svg.addEventListener('pointerdown',event=>{if(event.button===1||event.button===0&&event.target===svg){event.preventDefault();gesture={kind:'pan',camera:{...camera},clientX:event.clientX,clientY:event.clientY,pointerId:event.pointerId,capture:svg};svg.setPointerCapture(event.pointerId);}});
  svg.addEventListener('pointermove',event=>{if(!gesture)return;lastPointer={clientX:event.clientX,clientY:event.clientY};if(!frame)frame=requestAnimationFrame(dragFrame);});
  svg.addEventListener('pointerup',async event=>{if(!gesture||event.pointerId!==gesture.pointerId)return;if(frame)cancelAnimationFrame(frame);frame=0;lastPointer=event;dragFrame();const move=gesture;gesture=null;lastPointer=null;$('handles').removeAttribute('visibility');if(move.capture.hasPointerCapture(event.pointerId))move.capture.releasePointerCapture(event.pointerId);
    if(move.kind==='node'&&move.moved){setBusy(true);const before=A.copy(doc);try{const result=await scene.request({task:'move',baseKey:sceneKey,id:move.id,dx:move.dx,dy:move.dy});if(!result.ok)throw Error(result.error);window.SemanticSceneRuntime.unpack(result);figure=result.figure;sceneKey=result.key;doc.offsets=A.copy(result.state.offsets||{});snapshotFrom(before);draw();saveLocal();status('位置与路径已校验');}catch(error){draw();status('移动已恢复：'+error.message,true);}finally{setBusy(false);}}else if(move.kind==='node')choose(move.id,event.shiftKey);});
  function cancelDrag(){if(frame)cancelAnimationFrame(frame);frame=0;const old=gesture;gesture=null;lastPointer=null;if(old?.capture.hasPointerCapture(old.pointerId))old.capture.releasePointerCapture(old.pointerId);$('handles').removeAttribute('visibility');if(figure)draw();}
  svg.addEventListener('pointercancel',cancelDrag);window.addEventListener('blur',()=>{if(gesture)cancelDrag();});
  svg.addEventListener('wheel',event=>{event.preventDefault();const p=world(event),f=Math.exp(Math.max(-.3,Math.min(.3,event.deltaY*.001)));camera={x:p.x-(p.x-camera.x)*f,y:p.y-(p.y-camera.y)*f,w:Math.max(100,Math.min(200000,camera.w*f)),h:camera.h*f};setCamera();},{passive:false});
  function moduleButton(module,target,action){const b=document.createElement('button');b.className='module';b.innerHTML=`<strong>${esc(module.title)}</strong><small>${module.ir.nodes.length} 源码单位 · ${module.ir.edges.length} 内部连接</small>`;b.onclick=action||(()=>addModule(module));target.append(b);}
  function addModule(module){change(()=>{const inserted=A.add(doc,module,{parent:scope});selected=new Set(inserted.roots);doc.offsets={};},'已加入 '+module.title);}
  function refreshLibrary(){
    const q=$('search').value.trim().toLowerCase();for(const id of ['presets','atoms','customList','sourceParts','sourceAtoms'])$(id).replaceChildren();
    for(const module of presets.filter(m=>m.title.toLowerCase().includes(q)))moduleButton(module,$(module.level==='atomic'?'atoms':'presets'));
    for(const module of doc.library.filter(m=>m.title.toLowerCase().includes(q)))moduleButton(module,$('customList'));
    if(sourceReference){const by=new Map(sourceReference.nodes.map(n=>[n.id,n]));const rows=sourceReference.nodes.filter(n=>n.kind==='composite'&&n.parent&&(q?n.label.toLowerCase().includes(q):n.parent===(sourceReference.nodes.some(x=>x.id===scope)?scope:sourceReference.nodes.find(x=>!x.parent)?.id)));
      for(const n of rows.slice(0,100))moduleButton(A.fragment(sourceReference,[n.id],n.label),$('sourceParts'));
      // Atomic library is opt-in. Exact source nodes, including state/control,
      // are available rather than an invented finite set of tensor operators.
      const atoms=sourceReference.nodes.filter(n=>n.kind!=='composite'&&(q?[n.label,n.operator,n.kind].join(' ').toLowerCase().includes(q):true));
      for(const n of atoms.slice(0,80))moduleButton(A.fragment(sourceReference,[n.id],n.label+' · '+n.kind),$('sourceAtoms'));
      if(atoms.length>80){const p=document.createElement('p');p.textContent=`共 ${atoms.length} 个原始单元，输入名称或算子缩小范围。`; $('sourceAtoms').append(p);}
    }
    refreshRecipe();
  }
  function refreshRecipe(){const box=$('recipeParts');box.replaceChildren();if(!reference)return;
    const query=$('recipeSearch').value.trim().toLowerCase(),parts=reference.parts.filter(p=>!query||p.title.toLowerCase().includes(query));for(const module of parts.slice(0,recipeLimit))moduleButton(module,box,()=>change(()=>{A.add(doc,module,{keepIdentity:true});doc.offsets={};},'已加入参考构件'));
    const remaining=reference.connections.filter(e=>!doc.edges.some(x=>x.id===e.id));$('recipeStatus').textContent=`${reference.parts.length} 个源码构件；${remaining.length} 条参考跨构件连接待加入。构件可逐个编辑、展开与组合。`;
  }
  function refreshInspector(){
    const box=$('inspector');box.replaceChildren();$('mapping').textContent='';
    if(selectedEdge){const edge=doc.edges.find(e=>e.id===selectedEdge);if(!edge){box.textContent='此可见线代表折叠内部依赖，请展开端点后编辑具体连接。';return;}
      box.innerHTML=`<p>连接 <code>${esc(edge.id)}</code></p><pre>${esc(JSON.stringify(edge,null,2))}</pre><button id="removeEdge">删除连接</button><p>在下方选择新端口后点击“重新连接”。</p><button id="rewire">重新连接</button>`;
      $('removeEdge').onclick=()=>change(()=>{doc.edges=doc.edges.filter(e=>e.id!==selectedEdge);selectedEdge=null;},'连接已删除');$('rewire').onclick=()=>{const from=readPort('wireOutput'),to=readPort('wireInput');change(()=>{const id=selectedEdge;doc.edges=doc.edges.filter(e=>e.id!==id);A.connect(doc,from,to,{replace:$('replaceWire').checked});},'连接已更新');};return;
    }
    const nodes=[...selected].map(id=>doc.nodes.find(n=>n.id===id)).filter(Boolean);if(!nodes.length){box.textContent='选择模块以调整名称、参数、源码与连接。';return;}
    if(nodes.length>1){box.innerHTML=`<p>已选 ${nodes.length} 个节点，可组合为模块。</p>`;return;}
    const n=nodes[0],module=doc.modules[n.id];box.innerHTML=`<label>模块名称<input id="nodeLabel" aria-label="模块名称" value="${esc(n.label)}"></label><button id="rename">应用名称</button><div class="row"><button id="enter">进入内部</button><button id="editSource">编辑模块源码</button></div><p>${esc(n.kind)}${n.operator?' · '+esc(n.operator):''}</p><div id="parameterFields"></div><details><summary>原始字段（JSON）</summary><label>参数字段<textarea id="rawFields" aria-label="参数字段" rows="5">${esc(JSON.stringify({constructor:n.constructor||{},arguments:n.arguments||{}},null,2))}</textarea></label><button id="applyRaw">应用参数字段</button></details>`;
    $('rename').onclick=()=>change(()=>{n.label=$('nodeLabel').value.trim()||n.label;if(module)module.title=n.label;},'名称已更新');$('enter').disabled=!doc.nodes.some(c=>c.parent===n.id);$('enter').onclick=()=>enter(n.id);
    $('editSource').onclick=()=>openSource(module?.source?module:null,n.id);
    $('applyRaw').onclick=()=>change(()=>{const fields=JSON.parse($('rawFields').value);if(!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('参数字段必须是对象');A.editNode(doc,n.id,{constructor:fields.constructor||{},arguments:fields.arguments||{}});},'参数已记录为编辑草稿，未声称源码已经修改');
    if(module?.source){
      for(const [key,value]of Object.entries(module.constructor||{})){const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.dataset.parameter=key;input.setAttribute('aria-label','参数 '+key);if(typeof value==='boolean'){input.type='checkbox';input.checked=value;}else{input.type=typeof value==='number'?'number':'text';input.value=typeof value==='object'?JSON.stringify(value):String(value);if(input.type==='number')input.step='any';}label.append(input);$('parameterFields').append(label);}
      const button=document.createElement('button');button.textContent='重新解析并应用参数';button.onclick=async()=>{try{const params={...module.constructor};for(const input of $('parameterFields').querySelectorAll('[data-parameter]'))params[input.dataset.parameter]=A.parameterValue(input.type==='checkbox'?input.checked:input.value,params[input.dataset.parameter]);await compileAndApply({...module,constructor:params},n.id);}catch(error){status('参数无效：'+error.message,true);}};$('parameterFields').append(button);
    }else if(n.constructor?.args?.length||Object.keys(n.constructor?.kwargs||{}).length){
      const names=({linear:['in_features','out_features','bias'],convolution:['in_channels','out_channels','kernel_size','stride','padding'],normalization:['normalized_shape','eps'],embedding:['num_embeddings','embedding_dim']})[n.operator]||[];
      for(const [i,value]of (n.constructor.args||[]).entries()){const label=document.createElement('label');label.textContent=names[i]||'参数 '+i;const input=document.createElement('input');input.dataset.constructorSlot=String(i);input.setAttribute('aria-label',names[i]||'参数 '+i);input.value=JSON.stringify(value);label.append(input);$('parameterFields').append(label);}
      for(const [key,value]of Object.entries(n.constructor.kwargs||{})){const label=document.createElement('label');label.textContent=key;const input=document.createElement('input');input.dataset.constructorKey=key;input.setAttribute('aria-label',key);input.value=JSON.stringify(value);label.append(input);$('parameterFields').append(label);}
      const apply=document.createElement('button');apply.textContent='应用算子参数';apply.onclick=()=>change(()=>{const ctor=A.copy(n.constructor);for(const input of $('parameterFields').querySelectorAll('[data-constructor-slot]'))ctor.args[Number(input.dataset.constructorSlot)]=JSON.parse(input.value);for(const input of $('parameterFields').querySelectorAll('[data-constructor-key]'))ctor.kwargs[input.dataset.constructorKey]=JSON.parse(input.value);A.editNode(doc,n.id,{constructor:ctor});},'原子算子配置已更新，原始来源仍保留');$('parameterFields').append(apply);

      // Framework leaves are still the actual atomic framework operation. Show
      // common constructor slots as fields without replacing their IR identity.
      const label=document.createElement('p');label.textContent='此原始算子的配置可在参数字段中调整；源码实现可通过“编辑模块源码”替换。';$('parameterFields').append(label);
    }
    $('mapping').textContent=JSON.stringify({id:n.id,source_parent:n.source_parent,source:n.source,operator:n.operator,source_provenance:n.source_provenance,inputs:doc.edges.filter(e=>e.target===n.id),outputs:doc.edges.filter(e=>e.source===n.id)},null,2);
  }
  function fillOptions(select,rows,previous){select.replaceChildren();for(const row of rows){const option=document.createElement('option');option.value=row.value;option.textContent=row.label;select.append(option);}if(rows.some(r=>r.value===previous))select.value=previous;}
  function refreshWires(){const rows=currentNodes().map(n=>({value:n.id,label:n.label+' · '+n.kind}));fillOptions($('wireSource'),rows,$('wireSource').value);fillOptions($('wireTarget'),rows,$('wireTarget').value);refreshPortSelects();}
  function refreshPortSelects(){for(const [nodeId,portId,direction]of [['wireSource','wireOutput','outputs'],['wireTarget','wireInput','inputs']]){const id=$(nodeId).value,rows=id?A.ports(doc,id)[direction]:[];fillOptions($(portId),rows.map(p=>({value:JSON.stringify(p),label:p.label+' ['+p.port+']'})),$(portId).value);}}
  function readPort(id){if(!$(id).value)throw Error('没有可用端口，请先选择模块');return JSON.parse($(id).value);}
  $('wireSource').onchange=refreshPortSelects;$('wireTarget').onchange=refreshPortSelects;
  $('connect').onclick=()=>{try{const from=readPort('wireOutput'),to=readPort('wireInput');change(()=>A.connect(doc,from,to,{replace:$('replaceWire').checked}),'连接已建立');}catch(error){status(error.message,true);}};
  $('cancelWire').onclick=()=>{connection=null;draw();status('连接选择已取消');};
  function openSource(module,id=null){sourceEdit=id;$('sourceTitle').value=module?.title||'自定义模块';$('sourceEntry').value=module?.entry||'CustomBlock';$('sourceParams').value=JSON.stringify(module?.constructor||{},null,2);if(module?.source)$('sourceText').value=module.source;$('sourceStatus').textContent=id?'将替换选中模块的实现，并按同名接口保留连接。':'';$('sourceDialog').showModal();}
  async function apiRequest(operation,payload){
    const body=JSON.stringify(payload);let response;
    try{response=await fetch('/api/authoring/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body});if(response.status===404||response.status===501)response=null;}catch(_){}
    if(!response)try{response=await fetch('http://127.0.0.1:8767/api/authoring/'+operation,{method:'POST',headers:{'Content-Type':'application/json'},body});}catch(_){throw Error('源码解析服务未启动。请运行 python3 tools/serve_semantic_studio.py，再重试。');}
    const value=await response.json();if(!value.ok)throw Error(value.error||'解析失败');return value;
  }
  async function compile(module){const value=await apiRequest('compile',{source:module.source,entry:module.entry,constructor:module.constructor});return {...value.module,title:module.title||value.module.title};}
  async function compileAndApply(module,id){if(busy)return;setBusy(true);status('正在从源码重新提取模块…');try{const next=await compile(module);setBusy(false);await change(()=>{const root=A.replaceModule(doc,id,next);selected=new Set([root]);if(scope===id)scope=root;doc.offsets={};},'源码与参数已更新，连接已按接口恢复');}catch(error){status(error.message,true);}finally{setBusy(false);}}
  $('custom').onclick=()=>openSource(null);$('sourceClose').onclick=()=>$('sourceDialog').close();
  $('compile').onclick=async()=>{if(busy)return;$('compile').disabled=true;setBusy(true);try{const module=await compile({title:$('sourceTitle').value,entry:$('sourceEntry').value,source:$('sourceText').value,constructor:JSON.parse($('sourceParams').value)});setBusy(false);if(sourceEdit){const id=sourceEdit;const ok=await change(()=>{const root=A.replaceModule(doc,id,module);selected=new Set([root]);if(scope===id)scope=root;doc.offsets={};},'源码模块已替换');if(!ok)throw Error('替换未完成，请检查已连接接口与新源码是否兼容。');}else await change(()=>doc.library.push(module),'源码模块已保存到我的模块库');$('sourceDialog').close();}catch(error){$('sourceStatus').textContent=error.message;}finally{$('compile').disabled=false;setBusy(false);}};
  $('addInput').onclick=()=>change(()=>{selected=new Set([A.addInterface(doc,'input','input',scope)]);},'已加入输入接口');$('addOutput').onclick=()=>change(()=>{selected=new Set([A.addInterface(doc,'output','output',scope)]);},'已加入输出接口');
  $('search').oninput=refreshLibrary;$('recipeSearch').oninput=()=>{recipeLimit=80;refreshRecipe();};$('recipeMore').onclick=()=>{recipeLimit+=80;refreshRecipe();};
  $('up').onclick=async()=>{if(busy)return;scope=doc.nodes.find(n=>n.id===scope)?.parent||null;await render();saveLocal();};
  $('delete').onclick=()=>change(()=>{if(selectedEdge){doc.edges=doc.edges.filter(e=>e.id!==selectedEdge);selectedEdge=null;}else{const gone=A.erase(doc,[...selected]);if(gone.has(scope))scope=null;selected.clear();}doc.offsets={};},'所选内容已删除，可撤销');
  $('duplicate').onclick=()=>{if(!selected.size)return status('请先选择模块');const module=A.template(doc,[...selected],'副本');addModule(module);};
  function askName(title,action){nameAction=action;$('nameTitle').textContent=title;$('nameValue').value='自定义组合';$('nameDialog').showModal();}
  $('group').onclick=()=>askName('将所选原始节点组合为模块',title=>change(()=>{const id=A.group(doc,[...selected],title);selected=new Set([id]);doc.offsets={};},'组合已建立，可逐级展开'));
  $('saveModule').onclick=()=>askName('保存可复用模块',title=>change(()=>{if(!selected.size)throw Error('请选择模块');doc.library.push(A.template(doc,[...selected],title));},'已保存到我的组合模块'));
  $('nameApply').onclick=()=>{const action=nameAction,title=$('nameValue').value.trim();if(!title)return; $('nameDialog').close();action(title);};$('nameClose').onclick=()=>$('nameDialog').close();
  $('new').onclick=()=>change(()=>{const library=doc.library;doc=A.empty();doc.library=library;scope=null;selected.clear();},'已新建空白模型，原内容可撤销');
  $('undo').onclick=async()=>{if(busy||!history.length)return;future.push(A.copy(doc));doc=history.pop();scope=null;selected.clear();await render();saveLocal();};
  $('redo').onclick=async()=>{if(busy||!future.length)return;history.push(A.copy(doc));doc=future.pop();scope=null;selected.clear();await render();saveLocal();};
  $('layout').onclick=()=>change(()=>{doc.offsets={};},'已自动排布');$('fit').onclick=fitAll;$('modelTitle').onchange=()=>change(()=>{doc.title=$('modelTitle').value.trim()||doc.title;},'模型名称已更新');
  $('loadRecipe').onclick=async()=>{try{const model=catalog.find(m=>m.id===$('reference').value);const response=await fetch('../data/semantic/'+model.ir);if(!response.ok)throw Error('读取失败');const value=await response.json();reference=A.recipe(value,{atomic:$('recipeLevel').value==='atomic'});sourceReference=value;refreshLibrary();status('已读取构件清单；可在空白模型逐个加入并恢复连接。');}catch(error){status(error.message,true);}};
  $('recipeBlank').onclick=()=>{if(!reference)return status('请先读取构件清单');change(()=>{const library=doc.library;doc=A.empty(reference.title);doc.library=library;doc.recipe={parents:reference.parents,baseline:reference.baseline};scope=null;selected.clear();},'空白搭建已开始，请逐个加入构件');};
  $('recipeWires').onclick=()=>change(()=>{if(!reference)throw Error('请先读取构件');let count=0;const ids=new Set(doc.nodes.map(n=>n.id));for(const e of reference.connections)if(ids.has(e.source)&&ids.has(e.target)&&!doc.edges.some(x=>x.id===e.id)){A.restoreConnection(doc,e);count++;}if(!count)throw Error('没有可恢复连接，请加入更多端点构件');},'已恢复现有端点的精确参考连接');
  function showText(title,text){if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(new Blob([text],{type:'application/json'}));$('textTitle').textContent=title;$('documentText').value=text;$('download').href=exportUrl;$('download').download=doc.title+'-edit.json';$('textDialog').showModal();}
  $('save').onclick=()=>{A.validate(doc);showText('保存编辑文档',JSON.stringify(doc,null,2));saveLocal();};$('textClose').onclick=()=>$('textDialog').close();
  async function importDocument(value){const next=value.schema===A.schema?value:A.fromIR(value.ir||value);A.validate(next);await change(()=>{doc=next;scope=next.editorScope||null;selected.clear();sourceReference=next.baseline||next.recipe?.baseline||null;},'编辑文档已导入');}
  $('readText').onclick=async()=>{try{await importDocument(JSON.parse($('documentText').value));$('textDialog').close();}catch(error){status(error.message,true);}};
  $('import').onclick=()=>$('file').click();$('file').onchange=async()=>{try{const file=$('file').files[0];if(!file)return;if(file.size>30_000_000)throw Error('文档超过 30MB');await importDocument(JSON.parse(await file.text()));}catch(error){status(error.message,true);}finally{$('file').value='';}};
  async function preview(){if(busy)return;setBusy(true);try{A.validate(doc);let value=A.sourceIR(doc);if(value.authoring?.edited){status('正在复核组合后的局部语义…');try{value=(await apiRequest('certify',{ir:value})).ir;}catch(error){status('局部认证不可用，保留未认证的预览：'+error.message,true);}}const unchanged=(doc.baseline||doc.recipe?.baseline)?.ir_digest===value.ir_digest,state=unchanged&&viewBefore?A.copy(viewBefore):window.SemanticCompositionLayout.frontier({mode:'merged'},'detail');if(!unchanged){state.paperAuto=true;state.paperDirection='up';}
    doc.editorScope=scope;const payload={type:'semantic-authoring-preview',document:A.copy(doc),ir:value,state};
    if(parent!==window)parent.postMessage(payload,location.origin);else{await storage.write('semantic-authoring-preview-pending',JSON.stringify(payload));location.href='index.html?authoring=preview';}saveLocal();}catch(error){status(error.message,true);}finally{setBusy(false);}}
  $('preview').onclick=preview;
  document.addEventListener('keydown',event=>{if(event.target.matches('input,textarea,select'))return;if(event.key==='Escape'){cancelDrag();connection=null;selected.clear();draw();refreshInspector();}else if(event.key==='Delete')$('delete').click();else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();$(event.shiftKey?'redo':'undo').click();}});
  window.addEventListener('message',async event=>{if(event.origin!==location.origin||event.source!==parent)return;const p=event.data;if(p.type==='semantic-authoring-open'){try{viewBefore=p.state||null;const returning=!!p.document&&initialized;if(p.document){A.validate(p.document);doc=A.copy(p.document);sourceReference=doc.baseline||doc.recipe?.baseline||null;scope=Object.hasOwn(doc,'editorScope')?doc.editorScope:doc.nodes.find(n=>!n.parent&&n.kind==='composite')?.id||null;}else if(p.ir){doc=A.fromIR(p.ir);sourceReference=p.ir;scope=p.ir.nodes.find(n=>!n.parent&&n.kind==='composite')?.id||null;}if(!returning){history=[];future=[];}selected.clear();await render();initialized=true;saveLocal();}catch(error){status(error.message,true);}}else if(p.type==='semantic-authoring-request-preview')preview();});
  Promise.all([fetch('../data/semantic/authoring-presets.json').then(r=>r.json()),fetch('../data/semantic/catalog.json').then(r=>r.json())]).then(async([library,data])=>{presets=library.modules;catalog=data.models;fillOptions($('reference'),catalog.map(m=>({value:m.id,label:m.title})));refreshLibrary();if(parent!==window)parent.postMessage({type:'semantic-authoring-ready'},location.origin);else{const saved=await storage.read(storedKey);if(saved){A.validate(saved);doc=saved;scope=doc.editorScope||null;}await render();initialized=true;}}).catch(error=>status(error.message,true));
})();

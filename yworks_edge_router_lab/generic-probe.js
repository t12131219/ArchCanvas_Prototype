/* Explicit CPU supplementation. No inferred inputs or automatic execution. */
(function(root){
  'use strict';
  function defaults(ir){return {
    source:ir.entry.file,entry:ir.entry.class,
    sourceRoot:ir.analysis?.project_root||ir.entry.file.replace(/\/[^/]+$/,''),
    spec:{schema:'semantic-inputs/1',constructor:ir.entry.constructor||{},modes:['eval'],cases:[{id:'sample-1',inputs:{}}]}
  };}
  function request(ir,interpreter,sourceRoot,text,timeout){
    const spec=JSON.parse(text);
    if(!interpreter.trim()||!sourceRoot.trim())throw Error('请填写 Python 解释器和源码根目录');
    if(!spec||spec.schema!=='semantic-inputs/1'||!Array.isArray(spec.cases)||!spec.cases.length||spec.cases.some(c=>!c.inputs||!Object.keys(c.inputs).length))throw Error('请提供至少一个有效输入样例；不会自动猜测输入');
    return {execute:true,ir,interpreter:interpreter.trim(),source_root:sourceRoot.trim(),spec,timeout:Number(timeout)};
  }
  function resultText(value){
    const s=value.summary,associated=s.boundaries.filter(b=>b.observations.length).length;
    const integrated=value.ir?.source_runtime_index?.regions?.length||0;
    return `可衔接的调用记录：${integrated} 个（按样例逐个查看）\n运行状态：${s.status}${s.reason?' · '+s.reason:''}\n完成记录：${s.runs.length} 个输入 / 模式组合\n静态未知边界：${s.boundaries.length} 个，其中 ${associated} 个有源码行关联的运行算子。\n静态未知节点全部保留；源码行关联不等于算子等价或完整解析。\n未执行路径仍未知，覆盖范围仅为声明的输入与模式。`;
  }
  function create(host){
    const $=id=>document.getElementById(id),dialog=document.createElement('dialog');dialog.id='nativeProbeDialog';dialog.className='native-probe-dialog';
    dialog.innerHTML=`<div class="dialog-head"><h2>使用 CPU 探针进行辅助确认</h2><button id="nativeProbeClose">关闭</button></div>
      <p>使用当前模型的原始源码执行声明的输入，在 CPU 上记录模块调用、算子与张量依赖。核对调用位置及张量输入输出后接入源码图；完整运行证据保留，未覆盖路径仍未知。</p>
      <p id="nativeProbeEntry" class="micro"></p>
      <label class="field">Python 解释器<input id="nativeProbePython" placeholder="/path/to/environment/bin/python" autocomplete="off"></label>
      <label class="field">源码根目录<input id="nativeProbeRoot" autocomplete="off"></label>
      <label class="field">每个隔离进程超时（秒）<input id="nativeProbeTimeout" type="number" min="1" max="90" value="45"></label>
      <label class="field">输入规格 JSON<textarea id="nativeProbeSpec" rows="12" spellcheck="false"></textarea></label>
      <div class="generic-row"><button id="nativeProbeRead">读取输入规格文件</button><input id="nativeProbeFile" type="file" accept=".json" hidden></div>
      <details><summary>输入格式与范围</summary><p>构造参数必须与当前 IR 一致。每个 inputs 键为模型参数名；张量示例：{"shape":[1,4],"dtype":"float32","fill":"zeros"}；标量示例：{"value":true}。modes 可选 eval、train。多组样例请在 cases 中逐项声明。</p><p>需要已有可运行的模型环境；不安装依赖、不下载权重、不自动生成输入。整个模型按样例运行后关联边界，未执行分支仍保留。</p></details>
      <p id="nativeProbeStatus" role="status"></p><pre id="nativeProbeSummary" hidden></pre>
      <details id="nativeProbeDetails" hidden><summary>完整运行凭据与覆盖情况</summary><pre id="nativeProbeReceipt"></pre></details>
      <details id="nativeProbeIR" hidden><summary>补证 IR 文本（也可复制保存）</summary><textarea id="nativeProbeIRText" readonly rows="8" aria-label="CPU 补证 IR JSON"></textarea></details>
      <div class="generic-row"><button id="nativeProbeRun" class="primary">运行 CPU 探针</button><button id="nativeProbeApply" disabled>载入补证并重新排布</button><button id="nativeProbeDownload" disabled>下载补证 IR</button></div>`;
    document.body.append(dialog);let running=false,pending=null,basis=null;
    function status(text){$('nativeProbeStatus').textContent=text;}
    function active(value){running=value;for(const id of ['nativeProbeRun','nativeProbeClose','nativeProbeRead','nativeProbePython','nativeProbeRoot','nativeProbeTimeout','nativeProbeSpec'])$(id).disabled=value;}
    function invalidate(){pending=null;$('nativeProbeApply').disabled=true;$('nativeProbeDownload').disabled=true;$('nativeProbeSummary').hidden=true;$('nativeProbeDetails').hidden=true;$('nativeProbeIR').hidden=true;$('nativeProbeIRText').value='';}
    for(const id of ['nativeProbePython','nativeProbeRoot','nativeProbeTimeout','nativeProbeSpec'])$(id).addEventListener('input',invalidate);
    $('nativeProbeClose').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(running)e.preventDefault();});
    $('nativeProbeRead').onclick=()=>$('nativeProbeFile').click();
    $('nativeProbeFile').onchange=async()=>{try{const f=$('nativeProbeFile').files[0];if(!f)return;if(f.size>500000)throw Error('输入规格文件超过 500KB');const value=JSON.parse(await f.text());$('nativeProbeSpec').value=JSON.stringify(value,null,2);invalidate();status('输入规格已读取，请检查后运行。');}catch(e){status(e.message);}finally{$('nativeProbeFile').value='';}};
    $('nativeProbeRun').onclick=async()=>{
      if(running||host.busy)return;invalidate();
      try{
        const ir=host.graph.generic.ir;basis=ir.ir_digest;
        const payload=request(ir,$('nativeProbePython').value,$('nativeProbeRoot').value,$('nativeProbeSpec').value,$('nativeProbeTimeout').value);
        active(true);status('正在隔离 CPU 环境中运行并校验输出；原画布保持可用。');
        pending=await host.api('probe',payload);
        $('nativeProbeSummary').textContent=resultText(pending);$('nativeProbeSummary').hidden=false;
        $('nativeProbeReceipt').textContent=JSON.stringify({summary:pending.summary,runtime:pending.ir.runtime},null,2);$('nativeProbeDetails').hidden=false;
        $('nativeProbeIRText').value=JSON.stringify(pending.ir,null,2);$('nativeProbeIR').hidden=false;
        $('nativeProbeDownload').disabled=false;
        $('nativeProbeApply').disabled=!(pending.ir.runtime.runs?.length);
        status(pending.ir.runtime.runs?.length?'补证完成。可载入画布，或先下载结果。':'未产生运行轨迹；保留当前画布，查看原因后重试。');
      }catch(e){status(e.message);}finally{active(false);}
    };
    $('nativeProbeApply').onclick=async()=>{
      if(!pending||running||host.busy)return;
      try{active(true);$('nativeProbeApply').disabled=true;await host.applyProbe(pending.ir,basis);dialog.close();}
      catch(e){status(e.message);$('nativeProbeApply').disabled=false;}finally{active(false);}
    };
    $('nativeProbeDownload').onclick=()=>{if(!pending)return;const url=URL.createObjectURL(new Blob([JSON.stringify(pending.ir,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='cpu-assisted-ir.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);};
    return {open(){
      if(host.busy||running||!host.graph?.generic)return;
      invalidate();const ir=host.graph.generic.ir,d=defaults(ir);basis=ir.ir_digest;
      $('nativeProbeEntry').textContent=d.source+' · '+d.entry;
      $('nativeProbeRoot').value=d.sourceRoot;$('nativeProbeSpec').value=JSON.stringify(d.spec,null,2);
      const blocked=ir.authoring?.edited?'编辑后的结构不能执行原始 Python，请打开原始源码 IR。':ir.runtime?.status!=='not-requested'?'此图已包含运行凭据。重新运行请先打开原始源码 IR。':ir.analysis?.entry_kind==='factory'?'工厂入口暂不支持探针，请打开模型类入口。':ir.entry.cell!=null?'笔记本暂仅支持静态分析。':null;
      $('nativeProbeRun').disabled=!!blocked;status(blocked||'请显式指定运行环境和有效输入；不会自动执行或猜测配置。');dialog.showModal();
    }};
  }
  const api={create,defaults,request,resultText};root.SummaryGenericProbe=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

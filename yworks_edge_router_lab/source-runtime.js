/* Source-led runtime supplementation. Canonical facts never become view rewrites. */
(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x)),cache=new WeakMap();
  const observed=id=>id==='runtime-observations'||id.startsWith('runtime:');
  function enabled(ir,state){return state.mode==='merged'&&ir.runtime?.runs?.length>0;}
  // Recheck bridge identities against the saved receipt and both canonical
  // graphs. A saved presentation index cannot invent a wire or an operand.
  function regions(ir,run){
    const ix=ir.source_runtime_index,r=ir.runtime?.runs?.[run],by=new Map(ir.nodes.map(n=>[n.id,n])),edges=new Map(ir.edges.map(e=>[e.id,e]));
    if(ix?.schema!=='source-runtime-integration/1'||ix.receipt_digest!==ir.runtime.trace_digest||!ir.runtime.source_unchanged||ir.runtime.isolation?.status!=='passed'||r?.status!=='passed'||r.truncated||!r.replay?.matched)return [];
    const generation=ir.runtime.binding?.source_generation||{},sourceRoot=ir.runtime.binding?.source_root?.replace(/\/$/,'');
    if(!sourceRoot||ir.sources.some(s=>ir.nodes.some(n=>!observed(n.id)&&n.source?.some(t=>t.file===s.path))&&generation[s.physical.slice(sourceRoot.length+1)]!==s.sha256))return [];
    const prefix='runtime:'+run+':',events=new Map(r.events.map(e=>[prefix+e.id,e])),calls=new Map(r.module_events.filter(e=>e.event==='enter').map(e=>[prefix+e.id,e])),exits=new Map(r.module_events.filter(e=>e.event==='exit').map(e=>[prefix+e.id,e]));
    const candidates=ix.regions.filter(v=>v.run===run),counts=new Map();for(const v of candidates)counts.set(v.source,(counts.get(v.source)||0)+1);
    const valid=candidates.filter(v=>{
      const source=by.get(v.source),call=calls.get(v.call),exit=exits.get(v.call);
      if(counts.get(v.source)!==1||source?.kind!=='opaque'||!call||!call.parent_call||!exit?.output_is_tensor||exit.outputs?.length!==1||v.case!==r.case||v.mode!==r.mode||call.module_type!==v.module_type||call.path!==v.module_path)return false;
      const sites=call.source_stack||[];
      if(!sites.some(s=>{
        const same=n=>n.source?.some(t=>t.file===sourceRoot+'/'+s.file&&t.symbol===s.symbol&&['line','end_line','column','end_column'].every(k=>t[k]!=null&&t[k]===s[k]));
        const matches=ir.nodes.filter(n=>!observed(n.id)&&['compute','opaque'].includes(n.kind)&&same(n));return matches.length===1&&matches[0].id===v.source;
      }))return false;
      const descendants=new Set([v.call]);for(const [id,c]of calls)if(descendants.has(prefix+c.parent_call))descendants.add(id);
      const expected=[...events].filter(([,e])=>descendants.has(prefix+e.module_call));
      if(!expected.length||expected.length!==v.events.length||new Set(v.events).size!==v.events.length||expected.some(([id,e])=>!v.events.includes(id)||e.mutable||by.get(id)?.operator!==e.operator||JSON.stringify(by.get(id)?.inputs)!==JSON.stringify(e.inputs)||JSON.stringify(by.get(id)?.outputs)!==JSON.stringify(e.outputs)))return false;
      const out=exit.outputs[0],producer=events.get(v.output?.source);
      if(v.output?.source!==prefix+out.producer||v.output?.source_port!==String(out.slot)||v.output?.tensor!==out.id||!v.events.includes(v.output.source)||!producer?.outputs.some(t=>t.id===out.id&&String(t.slot)===String(out.slot)))return false;
      if(ir.edges.some(e=>e.source===v.source&&(!['data','alias','interface-binding'].includes(e.kind)||e.source_port!=='out')))return false;
      const set=new Set(v.events),ports=new Set(),used=new Set(),resources=new Set();
      for(const e of ir.edges.filter(e=>set.has(e.target)&&!set.has(e.source))){
        if(['parameter','buffer'].includes(by.get(e.source)?.kind)){resources.add(e.source);continue;}
        const b=v.inputs.find(b=>b.runtime_edge===e.id),a=b&&edges.get(b.source_edge),t=events.get(e.target)?.inputs[Number(e.target_port)];
        if(e.kind!=='data'||e.evidence!=='runtime-tensor'||String(t?.slot)!==e.source_port||e.source!==prefix+(t?.producer||('unresolved:'+t?.id)))return false;
        if(!b||!a||a.target!==v.source||a.kind!=='data'||a.condition||a.target_port!==b.argument_port||e.target!==b.target||e.target_port!==b.target_port||t?.id!==b.tensor||ports.has(a.id))return false;
        const bound=(call.input_bindings||[]).filter(t=>t.id===b.tensor&&!t.component&&t.port===b.argument_port);if(bound.length!==1)return false;
        ports.add(a.id);used.add(b.runtime_edge);
      }
      return used.size===v.inputs.length&&resources.size===v.resources.length&&v.resources.every(id=>resources.has(id));
    });
    // Nested overlapping regions and repeated executions need an occurrence
    // interface. Never fuse different invocations into one source operation.
    return valid.filter(v=>!valid.some(w=>w!==v&&v.events.some(id=>w.events.includes(id))));
  }
  function prepare(ir,run){
    let rows=cache.get(ir);if(!rows)cache.set(ir,rows=new Map());if(rows.has(run))return rows.get(run);
    const selected=regions(ir,run),by=new Map(ir.nodes.map(n=>[n.id,n])),source=ir.nodes.filter(n=>!observed(n.id)).map(copy),outBy=new Map(source.map(n=>[n.id,n]));
    const owners=new Map(),inputs=new Map(),outputs=new Map(),eventSet=new Set(),resourceOwners=new Map();
    for(const v of selected){
      const n=outBy.get(v.source);n.kind='composite';n.granularity='composite';n.source_runtime={...copy(v),static_kind:'opaque',scope:'only this recorded input and mode; unobserved paths remain unknown'};
      for(const id of v.events){eventSet.add(id);owners.set(id,n.id);const child=copy(by.get(id));child.parent=n.id;source.push(child);}
      owners.set(v.call,n.id);
      for(const id of v.resources){if(!resourceOwners.has(id))resourceOwners.set(id,[]);resourceOwners.get(id).push(n.id);}
      for(const b of v.inputs)inputs.set(b.source_edge,{...b,owner:v.source,call:v.call});outputs.set(v.source,v);
    }
    const sourceRoot=source.find(n=>!n.parent)?.id;
    for(const [id,os]of resourceOwners){const child=copy(by.get(id));child.parent=os.length===1?os[0]:sourceRoot;source.push(child);owners.set(id,child.parent);}
    const bridgedInputs=new Set(selected.flatMap(v=>v.inputs.map(b=>b.runtime_edge))),edges=[];
    for(const e of ir.edges){
      if(!observed(e.source)&&!observed(e.target)){
        const edge=copy(e),input=inputs.get(e.id),output=outputs.get(e.source);
        if(input){edge.target=input.target;edge.target_port=input.target_port;}
        if(output){edge.source=output.output.source;edge.source_port=output.output.source_port;}
        if(input||output)edge.runtime_bridge={source_binding:copy(e),...(input?{input:copy(input)}:{}),...(output?{output:{owner:output.source,call:output.call,...copy(output.output)}}:{}),run,case:ir.runtime.runs[run].case,mode:ir.runtime.runs[run].mode};
        edges.push(edge);
      }else if(!bridgedInputs.has(e.id)&&eventSet.has(e.target)&&(eventSet.has(e.source)||resourceOwners.has(e.source)))edges.push(copy(e));
    }
    const value={ir:{...ir,nodes:source,edges},selected,owners,run};rows.set(run,value);return value;
  }
  function project(ir,state,engine){
    if(!enabled(ir,state))return engine.project(ir,state);
    const run=Number.isInteger(state.runtimeInlineRun)&&ir.runtime.runs[state.runtimeInlineRun]?state.runtimeInlineRun:0;
    const prepared=prepare(ir,run),view=prepared.ir;
    let cut=engine.project(view,state);
    if(state.runtimeInlineInitialized!==run&&!state.paperCanonical){
      const open=[...new Set([...(cut.publication?.open||state.open||[]),...prepared.selected.map(v=>v.source)])];
      cut=engine.project(view,{...state,paperAuto:false,open});
    }
    for(const n of cut.nodes)if(n.source_runtime){n.paper={...n.paper,captions:[`CPU 观测 · ${ir.runtime.runs[run].case} / ${ir.runtime.runs[run].mode}`,'未覆盖输入仍未知']};}
    const canonicalEdges=new Map(ir.edges.map(e=>[e.id,e])),viewEdges=new Map(view.edges.map(e=>[e.id,e]));
    function provenance(e){
      const proofs=(e.originals||[e.id]).map(id=>viewEdges.get(id)?.runtime_bridge).filter(Boolean);if(proofs.length)e.runtime_bridges=copy(proofs);
      if(e.runtime_bridge){const original=canonicalEdges.get(e.id);e.canonical_source=original.source;e.canonical_target=original.target;}
      for(const m of e.bundle_members||[])provenance(m);
    }
    cut.edges.forEach(provenance);
    // Normalize the ledger back to the complete immutable IR. Unshown runs,
    // wrappers and redundant known operators remain inspectable attachments.
    for(const [key,all]of [['node_accounting',ir.nodes],['edge_accounting',ir.edges]]){
      const seen=new Set(Object.values(cut[key]).flat());
      for(const item of all)if(!seen.has(item.id))cut[key].attached.push(item.id);
    }
    const rootId=cut.nodes.find(n=>!n.parent)?.id||cut.nodes[0]?.id;
    for(const n of ir.nodes)if(!cut.representatives[n.id])cut.representatives[n.id]=cut.representatives[prepared.owners.get(n.id)]||rootId;
    const record={schema:'source-runtime-view/1',run,case:ir.runtime.runs[run].case,mode:ir.runtime.runs[run].mode,regions:copy(prepared.selected),raw_trace:'available in CPU 轨迹 evidence view',unplaced:copy(ir.source_runtime_index?.unplaced||[]),scope:'selected invocation evidence; canonical static unknowns and all source branches preserved'};
    cut.publication={...cut.publication,source_runtime:record};
    if(rootId){const notes=cut.annotations.get(rootId)||[];notes.push({annotation_kind:'source-runtime-evidence',...record});cut.annotations.set(rootId,notes);}
    return cut;
  }
  function fullyExpandedIR(ir,state){return enabled(ir,state)?prepare(ir,Number.isInteger(state.runtimeInlineRun)?state.runtimeInlineRun:0).ir:ir;}
  const api={enabled,regions,prepare,project,fullyExpandedIR};root.SummarySourceRuntime=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

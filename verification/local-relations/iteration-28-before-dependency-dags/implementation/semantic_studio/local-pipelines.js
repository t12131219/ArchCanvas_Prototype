/* A folded source helper can describe its modeled dependency path. This is a
 * presentation form, not fusion, purity, scheduling or a new family contract. */
(function(root){
  'use strict';
  const VERSION='local-pipelines/3',flow=e=>['data','alias','interface-binding'].includes(e.kind);
  function compile({ir,plan,bindings,metadata,configurationUses}){
    const by=new Map(plan.nodes.map(n=>[n.id,n])),canonical=new Map(ir.nodes.map(n=>[n.id,n])),children=new Map(),result=new Map();
    for(const n of plan.nodes){if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n.id);}
    const closure=id=>{const todo=[id];for(let i=0;i<todo.length;i++)todo.push(...children.get(todo[i])||[]);return todo;};
    // Focus panels deliberately keep their boundary interfaces visible. A
    // canonical single-input interface/alias still proves its value binding;
    // that fact must not depend on whether the display contracts the interface.
    const proofBindings=new Map(bindings),ins=new Map();
    for(const e of ir.edges){if(!ins.has(e.target))ins.set(e.target,[]);ins.get(e.target).push(e);}
    for(const n of ir.nodes){const es=ins.get(n.id)||[];if(['interface','value-alias'].includes(n.kind)&&!n.operator&&
      es.length===1&&flow(es[0])&&!es[0].condition)proofBindings.set(n.id,{...es[0],
        source_port:n.kind==='value-alias'?n.slot??es[0].source_port:es[0].source_port});}
    const resolve=(id,port)=>{const seen=new Set();while(proofBindings.has(id)&&!seen.has(id)){seen.add(id);const e=proofBindings.get(id);id=e.source;const outer=e.source_port??'out';port=outer==='out'?port:port==='out'?outer:outer+'.'+port;}return {node:id,slot:port};};
    const guarded=n=>n.evidence_status==='runtime-only'||['opaque','control'].includes(n.kind)||n.mutable||n.condition||n.identity_display||n.observed_calls||n.semantic_contracts?.length||n.repeat_contract||n.iteration||n.runtime_evidence?.length;
    for(const owner of plan.nodes){
      if(!owner.parent||!['source-function','source-module'].includes(owner.semantic_type)||guarded(owner))continue;
      const ids=closure(owner.id),inside=new Set(ids),members=ids.slice(1).map(id=>by.get(id));
      if(!members.length||members.some(n=>guarded(n)||!canonical.has(n.id)))continue;
      // Source refactoring alone need not break a proved value path. Nested
      // enclosures retain their own original cuts and provenance; a grouping,
      // certificate, effect or identity boundary cannot authorize composition.
      const boundaries=[owner,...members.filter(n=>n.kind==='composite')];
      if(boundaries.slice(1).some(n=>!['source-function','source-module'].includes(n.semantic_type)||
        ir.edges.some(e=>e.source===n.id||e.target===n.id)))continue;
      const auxiliary=members.filter(n=>n.symbolic_value?.kind==='tensor-attribute'),aux=new Set(auxiliary.map(n=>n.id));
      const steps=members.filter(n=>n.kind==='compute'&&!aux.has(n.id)&&!metadata.has(n.id));
      if(steps.length<2||steps.length>6||steps.some(n=>!n.operator&&!n.framework_type))continue;
      // Match the compact projection's read-only parameter attachment policy.
      // Do not absorb writes, incoming values, shared escapes or identity facts.
      const parameters=members.filter(n=>n.kind==='parameter'&&!metadata.has(n.id)),resources=new Set(parameters.map(n=>n.id));
      if(parameters.some(n=>ir.edges.some(e=>e.target===n.id)||!ir.edges.some(e=>e.source===n.id)||
        ir.edges.some(e=>e.source===n.id&&(!['data','parameter-read'].includes(e.kind)||!steps.some(n=>n.id===e.target)))))continue;
      if(members.some(n=>!['compute','interface','value-alias','parameter','state','buffer','composite'].includes(n.kind)||
        ['state','buffer'].includes(n.kind)&&!metadata.has(n.id)))continue;
      const active=new Set(steps.map(n=>n.id)),edges=ir.edges.filter(e=>inside.has(e.source)||inside.has(e.target));
      if(edges.some(e=>!flow(e)&&!(e.kind==='parameter-read'&&resources.has(e.source))||e.condition||e.design_route||e.iteration))continue;
      const adj=new Map(steps.map(n=>[n.id,new Set()])),incoming=new Map(steps.map(n=>[n.id,[]])),traces=[];
      let valid=true;
      for(const e of edges){
        const from=resolve(e.source,e.source_port??'out'),to=by.get(e.target);
        // Bindings are retained as proof traces, not new shortcut edges.
        if(active.has(e.target)){
          const trace={edge:e.id,producer:from.node,source_port:from.slot,target:e.target,target_port:e.target_port,
            kind:aux.has(from.node)?'symbolic-read':resources.has(from.node)?'parameter-read':metadata.has(from.node)?'configuration':'value'};traces.push(trace);
          if(aux.has(from.node)&&!configurationUses.has(e.id))valid=false;
          if(active.has(from.node)){adj.get(from.node).add(e.target);incoming.get(e.target).push(trace);}
        }
        if(aux.has(e.target)&&(!active.has(from.node)&&inside.has(from.node)&&by.get(from.node)?.kind!=='interface'))valid=false;
      }
      if(steps.some(n=>{const ports=traces.filter(t=>t.target===n.id).map(t=>t.target_port);return ports.length!==new Set(ports).size;}))valid=false;
      // A bounded converging dependency tree can summarize independent inputs
      // without claiming parallel execution. Fan-out of an internal operation
      // remains explicit: duplicating its label could imply duplicated work.
      if(!valid||steps.some(n=>adj.get(n.id).size>1||new Set(incoming.get(n.id).map(t=>t.producer)).size!==incoming.get(n.id).length))continue;
      const starts=steps.filter(n=>!incoming.get(n.id).length),sinks=steps.filter(n=>!adj.get(n.id).size);
      if(!starts.length||sinks.length!==1)continue;
      const ordered=[],degree=new Map(steps.map(n=>[n.id,incoming.get(n.id).length])),todo=starts.map(n=>n.id);
      for(let i=0;i<todo.length;i++){const at=todo[i];ordered.push(at);for(const next of adj.get(at)){degree.set(next,degree.get(next)-1);if(!degree.get(next))todo.push(next);}}
      if(ordered.length!==steps.length)continue;
      const tree=steps.some(n=>incoming.get(n.id).length>1);
      // An intermediate result escaping the helper requires its own interface;
      // a single output-path summary would hide the distinguishing connection.
      const cuts=edges.filter(e=>inside.has(e.source)!==inside.has(e.target));
      if(cuts.some(e=>inside.has(e.source)&&resolve(e.source,e.source_port??'out').node!==ordered.at(-1)))continue;
      const outputs=members.filter(n=>n.kind==='interface'&&n.role==='output'&&n.parent===owner.id);
      if(!outputs.length||outputs.some(n=>{const es=ir.edges.filter(e=>e.target===n.id);return es.length!==1||resolve(es[0].source,es[0].source_port??'out').node!==ordered.at(-1);}))continue;
      const operations=ordered.map(id=>{const n=by.get(id),framework=n.source_framework_function&&n.source_framework_function===n.function_target;
        return {node:id,operator:n.operator,framework_type:n.framework_type||null,
          label:n.framework_type?.split('.').at(-1)||(framework?n.function_target.split('.').at(-1):n.operator),
          label_basis:n.framework_type?'framework-type':framework?'source-framework-function':'operator'};});
      const expression=id=>({node:id,inputs:incoming.get(id).map(t=>({edge:t.edge,target_port:t.target_port,source_port:t.source_port,expression:expression(t.producer)}))});
      result.set(owner.id,{rule_version:tree||resources.size?VERSION:'local-pipelines/2',node:owner.id,form:tree?'dependency-tree-summary':'dependency-path-summary',operations,
        ...(tree?{entry_operations:starts.map(n=>n.id),result_operation:sinks[0].id,dependency_tree:expression(sinks[0].id)}:{}),
        ...(tree||resources.size?{parameter_reads:parameters.map(n=>({node:n.id,source:n.source||[],module_identity:n.module_identity??null,
          edges:ir.edges.filter(e=>e.source===n.id).map(e=>({...e}))})),
          output_bindings:cuts.filter(e=>inside.has(e.source)).map(e=>({edge:e.id,producer:resolve(e.source,e.source_port??'out').node,
            source_port:resolve(e.source,e.source_port??'out').slot,target:e.target,target_port:e.target_port}))}:{}),
        auxiliary_reads:auxiliary.map(n=>({node:n.id,fact:n.symbolic_value})),bindings:traces,cuts:cuts.map(e=>({...e})),
        canonical_members:ids.filter(id=>canonical.has(id)),
        source_boundaries:boundaries.map(n=>{const members=new Set(closure(n.id));return {node:n.id,parent:n.parent,semantic_type:n.semantic_type,
          source:n.source||[],module_identity:n.module_identity??null,cuts:ir.edges.filter(e=>members.has(e.source)!==members.has(e.target)).map(e=>({...e}))};}),
        scope:tree?'Modeled converging dependency tree across retained source boundaries; exact operands, auxiliary reads and each source cut retained. No scalar evaluation, purity, fusion, parallel execution or model-family assertion.':'Modeled dependency path across retained source boundaries; exact operands, auxiliary reads and each source cut retained. No purity, fusion, execution-order or model-family assertion.'});
    }
    return result;
  }
  function receipt(candidates,graph){return {rule_version:VERSION,rows:[...candidates.values()].filter(r=>graph.positions.has(r.node)).map(r=>({...r,
    status:graph.positions.get(r.node).expanded?'expanded':'summary',visible_node:r.node,
    detailed_operations_exposed:r.operations.every(o=>graph.positions.has(o.node))}))};}
  const api={VERSION,compile,receipt};root.SemanticLocalPipelines=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

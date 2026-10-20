/* A folded source helper can describe its modeled dependency path. This is a
 * presentation form, not fusion, purity, scheduling or a new family contract. */
(function(root){
  'use strict';
  const VERSION='local-pipelines/1',flow=e=>['data','alias','interface-binding'].includes(e.kind);
  function compile({ir,plan,bindings,metadata,configurationUses}){
    const by=new Map(plan.nodes.map(n=>[n.id,n])),canonical=new Map(ir.nodes.map(n=>[n.id,n])),children=new Map(),result=new Map();
    for(const n of plan.nodes){if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n.id);}
    const closure=id=>{const todo=[id];for(let i=0;i<todo.length;i++)todo.push(...children.get(todo[i])||[]);return todo;};
    const resolve=(id,port)=>{const seen=new Set();while(bindings.has(id)&&!seen.has(id)){seen.add(id);const e=bindings.get(id);id=e.source;const outer=e.source_port??'out';port=outer==='out'?port:port==='out'?outer:outer+'.'+port;}return {node:id,slot:port};};
    const guarded=n=>n.evidence_status==='runtime-only'||['opaque','control'].includes(n.kind)||n.mutable||n.condition||n.identity_display||n.observed_calls||n.semantic_contracts?.length||n.repeat_contract||n.iteration||n.runtime_evidence?.length;
    for(const owner of plan.nodes){
      if(!owner.parent||!['source-function','source-module'].includes(owner.semantic_type)||guarded(owner))continue;
      const ids=closure(owner.id),inside=new Set(ids),members=ids.slice(1).map(id=>by.get(id));
      if(!members.length||members.some(n=>guarded(n)||n.kind==='composite'||!canonical.has(n.id)))continue;
      const auxiliary=members.filter(n=>n.symbolic_value?.kind==='tensor-attribute'),aux=new Set(auxiliary.map(n=>n.id));
      const steps=members.filter(n=>n.kind==='compute'&&!aux.has(n.id)&&!metadata.has(n.id));
      if(steps.length<2||steps.length>6||steps.some(n=>!n.operator&&!n.framework_type))continue;
      if(members.some(n=>!['compute','interface','value-alias','parameter','state','buffer'].includes(n.kind)||
        ['state','buffer','parameter'].includes(n.kind)&&!metadata.has(n.id)))continue;
      const active=new Set(steps.map(n=>n.id)),edges=ir.edges.filter(e=>inside.has(e.source)||inside.has(e.target));
      if(edges.some(e=>!flow(e)||e.condition||e.design_route))continue;
      const adj=new Map(steps.map(n=>[n.id,new Set()])),incoming=new Map(steps.map(n=>[n.id,[]])),traces=[];
      let valid=true;
      for(const e of edges){
        const from=resolve(e.source,e.source_port??'out'),to=by.get(e.target);
        // Bindings are retained as proof traces, not new shortcut edges.
        if(active.has(e.target)){
          const trace={edge:e.id,producer:from.node,source_port:from.slot,target:e.target,target_port:e.target_port,
            kind:aux.has(from.node)?'symbolic-read':metadata.has(from.node)?'configuration':'value'};traces.push(trace);
          if(aux.has(from.node)&&!configurationUses.has(e.id))valid=false;
          if(active.has(from.node)){adj.get(from.node).add(e.target);incoming.get(e.target).push(trace);}
        }
        if(aux.has(e.target)&&(!active.has(from.node)&&inside.has(from.node)&&by.get(from.node)?.kind!=='interface'))valid=false;
      }
      if(!valid||steps.some(n=>adj.get(n.id).size>1||incoming.get(n.id).length>1))continue;
      const starts=steps.filter(n=>!incoming.get(n.id).length);if(starts.length!==1)continue;
      const ordered=[],seen=new Set();let at=starts[0].id;
      while(at&&!seen.has(at)){seen.add(at);ordered.push(at);at=[...adj.get(at)][0];}
      if(ordered.length!==steps.length||at)continue;
      // An intermediate result escaping the helper requires its own interface;
      // a single output-path summary would hide the distinguishing connection.
      const cuts=edges.filter(e=>inside.has(e.source)!==inside.has(e.target));
      if(cuts.some(e=>inside.has(e.source)&&resolve(e.source,e.source_port??'out').node!==ordered.at(-1)))continue;
      const outputs=members.filter(n=>n.kind==='interface'&&n.role==='output');
      if(!outputs.length||outputs.some(n=>{const es=ir.edges.filter(e=>e.target===n.id);return es.length!==1||resolve(es[0].source,es[0].source_port??'out').node!==ordered.at(-1);}))continue;
      const operations=ordered.map(id=>{const n=by.get(id),framework=n.source_framework_function&&n.source_framework_function===n.function_target;
        return {node:id,operator:n.operator,framework_type:n.framework_type||null,
          label:n.framework_type?.split('.').at(-1)||(framework?n.function_target.split('.').at(-1):n.operator),
          label_basis:n.framework_type?'framework-type':framework?'source-framework-function':'operator'};});
      result.set(owner.id,{rule_version:VERSION,node:owner.id,form:'dependency-path-summary',operations,
        auxiliary_reads:auxiliary.map(n=>({node:n.id,fact:n.symbolic_value})),bindings:traces,cuts:cuts.map(e=>({...e})),
        canonical_members:ids.filter(id=>canonical.has(id)),
        scope:'Modeled dependency order inside one source boundary; exact operands and auxiliary reads retained. No purity, fusion, execution-order or model-family assertion.'});
    }
    return result;
  }
  function receipt(candidates,graph){return {rule_version:VERSION,rows:[...candidates.values()].filter(r=>graph.positions.has(r.node)).map(r=>({...r,
    status:graph.positions.get(r.node).expanded?'expanded':'summary',visible_node:r.node,
    detailed_operations_exposed:r.operations.every(o=>graph.positions.has(o.node))}))};}
  const api={VERSION,compile,receipt};root.SemanticLocalPipelines=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

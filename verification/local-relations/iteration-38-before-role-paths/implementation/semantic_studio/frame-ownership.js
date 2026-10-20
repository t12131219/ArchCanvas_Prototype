/* A source boundary and a drawing frame are distinct. Only already-expanded,
 * redundant enclosures can become inspectable ownership annotations. */
(function(root){
  'use strict';
  function select({ir,idx,visible,open,roots,flattenDependencyBands=false,flattenSequenceSamples=false}){
    const frames=new Map(),rootSet=new Set(roots),incidents=new Set(ir.edges.flatMap(e=>[e.source,e.target]));
    const descendants=id=>{const all=[],todo=[id];for(let i=0;i<todo.length;i++){all.push(todo[i]);todo.push(...idx.children.get(todo[i])||[]);}return all;};
    const guarded=id=>{const members=new Set(descendants(id));return [...members].some(id=>{const n=idx.nodes.get(id);return n.kind==='opaque'||n.mutable||n.identity_display||n.observed_calls;})||
      ir.edges.some(e=>e.kind==='state-write'&&(members.has(e.source)||members.has(e.target)));};
    const eligible=n=>visible.has(n.id)&&open.has(n.id)&&!rootSet.has(n.id)&&!incidents.has(n.id)&&
      !n.semantic_contracts?.length&&!n.contract_roles&&!n.condition&&!n.mutable&&!n.identity_display&&!n.observed_calls;
    function attach(n,target,kind,reason){frames.set(n.id,{node:n.id,target,kind,reason,label:n.label,semantic_type:n.semantic_type,
      module_identity:n.module_identity??null,source:n.source||[],source_parent:n.source_parent??n.parent,
      scope:'source/drawing ownership only; no value substitution or object equivalence inferred'});}
    for(const id of visible){const n=idx.nodes.get(id);
      // Count/rank bands carry no source or semantic boundary of their own.
      // Removing their outline never removes the enclosed unknown, condition,
      // state or identity node. Actual source/semantic frames keep their guards.
      const rankBand=flattenDependencyBands&&n.presentation_only&&['dependency-band','dependency-panel'].includes(n.semantic_type);
      if(!eligible(n)||guarded(id)&&!rankBand)continue;const parent=idx.nodes.get(n.parent);
      if(['source-module','source-function'].includes(n.semantic_type)&&parent?.semantic_type==='repeat-instance'&&
        visible.has(parent.id)&&open.has(parent.id)&&n.module_identity&&n.module_identity===parent.module_identity){
        attach(n,parent.id,'same-call-source','Source wrapper and concrete repeat call explicitly bind the same module object.');
      }else if(n.presentation_only&&['structural-region','computation-region',...(flattenDependencyBands?['dependency-band','dependency-panel']:[])].includes(n.semantic_type)&&visible.has(n.parent)){
        attach(n,n.parent,'expanded-dependency-region','An expanded presentation grouping adds no computation, identity or control boundary; its membership and cuts remain in the plan.');
      }
    }
    // A single proved representative may share its expanded sequence frame.
    // Its concrete identity remains an annotation; later calls keep their own
    // closed ordered suffix. Heterogeneous/open/unknown instances stay framed.
    if(flattenSequenceSamples)for(const id of visible){
      const n=idx.nodes.get(id),parent=idx.nodes.get(n.parent),seq=parent?.sequence_frontier,sample=n.sequence_sample;
      if(n.semantic_type!=='repeat-instance'||!sample||!eligible(n)||guarded(id)||
        !visible.has(parent?.id)||!open.has(parent.id)||parent.semantic_type!=='serial-repeat'||
        !parent.repeat_contract||parent.condition||parent.mutable||parent.identity_display||parent.observed_calls||
        n.evidence_status==='runtime-only'||parent.evidence_status==='runtime-only'||
        sample.sequence!==parent.id||sample.index!==n.repeat_index||seq?.samples?.length!==1||seq.unclassified.length||
        seq.samples[0].instance!==id||seq.samples[0].index!==n.repeat_index||
        n.structure_representative?.status!=='proved')continue;
      const kids=(idx.children.get(parent.id)||[]).filter(id=>visible.has(id));
      const suffixes=kids.filter(k=>k!==id).map(k=>idx.nodes.get(k));
      if(!suffixes.length||suffixes.some(s=>s.semantic_type!=='serial-remainder'||open.has(s.id)||
        s.sequence_remainder?.sequence!==parent.id||s.sequence_remainder.representative!==id||
        !seq.remainders.some(r=>r.node===s.id)))continue;
      const positions=[n.repeat_index,...suffixes.flatMap(s=>s.sequence_remainder.indices)].sort((a,b)=>a-b);
      if(positions.length!==parent.repeat_contract.count||positions.some((v,i)=>v!==i))continue;
      attach(n,parent.id,'sequence-sample','One expanded concrete source representative shares the sequence frame; closed ordered suffixes retain all later calls.');
      frames.get(id).sequence_sample={sequence:parent.id,index:n.repeat_index,
        module_identity:n.module_identity??null,source_positions:n.structure_representative.indices.slice(),
        parameter_sharing:parent.repeat_contract.parameter_sharing};
    }
    for(const id of visible){const n=idx.nodes.get(id);if(frames.has(id)||!eligible(n)||guarded(id)||!['source-module','source-function'].includes(n.semantic_type))continue;
      const kids=(idx.children.get(id)||[]).filter(id=>visible.has(id));
      if(kids.length===1&&idx.nodes.get(kids[0]).kind==='composite'&&!frames.has(kids[0]))
        attach(n,kids[0],'source-owner','The expanded source enclosure has a single visible compound child; source identity remains an annotation, not the identity of that child.');
    }
    return frames;
  }
  const api={select};root.SemanticFrameOwnership=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

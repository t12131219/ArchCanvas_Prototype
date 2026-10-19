/* A source boundary and a drawing frame are distinct. Only already-expanded,
 * redundant enclosures can become inspectable ownership annotations. */
(function(root){
  'use strict';
  function select({ir,idx,visible,open,roots}){
    const frames=new Map(),rootSet=new Set(roots),incidents=new Set(ir.edges.flatMap(e=>[e.source,e.target]));
    const descendants=id=>{const all=[],todo=[id];for(let i=0;i<todo.length;i++){all.push(todo[i]);todo.push(...idx.children.get(todo[i])||[]);}return all;};
    const guarded=id=>{const members=new Set(descendants(id));return [...members].some(id=>{const n=idx.nodes.get(id);return n.kind==='opaque'||n.mutable||n.identity_display||n.observed_calls;})||
      ir.edges.some(e=>e.kind==='state-write'&&(members.has(e.source)||members.has(e.target)));};
    const eligible=n=>visible.has(n.id)&&open.has(n.id)&&!rootSet.has(n.id)&&!incidents.has(n.id)&&
      !n.semantic_contracts?.length&&!n.contract_roles&&!n.condition&&!n.mutable&&!n.identity_display&&!n.observed_calls;
    function attach(n,target,kind,reason){frames.set(n.id,{node:n.id,target,kind,reason,label:n.label,semantic_type:n.semantic_type,
      module_identity:n.module_identity??null,source:n.source||[],source_parent:n.source_parent??n.parent,
      scope:'source/drawing ownership only; no value substitution or object equivalence inferred'});}
    for(const id of visible){const n=idx.nodes.get(id);if(!eligible(n)||guarded(id))continue;const parent=idx.nodes.get(n.parent);
      if(['source-module','source-function'].includes(n.semantic_type)&&parent?.semantic_type==='repeat-instance'&&
        visible.has(parent.id)&&open.has(parent.id)&&n.module_identity&&n.module_identity===parent.module_identity){
        attach(n,parent.id,'same-call-source','Source wrapper and concrete repeat call explicitly bind the same module object.');
      }else if(n.presentation_only&&['structural-region','computation-region'].includes(n.semantic_type)&&visible.has(n.parent)){
        attach(n,n.parent,'expanded-dependency-region','An expanded presentation grouping adds no computation, identity or control boundary; its membership and cuts remain in the plan.');
      }
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

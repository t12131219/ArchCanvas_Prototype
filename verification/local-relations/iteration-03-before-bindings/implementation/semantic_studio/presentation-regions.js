/* Candidate boundaries are selected from dependencies and local facts. The
 * result is a presentation partition, never a certificate of an algorithm. */
(function(root){
  'use strict';
  const VERSION='presentation-regions/1';
  function candidates({nodes,children,parent,edges,relations,resolve,eligible,maxUnits=8}){
    const by=new Map(nodes.map(n=>[n.id,n])),units=(children.get(parent)||[]).filter(eligible),active=new Set(units);
    const owner=id=>{while(id!=null&&!active.has(id)){if(id===parent)return null;id=by.get(id)?.parent;}return id;};
    const closure=id=>{const out=[],todo=[id];for(let i=0;i<todo.length;i++){out.push(todo[i]);todo.push(...children.get(todo[i])||[]);}return out;};
    const facts=new Map();for(const r of relations){if(!facts.has(r.node))facts.set(r.node,[]);facts.get(r.node).push(r);}
    const reasons=new Map(units.map(id=>[id,[...new Set(closure(id).flatMap(cid=>{
      const n=by.get(cid),rs=facts.get(cid)||[];
      return [n.kind==='opaque'?'unknown':null,n.mutable?'effects':null,n.kind==='control'?'control':null,n.condition?'condition':null,
        rs.some(r=>r.type==='state-interface')?'state-interface':null,rs.some(r=>r.type==='selection')?'selection-interface':null,n.semantic_type==='loop-template'?'iteration':null,
        cid===id&&n.kind==='composite'&&!n.presentation_only?'source-interface':null,
        ['branch-region','dependency-band','serial-repeat','repeat-instance','observed-module-call'].includes(n.semantic_type)?'structural-interface':null].filter(Boolean);
    }))]]));
    // Small ordinary scopes already have a meaningful frontier. This planner
    // addresses broad mixed scopes where arbitrary count chunks lose boundaries.
    if(units.length<9||![...reasons.values()].some(rs=>rs.some(r=>['unknown','effects','control','condition','state-interface','iteration'].includes(r))))return null;
    // A join that reconnects a protected interface to ordinary computation is
    // a useful exposed connection point. It must not pull both sides into one
    // region merely because a residual or escaping result connects them.
    const interfaces=new Set(units.filter(id=>reasons.get(id).length));
    for(const id of units)if(!reasons.get(id).length){
      const incoming=edges.filter(e=>['data','alias','interface-binding'].includes(e.kind)&&owner(e.target)===id)
        .map(e=>owner(resolve(e.source,e.source_port))).filter(source=>source&&source!==id);
      if(new Set(incoming).size>1&&incoming.some(source=>interfaces.has(source)))reasons.get(id).push('boundary-join');
    }
    const proposals=[],rejected=[],claimed=new Set(),allNext=new Map(units.map(id=>[id,new Set()]));
    for(const e of edges){const a=owner(resolve(e.source,e.source_port)),b=owner(e.target);if(a&&b&&a!==b)allNext.get(a).add(b);}
    function proposal(members,kind){
      const selected=new Set(members),outside=new Set(),todo=[];
      for(const id of members)for(const next of allNext.get(id))if(!selected.has(next)&&!outside.has(next)){outside.add(next);todo.push(next);}
      for(let i=0;i<todo.length;i++)for(const next of allNext.get(todo[i])){
        if(selected.has(next)){rejected.push({kind,members,reason:'dependency-leaves-and-reenters-region'});return null;}
        if(!outside.has(next)){outside.add(next);todo.push(next);}
      }
      const canonical=new Set(members.flatMap(closure)),cuts=edges.filter(e=>canonical.has(e.source)!==canonical.has(e.target));
      const incoming=cuts.filter(e=>canonical.has(e.target)),outgoing=cuts.filter(e=>canonical.has(e.source));
      const internal=edges.filter(e=>canonical.has(e.source)&&canonical.has(e.target));
      const escaping=[...new Set(outgoing.map(e=>JSON.stringify([e.source,e.source_port])))];
      const result={kind,members,canonical_members:[...canonical],boundary_edges:cuts.map(e=>e.id),
        input_edges:incoming.map(e=>e.id),output_edges:outgoing.map(e=>e.id),escaping_results:escaping.map(s=>JSON.parse(s)),
        internal_edges:internal.length,cut_edges:cuts.length,cohesion:internal.length/Math.max(1,internal.length+cuts.length),
        claims:{algorithm:'not-asserted',purity:'not-asserted',execution_order:'canonical-dependencies-only'},status:'selected'};
      proposals.push(result);members.forEach(id=>claimed.add(id));return result;
    }
    // A condition and its governed bodies are one possible container. Gather
    // alternatives from actual branch bindings; no adjacency or name inference.
    const conditions=new Map();
    for(const r of relations)if(r.type==='conditional-region'){
      const control=r.properties.condition?.branch,a=owner(control),b=owner(r.node);
      if(!a||!b||a===b)continue;
      if(!conditions.has(control))conditions.set(control,new Set([a]));conditions.get(control).add(b);
    }
    for(const r of relations)if(r.type==='conditional-join')for(const binding of r.bindings){
      const set=conditions.get(binding.condition?.branch),id=owner(r.node);if(set&&id)set.add(id);
    }
    for(const members of conditions.values()){
      const ids=[...members];
      if(ids.length>1&&ids.length<=maxUnits&&!ids.some(id=>claimed.has(id)||reasons.get(id).some(r=>['unknown','effects','state-interface','iteration','structural-interface'].includes(r))))proposal(ids,'conditional-collection');
    }
    const ordinary=units.filter(id=>!claimed.has(id)&&!reasons.get(id).length),allowed=new Set(ordinary);
    const adj=new Map(ordinary.map(id=>[id,new Set()])),next=new Map(ordinary.map(id=>[id,new Set()]));
    for(const e of edges){
      if(!['data','alias','interface-binding'].includes(e.kind)||e.condition)continue;
      const a=owner(resolve(e.source,e.source_port)),b=owner(e.target);
      if(a!==b&&allowed.has(a)&&allowed.has(b)){adj.get(a).add(b);adj.get(b).add(a);next.get(a).add(b);}
    }
    const visited=new Set();
    for(const first of ordinary){
      if(visited.has(first))continue;
      const members=[],todo=[first];visited.add(first);
      for(let i=0;i<todo.length;i++){const id=todo[i];members.push(id);for(const n of adj.get(id))if(!visited.has(n)){visited.add(n);todo.push(n);}}
      // A component too large for one readable detail panel stays untouched;
      // count-based fallback can still partition it with explicit cuts. Do not
      // turn an SCC or a disconnected set into an apparent serial pipeline.
      const degree=new Map(members.map(id=>[id,0]));for(const id of members)for(const n of next.get(id))degree.set(n,degree.get(n)+1);
      const sorted=members.filter(id=>!degree.get(id));for(let i=0;i<sorted.length;i++)for(const n of next.get(sorted[i])){degree.set(n,degree.get(n)-1);if(!degree.get(n))sorted.push(n);}
      if(sorted.length===members.length&&members.length>1&&members.length<=maxUnits)proposal(sorted,'computation-region');
    }
    return {schema:VERSION,parent,proposals,rejected,protected:units.filter(id=>reasons.get(id).length&&!claimed.has(id)).map(id=>({id,reasons:reasons.get(id)})),
      ungrouped:units.filter(id=>!claimed.has(id)),basis:'local-boundaries-and-connected-acyclic-computation'};
  }
  const api={VERSION,candidates};root.SemanticPresentationRegions=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

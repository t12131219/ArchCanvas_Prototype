/* A closed box does not fulfill the detailed relationships it contains.
 * Goals are evaluated against the selected, routed panel, not export intent. */
(function(root){
  'use strict';
  const VERSION='expression-goals/1';
  function build(ir,plan){
    const by=new Map(ir.nodes.map(n=>[n.id,n])),goals=[],covered=new Set();
    for(const r of plan.relation_graph?.relations||[]){
      if(r.type==='source-uses')continue;
      const core=[r.node];
      if(['gated-product','gated-join'].includes(r.type))core.push(...r.bindings.filter(b=>b.role==='gate'||b.role.endsWith(':gate')||b.role.startsWith('sum:')).map(b=>b.producer));
      if(r.type==='conditional-join'||r.type==='conditional-region')core.push(...r.members.filter(id=>by.get(id)?.kind==='control'));
      core.push(...r.properties.required_nodes||[]);
      goals.push({id:'goal:'+r.id,kind:r.type,relation:r.id,focus_node:r.node,core:[...new Set(core)],edges:[...new Set(r.bindings.map(b=>b.edge))],provenance_edges:r.edges,
        identity:r.type==='same-object-calls'?{reference:r.properties.reference,calls:r.members}:r.type==='observed-parameter-aliases'?{node:r.node,aliases:r.properties.aliases}:null,
        priority:['unknown-boundary','state-interface','conditional-region','conditional-join','selection','iteration-template','iteration-binding'].includes(r.type)?3:2,
        expression:r.type==='unknown-boundary'?'boundary-summary':['state-interface','selection','gated-product','gated-join','conditional-region','conditional-join','iteration-binding'].includes(r.type)?'role-relationships':'computation-structure'});
      covered.add(r.node);
    }
    for(const n of ir.nodes){
      const externalInput=n.kind==='interface'&&n.role==='input'&&!ir.edges.some(e=>e.target===n.id);
      const externalOutput=n.kind==='interface'&&n.role==='output'&&!ir.edges.some(e=>e.source===n.id);
      if((!covered.has(n.id)&&['compute','opaque','control'].includes(n.kind))||externalInput||externalOutput)
        goals.push({id:'goal:node:'+n.id,kind:n.kind==='interface'?'external-interface':'computation',focus_node:n.id,core:[n.id],
          edges:externalOutput?ir.edges.filter(e=>e.target===n.id&&['data','alias','interface-binding'].includes(e.kind)).map(e=>e.id):[],
          direction:externalInput?'input':externalOutput?'output':null,priority:n.kind==='opaque'?3:1,expression:n.kind==='opaque'?'boundary-summary':'computation-structure'});
    }
    return {schema:VERSION,goals};
  }
  function evaluate(goalSet,graph,prepared){
    const routed=new Map(prepared.routes.map(e=>[e.id,e])),edges=new Map();
    for(const e of prepared.routes)for(const m of e.bundle_members||[e])for(const id of new Set([m.id,...m.originals||[]])){
      if(!edges.has(id))edges.set(id,[]);edges.get(id).push(e);
    }
    return goalSet.goals.map(goal=>{
      const missingNodes=goal.core.filter(id=>!graph.positions.has(id));
      const missingEdges=goal.edges.filter(id=>!edges.has(id));
      const failures=goal.edges.filter(id=>(edges.get(id)||[]).some(e=>!routed.get(e.id)?.route.ok));
      const receipts=graph.constraint_receipts?.filter(c=>c.evidence.relation===goal.relation)||[];
      const conflicts=receipts.filter(c=>c.status==='conflict').map(c=>c.id);
      const printed=n=>(n?.paper?.captions||[]).join('').replace(/\s/g,'');
      const missingIdentity=goal.identity?goal.kind==='same-object-calls'?goal.identity.calls.filter(id=>{
        const n=graph.nodes.find(n=>n.id===id),d=n?.identity_display;return d?.reference!==goal.identity.reference||d.relation!==goal.relation||!printed(n).includes(d.label.replace(/\s/g,''))||!printed(n).includes(`sourcecall${d.invocation}/${d.count}`);
      }):[goal.identity.node].filter(id=>{
        const n=graph.nodes.find(n=>n.id===id);return n?.identity_display?.relation!==goal.relation||!goal.identity.aliases.every(a=>printed(n).includes(a.replace(/\s/g,'')));
      }):[];
      // Every relation edge has to reach a physical path; hidden internal edges
      // and merely attached evidence cannot count as an expressed relationship.
      const fulfilled=!missingNodes.length&&!missingEdges.length&&!failures.length&&!conflicts.length&&!missingIdentity.length;
      return {goal:goal.id,kind:goal.kind,expression:goal.expression,status:fulfilled?'fulfilled':'unfulfilled',
        missing_nodes:missingNodes,missing_edges:missingEdges,missing_identity:missingIdentity,route_failures:failures,constraint_conflicts:conflicts,
        visible_edges:[...new Set(goal.edges.flatMap(id=>(edges.get(id)||[]).map(e=>e.id)))]};
    });
  }
  function panelRequests(goalSet,plan){
    const by=new Map(plan.nodes.map(n=>[n.id,n]));
    const ancestry=id=>{const result=[];while(id){result.push(id);id=by.get(id)?.parent;}return result;};
    const grouped=new Map();
    for(const goal of goalSet.goals){
      const chains=goal.core.map(ancestry),scope=chains[0].find(id=>by.get(id)?.kind==='composite'&&chains.every(c=>c.includes(id)));
      if(!scope)continue;
      if(!grouped.has(scope))grouped.set(scope,{id:scope,goals:[],required_open:new Set(),priority:0});
      const request=grouped.get(scope);request.goals.push(goal.id);request.priority=Math.max(request.priority,goal.priority);
      for(const id of goal.core){let at=by.get(id)?.parent;while(at){request.required_open.add(at);if(at===scope)break;at=by.get(at)?.parent;}}
    }
    return [...grouped.values()].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).map(r=>({...r,required_open:[...r.required_open]}));
  }
  const api={VERSION,build,evaluate,panelRequests};root.SemanticExpressionGoals=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

/* A local role frontier consumes existing certificates. It neither recognizes
 * model families nor substitutes computations for their internal paths. */
(function(root){
  'use strict';
  const VERSION='role-frontier/1';
  function compile({plan,focus}){
    const nodes=plan.nodes.map(n=>({...n})),by=new Map(nodes.map(n=>[n.id,n])),certs=new Map((plan.semantic_contracts||[]).map(c=>[c.id,c]));
    const within=(id,owner)=>{const seen=new Set();while(id&&!seen.has(id)){if(id===owner)return true;seen.add(id);id=by.get(id)?.parent;}return false;};
    const attached=n=>(n.semantic_contracts||[]).map(id=>certs.get(id)).filter(c=>c?.node===n.id);
    const candidates=new Set(nodes.filter(n=>n.kind==='composite'&&within(n.id,focus)&&attached(n).length).map(n=>n.id));
    const owners=new Set([...candidates].filter(id=>{let at=by.get(id)?.parent;while(at&&within(at,focus)){if(candidates.has(at))return false;at=by.get(at)?.parent;}return true;}));
    const open=new Set(),records=[],modules=[];
    const protectedFrame=n=>n.kind==='opaque'||n.kind==='control'||n.condition||n.mutable||n.identity_display||n.observed_calls||
      ['conditional-region','conditional-collection','loop-template','iteration-region','observed-variant','serial-repeat','repeat-instance','serial-remainder'].includes(n.semantic_type);
    const ownerOf=id=>{while(id){if(owners.has(id))return id;id=by.get(id)?.parent;}return null;};
    function references(value,path=[]){
      if(typeof value==='string'&&by.has(value))return [{path:path.join('.'),node:value}];
      if(value&&typeof value==='object')return Object.entries(value).flatMap(([key,v])=>references(v,[...path,key]));
      return [];
    }
    for(const owner of owners){
      const n=by.get(owner),local=[];
      for(const c of attached(n))for(const r of references(c.roles)){
        const record={owner,certificate:c.id,role:r.path,node:r.node,scope:c.scope,not_asserted:c.not_asserted||[]};
        if(r.node===owner||!within(r.node,owner)){records.push({...record,location:r.node===owner?'self':'external',frontier_node:r.node});continue;}
        // Stop before the next certified, conditional, unknown or mutable
        // boundary. Its own detail remains available through manual expansion.
        const chain=[];let at=r.node;while(at&&at!==owner){chain.unshift(at);at=by.get(at)?.parent;}
        let target=r.node;
        for(const id of chain){const child=by.get(id);if(protectedFrame(child)||attached(child).length){target=id;break;}}
        const row={...record,location:'internal',frontier_node:target};records.push(row);local.push(row);
        let parent=by.get(target)?.parent;while(parent&&parent!==owner){open.add(parent);parent=by.get(parent)?.parent;}
        const child=by.get(target);child.role_annotations=[...(child.role_annotations||[]),row];
      }
      if(local.length&&!protectedFrame(n))open.add(owner);
      modules.push({node:owner,certificates:attached(n).map(c=>c.id),roles:local.length,scope:'one local role layer; nested certified/control/unknown boundaries retain independent detail'});
    }
    return {plan:{...plan,nodes},open,owners,ownerOf,records,modules};
  }
  function receipt(frontier,graph){
    const attached=new Set(graph.node_accounting.attached),contracted=new Set(graph.node_accounting.contracted);
    return {rule_version:VERSION,modules:frontier.modules.map(m=>({...m,expanded:!!graph.positions.get(m.node)?.expanded})),roles:frontier.records.map(r=>{
      const visible=graph.positions.has(r.frontier_node),representative=graph.representatives[r.frontier_node]||null;
      return {...r,visible_node:visible?r.frontier_node:representative,status:visible?(r.node===r.frontier_node?'exposed':'boundary'):
        attached.has(r.frontier_node)?'attached':contracted.has(r.frontier_node)?'contracted':representative?'folded':'outside'};
    }),scope:'Existing certificate role references only; no equivalence, missing role, causality or execution-count claim is added.'};
  }
  const api={VERSION,compile,receipt};root.SemanticRoleFrontier=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

/* Reversible presentation subregions selected from certified roles. A stage
 * never takes ownership of the certificate or of its entire proof scope. */
(function(root){
  'use strict';
  const VERSION='contract-stages/1',copy=x=>JSON.parse(JSON.stringify(x)),flow=e=>['data','alias','interface-binding'].includes(e.kind);
  function compile({ir,plan}){
    const nodes=plan.nodes.map(n=>({...n})),by=new Map(nodes.map(n=>[n.id,n])),canonical=new Map(ir.nodes.map(n=>[n.id,n])),ins=new Map(),uses=new Map(),rows=[],rejected=[],claimed=new Set();
    for(const e of ir.edges){if(!ins.has(e.target))ins.set(e.target,[]);ins.get(e.target).push(e);if(!uses.has(e.source))uses.set(e.source,[]);uses.get(e.source).push(e);}
    const guarded=n=>!n||n.kind==='opaque'||n.kind==='control'||n.mutable||n.condition||n.identity_display||n.observed_calls||n.evidence_status==='runtime-only'||n.runtime_evidence?.length;
    const resolve=(node,slot='out')=>{const seen=new Set();while(!seen.has(node)){
      seen.add(node);const n=canonical.get(node),incoming=ins.get(node)||[];
      if(!n||!['interface','value-alias'].includes(n.kind)||n.operator||guarded(n)||incoming.length!==1||!flow(incoming[0])||incoming[0].condition)break;
      const e=incoming[0],outer=n.kind==='value-alias'?(n.slot??e.source_port??'out'):(e.source_port??'out');
      slot=outer==='out'?slot:slot==='out'?outer:outer+'.'+slot;node=e.source;
    }return {node,slot};};
    for(const c of plan.semantic_contracts||[]){
      // This recipe is a local operation relation, independent of the enclosing
      // source/model name. Other certified role recipes can share this protocol.
      if(c.rule!=='residual-postnorm')continue;
      const r=c.roles||{},add=by.get(r.add),norm=by.get(r.normalization),core=[r.add,r.normalization];
      const reject=reason=>rejected.push({certificate:c.id,roles:core,reason});
      if(c.rule_version!=='source-contracts/1'||c.node!==r.normalization||r.output!==r.normalization||r.order!=='postnorm'||
        new Set(core).size!==2||core.some(id=>!canonical.has(id)||!c.members?.includes(id))){reject('incompatible-certificate');continue;}
      if(core.some(id=>claimed.has(id))){reject('overlapping-stage-roles');continue;}
      if(core.some(id=>guarded(by.get(id))||by.get(id)?.kind!=='compute')||!add.parent||add.parent!==norm.parent||
        norm.framework_type!==r.normalization_type||add.operator!=='add'){reject('incompatible-role-boundary');continue;}
      let parent=by.get(add.parent),blocked=false;while(parent){if(guarded(parent)){blocked=true;break;}parent=by.get(parent.parent);}
      if(blocked){reject('protected-enclosing-boundary');continue;}
      const incident=ir.edges.filter(e=>core.includes(e.source)||core.includes(e.target));
      if(incident.some(e=>e.condition||!flow(e)&&!['parameter-read','buffer-read','state-read'].includes(e.kind))){reject('effect-or-control-boundary');continue;}
      const outgoing=uses.get(add.id)||[],input=(ins.get(norm.id)||[]).filter(flow),operands=(ins.get(add.id)||[]).filter(flow);
      if(outgoing.length!==1||input.length!==1||outgoing[0]!==input[0]||input[0].target!==norm.id||
        (input[0].source_port??'out')!=='out'||operands.length!==2){reject('escaping-or-indirect-intermediate');continue;}
      const matches=(e,node,slot)=>{const v=resolve(e.source,e.source_port??'out');return v.node===node&&v.slot===slot;};
      const skip=operands.filter(e=>matches(e,r.skip,r.skip_slot)),branch=operands.filter(e=>matches(e,r.branch,r.branch_slot));
      if(skip.length!==1||branch.length!==1||skip[0]===branch[0]||skip[0].target_port===branch[0].target_port){reject('operand-role-mismatch');continue;}
      // A resource may enter as an annotation; it is never reparented or treated
      // as a tensor operand. Unknown sources cannot be hidden in this stage.
      if(incident.some(e=>!flow(e)&&(!['parameter','buffer','state'].includes(canonical.get(e.source)?.kind)||e.target!==norm.id))){reject('unresolved-resource-boundary');continue;}
      let id='paper:contract-stage:'+c.id;while(by.has(id))id+=':1';
      const cuts=incident.filter(e=>core.includes(e.source)!==core.includes(e.target));
      const row={rule_version:VERSION,node:id,form:'certified-role-subregion',certificate:c.id,certificate_node:c.node,
        recipe:'residual-postnorm-tail',roles:{add:add.id,normalization:norm.id,skip:r.skip,skip_slot:r.skip_slot,branch:r.branch,branch_slot:r.branch_slot},
        canonical_members:core.slice(),cuts:copy(cuts),internal_edges:[input[0].id],
        operands:operands.map(e=>({edge:e.id,role:e===skip[0]?'skip':'branch',...resolve(e.source,e.source_port??'out'),target:e.target,target_port:e.target_port})),
        normalization_type:r.normalization_type,scope:c.scope,not_asserted:copy(c.not_asserted||[])};
      const stage={id,parent:add.parent,kind:'composite',semantic_type:'certified-role-stage',label:'Add & Norm',
        presentation_only:true,source_parent:null,source:core.flatMap(id=>canonical.get(id).source||[]),runtime_evidence:[],evidence_status:'static-only',
        canonical_members:core.slice(),boundary_ports:copy(cuts),contract_stage:row};
      nodes.push(stage);by.set(id,stage);add.parent=id;norm.parent=id;core.forEach(id=>claimed.add(id));rows.push(row);
    }
    return {plan:{...plan,nodes},rows,rejected};
  }
  function receipt(stages,graph){return {rule_version:VERSION,rows:stages.rows.map(r=>({...r,
    visible_node:graph.positions.has(r.node)?r.node:graph.representatives[r.canonical_members[0]]||null,
    status:graph.positions.has(r.node)?graph.positions.get(r.node).expanded?'expanded':'summary':'folded',
    detailed_operations_exposed:r.canonical_members.every(id=>graph.positions.has(id)),
    bypass_constraint:'constraint:design:'+r.certificate+':bypass'})),rejected:stages.rejected};}
  const api={VERSION,compile,receipt};root.SemanticContractStages=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

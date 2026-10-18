/* Evidence-backed local graph rules. This module never edits the canonical IR.
 * Source ownership, semantic findings and the presentation tree are independent.
 * Unknown operators are boundaries, not invitations to manufacture a template. */
(function(root){
  'use strict';
  const VERSION='architecture-rules/1';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const flow=e=>['data','alias','interface-binding'].includes(e.kind);
  const transparent=n=>n&&(n.kind==='interface'||n.kind==='value-alias')&&n.slot==null&&!n.operator;
  const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return(h>>>0).toString(16);};
  function operator(n){
    if(!n||n.kind==='opaque')return null;
    const activation=(n.function_target||n.framework_type||'').split('.').at(-1)?.toLowerCase();
    if(['sigmoid','tanh'].includes(activation))return activation;
    const op=n.operator||'';
    if(!op.startsWith('aten.'))return op;
    const name=op.split('.')[1];
    return ({mul:'mult',add:'add',sigmoid:'sigmoid',tanh:'tanh',relu:'activation',gelu:'activation',
      linear:'linear',convolution:'convolution',conv2d:'convolution',layer_norm:'normalization',
      native_layer_norm:'normalization',softmax:'softmax',_softmax:'softmax',dropout:'dropout'})[name]||op;
  }
  function build(ir){
    const original=new Map(ir.nodes.map(n=>[n.id,n])),incoming=new Map(),outgoing=new Map();
    for(const e of ir.edges){
      if(!incoming.has(e.target))incoming.set(e.target,[]);incoming.get(e.target).push(e);
      if(!outgoing.has(e.source))outgoing.set(e.source,[]);outgoing.get(e.source).push(e);
    }
    // Resolve only unambiguous aliases/interfaces; tuple slots and conditional
    // joins retain their identity. No guessed tensor equivalence across slots.
    function value(id,port='out',seen=new Set()){
      const key=JSON.stringify([id,port]);if(seen.has(key))return {id,port};seen.add(key);
      const n=original.get(id),es=(incoming.get(id)||[]).filter(flow);
      if(transparent(n)&&es.length===1&&!es[0].condition)return value(es[0].source,es[0].source_port,seen);
      return {id,port};
    }
    const producer=id=>value(id).id;
    function inputs(id){return (incoming.get(id)||[]).filter(e=>flow(e)&&!e.condition).map(e=>({...value(e.source,e.source_port),edge:e}));}
    function compatible(a,b){return a.evidence===b.evidence||new Set([a.evidence,b.evidence]).size===2&&[a.evidence,b.evidence].every(e=>['source-dependency','framework-contract'].includes(e));}
    // Find a dependency path with a bounded search. A successful path says only
    // that one value feeds a substructure; it is not an all-input equivalence proof.
    function path(from,to,evidence){
      const queue=[[to,[]]],seen=new Set();
      for(let i=0;i<queue.length&&i<2048;i++){
        const [at,tail]=queue[i],{id,port}=at;if(id===from.id&&port===from.port)return tail;
        const key=JSON.stringify([id,port]);if(seen.has(key)||tail.length>=48)continue;seen.add(key);
        const n=original.get(id);
        if(!n||!['compute','interface','value-alias'].includes(n.kind)||n.mutable||n.condition||n.operator==='phi')continue;
        for(const e of incoming.get(id)||[])if(flow(e)&&!e.condition&&compatible(e,{evidence}))queue.push([value(e.source,e.source_port),[id,...tail]]);
      }
      return null;
    }
    function support(at,stop){
      const queue=[at],seen=new Set(),members=[];
      for(let i=0;i<queue.length&&i<2048;i++){
        const current=queue[i],key=JSON.stringify([current.id,current.port]);
        if(seen.has(key)||current.id===stop.id&&current.port===stop.port)continue;seen.add(key);
        const n=original.get(current.id);if(!n||['parameter','buffer','state','control','composite'].includes(n.kind))continue;
        const es=(incoming.get(current.id)||[]).filter(flow);
        if(n.kind==='interface'&&!es.length)continue;
        members.push(current.id);
        if(n.kind==='opaque'||n.operator==='phi')continue;
        for(const e of es)if(!e.condition)queue.push(value(e.source,e.source_port));
      }
      return members;
    }
    const findings=[];
    function finding(rule,label,members,roles,proof,excluded=[]){
      members=[...new Set(members)];
      const sorted=members.slice().sort(),base='architecture:'+rule+':'+hash(sorted.join('|'));
      if(findings.some(f=>f.rule===rule&&JSON.stringify(f.members.slice().sort())===JSON.stringify(sorted)))return;
      let id=base;for(let suffix=1;findings.some(f=>f.id===id);suffix++)id=base+':'+suffix;
      findings.push({id,rule,label,members,roles,proof,excluded,rule_version:VERSION,
        evidence_scope:members.some(id=>original.get(id)?.evidence_status==='runtime-only')?'observed-run':'source-dependencies'});
    }
    function consumers(id){
      // Consumers through explicit bindings, including local helper interfaces.
      const todo=[id],seen=new Set(),result=[];
      for(let i=0;i<todo.length&&i<2048;i++){
        const at=todo[i];if(seen.has(at))continue;seen.add(at);
        for(const e of outgoing.get(at)||[]){
          if(!flow(e)||e.condition)continue;
          if(transparent(original.get(e.target)))todo.push(e.target);else result.push(e.target);
        }
      }
      return [...new Set(result)];
    }
    for(const n of ir.nodes){
      if(n.kind!=='compute')continue;
      const op=operator(n),ins=inputs(n.id);
      if(['mult','mul'].includes(op)&&ins.length===2&&compatible(ins[0].edge,ins[1].edge)){
        const gate=ins.find(p=>operator(original.get(p.id))==='sigmoid');
        if(gate&&gate.id!==ins.find(p=>p!==gate).id){
          const value=ins.find(p=>p!==gate).id,members=[gate.id,n.id];
          if(operator(original.get(value))==='tanh')members.push(value);
          finding('gate','Sigmoid gate',members,{gate:gate.id,value,output:n.id},['sigmoid output is an explicit operand of multiplication; no LSTM claim']);
        }
      }
      if(op==='matmul'||/^aten\.(bmm|mm|matmul)\./.test(op||'')){
        for(const operand of ins){
          let at=operand.id,chain=[],scaled=false,softmax=null,score=null;
          for(let step=0;step<12;step++){
            const current=original.get(at),kind=operator(current);
            if(!current||current.kind==='opaque'||current.mutable)break;
            if(kind==='softmax')softmax=at;
            if(['div','mult','mul'].includes(kind)||/^aten\.(div|mul)\./.test(kind||''))scaled=true;
            if(softmax&&(kind==='matmul'||/^aten\.(bmm|mm|matmul)\./.test(kind||''))){score=at;break;}
            // Follow a single data input; scale constants have no producer in
            // the static IR. Multiple tensor inputs must not be guessed away.
            const prev=inputs(at).filter(p=>kind!=='softmax'||!['kw:dim','arg:1'].includes(p.edge.target_port));if(prev.length!==1)break;
            chain.push(at);at=prev[0].id;
          }
          if(score&&softmax&&scaled){const other=ins.find(p=>p!==operand);
            if(other)finding('scaled-attention-like','Scaled attention-like',[score,...chain,n.id],
              {scores:score,normalization:softmax,values:other.id,output:n.id},
              ['matmul → scale → softmax → matmul operand path; Q/K/V and head identities are not asserted']);
          }
        }
      }
      if(op==='linear'||op==='convolution'){
        const activations=consumers(n.id).filter(id=>operator(original.get(id))==='activation');
        for(const act of activations){
          const next=consumers(act);
          if(op==='linear'){
            for(const end of next.filter(id=>operator(original.get(id))==='linear'))
              finding('feed-forward','Feed-forward',[n.id,act,end],{input:n.id,activation:act,output:end},['Linear → activation → Linear operand dependency path']);
          }else{
            const pool=next.find(id=>operator(original.get(id))==='pooling');
            finding('convolution-block','Convolution block',[n.id,act,...(pool?[pool]:[])],{convolution:n.id,activation:act,...(pool?{pooling:pool}:{})},['convolution → activation'+(pool?' → pooling':'')+' operand dependency path']);
          }
        }
      }
      if(op!=='add'||ins.length!==2||n.mutable||!compatible(ins[0].edge,ins[1].edge))continue;
      for(let side=0;side<2;side++){
        const skip=ins[side].id,branch=ins[1-side].id;
        if(skip===branch)continue;
        const branchPath=path(ins[side],ins[1-side],ins[side].edge.evidence);
        if(!branchPath?.length)continue;
        const norm=consumers(n.id).find(id=>operator(original.get(id))==='normalization'&&inputs(id).length===1);
        // A normalization *somewhere* in a branch is not sufficient for Pre-LN.
        const prenorm=branchPath.find(id=>operator(original.get(id))==='normalization'&&inputs(id).length===1&&inputs(id)[0].id===skip&&inputs(id)[0].port===ins[side].port);
        const rule=norm?'residual-postnorm':prenorm?'residual-prenorm':'residual';
        finding(rule,norm?'Residual · Post-Norm':prenorm?'Residual · Pre-Norm':'Residual',
          [...support(ins[1-side],ins[side]),n.id,...(norm?[norm]:[])],{skip,branch,add:n.id,...(norm?{normalization:norm}:prenorm?{normalization:prenorm}:{})},
          ['skip value is an actual producer of both the branch path and addition',norm?'normalization consumes the addition output':prenorm?'normalization directly consumes the skip value':'normalization order not asserted'],[skip]);
        break;
      }
    }
    // Serial invocations of the same local definition and configuration can be
    // summarized without substituting one instance for another. All instances
    // and parameter paths remain inside the summary; sharing is not guessed.
    const scopes=new Map();
    const unresolved=x=>x&&typeof x==='object'&&('unresolved' in x||Object.values(x).some(unresolved));
    for(const n of ir.nodes)if(n.kind==='composite'&&['source-module','source-function'].includes(n.semantic_type)&&n.source?.length&&Object.hasOwn(n,'constructor')&&n.constructor!==undefined&&!unresolved(n.constructor)){
      if(!scopes.has(n.parent))scopes.set(n.parent,[]);scopes.get(n.parent).push(n);
    }
    function originalOwner(id,parent){while(id!=null&&original.get(id)?.parent!==parent)id=original.get(id)?.parent;return id;}
    for(const [parent,calls]of scopes){
      if(calls.length<2)continue;
      const ids=new Set(calls.map(n=>n.id)),adj=new Map(calls.map(n=>[n.id,new Set()])),prev=new Map(calls.map(n=>[n.id,new Set()]));
      for(const e of ir.edges)if(flow(e)&&!e.condition){
        const a=originalOwner(producer(e.source),parent),b=originalOwner(e.target,parent);
        if(ids.has(a)&&ids.has(b)&&a!==b){adj.get(a).add(b);prev.get(b).add(a);}
      }
      const signature=n=>JSON.stringify([(n.source||[]).map(s=>[s.file,s.symbol,s.line,s.column]),n.constructor]);
      const same=(a,b)=>signature(original.get(a))===signature(original.get(b));
      const next=id=>[...adj.get(id)].filter(b=>same(id,b));
      for(const n of calls){
        if([...prev.get(n.id)].some(a=>same(a,n.id)))continue;
        const members=[n.id],seen=new Set(members);let at=n.id;
        while(next(at).length===1){const b=next(at)[0];if(seen.has(b)||[...prev.get(b)].filter(a=>same(a,b)).length!==1)break;members.push(b);seen.add(b);at=b;}
        if(members.length>1)finding('repeated-source',`Repeated structure × ${members.length}`,members,
          {instances:members,parameter_scopes:members.map(id=>original.get(id).module_path),parameter_sharing:'unresolved'},
          ['serial dependency between invocations of the same local source definition and constructor configuration',
            'every invocation is retained; equivalent outputs and independent/shared parameters are not asserted']);
      }
    }
    const nodes=ir.nodes.map(n=>({...copy(n),source_parent:n.source_parent===undefined?n.parent:n.source_parent}));
    const by=new Map(nodes.map(n=>[n.id,n]));
    const descendants=id=>{const result=[];for(const n of nodes)if(n.parent===id)result.push(n.id,...descendants(n.id));return result;};
    function ancestry(id){const result=[];while(id!=null){result.push(id);id=by.get(id)?.parent;}result.push(null);return result;}
    function direct(id,parent){while(by.get(id)?.parent!==parent){id=by.get(id)?.parent;if(id==null)return null;}return id;}
    // Findings can overlap. Materialize compatible, nested groups only; retain
    // every incompatible finding as evidence rather than forcing a false tree.
    for(const f of findings.slice().sort((a,b)=>a.members.length-b.members.length||a.id.localeCompare(b.id))){
      const chains=f.members.map(ancestry),parent=chains[0].slice(1).find(p=>chains.every(c=>c.includes(p)));
      const members=[...new Set(f.members.map(id=>direct(id,parent)))];
      if(members.includes(null)||members.length<2){f.presentation='annotation';continue;}
      const closure=new Set(members.flatMap(id=>[id,...descendants(id)]));
      if(f.excluded.some(id=>closure.has(id))||members.some(id=>by.get(id)?.kind==='opaque')){f.presentation='annotation';continue;}
      const partialOverlap=members.some(id=>{
        const grouped=findings.find(other=>other.id===by.get(id)?.finding);
        return grouped&&!grouped.members.every(id=>f.members.includes(id));
      });
      if(partialOverlap){f.presentation='annotation';f.presentation_reason='overlapping findings cannot form a nested presentation tree';continue;}
      // Move dependent aliases and exclusively owned resources with the group.
      let changed=true;
      while(changed){changed=false;for(const n of nodes){
        if(n.parent!==parent||closure.has(n.id))continue;
        const es=(incoming.get(n.id)||[]).filter(flow),uses=outgoing.get(n.id)||[];
        const binding=n.kind==='value-alias'&&!n.operator&&es.length===1&&closure.has(es[0].source);
        const resource=['parameter','buffer'].includes(n.kind)&&uses.length&&uses.every(e=>closure.has(e.target));
        if(binding||resource){members.push(n.id);closure.add(n.id);changed=true;}
      }}
      const sources=members.flatMap(id=>by.get(id).source||[]),runtime=members.flatMap(id=>by.get(id).runtime_evidence||[]);
      const group={id:f.id,kind:'composite',label:f.label,parent,source:sources,runtime_evidence:runtime,
        semantic_type:f.rule,granularity:'composite',evidence_status:f.evidence_scope==='observed-run'?'runtime-only':'static-only',
        glyph:{shape:'frame',fill:'#e9f1ff'},presentation_only:true,finding:f.id};
      nodes.push(group);by.set(group.id,group);for(const id of members)by.get(id).parent=group.id;
      f.presentation='group';f.parent=parent;
    }
    // Each original node and edge survives. Boundary ports identify the exact
    // cut, even when two tensors connect the same pair of collapsed modules.
    for(const n of nodes)if(n.presentation_only){
      const inside=new Set(descendants(n.id));
      n.canonical_members=[...inside].filter(id=>original.has(id));
      n.boundary_ports=ir.edges.filter(e=>inside.has(e.source)!==inside.has(e.target)).map(e=>({
        id:e.id,direction:inside.has(e.target)?'input':'output',source:e.source,source_port:e.source_port,
        target:e.target,target_port:e.target_port,evidence:e.evidence,...(e.condition?{condition:copy(e.condition)}:{})
      }));
    }
    return {schema:'archcanvas-architecture/1',rule_version:VERSION,canonical_digest:ir.ir_digest,nodes,edges:ir.edges.map(copy),findings,
      limitations:['Local dependency patterns do not certify arbitrary-input behavior.',
        'Unknown operations, tuple slots, conditional joins and loop templates remain explicit.',
        'No Q/K/V, complete LSTM, MoE or model-family identity is inferred from names.']};
  }
  const api={VERSION,build,operator};root.SemanticArchitecture=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

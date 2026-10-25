/* Frozen pre-transfer port oracle (2026-10-25). */
  function closure(doc,ids){const found=new Set(ids),children=new Map();for(const n of doc.nodes){if(!children.has(n.parent))children.set(n.parent,[]);children.get(n.parent).push(n.id);}const todo=[...found];for(let i=0;i<todo.length;i++)for(const id of children.get(todo[i])||[])if(!found.has(id)){found.add(id);todo.push(id);}return found;}
  function ports(doc,id){
    const n=doc.nodes.find(n=>n.id===id);if(!n)throw Error('模块不存在');const inside=closure(doc,[id]),children=doc.nodes.filter(n=>n.parent===id),inputs=[],outputs=[];
    function put(list,node,port,label){if(!list.some(p=>p.node===node&&p.port===String(port)))list.push({node,port:String(port),label:label||String(port)});}
    if(n.kind!=='composite'){
      const ins=doc.edges.filter(e=>e.target===id);for(const e of ins)put(inputs,id,e.target_port,e.target_port);
      if(!inputs.length&&!['parameter','state','buffer'].includes(n.kind))put(inputs,id,'in','输入');
      const out=doc.edges.filter(e=>e.source===id);for(const e of out)put(outputs,id,e.source_port,e.source_port);
      if(!outputs.length)put(outputs,id,'out','输出');return {inputs,outputs};
    }
    for(const c of children){if(c.kind==='interface'&&c.role==='input')put(inputs,c.id,'in',c.label);if(c.kind==='interface'&&c.role==='output')put(outputs,c.id,'out',c.label);}
    const boundaryLabel=(node,port)=>{const child=doc.nodes.find(n=>n.id===node),owner=doc.nodes.find(n=>n.id===child?.parent);return (owner&&owner.id!==id?owner.label+' · ':'')+(child?.kind==='interface'?child.label:String(port));};
    for(const e of doc.edges){if(!inside.has(e.source)&&inside.has(e.target))put(inputs,e.target,e.target_port,boundaryLabel(e.target,e.target_port));if(inside.has(e.source)&&!inside.has(e.target))put(outputs,e.source,e.source_port,boundaryLabel(e.source,e.source_port));}
    const needInputs=!inputs.length,needOutputs=!outputs.length;if(needInputs||needOutputs)for(const child of children.filter(n=>n.kind==='composite')){const p=ports(doc,child.id);if(needInputs)for(const v of p.inputs)if(!doc.edges.some(e=>e.target===v.node&&String(e.target_port)===v.port))put(inputs,v.node,v.port,child.label+' · '+v.label);if(needOutputs)for(const v of p.outputs)if(!doc.edges.some(e=>e.source===v.node&&inside.has(e.target)))put(outputs,v.node,v.port,child.label+' · '+v.label);}
    return {inputs,outputs};
  }

module.exports={ports};

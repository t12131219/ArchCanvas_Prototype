/* DOM-only preview. Solving and fact validation belong to the scene worker.
 * Adjacent runs preserve the exact paint order, including nested frame layers. */
(function(root){
  'use strict';
  const I=root.SemanticCanvasInteraction||(typeof require==='function'?require('./canvas-interaction'):null);
  function create({session,nodes,edges,labels=[],markers=[],document:doc=root.document}){
    const translated=new Set(),hidden=[],boundary=[],wrappers=[];
    for(const id of session.ids){const node=nodes.get(id);if(node)translated.add(node);}
    const affected=new Map(session.edges.map(e=>[e.id,e]));
    for(const edge of session.edges){const element=edges.get(edge.id);if(!element)continue;
      if(session.ids.has(edge.source)&&session.ids.has(edge.target))translated.add(element);
      else {const paths=element.tagName.toLowerCase()==='path'?[element]:[...element.querySelectorAll('path')];
        boundary.push({edge,paths,original:paths.map(p=>p.getAttribute('d'))});}
    }
    for(const item of [...labels,...markers]){
      const es=item.edges||[item.edge],internal=es.every(id=>{const e=affected.get(id);return e&&session.ids.has(e.source)&&session.ids.has(e.target);});
      if(!es.some(id=>affected.has(id)))continue;
      if(internal)translated.add(item.element);
      else {hidden.push([item.element,item.element.getAttribute('visibility')]);item.element.setAttribute('visibility','hidden');}
    }
    const parents=new Set([...translated].map(n=>n.parentNode));
    for(const parent of parents){let group=null;
      for(const child of [...parent.children]){
        if(!translated.has(child)){group=null;continue;}
        if(!group){group=doc.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('data-move-preview','');parent.insertBefore(group,child);wrappers.push(group);}
        group.appendChild(child);
      }
    }
    let disposed=false;
    return {stats:{translated:translated.size,groups:wrappers.length,boundary:boundary.length},
      update(dx,dy){if(disposed)return;const transform=`translate(${dx},${dy})`;
        for(const group of wrappers)group.setAttribute('transform',transform);
        for(const item of boundary){const d=I.path(I.previewRoute(item.edge,session,dx,dy));for(const p of item.paths)p.setAttribute('d',d);}
      },
      reset(){if(disposed)return;disposed=true;
        for(const group of wrappers){while(group.firstChild)group.parentNode.insertBefore(group.firstChild,group);group.remove();}
        for(const item of boundary)item.paths.forEach((p,i)=>p.setAttribute('d',item.original[i]));
        for(const [element,value]of hidden)if(value==null)element.removeAttribute('visibility');else element.setAttribute('visibility',value);
      }};
  }
  const api={create};root.SemanticCanvasPreview=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

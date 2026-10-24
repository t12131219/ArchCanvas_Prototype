// Quadratic oracle from ebb39ec; unchanged narrow-phase arithmetic.
  function lineGeometry(routes){
    const overlaps=[],contacts=[];let crossings=0;
    for(let i=0;i<routes.length;i++)for(let j=i+1;j<routes.length;j++){
      const first=routes[i],second=routes[j],touches=new Set();let sharedLength=0;
      const sameValue=first.resolved_source===second.resolved_source&&first.source_port===second.source_port;
      for(let a=1;a<first.route.points.length;a++)for(let b=1;b<second.route.points.length;b++){
        const p=first.route.points[a-1],q=first.route.points[a],u=second.route.points[b-1],v=second.route.points[b],vertical=p.x===q.x,otherVertical=u.x===v.x;
        if(vertical===otherVertical){
          if(vertical?p.x!==u.x:p.y!==u.y)continue;
          const length=vertical?Math.min(Math.max(p.y,q.y),Math.max(u.y,v.y))-Math.max(Math.min(p.y,q.y),Math.min(u.y,v.y)):Math.min(Math.max(p.x,q.x),Math.max(u.x,v.x))-Math.max(Math.min(p.x,q.x),Math.min(u.x,v.x));
          if(length>8)sharedLength+=length;
        }else{
          const [a,b,c,d]=vertical?[p,q,u,v]:[u,v,p,q];
          if(a.x>Math.min(c.x,d.x)&&a.x<Math.max(c.x,d.x)&&c.y>Math.min(a.y,b.y)&&c.y<Math.max(a.y,b.y))crossings++;
          else if(!sameValue&&a.x>=Math.min(c.x,d.x)&&a.x<=Math.max(c.x,d.x)&&c.y>=Math.min(a.y,b.y)&&c.y<=Math.max(a.y,b.y)){
            const endpoint=edge=>[edge.route.points[0],edge.route.points.at(-1)].some(p=>p.x===a.x&&p.y===c.y);
            // A bend touching another wire is visually a junction even though
            // strict segment-interior crossing tests do not count it.
            if(!(endpoint(first)&&endpoint(second)))touches.add(JSON.stringify([a.x,c.y]));
          }
        }
      }
      if(sharedLength)overlaps.push({edges:[first.id,second.id],length:sharedLength,same_value:sameValue});
      for(const p of touches){const [x,y]=JSON.parse(p);contacts.push({edges:[first.id,second.id],x,y});}
    }
    return {crossings,overlapping_paths:overlaps,unrelated_contacts:contacts};
  }
module.exports={lineGeometry};

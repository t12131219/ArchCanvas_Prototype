/* Exact pre-change oracle from 57d79f3. Retain separately from optimized code. */
'use strict';
  const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1e-5&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1e-5;
  function constrain(s,dx,dy){
    if(!s||!Number.isFinite(dx)||!Number.isFinite(dy))return {ok:false,reason:'invalid displacement'};
    const p=s.origins.get(s.id),b=s.parent||s.bounds,pad=s.parent?2:0,header=s.parent?(s.parent.header||0):0;
    const loX=b.x+pad-p.x,hiX=b.x+b.w-pad-p.x-p.w,loY=b.y+header+pad-p.y,hiY=b.y+b.h-pad-p.y-p.h;
    // A pre-existing tight frame must never cause a jump on pointerdown.
    dx=Math.max(Math.min(0,loX),Math.min(Math.max(0,hiX),dx));dy=Math.max(Math.min(0,loY),Math.min(Math.max(0,hiY),dy));
    for(const original of s.origins.values())for(const obstacle of s.obstacles){
      const moved={...original,x:original.x+dx,y:original.y+dy};
      if(overlap(moved,obstacle)&&!overlap(original,obstacle))return {ok:false,reason:'node overlap',dx:s.dx,dy:s.dy};
    }
    return {ok:true,dx,dy};
  }
  const textWidths=new Map();
  function width(s,font=16){
    const text=String(s),key=JSON.stringify([text,font]);
    if(textWidths.has(key))return textWidths.get(key);
    const value=Array.from(text).reduce((a,c)=>a+font*(/[^\u0000-\u024f]/u.test(c)?1:/[ilI.,:;'!|]/.test(c)?.29:/[MW@#%]/.test(c)?.85:.57),0);
    if(textWidths.size>=8192)textWidths.delete(textWidths.keys().next().value);
    textWidths.set(key,value);return value;
  }
  function wrap(text,limit,font=16){
    const lines=[];let line='';
    // Use identifier word boundaries before falling back to character cuts.
    // Keep every character: this changes wrapping, never the source label.
    for(const token of String(text).split(/(\s+|(?<=[_.\/·→])|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z]))/u).filter(Boolean)){
      if(line&&width(line+token,font)>limit){lines.push(line.trim());line='';}
      for(const c of token){if(line&&width(line+c,font)>limit){lines.push(line.trim());line='';}line+=c;}
    }
    if(line.trim())lines.push(line.trim());return lines.length?lines:[''];
  }

module.exports={constrain,wrap};

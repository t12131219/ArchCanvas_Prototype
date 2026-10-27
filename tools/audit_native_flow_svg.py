"""Check actual exported SVG paths independently of production routing helpers."""
import json,re,sys,xml.etree.ElementTree as ET
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else 'verification/native-flow/current');audit=json.loads((root/'flow-audit.json').read_text());ns={'s':'http://www.w3.org/2000/svg'};rows=[]
for row in audit['rows']:
 tree=ET.parse(root/(row['mode']+'.svg'));svg=tree.getroot();nodes=svg.findall('s:g[@data-node-id]',ns);leaf=[];frames=[]
 for n in nodes:
  rect=n.find('s:rect',ns)
  if rect is None:continue
  x,y=map(float,re.findall(r'[-\d.]+',n.attrib['transform']));box=(x,y,float(rect.attrib['width']),float(rect.attrib['height']),n.attrib['data-node-id'])
  (frames if float(rect.attrib['stroke-width'])==1.4 else leaf).append(box)
 wires=[];violations=[];styles={};border=0;tangencies=[];bands={};edge_points={}
 for g in svg.findall('s:g[@data-edge-id]',ns):
  p=g.find('s:path[@class="wire-path"]',ns);d=p.attrib['d'];assert not re.search('[A-KN-Z]',d),d
  nums=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',d)));pts=list(zip(nums[::2],nums[1::2]));segments=list(zip(pts,pts[1:]));wires.append((g.attrib['data-edge-id'],pts,segments))
  edge_points[g.attrib['data-edge-id']]=pts
  for a,b in segments:
   vertical=a[0]==b[0];axis=1 if vertical else 0
   key=(g.attrib.get('data-value-slot',g.attrib['data-edge-id']),vertical,a[0] if vertical else a[1])
   bands.setdefault(key,[]).append(sorted([a[axis],b[axis]]))
  style=g.attrib['data-relation-style'];styles[style]=styles.get(style,0)+1
  if style in ['data','resource']:assert p.attrib['stroke-dasharray']=='none'
  else:assert p.attrib['stroke-dasharray']!='none'
  for a,b in segments:
   assert a[0]==b[0] or a[1]==b[1]
   for x,y,w,h,nid in leaf:
    if a[0]==b[0]:hit=x+1e-6<a[0]<x+w-1e-6 and min(max(a[1],b[1]),y+h)-max(min(a[1],b[1]),y)>1e-6
    else:hit=y+1e-6<a[1]<y+h-1e-6 and min(max(a[0],b[0]),x+w)-max(min(a[0],b[0]),x)>1e-6
    if hit:violations.append([g.attrib['data-edge-id'],nid])
   for x,y,w,h,nid in frames+leaf:
    frame=(x,y,w,h,nid) in frames;gap,minimum=(18,80) if frame else (12,24)
    vertical=a[0]==b[0];overlap=min(max(a[1],b[1]),y+h)-max(min(a[1],b[1]),y) if vertical else min(max(a[0],b[0]),x+w)-max(min(a[0],b[0]),x)
    if overlap>=minimum:
     for side in ([x,x+w] if vertical else [y,y+h]):
      dist=abs((a[0] if vertical else a[1])-side)
      if dist<gap:border+=overlap*(gap-dist)/gap
   for x,y,w,h,nid in leaf:
    vertical=a[0]==b[0];overlap=min(max(a[1],b[1]),y+h)-max(min(a[1],b[1]),y) if vertical else min(max(a[0],b[0]),x+w)-max(min(a[0],b[0]),x)
    if overlap>=24 and min(abs((a[0] if vertical else a[1])-side) for side in ([x,x+w] if vertical else [y,y+h]))<1.8:tangencies.append(dict(edge=g.attrib['data-edge-id'],node=nid,length=overlap))
 near=0
 for i,(edge,_,aa) in enumerate(wires):
  slot=svg.find('s:g[@data-edge-id="'+edge+'"]',ns).attrib.get('data-value-slot')
  for other,_,bb in wires[i+1:]:
   if slot==svg.find('s:g[@data-edge-id="'+other+'"]',ns).attrib.get('data-value-slot'):continue
   for a,b in aa:
    for c,d in bb:
     vertical=a[0]==b[0]
     if vertical!=(c[0]==d[0]):continue
     axis=1 if vertical else 0;across=1-axis
     overlap=min(max(a[axis],b[axis]),max(c[axis],d[axis]))-max(min(a[axis],b[axis]),min(c[axis],d[axis]));distance=abs(a[across]-c[across])
     if overlap>=40 and distance<12:near+=overlap*(12-distance)/12
 length=sum(abs(a[0]-b[0])+abs(a[1]-b[1]) for _,_,ss in wires for a,b in ss);bends=sum(len(p)-2 for _,p,_ in wires);crossings=0
 for i,(_,_,aa) in enumerate(wires):
  for _,_,bb in wires[i+1:]:
   for a,b in aa:
    for c,d in bb:
     if (a[0]==b[0])==(c[0]==d[0]):continue
     v0,v1,h0,h1=(a,b,c,d) if a[0]==b[0] else (c,d,a,b)
     crossings+=min(v0[1],v1[1])+1e-6<h0[1]<max(v0[1],v1[1])-1e-6 and min(h0[0],h1[0])+1e-6<v0[0]<max(h0[0],h1[0])-1e-6
 ink=0;painted_border=0
 for (_,vertical,c),spans in bands.items():
  merged=[]
  for a,b in sorted(spans):
   if merged and a<=merged[-1][1]+1e-6:merged[-1][1]=max(merged[-1][1],b)
   else:merged.append([a,b])
  for a,b in merged:
   for x,y,w,h,nid in frames+leaf:
    frame=(x,y,w,h,nid) in frames;gap,minimum=(18,80) if frame else (12,24);overlap=min(b,y+h if vertical else x+w)-max(a,y if vertical else x)
    if overlap>=minimum:
     for side in ([x,x+w] if vertical else [y,y+h]):
      distance=abs(c-side)
      if distance<gap:painted_border+=overlap*(gap-distance)/gap
  end=float('-inf')
  for a,b in sorted(spans):ink+=max(0,b-max(a,end));end=max(end,b)
 def on_segment(p,a,b):
  return abs(a[0]-b[0])<1e-6 and abs(p[0]-a[0])<.02 and min(a[1],b[1])-.02<=p[1]<=max(a[1],b[1])+.02 or abs(a[1]-b[1])<1e-6 and abs(p[1]-a[1])<.02 and min(a[0],b[0])-.02<=p[0]<=max(a[0],b[0])+.02
 dots=svg.findall('s:circle[@data-value-fork]',ns)
 for dot in dots:
  edges=json.loads(dot.attrib['data-value-fork']);point=(float(dot.attrib['cx']),float(dot.attrib['cy']));assert len(edges)>=2
  slots={svg.find('s:g[@data-edge-id="'+edge+'"]',ns).attrib['data-value-slot'] for edge in edges};assert len(slots)==1
  for edge in edges:assert any(on_segment(point,a,b) for a,b in zip(edge_points[edge],edge_points[edge][1:])),(row['mode'],point,edge)
 if 'ink' in row:assert abs(ink-row['ink'])<.3,(ink,row['ink']);assert len(dots)==len(row['forks'])
 if 'proximity' in row:assert abs(near-row['proximity'])<1,(near,row['proximity'])
 if 'border_ink' in row:assert abs(painted_border-row['border_ink'])<1,(painted_border,row['border_ink'])
 actual=dict(length=round(length),bends=bends,crossings=crossings)
 assert actual==row['stats'],(row['mode'],actual,row['stats']);assert len(nodes)==row['visible']['nodes'];assert len(wires)==row['visible']['edges'];assert not violations,violations
 assert abs(border-row.get('border',row['channels']['borderAfter']))<0.2 # SVG coordinates are rounded to 0.01 px
 rows.append(dict(mode=row['mode'],actual=actual,styles=styles,nodes=len(nodes),frames=len(frames),leaf_intersections=violations,border_penalty=border,ink=ink,forks=len(dots),near_parallel_penalty=near,painted_border_penalty=painted_border,leaf_border_tangencies=tangencies))
report=dict(complete=True,method='Independent XML paths, leaf rectangles and frame strokes; no production geometry helpers',rows=rows)
(root/'svg-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))

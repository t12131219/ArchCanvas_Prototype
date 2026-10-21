"""Independently verify full source SVG geometry and actual navigation evidence."""
import copy
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import tempfile
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/source-navigation/current'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
NS={'s':'http://www.w3.org/2000/svg'}

def check_svg(path,layout,ir):
    tree=ET.parse(path).getroot();nodes={n.get('data-id'):n for n in tree.findall('.//s:g',NS) if n.get('data-id')}
    edges={e.get('data-edge-id'):e for e in tree.findall('.//s:path',NS) if e.get('data-edge-id')}
    by={n['id']:n for n in ir['nodes']};pos={n['id']:n for n in layout['nodes']};raw={e['id']:e for e in ir['edges']}
    assert nodes.keys()==by.keys()==pos.keys() and edges.keys()==raw.keys()
    expected=layout['bounds'];assert [float(v) for v in tree.get('viewBox').split()]==[expected[k] for k in ['x','y','w','h']]
    for id,n in nodes.items():
        p=pos[id];actual=[float(v) for v in re.findall(r'[-+]?\d*\.?\d+(?:e[-+]?\d+)?',n.get('transform'),re.I)]
        assert actual==[p['x'],p['y']]
        title=n.find('s:title',NS).text;original=by[id];assert title==original['label']+' | '+original['kind']+' | '+original['evidence_status']
        if p.get('symbol'):
            c=n.find('s:circle',NS);assert [float(c.get(k)) for k in ['cx','cy','r']]==[p['w']/2,p['h']/2,p['w']/2]
        elif original['kind']!='control' or p.get('expanded'):
            r=n.find('s:rect',NS);assert float(r.get('width'))==p['w'] and float(r.get('height'))==p['h']
    inspected=0
    def ancestors(id):
        result=set()
        while id is not None:result.add(id);id=by[id].get('parent')
        return result
    def blocked(a,b,p,pad=0):
        top=p['y']+(min(p['h'],p['header']-10) if p.get('expanded') and p.get('header') else 0)
        x=p['x']-pad;y=top-(0 if top!=p['y'] else pad);w=p['w']+pad*2;h=p['y']+p['h']+pad-y
        if p.get('symbol'):
            radius=w/2;cx=x+radius;cy=y+radius;d=abs(a[0]-cx) if a[0]==b[0] else abs(a[1]-cy)
            if d>=radius-1e-8:return False
            half=math.sqrt(radius*radius-d*d)
            return max(a[1],b[1])>cy-half+1e-8 and min(a[1],b[1])<cy+half-1e-8 if a[0]==b[0] else max(a[0],b[0])>cx-half+1e-8 and min(a[0],b[0])<cx+half-1e-8
        return x<a[0]<x+w and max(a[1],b[1])>y and min(a[1],b[1])<y+h if a[0]==b[0] else y<a[1]<y+h and max(a[0],b[0])>x and min(a[0],b[0])<x+w
    for row in layout['edges']:
        e=edges[row['id']];r=row['route'];raw_edge=raw[row['id']]
        assert r['ok'] and e.get('data-route-valid')=='true'
        actual=[float(v) for v in re.findall(r'[-+]?\d*\.?\d+(?:e[-+]?\d+)?',e.get('d'),re.I)]
        expected=[v for p in r['points'] for v in [p['x'],p['y']]];assert len(actual)==len(expected) and all(abs(a-b)<1e-7 for a,b in zip(actual,expected))
        assert e.find('s:title',NS).text==f"{row['id']} · {raw_edge['kind']} · {raw_edge['evidence']} · {raw_edge['source_port']} → {raw_edge['target_port']}"
        sa=ancestors(row['source']);ta=ancestors(row['target'])
        obstacles=[(p,8) for id,p in pos.items() if id not in sa|ta]
        for id,other in [(row['source'],ta),(row['target'],sa)]:
            p=pos[id]
            if not (p.get('expanded') and id in other):obstacles.append((p,0))
        points=list(zip(actual[::2],actual[1::2]));assert len(points)>=2
        for a,b in zip(points,points[1:]):
            assert a[0]==b[0] or a[1]==b[1]
            for p,pad in obstacles:assert not blocked(a,b,p,pad),(row['id'],'node intrusion',p['id'],a,b)
            inspected+=1
    return dict(nodes=len(nodes),edges=len(edges),orthogonal_segments=inspected,bounds=layout['bounds'],all_canonical_ids=True,node_intrusions=0)

if __name__=='__main__':
    report=read(OUT/'source-routing-report.json');ir=read(ROOT/report['input']);layout=read(OUT/'source-routing.layout.json')
    assert sha(ROOT/report['input'])==report['input_sha256'] and sha(OUT/'source-routing.layout.json')==report['layout_sha256']
    for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale implementation',f)
    assert all(not r['failures'] and (r['nodes'],r['edges'])==(3371,3663) for r in report['runs'])
    assert len({r['geometry_sha256'] for r in report['runs']})==1
    before=check_svg(OUT/'ui-source-before.svg',layout,ir);restored=check_svg(OUT/'ui-source-restored.svg',layout,ir)
    assert (OUT/'ui-source-before.svg').read_bytes()==(OUT/'ui-source-restored.svg').read_bytes()
    negative=[]
    for kind in ['missing-node','missing-edge','wrong-slot-label','moved-node','node-intrusion']:
        tree=ET.parse(OUT/'ui-source-before.svg');bad=copy.deepcopy(layout);root=tree.getroot()
        if kind=='missing-node':
            group=next(g for g in root.findall('.//s:g',NS) if g.get('data-id'))
            next(g for g in root.iter() if group in list(g)).remove(group)
        elif kind=='missing-edge':
            edge=next(e for e in root.findall('.//s:path',NS) if e.get('data-edge-id'))
            next(g for g in root.iter() if edge in list(g)).remove(edge)
        elif kind=='wrong-slot-label':
            edge=next(e for e in root.findall('.//s:path',NS) if e.get('data-edge-id'));edge.find('s:title',NS).text+=' wrong-slot'
        elif kind=='moved-node':
            group=next(g for g in root.findall('.//s:g',NS) if g.get('data-id'));group.set('transform','translate(0,0)')
        else:
            row=bad['edges'][0];p=next(p for p in bad['nodes'] if not p.get('expanded') and not p.get('symbol') and p['id'] not in [row['source'],row['target']])
            a,b=row['route']['points'][0],row['route']['points'][-1];x,y=p['x']+p['w']/2,p['y']+p['h']/2
            row['route']['points']=[a,dict(x=x,y=a['y']),dict(x=x,y=y),dict(x=x,y=b['y']),b]
            edge=next(e for e in root.findall('.//s:path',NS) if e.get('data-edge-id')==row['id']);edge.set('d',' '.join(('M' if i==0 else 'L')+str(p['x'])+','+str(p['y']) for i,p in enumerate(row['route']['points'])))
        with tempfile.TemporaryDirectory(prefix='archcanvas-source-audit-') as tmp:
            path=Path(tmp)/'corrupt.svg';tree.write(path)
            try:check_svg(path,bad,ir)
            except AssertionError:negative.append(dict(kind=kind,rejected=True))
            else:raise AssertionError(('accepted corrupt SVG',kind))
    saved=json.loads(gzip.decompress((OUT/'source-saved.json.gz').read_bytes()));after=json.loads(gzip.decompress((OUT/'source-after-saved.json.gz').read_bytes()));assert saved==after and saved['ir']==ir
    checks=read(OUT/'browser-navigation.json');by={r['label']:r for r in checks}
    for name in ['source-locate-bottom','source-location-query','source-capped-query','source-no-match','source-escape','source-locate-expanded-header','source-undo-restored']:
        assert (by[name]['nodes'],by[name]['edges'],by[name]['failed'])==(3371,3663,0)
    # A line query finds the call and its return; a name query also finds
    # the parameter object declared elsewhere. Check source facts, not equality
    # between two different searches.
    location_ids={n['id'] for n in ir['nodes'] if any(str(s.get('file','')).endswith('/transformer.py') and s.get('line')==499 for s in n.get('source',[]))}
    assert {r['id'] for r in by['source-location-query']['results']}==location_ids
    assert by['source-location-query']['results'][0]['id']==by['source-locate-bottom']['selected'][0]['id']
    assert len(by['source-capped-query']['results'])==40 and '3371' in by['source-capped-query']['note']
    assert not by['source-no-match']['results'] and by['source-escape']['resultsHidden']
    assert by['source-collapsed-refresh']['nodes']==1 and not by['source-collapsed-refresh']['results']
    for name in ['source-locate-bottom','source-locate-expanded-header','mixed-locate-unknown','main-locate-role']:
        c=by[name];assert len(c['selected'])==1;id=c['selected'][0]['id'];assert id in [r['id'] for r in c['results']]
        x,y,w,h=map(float,c['viewBox'].split());assert (w,h)==(c['viewport']['w'],c['viewport']['h'])
        if name.startswith('source-'):
            p=next(p for p in layout['nodes'] if p['id']==id)
            width=min(p['w'],max(1,w-48)) if p.get('expanded') else p['w'];height=min(p.get('header',64),max(1,h-48)) if p.get('expanded') else p['h']
            assert abs(x-(p['x']+width/2-w/2))<1e-7 and abs(y-(p['y']+height/2-h/2))<1e-7
    assert (by['mixed-locate-unknown']['nodes'],by['mixed-locate-unknown']['edges'])==(41,42)
    assert 'opaque' in by['mixed-locate-unknown']['selected'][0]['id']
    assert (by['main-locate-role']['nodes'],by['main-locate-role']['edges'])==(65,76)
    assert (OUT/'ui-main.svg').read_bytes()==(ROOT/'verification/coincident-ports/current/Transformer-panel-0-current.svg').read_bytes()
    files=['ui-source-before.svg','ui-source-restored.svg','ui-main.svg','browser-navigation.json','source-routing-report.json','before-browser.png','located-browser.png','mixed-browser.png','main-browser.png','source-saved.json.gz','source-after-saved.json.gz']
    result=dict(passed=True,goal_complete=False,source=before,source_svg_roundtrip_identical=True,saved_document_unchanged=True,
        navigation_checks=len(checks),negative_checks=negative,cli_median_ms=dict(project=statistics.median(r['project_ms'] for r in report['runs']),route=statistics.median(r['route_ms'] for r in report['runs'])),
        auditor_sha256=sha(Path(__file__)),files_sha256={f:sha(OUT/f) for f in files},
        limitations=['No browser event/paint latency measurement','No full-graph all-pair crossing/readability certification','No new publication layout or semantic inference'])
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))

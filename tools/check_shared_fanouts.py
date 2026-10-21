"""Read real SVG paths, recompute shared ink and prove unchanged exact uses."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/shared-fanouts/current'
sys.path.insert(0, str(ROOT / 'tools'))
from check_title_passages import passages, intersects
from audit_diagram_assignments import assignments
import audit_adaptive_frontier as geometry
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

def points(svg):
    return {e.get('data-edge-id'): [tuple(map(float,p)) for p in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',e.get('d'))] for e in svg.iter() if e.get('data-edge-id')}

def ink(paths):
    lines = {}
    for ps in paths:
        for a,b in zip(ps,ps[1:]):
            assert a[0] == b[0] or a[1] == b[1]
            v = a[0] == b[0]
            lines.setdefault((v,a[0] if v else a[1]),[]).append(sorted((a[1] if v else a[0],b[1] if v else b[0])))
    total = 0
    for ranges in lines.values():
        end = float('-inf')
        for a,b in sorted(ranges):total += max(0,b-max(a,end));end = max(end,b)
    return total

def junctions(paths):
    result=[]
    for p in set(p for ps in paths for p in ps):
        directions=set()
        for ps in paths:
            for a,b in zip(ps,ps[1:]):
                if a[0]==b[0]==p[0] and min(a[1],b[1])<=p[1]<=max(a[1],b[1]):
                    if min(a[1],b[1])<p[1]:directions.add('up')
                    if max(a[1],b[1])>p[1]:directions.add('down')
                if a[1]==b[1]==p[1] and min(a[0],b[0])<=p[0]<=max(a[0],b[0]):
                    if min(a[0],b[0])<p[0]:directions.add('left')
                    if max(a[0],b[0])>p[0]:directions.add('right')
        if len(directions)>=3:result.append(p)
    return sorted(result,key=lambda p:(p[1],p[0]))

def compare(a,b,sa,sb):
    for k in ['ir','architecture','publication','expression_goals','expression_coverage','summary_goals','summary_coverage']:
        assert a.get(k)==b.get(k),('semantic frontier or evidence changed',k)
    for k in ['nodes','bounds','node_accounting','edge_accounting','representatives','frame_ownership','labels']:
        assert a['layout'].get(k)==b['layout'].get(k),('geometry or accounting changed',k)
    pa,pb=points(sa),points(sb);assert pa.keys()==pb.keys()
    old={e['id']:e for e in a['layout']['edges']};new={e['id']:e for e in b['layout']['edges']}
    selected=b['layout'].get('shared_fanouts',[]);touched={id for row in selected for id in row['edges']}
    dots=[e for e in sb.iter()if e.get('class')=='paper-fanout-junction'];assert len(dots)==sum(len(r['junctions'])for r in selected)
    saved={}
    for row in selected:
        ids=row['edges'];assert 2<=len(ids)<=6
        uses=[new[id]for id in ids];keys={(e['source'],e['resolved_source'],e['source_port'])for e in uses}
        assert keys=={(row['source'],row['resolved_source'],row['source_port'])}
        assert len({e['target']for e in uses})==len(ids)
        assert all(e['kind']in ['data','alias','interface-binding'] and not any(e.get(k)for k in ['condition','iteration','design_route','context_lane','layout_after','bundle_members','paper_labels'])for e in uses)
        before,after=ink([pa[id]for id in ids]),ink([pb[id]for id in ids]);assert abs(before-row['ink_before'])<1e-6 and abs(after-row['ink_candidate'])<1e-6
        assert after<=before*.8
        js=junctions([pb[id]for id in ids]);assert js==[(p['x'],p['y'])for p in row['junctions']]
        markers=[d for d in dots if json.loads(d.get('data-fanout-edges'))==ids]
        assert [(float(d.get('cx')),float(d.get('cy')))for d in markers]==js
        assert all(d.get('data-fanout-source')==row['resolved_source'] and d.get('data-source-port')==row['source_port']for d in markers)
        for x,y in js:
            assert all(not intersects(ps,dict(x=x-4,y=y-4,w=8,h=8))for id,ps in pb.items()if id not in ids),('junction touches another value',row['source'])
        budget=2*sum(abs(pa[id][0][0]-row['hub'])for id in ids);assert budget==row['terminal_detour_budget']
        length=lambda ps:sum(abs(a[0]-b[0])+abs(a[1]-b[1])for a,b in zip(ps,ps[1:]))
        assert sum(length(pb[id])-length(pa[id])for id in ids)<=budget+1e-6
        saved[tuple(ids)]=before-after
    for id,e in new.items():
        was=old[id];assert {k:v for k,v in e.items()if k!='route'}=={k:v for k,v in was.items()if k!='route'}
        assert [pa[id][0],pa[id][-1]]==[pb[id][0],pb[id][-1]],('terminal moved',id)
        assert e['route']['source_side']==was['route']['source_side'] and e['route']['target_side']==was['route']['target_side']
        if id not in touched:assert pa[id]==pb[id],('distant edge changed',id)
    texts=lambda s:{n.get('data-node-id'):[ET.tostring(t,encoding='unicode')for t in n if t.tag.endswith('text')]for n in s.iter()if n.get('data-node-id')}
    assert texts(sa)==texts(sb)
    applied={r['id']for r in a['layout']['constraint_receipts']if r['status']=='applied'}
    assert applied<={r['id']for r in b['layout']['constraint_receipts']if r['status']=='applied'}
    return sum(saved.values()),len(selected)

def main():
    reports=[read(OUT/'small-report.json')]+([] if '--small' in sys.argv else [read(OUT/f'Transformer-panel-{i}-report.json')for i in range(3)])
    hashes=reports[0]['implementation_sha256'];rows=[]
    for f,h in hashes.items():assert sha(ROOT/f)==h,('stale producer',f)
    geometry.OUT=OUT
    for report in reports:
        assert report['implementation_sha256']==hashes
        for row in report['rows']:
            assert sha(ROOT/row['input'])==row['input_sha256'];captures=[]
            for result in row['results']:
                for key in ['svg','document']:assert sha(OUT/result[key])==result[key+'_sha256']
                doc=read(OUT/result['document']);svg=ET.parse(OUT/result['svg']).getroot();captures.append((doc,svg))
                actual={n.get('data-node-id'):n for n in svg.iter()if n.get('data-node-id')}
                assert actual.keys()=={n['id']for n in doc['layout']['nodes']}
                assert list(map(float,svg.get('viewBox').split()))==[doc['layout']['bounds'][k]for k in ['x','y','w','h']]
                for p in doc['layout']['nodes']:
                    n=actual[p['id']];xy=list(map(float,re.findall(r'-?[\d.eE+]+',n.get('transform').removeprefix('translate'))));assert xy==[p['x'],p['y']]
                    shape=next(c for c in n if c.tag.endswith(('rect','circle','path')))
                    if shape.tag.endswith('rect'):assert float(shape.get('width'))==p['w'] and float(shape.get('height'))==p['h']
                    if shape.tag.endswith('circle'):assert p['symbol'] and float(shape.get('r'))==23
                _,bodies=passages(doc,svg);assert not bodies,(row['name'],bodies)
                geometry.inspect({**result,'name':row['name']+'-'+result['suffix']})
                goals=doc['expression_goals']['goals'];direct={g['id']for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':result['quality']},svg))if ok}
                assert direct=={r['goal']for r in doc['expression_coverage']if r['status']=='fulfilled'},row['name']
                for key,canonical in [('node_accounting',doc['ir']['nodes']),('edge_accounting',doc['ir']['edges'])]:
                    ids=[id for group in doc['layout'][key].values()for id in group];assert len(ids)==len(set(ids)) and set(ids)=={n['id']for n in canonical}
            saved,count=compare(*[captures[0][0],captures[1][0],captures[0][1],captures[1][1]])
            qa,qb=[r['quality']for r in row['results']]
            assert qb['line_geometry']['crossings']<=qa['line_geometry']['crossings']
            assert qb['native_width_px']<=qa['native_width_px'] and qb['native_height_px']<=qa['native_height_px']
            rows.append(dict(name=row['name'],shared_groups=count,visible_ink_saved=saved,wire_before=qa['wire_length'],wire_current=qb['wire_length'],crossings=qb['line_geometry']['crossings']))
    result=dict(passed=True,svg_count=len(rows)*2,rows=rows,implementation_sha256=hashes,goal_complete=False)
    (OUT/'independent-checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result['rows'],indent=2))
if __name__=='__main__':main()

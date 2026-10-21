"""Check candidate replay receipts against exported SVGs, independently."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/residual-bands/current'
sys.path.insert(0,str(ROOT/'tools'))
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments
from check_title_passages import passages
from check_final_sample_frames import terminals
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if __name__=='__main__':
    report=read(OUT/'adaptive-report.json');geometry.OUT=OUT;rows={};results=[]
    for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    for row in report['rows']:
        for key in ['svg','document']:assert sha(OUT/row[key])==row[key+'_sha256']
        assert sha(ROOT/row['input'])==row['input_sha256'];d=read(OUT/row['document']);s=ET.parse(OUT/row['svg']).getroot()
        assert d['ir']==read(ROOT/row['input']) and d['state']=={**row['state'],'view':'publication'}
        actual=geometry.inspect(row);title,bodies=passages(d,s);assert not bodies,bodies;terminals(d)
        bounds=list(map(float,s.get('viewBox').split()));q=row['quality'];assert bounds[2:]==[q['native_width_px'],q['native_height_px']]
        wire=0
        for path in s.iter():
            if not path.get('data-edge-id'):continue
            points=[tuple(map(float,p))for p in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',path.get('d'))]
            wire+=sum(abs(a[0]-b[0])+abs(a[1]-b[1])for a,b in zip(points,points[1:]))
        assert abs(wire-q['wire_length'])<=.051
        goals=d['expression_goals']['goals'];direct={g['id']for g,ok in zip(goals,assignments(d['ir'],goals,{**d,'quality':q},s))if ok}
        rows[row['name']]=dict(actual=actual,direct=direct,document=d,wire=wire,dimensions=bounds[2:])
        results.append(dict(name=row['name'],crossings=actual['crossings'],dimensions=bounds[2:],wire_length=wire,direct_goals=len(direct)))
    for selection in report['selections']:
        name=selection['name'];base=rows[name+'-baseline'];selected=rows[name+'-selected'];assert base['direct']<=selected['direct']
        if name+'-old-selected' in rows:
            old=rows[name+'-old-selected'];assert old['direct']<=selected['direct'] and old['actual']['boundaries']<=selected['actual']['boundaries']
        assert base['actual']['boundaries']<=selected['actual']['boundaries']
        metrics=selection['receipt']['selected'];assert metrics['width']==selected['dimensions'][0] and metrics['height']==selected['dimensions'][1]
        for attempt in selection['attempts']:
            trial=rows[attempt['capture']];m=attempt['metrics'];assert m['width']==trial['dimensions'][0] and m['height']==trial['dimensions'][1]
            assert m['crossings']==trial['actual']['crossings'] and m['contacts']==trial['actual']['contacts']
    (OUT/'adaptive-independent-report.json').write_text(json.dumps(dict(passed=True,svgs=len(rows),rows=results,
        scope='Actual SVG dimensions, paths, lengths, crossings, bodies and terminals; replayed candidate/selected measurements and retained direct goals and critical boundaries.'),indent=2)+'\n')
    print(json.dumps(dict(passed=True,svgs=len(rows))))

"""Audit actual editor artifacts independently of the UI renderer producer."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/prefix-role-paths/current'
sys.path.insert(0,str(ROOT/'tools'))
import check_role_path_stages as stages
read=lambda f:json.loads((OUT/f).read_text())
sha=lambda f:hashlib.sha256((OUT/f).read_bytes()).hexdigest()
if __name__=='__main__':
    report=read('ui-report.json');assert report['passed']
    assert report['auditor_sha256']==hashlib.sha256((ROOT/'tools/audit_prefix_role_paths_ui.cjs').read_bytes()).hexdigest()
    for f,h in report['files_sha256'].items():assert sha(f)==h
    stages.OUT=OUT
    actual=[stages.check(row) for row in report['rows']]
    initial=read('ui-initial-saved.json');deep=read('ui-deep-saved.json');refold=read('ui-refolded-saved.json')
    row=read('PreparedCurve-current.layout.json')['publication']['role_path_stages']['rows'][0]
    assert set(deep['state']['open'])==set(initial['state']['open'])|{row['node'],row['helper']}
    assert set(refold['state']['open'])==set(initial['state']['open']) and refold['ir']==deep['ir']==initial['ir']
    assert sha('ui-initial.svg')==sha('ui-refolded.svg')==sha('ui-restored-auto.svg')==sha('PreparedCurve-current.svg')
    assert sha('ui-deep.svg')==sha('ui-deep-reopened.svg')==sha('PreparedCurve-deep.svg')
    raw=read('ui-source-saved.json');ir=read('PreparedCurve.json');assert raw['ir']==ir
    svg=ET.parse(OUT/'ui-source.svg').getroot();nodes={e.get('data-id') for e in svg.iter() if e.get('data-id')};paths={e.get('data-edge-id'):e for e in svg.iter() if e.get('data-edge-id')}
    assert nodes=={n['id'] for n in ir['nodes']} and paths.keys()=={e['id'] for e in ir['edges']}
    projected=read('ui-raw-projection.json')
    for edge in projected['edges']:
        points=[tuple(map(float,p)) for p in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',paths[edge['id']].get('d'))]
        assert edge['route']['ok'] and points==[(p['x'],p['y']) for p in edge['route']['points']]
        assert all(a[0]==b[0] or a[1]==b[1] for a,b in zip(points,points[1:]))
    browser=read('browser-text-report.json');expected={r['name']:r for f in ['small-report.json','large-report.json'] for r in read(f)['rows']}
    assert len(browser['rows'])==len(expected)
    for r in browser['rows']:
        e=expected[r['panel']];assert not r['issues'] and r['texts']>0 and (r['nodes'],r['edges'])==(e['nodes'],e['edges'])
    labels=sum(r['labels'] for r in browser['rows'])
    screenshots={f:sha(f) for f in ['editor-initial.png','editor-deep.png','editor-refolded.png','editor-mixed.png','main-browser.png','reference-browser.png','local-browser.png']}
    result=dict(passed=True,goal_complete=False,actual_ui_panels=len(actual),raw_nodes=len(nodes),raw_edges=len(paths),native_text_panels=len(expected),port_labels=labels,
                canonical_ir_unchanged=True,screenshots=screenshots,auditor_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    (OUT/'ui-independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['screenshots','auditor_sha256']}))

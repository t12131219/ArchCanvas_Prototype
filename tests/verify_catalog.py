#!/usr/bin/env python3
"""Check the entire imported catalog against the saved source evidence."""
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

catalog = read(ROOT/'data/catalog.json')
manifest = read(ROOT/'verification/input-manifest.json')
assert len(catalog['inputs']) == 8 and not catalog['errors']
for entry in manifest:
    original = ROOT.parent/entry['source']; snapshot = ROOT/entry['snapshot']
    assert original.is_file() and snapshot.is_file(), entry
    assert sha(original) == sha(snapshot) == entry['sha256'], entry['source']
    assert snapshot.stat().st_size == entry['bytes']

used, views, nodes, edges, source_bindings = set(), 0, 0, 0, 0
assert len({c['id'] for c in catalog['cases']}) == len(catalog['cases'])
for case in catalog['cases']:
    if case.get('sourceIndex'): assert (ROOT/case['sourceIndex']).is_file()
    for view in case['views']:
        if view.get('builtin'): continue
        for name in ['asset','json','svg']:
            assert (ROOT/view[name]).is_file(), (case['id'],name)
        used.add(view['svg']); views += 1
        graph = read(ROOT/view['json'])
        assert graph['caseId'] == case['id'] and graph['viewKey'] == view['key']
        ids = {n['id'] for n in graph['nodes']}
        assert len(ids) == len(graph['nodes'])
        assert len({e['id'] for e in graph['edges']}) == len(graph['edges'])
        for n in graph['nodes']:
            assert all(math.isfinite(n[k]) for k in ['x','y','w','h'])
            assert n['w'] >= 0 and n['h'] >= 0
            assert n.get('parent') is None or n['parent'] in ids
            parents, cursor = set(), n
            while cursor.get('parent'):
                assert cursor['id'] not in parents
                parents.add(cursor['id']); cursor = next(x for x in graph['nodes'] if x['id']==cursor['parent'])
        for e in graph['edges']:
            assert e['source'] in ids and e['target'] in ids
            assert len(e['route']) >= 2 and not e['draft'] and 'binding' in e
            assert all(math.isfinite(p[k]) for p in e['route'] for k in ['x','y'])
            for side, index in [('source',0),('target',-1)]:
                n = next(x for x in graph['nodes'] if x['id']==e[side]); fixed=e.get('physical'+side.title(),e['fixed'+side.title()])
                assert 0 <= fixed['fraction'] <= 1
                if 'offset' in fixed:
                    assert abs(n['x']+fixed['offset']['x']-e['route'][index]['x']) < 1e-6
                    assert abs(n['y']+fixed['offset']['y']-e['route'][index]['y']) < 1e-6
                else:
                    x=n['x'] if fixed['side']=='left' else n['x']+n['w'] if fixed['side']=='right' else n['x']+n['w']*fixed['fraction']
                    y=n['y'] if fixed['side']=='top' else n['y']+n['h'] if fixed['side']=='bottom' else n['y']+n['h']*fixed['fraction']
                    assert abs(x-e['route'][index]['x']) < 1e-6 and abs(y-e['route'][index]['y']) < 1e-6
        if graph.get('irSource'):
            assert sha(ROOT/graph['irSource']) == graph['irSha256']
            ir = {n['id']:n for n in read(ROOT/graph['irSource']).get('nodes',[])}
            for n in graph['nodes']:
                if n['id'] in ir: assert n['semantic'] == ir[n['id']]
        if graph.get('layoutSource'):
            recorded = read(ROOT/graph['layoutSource']).get('routes',[])
            for e in graph['edges']: assert e['binding'] in recorded
            source_bindings += len(graph['edges'])
        # All labels/annotations survive the adaptation, including historical figures.
        original = ET.parse(ROOT/view['svg']).getroot()
        current = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">'+graph['extras']+
                                ''.join(n['html'] for n in graph['nodes'])+
                                ''.join(a['html'] for a in graph.get('attachments',[]))+
                                ''.join(a['html'] for a in graph.get('routeLabels',[]))+'</svg>')
        texts=lambda doc: sorted(''.join(e.itertext()).strip() for e in doc.iter() if e.tag.endswith('}text'))
        assert texts(original) == texts(current), ('lost labels',view['svg'])
        nodes += len(graph['nodes']); edges += len(graph['edges'])
assert used == {p.relative_to(ROOT).as_posix() for p in (ROOT/'snapshots').rglob('*.svg')}
for e in catalog['evidence']: assert (ROOT/e['path']).is_file()
report={'passed':True,'inputs':8,'snapshotFiles':len(manifest),'catalogCases':len(catalog['cases']),
        'activeCases':catalog['counts']['active'],'importedViews':views,'nodes':nodes,'edges':edges,
        'sourceRouteBindings':source_bindings,'allSvgCovered':True,'sourceHashesUnchanged':True,
        'sourceLabelsPreserved':True,'semanticIrPreserved':True}
(ROOT/'verification/catalog-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))

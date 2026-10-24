#!/usr/bin/env python3
"""Check frozen receipts and actual SVG paths independently of renderer helpers."""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/attention-expansion/current'
read = lambda p: json.loads(Path(p).read_text())
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
current = read(OUT / 'report.json')
before = read(OUT.parent / 'before/report.json')
assert current['complete'] and before['complete']
for report in [current, before]:
    for name, digest in report['implementation_sha256'].items():
        assert sha(ROOT / name) == digest, name
for p in (Path('/tmp/archcanvas-attention-before/semantic_studio')).iterdir():
    if p.is_file():
        expected = subprocess.check_output(['git', 'show', '7beda55:semantic_studio/' + p.name], cwd=ROOT)
        assert hashlib.sha256(expected).hexdigest() == sha(p)
ir = read(ROOT / 'data/semantic/0216717d966327f4.json')
edges = {e['id']: e for e in ir['edges']}
nodes_by_id = {n['id']: n for n in ir['nodes']}
def source_ports(edge):
    ports = {edge['source_port']}
    n = nodes_by_id[edge['source']]
    incoming = [e for e in ir['edges'] if e['target'] == n['id']]
    if n['kind'] == 'value-alias' and n.get('slot') is not None and len(incoming) == 1:
        use = incoming[0]
        if use['kind'] == 'alias' and not use.get('condition') and use['target_port'] == str(n['slot']):
            ports.add(use['source_port'])
    return ports
ns = {'s': 'http://www.w3.org/2000/svg'}
checked = []
for row in current['rows']:
    old = next(r for r in before['rows'] if r['name'] == row['name'])
    if row.get('status') == 'timeout':
        checked.append({'name': row['name'], 'status': 'timeout'})
        continue
    p = OUT / (row['name'] + '.svg')
    assert sha(p) == row['svg_sha256']
    if old.get('status') != 'timeout':
        assert row['svg_sha256'] == old['svg_sha256']
        assert row['facts_sha256'] == old['facts_sha256']
        assert row['quality'] == old['quality']
    svg = ET.parse(p).getroot()
    assert json.loads(svg.find('s:metadata', ns).text)['quality'] == row['quality']
    nodes = [e for e in svg.iter() if 'data-id' in e.attrib]
    paths = [e for e in svg.iter() if 'data-edge-id' in e.attrib]
    assert len(nodes) == row['nodes'] and len(paths) == row['edges']
    assert len({e.attrib['data-id'] for e in nodes}) == len(nodes)
    segments = []
    canonical_uses = set()
    for e in paths:
        a = e.attrib
        pts = [(float(x), float(y)) for x, y in re.findall(r'[ML]([\d.e+-]+),([\d.e+-]+)', a['d'])]
        assert len(pts) >= 2 and all(math.isfinite(v) for p in pts for v in p)
        assert all(p[0] == q[0] or p[1] == q[1] for p, q in zip(pts, pts[1:]))
        segments.append(list(zip(pts, pts[1:])))
        assert a['data-route-valid'] == 'true'
        if 'data-bundle-members' in a:
            members = json.loads(a['data-bundle-members'])
            endpoints = json.loads(a['data-bundle-endpoints'])
            assert [e['id'] for e in endpoints] == members
            titles = []
            for m in endpoints:
                raw = edges[m['id']]
                assert (m['source'], m['target']) == (raw['source'], raw['target'])
                titles.append(f"{raw['id']}: {raw['source']}[{raw['source_port']}] → {raw['target']}[{raw['target_port']}]")
                canonical_uses.add(raw['id'])
            assert e.find('s:title', ns).text == '\n'.join(titles)
        else:
            raw = edges[a['data-edge-id']]
            for rendered, canonical in [('data-canonical-source', 'source'), ('data-canonical-target', 'target'),
                                        ('data-target-port', 'target_port')]:
                assert a[rendered] == raw[canonical]
            assert a['data-source-port'] in source_ports(raw)
            canonical_uses.add(raw['id'])
    crossings = 0
    for i, first in enumerate(segments):
        for second in segments[i+1:]:
            for p, q in first:
                for u, v in second:
                    vertical, other = p[0] == q[0], u[0] == v[0]
                    if vertical == other:
                        continue
                    a, b, c, d = (p, q, u, v) if vertical else (u, v, p, q)
                    crossings += int(min(c[0], d[0]) < a[0] < max(c[0], d[0]) and min(a[1], b[1]) < c[1] < max(a[1], b[1]))
    assert crossings == row['quality']['line_geometry']['crossings']
    assert row['quality']['issues'] == [] and row['quality']['unplaced_port_labels'] == []
    checked.append({'name': row['name'], 'nodes': len(nodes), 'paths': len(paths), 'canonical_uses': len(canonical_uses),
                    'actual_svg_crossings': crossings, 'SVG_and_facts_unchanged': True if old.get('status') != 'timeout' else None})
tests = read(OUT / 'test-report.json')
catalog = read(OUT / 'catalog/catalog-report.json')
prior_catalog = read(ROOT / 'verification/interaction-performance/current/catalog/catalog-report.json')
assert all(c['exit_code'] == 0 for c in tests['commands']) and catalog['complete']
for report in [tests, catalog]:
    for name, digest in report['implementation_sha256'].items():
        assert sha(ROOT / name) == digest, name
states = 0
for model in catalog['models']:
    old_model = next(m for m in prior_catalog['models'] if m['id'] == model['id'])
    assert model['input_sha256'] == old_model['input_sha256']
    for row in model['rows']:
        old = next(r for r in old_model['rows'] if r['name'] == row['name'])
        assert row['svg_sha256'] == old['svg_sha256'], (model['title'], row['name'])
        assert row['facts_sha256'] == old['facts_sha256']
        states += 1
ui = read(OUT / 'ui-proof.json')
assert not ui['first_open']['cached'] and ui['first_open']['nodes'] == 49 and ui['first_open']['edges'] == 53
assert not ui['reopen']['cached'] and ui['redo']['svg_exact'] and ui['reopen']['svg_exact']
assert ui['redo']['dom_exact'] and ui['reopen']['dom_exact']
assert ui['svg_sha256'] == sha(OUT / 'attention-first-open.svg')
assert ui['screenshot_sha256'] == sha(OUT / 'attention-opened.jpg')
assert ui['saved_state_sha256'] == sha(OUT / 'ui-saved-state.json')
svg = ET.parse(OUT / 'attention-first-open.svg').getroot()
tag = lambda e: e.tag.rsplit('}', 1)[-1]
def signature(e):
    return [tag(e), sorted([list(a) for a in e.attrib.items()]), e.text or '', [signature(c) for c in e]]
dom = {'nodes': [dict(id=e.attrib['data-id'], transform=e.attrib['transform'],
                      body=[signature(c) for c in e if tag(c) != 'title'])
                 for e in svg.iter() if 'data-id' in e.attrib],
       'edges': [signature(e) for e in svg.iter() if 'data-edge-id' in e.attrib]}
assert hashlib.sha256(json.dumps(dom, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest() == ui['dom_sha256']
result = {'schema': 'attention-expansion-acceptance/1', 'baseline': '7beda55', 'actual_svg': checked,
          'tests': {'groups': len(tests['commands']), 'tests': sum(tests['counts'].values()), 'passed': True},
          'catalog': {'models': len(catalog['models']), 'states': states, 'SVG_and_facts_unchanged': True},
          'actual_browser': {'first_open_ms': ui['first_open']['scene_ms'], 'uncached': True, 'undo_redo_reopen_exact': True, 'retained_DOM_exact': True},
          'checker_sha256': sha(__file__)}
(OUT / 'acceptance.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False))

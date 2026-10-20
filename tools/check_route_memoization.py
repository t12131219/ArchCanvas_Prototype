"""Validate actual SVG routes and byte equality of the isolated experiment."""
import hashlib
import json
from pathlib import Path
import sys
import re
import xml.etree.ElementTree as ET
import audit_local_svg as svg_audit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/route-memoization/experiment'
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
report = json.loads((OUT / 'render-report.json').read_text())
assert report['status'] == 'complete' and report['production_modified'] is False  # The benchmark itself never installs code.
for file, expected in report['implementation_sha256'].items():
    assert sha(ROOT / file) == expected, ('stale producer', file)
pairs = {}
for row in report['rows']:
    pairs.setdefault(row['case'], {})[row['variant']] = row
    assert sha(ROOT / row['input']) == row['input_sha256']
    assert sha(OUT / row['document']) == row['document_sha256']
    document = json.loads((OUT / row['document']).read_text())
    assert document['ir'] == json.loads((ROOT / row['input']).read_text())
    for bucket, items in [('node_accounting', document['ir']['nodes']), ('edge_accounting', document['ir']['edges'])]:
        ids = [i for group in document['layout'][bucket].values() for i in group]
        assert len(ids) == len(set(ids)) and set(ids) == {item['id'] for item in items}
    tree = ET.parse(OUT / row['svg']); viewbox = list(map(float, tree.getroot().get('viewBox').split()))
    assert viewbox[2:] == [row['quality']['native_width_px'], row['quality']['native_height_px']]
    positions = {p['id']: p for p in document['layout']['nodes']}
    segments = []
    for element in tree.iter():
        if 'data-node-id' in element.attrib:
            p = positions[element.attrib['data-node-id']]
            xy = list(map(float, re.fullmatch(r'translate\(([-\d.eE+]+),([-\d.eE+]+)\)', element.get('transform')).groups()))
            assert xy == [p['x'], p['y']]
            rect = element.find('{http://www.w3.org/2000/svg}rect')
            if rect is not None:
                assert [float(rect.get(k)) for k in ['width', 'height']] == [p['w'], p['h']]
        if 'data-edge-id' in element.attrib:
            points = [tuple(map(float, point)) for point in re.findall(r'[ML]([-\d.eE+]+),([-\d.eE+]+)', element.get('d'))]
            segments.append(list(zip(points, points[1:])))
    crossings = 0
    for i, first in enumerate(segments):
        for second in segments[i + 1:]:
            for a, b in first:
                for c, d in second:
                    if (a[0] == b[0]) == (c[0] == d[0]):
                        continue
                    v, w, h, k = (a, b, c, d) if a[0] == b[0] else (c, d, a, b)
                    crossings += min(h[0], k[0]) < v[0] < max(h[0], k[0]) and min(v[1], w[1]) < h[1] < max(v[1], w[1])
    assert crossings == row['quality']['line_geometry']['crossings']
for name, pair in pairs.items():
    a, b = [pair[v] for v in ['before', 'candidate']]
    assert a['svg_sha256'] == b['svg_sha256'] and (OUT / a['svg']).read_bytes() == (OUT / b['svg']).read_bytes()
    da, db = [json.loads((OUT / row['document']).read_text()) for row in [a, b]]
    assert da == db, ('document or routing changed', name)
    assert a['quality'] == b['quality']
svg_audit.OUT = OUT
sys.argv = [__file__]
svg_audit.main()
browser_file = OUT / 'browser-report.json'
if browser_file.exists():
    browser = json.loads(browser_file.read_text())
    assert browser['status'] == 'complete'
    assert browser['kernel_report_sha256'] == sha(OUT / 'render-report.json')
    assert browser['implementation_sha256'] == report['implementation_sha256']
    assert {row['case'] for row in browser['rows']} == pairs.keys()
    for row in browser['rows']:
        assert row['exact_match']
        for variant in ['before', 'candidate']:
            result = row[variant]
            assert result['canonical_ir_unchanged'] and len(result['measured_ms']) == 3
            assert len(set(result['svg_sha256'])) == len(set(result['routes_sha256'])) == 1
            assert result['quality'] == row['before']['quality']
        assert row['before']['svg_sha256'] == row['candidate']['svg_sha256']
        assert row['before']['routes_sha256'] == row['candidate']['routes_sha256']
    print(json.dumps({'browser_pairs': len(browser['rows']), 'all_outputs_equal': True}))
print(json.dumps({'kernel_pairs': len(pairs), 'actual_svg_panels': len(report['rows']), 'all_documents_equal': True}))

"""Independent source, goal assignment and actual SVG checks for local detail."""
import hashlib
import json
from pathlib import Path
import subprocess
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/detail-alternatives/experiment'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
from semantic_adapter.analyzer import analyze
import audit_local_svg as geometry
import audit_diagram_assignments as assignments

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
r = read(OUT / 'render-report.json')
for f, h in r['implementation_sha256'].items():
    assert sha(ROOT / f) == h, ('stale producer', f)
snapshot = read(OUT / 'snapshot.json')
assert sha(OUT / 'snapshot.json') == r['baseline_sha256']
for f, h in snapshot['files'].items():
    saved = OUT / 'before' / Path(f).name
    assert sha(saved) == h
    assert saved.read_bytes() == subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)
e = read(OUT / 'extraction.json')
assert sha(ROOT / e['source']) == e['source_sha256']
for fixture in e['rows']:
    assert sha(ROOT / fixture['input']) == fixture['sha256']
    assert analyze(ROOT / e['source'], fixture['entry']) == read(ROOT / fixture['input'])
for row in r['rows']:
    doc = read(OUT / row['document'])
    assert doc['ir'] == read(ROOT / row['input'])
    assert sha(OUT / row['document']) == row['document_sha256']
    tree = ET.parse(OUT / row['svg'])
    nodes = {n.get('data-node-id'): n for n in tree.iter() if n.get('data-node-id')}
    q = row['quality']
    viewbox = list(map(float, tree.getroot().get('viewBox').split()))
    assert viewbox[2:] == [q['native_width_px'], q['native_height_px']]
    polylines = [[(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', n.get('d'))] for n in tree.iter() if n.get('data-edge-id')]
    segments = [list(zip(p, p[1:])) for p in polylines]
    crossings = 0
    for i, first in enumerate(segments):
        for second in segments[i + 1:]:
            for a, b in first:
                for c, d in second:
                    if (a[0] == b[0]) == (c[0] == d[0]):
                        continue
                    v, w, h, k = (a, b, c, d) if a[0] == b[0] else (c, d, a, b)
                    crossings += min(h[0], k[0]) < v[0] < max(h[0], k[0]) and min(v[1], w[1]) < h[1] < max(v[1], w[1])
    assert crossings == q['line_geometry']['crossings']
    for bucket, key in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
        ids = [at for group in doc['layout'][bucket].values() for at in group]
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in doc['ir'][key]}
    from audit_input_dock_receipts import verify as docks
    from audit_return_region_receipts import verify as returns
    docks(doc, tree)
    returns(doc, tree)
    geometry.audit_pipeline_summaries(doc, row, nodes)
    for cut in doc['publication']['boundary']:
        original = next(edge for edge in doc['ir']['edges'] if edge['id'] == cut['id'])
        assert all(cut.get(k) == original.get(k) for k in ['source', 'target', 'source_port', 'target_port', 'kind', 'condition', 'evidence'])
    assert not row['quality']['issues'], (row['name'], row['quality']['issues'])
for pair in r['comparisons']:
    assert (OUT / pair['before']['main_svg']).read_bytes() == (OUT / pair['current']['main_svg']).read_bytes()
    assert pair['current']['fulfilled'] >= pair['before']['fulfilled']
geometry.OUT = OUT
sys.argv = [__file__] # Keep the explicit current OUT; historical flags select historical folders.
geometry.main()
assignments.OUT = OUT
assignments.main()
result = {'schema': 'detail-alternatives-independent/1', 'render_report_sha256': sha(OUT / 'render-report.json'),
          'auditor_sha256': sha(Path(__file__)), 'source_fixtures': len(e['rows']), 'svg_panels': len(r['rows']),
          'all_main_svgs_identical': True, 'canonical_ir_and_cuts_unchanged': True, 'passed': True}
(OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))

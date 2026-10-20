"""Audit paper UI SVGs and every raw source SVG identity and path."""
import hashlib
import json
from pathlib import Path
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
import audit_local_svg as shared
from audit_input_dock_receipts import verify as verify_docks
from audit_role_source_frame_receipts import verify as verify_frames

OUT = Path(__file__).resolve().parents[1] / 'verification/helper-contracts/current'
report = json.loads((OUT / 'ui-report.json').read_text())
for row in report['rows']:
    doc, tree = json.loads((OUT / row['document']).read_text()), ET.parse(OUT / row['svg'])
    verify_docks(doc, tree); verify_frames(doc, tree)
with tempfile.TemporaryDirectory(prefix='archcanvas-helper-ui-') as temporary:
    folder = Path(temporary)
    rows = [{**r, 'svg': str(OUT / r['svg']), 'document': str(OUT / r['document'])} for r in report['rows']]
    (folder / 'render-report.json').write_text(json.dumps({'rows': rows}))
    shared.OUT = folder; sys.argv = [__file__]; shared.main()
    result = json.loads((folder / 'svg-report.json').read_text())
raw = json.loads((OUT / report['raw_document']).read_text()); tree = ET.parse(OUT / report['raw_svg'])
nodes = {e.get('data-id'): e for e in tree.iter() if e.get('data-id')}
paths = {e.get('data-edge-id'): e for e in tree.iter() if e.get('data-edge-id')}
assert set(nodes) == {n['id'] for n in raw['ir']['nodes']} and set(paths) == {e['id'] for e in raw['ir']['edges']}
geometry = {n['id']: n for n in raw['nodes']}
for identity, node in nodes.items():
    actual = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', node.get('transform'))]
    assert actual == [geometry[identity]['x'], geometry[identity]['y']]
for edge in raw['edges']:
    element = paths[edge['id']]
    points = [float(n) for n in re.findall(r'-?\d+(?:\.\d+)?', element.get('d'))]
    assert points == [v for p in edge['route']['points'] for v in [p['x'], p['y']]]
    assert element.get('data-route-valid') == 'true' and edge['route']['ok']
    assert len(points) >= 4
    for index in range(2, len(points), 2):
        assert points[index] == points[index - 2] or points[index + 1] == points[index - 1]
    assert edge['source'] in nodes and edge['target'] in nodes
result.update(render_report_sha256=hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest(),ui_report_sha256=hashlib.sha256((OUT / 'ui-report.json').read_bytes()).hexdigest(),
    raw_source={'nodes': len(nodes), 'edges': len(paths), 'all_canonical_ids_and_paths_verified': True, 'scope': 'Exact raw source IDs, positions and orthogonal route points; generic paper terminal/contact audit applies only to the two publication states.'})
(OUT / 'ui-svg-report.json').write_text(json.dumps(result, indent=2) + '\n')

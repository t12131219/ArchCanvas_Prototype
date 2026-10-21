"""Independently inspect canonical cuts, literal provenance and actual SVG rails."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/invocation-inputs/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
from semantic_adapter.analyzer import analyze
import audit_local_svg as geometry
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns

sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
report = read(OUT / 'render-report.json')
for f, h in report['implementation_sha256'].items():
    assert sha(ROOT / f) == h, ('producer changed', f)
snapshot = read(OUT / 'snapshot.json')
assert sha(OUT / 'snapshot.json') == report['baseline_sha256']
for f, h in snapshot['files'].items():
    saved = OUT / 'before' / Path(f).name
    assert sha(saved) == h
    assert saved.read_bytes() == subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)
extraction = read(ROOT / report['extraction'])
assert sha(ROOT / report['extraction']) == report['extraction_sha256']
assert sha(ROOT / extraction['source']) == extraction['source_sha256']
for row in extraction['rows']:
    assert sha(ROOT / row['input']) == row['sha256']
    assert analyze(ROOT / extraction['source'], row['entry']) == read(ROOT / row['input'])

def intersects(a, b, box):
    x, y, w, h = box
    if a[0] == b[0]:
        return x < a[0] < x+w and max(min(a[1], b[1]), y) < min(max(a[1], b[1]), y+h)
    return y < a[1] < y+h and max(min(a[0], b[0]), x) < min(max(a[0], b[0]), x+w)

results = []
for row in report['rows']:
    doc = read(OUT / row['document'])
    assert sha(OUT / row['document']) == row['document_sha256']
    assert sha(OUT / row['svg']) == row['svg_sha256']
    assert sha(ROOT / row['input']) == row['input_sha256']
    assert doc['ir'] == read(ROOT / row['input'])
    tree = ET.parse(OUT / row['svg'])
    nodes = {n.get('data-node-id'): n for n in tree.iter() if n.get('data-node-id')}
    paths = {n.get('data-edge-id'): n for n in tree.iter() if n.get('data-edge-id')}
    assert len(nodes) == row['nodes'] and len(paths) == row['edges']
    q = row['quality']
    assert list(map(float, tree.getroot().get('viewBox').split()))[2:] == [q['native_width_px'], q['native_height_px']]
    assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
    assert not q['line_geometry']['unrelated_contacts']
    assert all(p['same_value'] for p in q['line_geometry']['overlapping_paths'])
    for bucket, key in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
        ids = [v for group in doc['layout'][bucket].values() for v in group]
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in doc['ir'][key]}
    canonical = {n['id']: n for n in doc['ir']['nodes']}
    planned = {n['id']: n for n in doc['architecture']['nodes']}
    positions = {n['id']: n for n in doc['layout']['nodes']}
    lines = {key: [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', p.get('d'))] for key, p in paths.items()}
    route_by_id = {e['id']: e for e in doc['layout']['edges']}
    edge_by_id = {e['id']: e for e in doc['ir']['edges']}
    for id, points in lines.items():
        edge = route_by_id[id]
        assert points == [(p['x'], p['y']) for p in edge['route']['points']]
        assert edge['route']['ok'] and len(points) >= 2
        assert all(a[0] == b[0] or a[1] == b[1] for a, b in zip(points, points[1:]))
        for endpoint, (x, y) in [('source', points[0]), ('target', points[-1])]:
            assert edge[endpoint] in nodes
            p = positions[edge[endpoint]]
            if p['expanded']:
                continue
            if p.get('symbol'):
                assert abs(((x-p['x']-p['w']/2)**2+(y-p['y']-p['h']/2)**2)**.5-p['w']/2) < 1e-6
            else:
                assert p['x']-1e-6 <= x <= p['x']+p['w']+1e-6 and p['y']-1e-6 <= y <= p['y']+p['h']+1e-6
                assert min(abs(x-p['x']), abs(x-p['x']-p['w']), abs(y-p['y']), abs(y-p['y']-p['h'])) < 1e-6
        element = paths[id]
        if 'data-source-port' in element.attrib and id in edge_by_id:
            assert element.get('data-target-port') == edge_by_id[id]['target_port']
            assert element.get('data-canonical-target') == edge_by_id[id]['target']
        if 'data-bundle-members' in element.attrib:
            assert json.loads(element.get('data-bundle-members')) == [m['id'] for m in edge['bundle_members']]
            for member, actual in zip(edge['bundle_members'], json.loads(element.get('data-bundle-endpoints'))):
                canonical_edge = edge_by_id[member['id']]
                assert all(actual[k] == canonical_edge[k] for k in ['source', 'target'])
                assert member['target_port'] == canonical_edge['target_port']
    crossings = 0
    segments = [list(zip(points, points[1:])) for points in lines.values()]
    for i, first in enumerate(segments):
        for second in segments[i+1:]:
            for a, b in first:
                for c, d in second:
                    if (a[0] == b[0]) == (c[0] == d[0]):
                        continue
                    v, w, h, k = (a, b, c, d) if a[0] == b[0] else (c, d, a, b)
                    crossings += min(h[0], k[0]) < v[0] < max(h[0], k[0]) and min(v[1], w[1]) < h[1] < max(v[1], w[1])
    assert crossings == q['line_geometry']['crossings']
    bindings = doc['publication'].get('invocation_inputs', {})
    assert bindings == (row.get('invocation_inputs') or {})
    fixed = {r['node']: r for r in bindings.get('rows', [])}
    for id, binding in fixed.items():
        original = canonical[id]
        assert original['kind'] == 'interface' and original['role'] == 'input'
        assert binding['source_parent'] == original['parent']
        assert original['source_constant_input']['value'] == binding['value']
        assert original['source_constant_input']['scope'] == binding['proof_scope']
        assert not any(e['target'] == id for e in doc['ir']['edges'])
        assert binding['uses'] == [e for e in doc['ir']['edges'] if e['source'] == id]
        if binding['status'] in ['docked', 'visible']:
            assert id in nodes and binding['visible_node'] == id
            assert binding['label'] in ''.join(nodes[id].itertext())
            assert 'Fixed call argument:' in ''.join(nodes[id].itertext())
            for use in binding['uses']:
                routed = [e for e in doc['layout']['edges'] if any(use['id'] in {m['id'], *m.get('originals', [])} for m in e.get('bundle_members', [e]))]
                assert routed, ('literal use missing', row['name'], use)
                for edge in routed:
                    assert edge['source'] == id and edge['route']['ok']
                    member = next(m for m in edge.get('bundle_members', [edge]) if use['id'] in {m['id'], *m.get('originals', [])})
                    assert all(member.get(k) == use.get(k) for k in ['source_port', 'target_port', 'kind', 'condition'])
        else:
            assert id not in nodes and binding['status'] in ['folded', 'outside']
    for dock in bindings.get('docks', []):
        parent = positions[dock['parent']]
        assert parent['expanded'] and parent['protected_header_width'] == dock['title_width']
        title_box = (parent['x'], parent['y'], dock['title_width'], parent['protected_header_height'])
        for id in dock['nodes']:
            p = positions[id]
            assert fixed[id]['status'] == 'docked' and p['arrangement'] == 'fixed-call-argument'
            assert planned[id]['parent'] == dock['parent']
            assert p['x'] >= parent['x'] + dock['title_width']
            assert p['x'] + p['w'] <= parent['x'] + parent['w']
            assert parent['y'] <= p['y'] and p['y'] + p['h'] < parent['y'] + parent['header'] - 10
            actual = list(map(float, re.findall(r'-?[\d.]+', nodes[id].get('transform'))))
            assert actual == [p['x'], p['y']]
        for points in lines.values():
            assert not any(intersects(a, b, title_box) for a, b in zip(points, points[1:])), ('wire enters title', row['name'], dock['parent'])
    for cut in doc['publication']['boundary']:
        original = next(e for e in doc['ir']['edges'] if e['id'] == cut['id'])
        assert all(cut.get(k) == original.get(k) for k in ['source', 'target', 'source_port', 'target_port', 'kind', 'condition', 'evidence'])
    docks(doc, tree)
    returns(doc, tree)
    audit_row = {**row, 'local_pipelines': doc['publication'].get('local_pipelines'), 'contract_stages': doc['publication'].get('contract_stages')}
    geometry.audit_pipeline_summaries(doc, audit_row, nodes)
    geometry.audit_contract_stages(doc, audit_row, nodes)
    results.append({'name': row['name'], 'original_fixed_terminals': len(fixed), 'docked': sum(r['status'] == 'docked' for r in fixed.values()), 'passed': True})

by = {r['name']: r for r in report['rows']}
comparisons = []
for pair in report['comparisons']:
    a, b = [by[pair[k]] for k in ['before', 'current']]
    da, db = [read(OUT / row['document']) for row in [a, b]]
    assert pair['svg_equal'] == ((OUT/a['svg']).read_bytes() == (OUT/b['svg']).read_bytes())
    exposed = lambda d: sorted((r['certificate'], r['role_keys'], r['node']) for r in d['publication'].get('role_frontier', {}).get('roles', []) if r['status'] == 'exposed')
    assert exposed(da) == exposed(db)
    protected = {n['id'] for n in da['ir']['nodes'] if n['kind'] in ['opaque', 'control'] or n.get('condition') or n.get('mutable') or n.get('identity_display')}
    visible = lambda d: {n['id'] for n in d['layout']['nodes']}
    assert visible(da) & protected == visible(db) & protected
    comparisons.append({**pair, 'exposed_roles_unchanged': True, 'protected_visibility_unchanged': True,
                        'added_nodes': sorted(visible(db)-visible(da)), 'removed_nodes': sorted(visible(da)-visible(db))})
result = {'schema': 'invocation-inputs-independent/1', 'render_report_sha256': sha(OUT/'render-report.json'), 'auditor_sha256': sha(Path(__file__)),
          'source_fixtures': len(extraction['rows']), 'svg_panels': len(report['rows']), 'results': results, 'comparisons': comparisons, 'passed': True, 'goal_complete': False}
(OUT/'independent-report.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({'svg_panels': len(report['rows']), 'passed': True}))

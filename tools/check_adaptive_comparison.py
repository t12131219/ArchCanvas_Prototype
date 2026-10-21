"""Audit completed default adaptive renders without refreshing historical UI evidence."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import audit_local_svg as geometry
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns
from audit_role_source_frame_receipts import verify as frames

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-comparison/current'
sys.path.insert(0, str(ROOT))
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
report = read(OUT / 'render-report.json')
for f, h in report['implementation_sha256'].items():
    assert sha(ROOT / f) == h, ('stale producer', f)
snapshot_path = ROOT / report['checkpoint']
assert sha(snapshot_path) == report['checkpoint_sha256']
snapshot = read(snapshot_path)
for f, h in snapshot['files'].items():
    assert sha(snapshot_path.parent / 'implementation' / f) == h
    assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
launch, timing = [read(OUT / f) for f in ['resume-launch.json', 'transformer-timing.json']]
assert timing['resume_launch_sha256'] == sha(OUT / 'resume-launch.json')
assert timing['implementation_sha256'] == launch['implementation_sha256']
assert timing['input_sha256'] == launch['input_sha256'] == sha(ROOT / timing['input'])
for f, h in timing['implementation_sha256'].items():
    assert sha(ROOT / f) == h
for f, h in launch['baseline_sha256'].items():
    assert sha(OUT / f) == h
assert timing['rows'][0]['elapsed_ms'] is None
assert timing['rows'][1]['name'] == 'current' and timing['rows'][1]['elapsed_ms'] > 0
assert launch['previous_process_terminal_verified'] and launch['previous_exit_code'] == 143
assert report['reference']['sha256'] == sha(ROOT / report['reference']['file'])
rows = {r['name']: r for r in report['rows']}
assert len(rows) == 22 and {'transformer-before', 'transformer-current'} <= rows.keys()
docs, results = {}, []
for row in report['rows']:
    doc = read(OUT / row['document'])
    assert sha(OUT / row['document']) == row['document_sha256']
    assert sha(OUT / row['svg']) == row['svg_sha256']
    assert sha(ROOT / row['input']) == row['input_sha256']
    assert doc['ir'] == read(ROOT / row['input'])
    for bucket, key in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
        ids = sum(doc['layout'][bucket].values(), [])
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in doc['ir'][key]}
    for cut in doc['publication']['boundary']:
        original = next(e for e in doc['ir']['edges'] if e['id'] == cut['id'])
        assert all(cut.get(k) == original.get(k) for k in ['source', 'target', 'source_port', 'target_port', 'kind', 'condition', 'evidence'])
    tree = ET.parse(OUT / row['svg'])
    nodes = {n.get('data-node-id'): n for n in tree.iter() if n.get('data-node-id')}
    paths = {n.get('data-edge-id'): n for n in tree.iter() if n.get('data-edge-id')}
    assert len(nodes) == row['nodes'] and len(paths) == row['edges']
    q = row['quality']
    assert list(map(float, tree.getroot().get('viewBox').split()))[2:] == [q['native_width_px'], q['native_height_px']]
    segments = [list(zip(p, p[1:])) for p in [[(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', p.get('d'))] for p in paths.values()]]
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
    assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
    assert not q['line_geometry']['unrelated_contacts']
    assert all(p['same_value'] for p in q['line_geometry']['overlapping_paths'])
    docks(doc, tree); returns(doc, tree); frames(doc, tree)
    geometry.audit_pipeline_summaries(doc, row, nodes)
    geometry.audit_contract_stages(doc, row, nodes)
    docs[row['name']] = doc
    results.append({'name': row['name'], 'nodes': len(nodes), 'paths': len(paths), 'crossings': crossings, 'passed': True})
before, current = [docs['transformer-' + s] for s in ['before', 'current']]
expected_state = {**launch['state'], 'view': 'publication'}
assert before['state'] == current['state'] == expected_state
def exposed(d):
    contracts = {c['id']: c for c in d['architecture']['semantic_contracts']}
    def refs(value, keys=()):
        if isinstance(value, str):
            yield list(keys), value
        elif isinstance(value, dict):
            for key, child in value.items():
                yield from refs(child, (*keys, key))
        elif isinstance(value, list):
            for index, child in enumerate(value):
                yield from refs(child, (*keys, str(index)))
    rows = []
    for r in d['publication']['role_frontier']['roles']:
        if r['status'] != 'exposed':
            continue
        candidates = [keys for keys, node in refs(contracts[r['certificate']]['roles'])
                      if node == r['node'] and '.'.join(keys) == r['role']]
        # The frozen version predates exact key arrays. Recover from its actual
        # certificate only if the old flattened reference has one interpretation.
        keys = r.get('role_keys')
        if keys is None:
            assert len(candidates) == 1, ('ambiguous historical role', r)
            keys = candidates[0]
        assert keys in candidates
        rows.append((r['certificate'], keys, r['node']))
    return sorted(rows)
assert exposed(before) == exposed(current)
protected = {n['id'] for n in current['ir']['nodes'] if n['kind'] in ['opaque', 'control'] or n.get('condition') or n.get('mutable') or n.get('identity_display')}
visible = lambda d: {n['id'] for n in d['layout']['nodes']}
assert protected & visible(before) == protected & visible(current)
adaptive = current['publication']['adaptive_frontier']
canonical = {n['id']: n for n in current['ir']['nodes']}
constant_interfaces = []
for n in current['layout']['nodes']:
    fact = canonical.get(n['id'], {})
    if fact.get('kind') == 'interface' and fact.get('role') == 'input' and 'source_constant_input' in fact:
        constant_interfaces.append({'node': fact['id'], 'label': fact['label'], 'binding': fact['source_constant_input'],
            'uses': [e for e in current['ir']['edges'] if e['source'] == fact['id']],
            'scope': 'Inventory only. Literal evidence does not authorize hiding control, state, effects or unknown boundaries.'})
assert len(adaptive['attempts']) <= adaptive['measurement_limit'] == 3
assert len(adaptive['preflights']) <= adaptive['preflight_limit'] == 36
assert not adaptive['selected_role_paths'] and not any(t['accepted'] for t in adaptive['attempts'])
# Establish byte equality, rather than using fixed-policy evidence as a substitute
# for the independently completed default-adaptive calculation.
fixed = ROOT / 'verification/coherent-frontiers/current/Transformer-fixed-current.svg'
assert fixed.read_bytes() == (OUT / 'transformer-current.svg').read_bytes()
geometry.OUT = OUT
sys.argv = [__file__]
geometry.main()
result = {'schema': 'adaptive-comparison-independent/1', 'render_report_sha256': sha(OUT / 'render-report.json'),
    'auditor_sha256': sha(Path(__file__)), 'svg_panels': len(results), 'results': results,
    'current_elapsed_ms': timing['rows'][1]['elapsed_ms'], 'before_elapsed_ms': None,
    'default_adaptive_matches_fixed_svg': True, 'exposed_role_identities_unchanged': True,
    'protected_visibility_unchanged': True, 'exposed_roles': len(exposed(current)),
    'selected_additional_role_paths': 0, 'canonical_ir_unchanged': True, 'passed': True, 'goal_complete': False}
result['visible_source_constant_interfaces'] = constant_interfaces
(OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'svg_panels': len(results), 'passed': True, 'current_elapsed_ms': result['current_elapsed_ms']}))

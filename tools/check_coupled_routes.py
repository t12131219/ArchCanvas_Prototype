"""Audit actual SVG paths and fixed semantic/physical boundaries independently."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/coupled-routes/current'
sys.path.insert(0, str(ROOT / 'tools'))
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments
from check_title_passages import passages
from check_final_sample_frames import terminals

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def compare(a, b):
    for key in ['ir', 'state', 'architecture', 'publication', 'expression_goals', 'expression_coverage', 'summary_goals', 'summary_coverage']:
        assert a.get(key) == b.get(key), ('changed facts', key)
    for key in set(a['layout']) | set(b['layout']):
        if key not in ['edges', 'labels', 'bounds']:assert a['layout'].get(key) == b['layout'].get(key), key
    old = {e['id']: e for e in a['layout']['edges']}
    assert old.keys() == {e['id'] for e in b['layout']['edges']}
    changed = []
    for e in b['layout']['edges']:
        was = old[e['id']]
        assert {k: v for k, v in e.items() if k != 'route'} == {k: v for k, v in was.items() if k != 'route'}
        for key in ['source_side', 'target_side']:assert e['route'][key] == was['route'][key]
        assert [e['route']['points'][0], e['route']['points'][-1]] == [was['route']['points'][0], was['route']['points'][-1]]
        if e != was:changed.append(e['id'])
    receipt = b['diagnostics']['routing'].get('coupled_route_refinement', {})
    touched = {id for r in receipt.get('attempts', []) if r['accepted'] for id in r['edges']}
    assert set(changed) <= touched
    assert len(receipt.get('attempts', [])) <= receipt.get('max_attempts', 0) <= 48
    assert len({tuple(r['edges']) for r in receipt.get('attempts', [])}) <= 12
    for id in changed:
        e = old[id]
        assert not any(e.get(k) for k in ['design_route', 'context_lane', 'iteration', 'layout_after'])
        assert all(m['kind'] in ['data', 'alias', 'interface-binding', 'parameter-read', 'buffer-read'] for m in e.get('bundle_members', [e]))
    return changed


def main():
    reports = [read(OUT / (key + '-report.json')) for key in ['small', 'large']]
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for f, h in reports[0]['implementation_sha256'].items():assert sha(ROOT / f) == h, ('stale producer', f)
    snapshot = reports[0]['snapshot'];assert snapshot == reports[1]['snapshot']
    for f, h in snapshot['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    report_blob = subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + snapshot['large_report']['path']], cwd=ROOT)
    assert hashlib.sha256(report_blob).hexdigest() == snapshot['large_report']['sha256']
    recorded = json.loads(report_blob)
    geometry.OUT = OUT
    rows = [];svg_count = 0
    for report in reports:
        for request in report['rows']:
            assert sha(ROOT / request['input']) == request['input_sha256']
            documents = [];counts = [];direct = [];title_counts = []
            for result in request['results']:
                for key in ['svg', 'document']:assert sha(OUT / result[key]) == result[key + '_sha256']
                d = read(OUT / result['document']);svg = ET.parse(OUT / result['svg']).getroot()
                assert d['ir'] == read(ROOT / request['input'])
                assert d['state'] == {**request['state'], 'view': 'publication'}
                if result.get('reuse'):
                    old = next(r for r in recorded['rows'] if r['name'] == request['name'])
                    assert old['state'] == request['state'] and old['input_sha256'] == request['input_sha256']
                    capture = next(r for r in old['results'] if r['suffix'] == 'current')
                    for key in ['svg', 'document']:assert result[key + '_sha256'] == capture[key + '_sha256']
                view = geometry.inspect({**result, 'name': request['name'] + '-' + result['suffix']})
                title, bodies = passages(d, svg);assert not bodies, bodies
                terminals(d)
                paths = {p.get('data-edge-id'): p for p in svg.iter() if p.get('data-edge-id')}
                for e in d['layout']['edges']:
                    p = paths[e['id']]
                    assert p.get('data-source-port') == e['source_port'] and p.get('data-target-port') == e['target_port']
                    if not e.get('bundle_members'):
                        assert p.get('data-canonical-source') == e['canonical_source'] and p.get('data-canonical-target') == e['canonical_target']
                goals = d['expression_goals']['goals']
                direct.append({g['id'] for g, ok in zip(goals, assignments(d['ir'], goals, {**d, 'quality': result['quality']}, svg)) if ok})
                for key, canonical in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
                    ids = [id for group in d['layout'][key].values() for id in group]
                    assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in d['ir'][canonical]}
                documents.append(d);counts.append(view['crossings']);title_counts.append(len(title));svg_count += 1
            a, b = documents;changed = compare(a, b);assert direct[0] <= direct[1]
            aq, bq = [r['quality'] for r in request['results']]
            assert counts[1] <= counts[0] and bq['wire_length'] <= aq['wire_length'] * 1.02
            assert all(bq[k] <= aq[k] for k in ['native_width_px', 'native_height_px'])
            assert bq['min_canvas_font_px'] >= aq['min_canvas_font_px']
            assert not bq['route_failures'] and not bq['line_geometry']['unrelated_contacts']
            assert all(p['same_value'] for p in bq['line_geometry']['overlapping_paths'])
            assert set(bq['issues']) <= set(aq['issues'])
            rows.append(dict(name=request['name'], crossings=counts, wire_length=[aq['wire_length'], bq['wire_length']],
                direct_goals=[len(x) for x in direct], title_passages=title_counts, changed_paths=changed))
    output = dict(schema='coupled-routes-independent/1', passed=True, svgs=svg_count, rows=rows,
        scope='Actual XML crossings, canonical edges/slots, unchanged nodes, exact terminals, title passages, real body obstacles, full accounting and direct goals. No claim of global optimality or complete goal convergence.')
    (OUT / 'independent-report.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps(dict(passed=True, svgs=svg_count, improved=[r for r in rows if r['crossings'][1] < r['crossings'][0]])))


if __name__ == '__main__':main()

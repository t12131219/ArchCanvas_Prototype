"""Audit actual SVG shortcuts independently of their producer receipts."""
import json
from pathlib import Path
import sys
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
from audit_unconsumed_dimension_proofs import audit as dimensions

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/route-shortcuts/current'
read, sha = content.read, content.sha


def self_clear(points):
    for a, b, c in zip(points, points[1:], points[2:]):
        assert not (a['x'] == b['x'] == c['x'] or a['y'] == b['y'] == c['y'])
    for i, (a, b) in enumerate(zip(points, points[1:])):
        assert a != b and (a['x'] == b['x'] or a['y'] == b['y'])
        for c, d in list(zip(points, points[1:]))[i+2:]:
            assert not (max(min(a['x'], b['x']), min(c['x'], d['x'])) <= min(max(a['x'], b['x']), max(c['x'], d['x']))
                        and max(min(a['y'], b['y']), min(c['y'], d['y'])) <= min(max(a['y'], b['y']), max(c['y'], d['y'])))


def length(points):
    return sum(abs(a['x']-b['x'])+abs(a['y']-b['y']) for a, b in zip(points, points[1:]))


if __name__ == '__main__':
    reports = [read(OUT / 'small-report.json')]
    if '--small' not in sys.argv:
        reports += [read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    hashes = reports[0]['implementation_sha256']
    for file, digest in hashes.items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    content.OUT = operands.OUT = OUT
    rows = []
    for report in reports:
        assert report['implementation_sha256'] == hashes
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            captures = [content.inspect(r, row['name']+'-'+r['suffix'], sequences.check_operation) for r in row['results']]
            (a, ga, _), (b, gb, _) = captures
            for capture, (doc, _, _) in zip(row['results'], captures):
                operands.check_svg_bindings(capture, doc)
                dimensions(doc, dict(configuration_paths=[r for r in doc['publication']['configuration_arithmetic'] if r.get('rule_version') == 'dimension-paths/1']), {n['id'] for n in doc['layout']['nodes']})
            # A final path pass cannot choose a different semantic frontier or
            # credit an attachment/summary as newly exposed computation.
            for key in ['ir', 'architecture', 'publication', 'expression_goals', 'expression_coverage', 'summary_goals', 'summary_coverage']:
                assert a[key] == b[key], (row['name'], key)
            assert ga == gb
            for key in ['nodes', 'node_accounting', 'edge_accounting', 'representatives', 'labels', 'frame_ownership',
                        'source_fork_widths', 'local_bypasses', 'input_docks', 'branch_columns', 'shared_fanouts']:
                assert a['layout'].get(key) == b['layout'].get(key), (row['name'], key)
            applied = {r['id'] for r in a['layout']['constraint_receipts'] if r['status'] == 'applied'}
            assert applied <= {r['id'] for r in b['layout']['constraint_receipts'] if r['status'] == 'applied'}
            old = {e['id']: e for e in a['layout']['edges']}
            new = {e['id']: e for e in b['layout']['edges']}
            assert old.keys() == new.keys()
            changed = []
            direction = lambda a, b: ((b['x'] > a['x'])-(b['x'] < a['x']), (b['y'] > a['y'])-(b['y'] < a['y']))
            for at, e in new.items():
                was = old[at]
                assert {k: v for k, v in was.items() if k != 'route'} == {k: v for k, v in e.items() if k != 'route'}
                if e['route'] == was['route']:
                    continue
                assert not any(e.get(k) for k in ['design_route', 'context_lane', 'iteration', 'layout_after', 'bundle_members'])
                assert e['kind'] in ['data', 'alias', 'interface-binding', 'parameter-read', 'buffer-read']
                assert {k: v for k, v in was['route'].items() if k != 'points'} == {k: v for k, v in e['route'].items() if k != 'points'}
                p, q = was['route']['points'], e['route']['points']
                assert p[0] == q[0] and p[-1] == q[-1]
                assert direction(p[0], p[1]) == direction(q[0], q[1]) and direction(p[-2], p[-1]) == direction(q[-2], q[-1])
                assert length(q) < length(p)
                self_clear(q)
                changed.append(at)
            receipt = row['results'][1].get('shortcuts')
            assert set(changed) == {r['edge'] for r in (receipt or {}).get('selected', [])}
            qa, qb = [r['quality'] for r in row['results']]
            assert not qb['route_failures'] and not qb['unplaced_port_labels']
            assert not (set(qb['issues']) - set(qa['issues']))
            assert qb['native_width_px'] <= qa['native_width_px'] and qb['native_height_px'] <= qa['native_height_px']
            assert qb['wire_length'] <= qa['wire_length'] and qb['line_geometry']['crossings'] <= qa['line_geometry']['crossings']
            # Check actual pair identities and overlap lengths, including same
            # source values, rather than only an aggregate issue count.
            overlaps = lambda q: {tuple(r['edges']): r['length'] for r in q['line_geometry']['overlapping_paths']}
            oa, ob = overlaps(qa), overlaps(qb)
            assert all(size <= oa.get(pair, 0) for pair, size in ob.items())
            contacts = lambda q: {tuple(r['edges']) for r in q['line_geometry']['unrelated_contacts']}
            assert contacts(qb) <= contacts(qa)
            if changed:
                assert qb['wire_length'] < qa['wire_length'] and qb['line_geometry']['crossings'] < qa['line_geometry']['crossings']
            else:
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'], changed_paths=changed, direct=len(gb),
                nodes=len(b['layout']['nodes']), dimensions_before=[qa['native_width_px'], qa['native_height_px']],
                dimensions_current=[qb['native_width_px'], qb['native_height_px']],
                wire_before=qa['wire_length'], wire_current=qb['wire_length'],
                crossings_before=qa['line_geometry']['crossings'], crossings_current=qb['line_geometry']['crossings']))
    result = dict(passed=True, svg_count=2*len(rows), implementation_sha256=hashes, rows=rows, goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(rows, indent=2))

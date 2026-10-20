"""Check local choices from actual SVG nodes/paths and canonical fact bindings."""
import hashlib
import itertools
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-frontier/current'


def read(path):
    return json.loads(path.read_text())


def inspect(row):
    doc = read(OUT / row['document'])
    tree = ET.parse(OUT / row['svg'])
    nodes = {e.get('data-node-id'): e for e in tree.iter() if e.get('data-node-id')}
    paths = {e.get('data-edge-id'): e for e in tree.iter() if e.get('data-edge-id')}
    layout = {e['id']: e for e in doc['layout']['edges']}
    points = {key: [tuple(map(float, p)) for p in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', e.get('d'))] for key, e in paths.items()}
    crossings, contacts, overlaps = 0, set(), []
    for first, second in itertools.combinations(paths, 2):
        a, b = layout[first], layout[second]
        same = a.get('resolved_source') == b.get('resolved_source') and a.get('source_port') == b.get('source_port')
        shared = 0
        for p, q in zip(points[first], points[first][1:]):
            for u, v in zip(points[second], points[second][1:]):
                axis1, axis2 = int(p[0] != q[0]), int(u[0] != v[0])
                if axis1 == axis2:
                    if p[axis1] == u[axis1]:
                        axis = 1 - axis1
                        length = min(max(p[axis], q[axis]), max(u[axis], v[axis])) - max(min(p[axis], q[axis]), min(u[axis], v[axis]))
                        shared += length if length > 8 else 0
                    continue
                low, high, left, right = (p, q, u, v) if axis1 == 0 else (u, v, p, q)
                x, y = low[0], left[1]
                inside_x, inside_y = sorted([left[0], right[0]]), sorted([low[1], high[1]])
                if inside_x[0] < x < inside_x[1] and inside_y[0] < y < inside_y[1]:
                    crossings += 1
                elif not same and inside_x[0] <= x <= inside_x[1] and inside_y[0] <= y <= inside_y[1]:
                    if not all((x, y) in [points[key][0], points[key][-1]] for key in [first, second]):
                        contacts.add((first, second, x, y))
        if shared:
            overlaps.append((first, second, shared, same))
    expected = row['quality']['line_geometry']
    assert crossings == expected['crossings'], row['name']
    assert len(contacts) == len(expected['unrelated_contacts']), row['name']
    assert overlaps == [(r['edges'][0], r['edges'][1], r['length'], r['same_value']) for r in expected['overlapping_paths']], row['name']
    actual = {}
    for key, path in paths.items():
        if path.get('data-route-valid') == 'true':
            for member in layout[key].get('bundle_members', [layout[key]]):
                for edge in {member['id'], *member.get('originals', [])}:
                    actual.setdefault(edge, []).append(key)
    ir = doc['ir']
    fulfilled = {}
    conflicts = {c['evidence'].get('relation') for c in doc['layout']['constraint_receipts'] if c['status'] == 'conflict'}
    receipts = {r['goal']: r for r in doc['expression_coverage']}
    for goal in doc['expression_goals']['goals']:
        if not set(goal['core']) <= nodes.keys() or not set(goal['edges']) <= actual.keys() or goal.get('relation') in conflicts:
            continue
        # Identity is independently checked by audit_local_svg; it must also
        # pass the renderer's printed-reference check before it can earn gain.
        if goal.get('identity') and receipts[goal['id']]['status'] != 'fulfilled':
            continue
        if goal['kind'] == 'computation':
            ins = [e['id'] for e in ir['edges'] if e['target'] == goal['focus_node'] and e['kind'] in ['data', 'alias', 'interface-binding']]
            if not ins or not set(ins) <= actual.keys():
                continue
        fulfilled[goal['id']] = goal
    canonical = {n['id']: n for n in ir['nodes']}
    boundaries = {key for key in nodes if key in canonical and (canonical[key]['kind'] in ['opaque', 'control'] or any(canonical[key].get(k) for k in ['condition', 'mutable', 'identity_display']) or canonical[key].get('evidence_status') == 'runtime-only')}
    return {'document': doc, 'nodes': nodes, 'paths': paths, 'fulfilled': fulfilled, 'boundaries': boundaries,
            'crossings': crossings, 'contacts': len(contacts), 'overlaps': sum(not r[3] for r in overlaps)}


def main():
    report = read(OUT / 'render-report.json')
    rows = {r['name']: r for r in report['rows']}
    views = {key: inspect(r) for key, r in rows.items()}
    results = []
    for name, row in rows.items():
        current = views[name]
        if row.get('baseline'):
            baseline = views[row['baseline']]
            assert baseline['document']['ir'] == current['document']['ir']
            assert baseline['fulfilled'].keys() <= current['fulfilled'].keys()
            assert baseline['boundaries'] <= current['boundaries']
            receipt = row['adaptive']
            assert len(receipt['attempts']) <= receipt['measurement_limit'] == 3
            assert len(receipt['preflights']) <= receipt['preflight_limit'] == 36
            assert current['document']['state'] == {**row['state'], 'view': 'publication'}
        if row.get('trial_for'):
            parent = views[row['trial_parent']]
            attempt = rows[row['trial_for']]['adaptive']['attempts'][row['attempt']]
            gained = current['fulfilled'].keys() - parent['fulfilled'].keys()
            lost = parent['fulfilled'].keys() - current['fulfilled'].keys()
            assert gained == {g['id'] for g in attempt['gained_goals']}
            assert lost == set(attempt['lost_goals'])
            gain = sum(current['fulfilled'][key]['priority'] for key in gained)
            assert attempt['gain'] == gain
            if row['accepted']:
                assert gain and not lost and parent['boundaries'] <= current['boundaries']
                assert current['contacts'] <= parent['contacts'] and current['overlaps'] <= parent['overlaps']
                assert current['crossings'] <= parent['crossings'] + gain // 2
                quality = row['quality']
                assert not quality['route_failures'] and not quality['unplaced_port_labels']
                for key, limit in [('width', 'width_px'), ('height', 'height_px')]:
                    metric = 'native_' + key + '_px'
                    assert quality[metric] <= max(parent['document']['diagnostics']['publication'][metric], quality['canvas_limits'][limit])
                area = quality['native_width_px'] * quality['native_height_px']
                pq = parent['document']['diagnostics']['publication']
                assert area <= max(pq['native_width_px'] * pq['native_height_px'], quality['canvas_limits']['area_px2'])
            else:
                assert attempt['reasons'], name
            results.append({'name': name, 'accepted': row['accepted'], 'verified_gain': gain, 'crossings': current['crossings'], 'contacts': current['contacts']})
    output = {'schema': 'adaptive-frontier-independent/1', 'render_report_sha256': hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest(),
              'panels': len(rows), 'results': results, 'passed': True,
              'scope': 'Actual XML exposure, canonical physical paths, retained boundary nodes, gain, dimensions, crossings, contacts and distinct-value overlaps; hidden instances are not scored as obligations.'}
    (OUT / 'adaptive-report.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'panels': len(rows), 'trials': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

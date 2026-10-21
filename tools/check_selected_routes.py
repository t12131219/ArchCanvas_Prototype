"""Recompute selected-route geometry and exact expression from actual SVGs."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/selected-routes/current'
sys.path.insert(0, str(ROOT / 'tools'))
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from audit_diagram_assignments import assignments
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def intrusions(doc, edge):
    """Visible node bodies and ancestor titles, from fixed SVG geometry."""
    boxes = {n['id']: n for n in doc['layout']['nodes']}
    source, target = [boxes[edge[k]] for k in ['source', 'target']]
    contains = lambda a, b: a['x'] <= b['x'] and a['y'] <= b['y'] and a['x'] + a['w'] >= b['x'] + b['w'] and a['y'] + a['h'] >= b['y'] + b['h']
    points = edge['route']['points']
    hits = set()
    for id, p in boxes.items():
        ancestor = p.get('expanded') and (contains(p, source) or contains(p, target))
        x, y, w, h = p['x'], p['y'], p['w'], p['h']
        if ancestor:
            w, h = p.get('protected_header_width', w), p.get('protected_header_height', p['header'] - 10)
        for a, b in zip(points, points[1:]):
            if p.get('symbol'):
                radius = w / 2;cx = x + radius;cy = y + radius
                distance = abs(a['x'] - cx) if a['x'] == b['x'] else abs(a['y'] - cy)
                if distance >= radius - 1e-8:continue
                half = (radius * radius - distance * distance) ** .5
                hit = max(a['y'], b['y']) > cy - half + 1e-8 and min(a['y'], b['y']) < cy + half - 1e-8 if a['x'] == b['x'] else max(a['x'], b['x']) > cx - half + 1e-8 and min(a['x'], b['x']) < cx + half - 1e-8
            else:
                hit = x < a['x'] < x + w and max(a['y'], b['y']) > y and min(a['y'], b['y']) < y + h if a['x'] == b['x'] else y < a['y'] < y + h and max(a['x'], b['x']) > x and min(a['x'], b['x']) < x + w
            if hit:hits.add(id)
    return hits


def main():
    small, large = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    assert small['implementation_sha256'] == large['implementation_sha256']
    for f, h in small['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale implementation', f)
    snapshot = small['baseline']
    assert snapshot == large['baseline']
    for f, h in snapshot['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    historical = json.loads(subprocess.check_output(['git', 'show', snapshot['commit'] + ':verification/exact-expression/current/large-report.json'], cwd=ROOT))
    geometry.OUT = stages.OUT = OUT
    docs, rows, direct, raw, measured = {}, {}, {}, {}, {}
    for report in [small, large]:
        for r in report['rows']:
            name = r['name']
            assert name not in docs
            if name.startswith('Transformer-') and name.endswith('-before'):
                previous = next(row for row in historical['rows'] if row['name'] == name.removesuffix('-before') + ('-current' if '-panel-' in name else ''))
                assert previous['svg_sha256'] == r['svg_sha256'] and previous['document_sha256'] == r['document_sha256']
            d = read(OUT / r['document'])
            measured[name] = stages.check({**r, 'role_path_stages': d['publication'].get('role_path_stages')}, compare_expression=False, require_quality=False, allow_label_notes=True)
            geometry.inspect(r)
            svg = ET.parse(OUT / r['svg']).getroot()
            goals = d['expression_goals']['goals']
            direct[name] = {g['id'] for g, ok in zip(goals, assignments(d['ir'], goals, {**d, 'quality': r['quality']}, svg)) if ok}
            raw[name] = {g['id'] for g, ok in zip(goals, assignments(d['ir'], goals, {**d, 'quality': r['quality']}, svg, require_quality=False)) if ok}
            assert raw[name] == {r['goal'] for r in d['expression_coverage'] if r['status'] == 'fulfilled'}
            docs[name], rows[name] = d, r
    comparisons = []
    changed_total = 0
    for report in [small, large]:
        for c in report['comparisons']:
            a, b = docs[c['before']], docs[c['after']]
            assert a['ir'] == b['ir']
            same = a['state'] == b['state']
            if not same:
                comparisons.append(dict(name=c['name'], rescheduled=True))
                continue
            assert a['layout']['nodes'] == b['layout']['nodes'], ('nodes moved', c['name'])
            assert a['publication'] == b['publication'], ('frontier changed', c['name'])
            for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
                assert a['layout'].get(key) == b['layout'].get(key)
            old = {e['id']: e for e in a['layout']['edges']}
            changed = []
            for edge in b['layout']['edges']:
                previous = old[edge['id']]
                assert {k: v for k, v in previous.items() if k != 'route'} == {k: v for k, v in edge.items() if k != 'route'}
                for terminal in [0, -1]:
                    assert previous['route']['points'][terminal] == edge['route']['points'][terminal]
                if previous['route'] != edge['route']:
                    assert not intrusions(b, edge) - intrusions(a, previous), ('new node or title intrusion', c['name'], edge['id'])
                    changed.append(edge['id'])
            assert raw[c['before']] <= raw[c['after']]
            assert direct[c['before']] <= direct[c['after']]
            q, p = rows[c['after']]['quality'], rows[c['before']]['quality']
            assert q['native_width_px'] <= p['native_width_px'] and q['native_height_px'] <= p['native_height_px']
            assert q['line_geometry']['crossings'] <= p['line_geometry']['crossings'] + 1
            assert len(q['line_geometry']['unrelated_contacts']) <= len(p['line_geometry']['unrelated_contacts'])
            assert not set(q['issues']) - set(p['issues'])
            receipt = b['diagnostics']['routing'].get('selected_route_refinement')
            if receipt:
                assert receipt['attempts'] <= receipt['max_attempts'] == 32
                assert receipt['after']['crossings'] == q['line_geometry']['crossings']
            changed_total += len(changed)
            comparisons.append(dict(name=c['name'], changed_routes=changed, before=measured[c['before']], after=measured[c['after']],
                contacts=[len(p['line_geometry']['unrelated_contacts']), len(q['line_geometry']['unrelated_contacts'])],
                overlaps=[sum(not x['same_value'] for x in v['line_geometry']['overlapping_paths']) for v in [p, q]],
                raw_goals=[len(raw[c['before']]), len(raw[c['after']])], direct_goals=[len(direct[c['before']]), len(direct[c['after']])]))
    j = large['joint']
    def coverage(panels):
        return {goal['id']: [p['id'] for p in panels if goal['id'] in direct[p['capture']]] for goal in j['plan']['goals']}
    before, after = coverage(j['initial']), coverage(j['panels'])
    for declared, actual in [(j['baseline_coverage'], before), (j['coverage'], after)]:
        assert all(r['panels'] == actual[r['goal']] and (r['status'] == 'fulfilled') == bool(actual[r['goal']]) for r in declared)
    prior, current = [{id for id, panels in c.items() if panels} for c in [before, after]]
    assert prior <= current and len(j['panels']) <= 3 and len(j['attempts']) <= 2
    assert changed_total > 0
    result = dict(passed=True, goal_complete=False, panels=len(docs), comparisons=comparisons,
        joint=dict(before=len(prior), after=len(current), gained=sorted(current-prior), lost=sorted(prior-current)),
        unresolved_quality_panels=[n for n, r in rows.items() if r['quality']['issues'] or r['quality']['line_geometry']['unrelated_contacts']],
        auditor_sha256=sha(Path(__file__)))
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['passed', 'panels', 'joint', 'unresolved_quality_panels']}))


if __name__ == '__main__':
    main()

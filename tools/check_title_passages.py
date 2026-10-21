"""Check actual SVG passages, concrete obstacles and canonical expression."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/title-passages/current'
sys.path.insert(0, str(ROOT / 'tools'))
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from audit_diagram_assignments import assignments

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def intersects(points, p):
    x, y, w, h = [p[k] for k in ['x', 'y', 'w', 'h']]
    for a, b in zip(points, points[1:]):
        if p.get('symbol'):
            radius = w / 2;cx = x + radius;cy = y + radius
            distance = abs(a[0] - cx) if a[0] == b[0] else abs(a[1] - cy)
            if distance >= radius - 1e-7:continue
            half = (radius * radius - distance * distance) ** .5
            hit = max(a[1], b[1]) > cy - half + 1e-7 and min(a[1], b[1]) < cy + half - 1e-7 if a[0] == b[0] else max(a[0], b[0]) > cx - half + 1e-7 and min(a[0], b[0]) < cx + half - 1e-7
        else:
            hit = x + 1e-7 < a[0] < x + w - 1e-7 and max(a[1], b[1]) > y + 1e-7 and min(a[1], b[1]) < y + h - 1e-7 if a[0] == b[0] else y + 1e-7 < a[1] < y + h - 1e-7 and max(a[0], b[0]) > x + 1e-7 and min(a[0], b[0]) < x + w - 1e-7
        if hit:return True
    return False


def passages(doc, svg):
    boxes = {n['id']: n for n in doc['layout']['nodes']}
    source = {n['id']: n for n in doc['architecture']['nodes']}
    attached = {r['node'] for r in doc['layout'].get('frame_ownership', [])}
    parents = {}
    for id, n in source.items():
        p = n.get('parent')
        while p in attached:p = source[p].get('parent')
        parents[id] = p
    def ancestors(id):
        result = set()
        while id is not None and id not in result:
            result.add(id);id = parents.get(id)
        return result
    paths = {e.get('data-edge-id'): [tuple(map(float, p)) for p in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', e.get('d'))] for e in svg.iter() if e.get('data-edge-id')}
    result, bodies = [], []
    for edge in doc['layout']['edges']:
        points = paths[edge['id']]
        assert points == [(p['x'], p['y']) for p in edge['route']['points']]
        assert all(a[0] == b[0] or a[1] == b[1] for a, b in zip(points, points[1:]))
        active = ancestors(edge['source']) | ancestors(edge['target'])
        for id, p in boxes.items():
            if p.get('expanded') and p.get('header') and intersects(points, {**p, 'h': p['header'] - 10}):
                result.append(dict(edge=edge['id'], frame=id))
            if id in active and p.get('expanded'):continue
            top = p.get('header', 0) - 10 if p.get('expanded') and p.get('header') else 0
            body = {**p, 'y': p['y'] + top, 'h': p['h'] - top}
            if intersects(points, body):bodies.append(dict(edge=edge['id'], node=id))
    return result, bodies


def main():
    small, large = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    assert small['implementation_sha256'] == large['implementation_sha256']
    for f, h in small['implementation_sha256'].items():assert sha(ROOT / f) == h, ('stale implementation', f)
    snapshot = small['baseline'];assert snapshot == large['baseline']
    for f, h in snapshot['files'].items():assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    historical = json.loads(subprocess.check_output(['git', 'show', snapshot['commit'] + ':verification/selected-routes/current/large-report.json'], cwd=ROOT))
    geometry.OUT = stages.OUT = OUT
    docs, rows, direct, raw, measured, crossings = {}, {}, {}, {}, {}, {}
    for report in [small, large]:
        for r in report['rows']:
            name = r['name'];assert name not in docs
            if name.startswith('Transformer-') and name.endswith('-before'):
                index = int(name.split('-')[2])
                capture = historical['joint']['panels'][index]['capture']
                prior = next(row for row in historical['rows'] if row['name'] == capture)
                assert prior['svg_sha256'] == r['svg_sha256'] and prior['document_sha256'] == r['document_sha256']
            assert sha(OUT / r['svg']) == r['svg_sha256'] and sha(OUT / r['document']) == r['document_sha256']
            assert sha(ROOT / r['input']) == r['input_sha256']
            doc = read(OUT / r['document']);svg = ET.parse(OUT / r['svg']).getroot()
            measured[name] = stages.check({**r, 'role_path_stages': doc['publication'].get('role_path_stages')}, compare_expression=False, require_quality=False, allow_label_notes=True)
            geometry.inspect(r)
            goals = doc['expression_goals']['goals']
            direct[name] = {g['id'] for g, ok in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': r['quality']}, svg)) if ok}
            raw[name] = {g['id'] for g, ok in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': r['quality']}, svg, require_quality=False)) if ok}
            assert raw[name] == {r['goal'] for r in doc['expression_coverage'] if r['status'] == 'fulfilled'}
            crossings[name], bodies = passages(doc, svg)
            assert not bodies, ('concrete node or unrelated body intrusion', name, bodies)
            if not name.endswith('-before'):assert doc['layout']['frame_title_routing'] == 'pass-through'
            docs[name], rows[name] = doc, r
    comparisons = []
    fields = ['id', 'source', 'target', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'bundle_members', 'canonical_source', 'canonical_target', 'resolved_source']
    descriptors = lambda doc: [{k: e.get(k) for k in fields} for e in doc['layout']['edges']]
    for report in [small, large]:
        for c in report['comparisons']:
            a, b = [docs[c[k]] for k in ['before', 'after']]
            assert a['ir'] == b['ir']
            assert a['architecture'] == b['architecture'] and a['expression_goals'] == b['expression_goals']
            changed = {n['id'] for n in a['layout']['nodes']} != {n['id'] for n in b['layout']['nodes']}
            if changed:
                # Route costs can change the adaptive frontier. Audit each
                # accounting partition above and compare canonical uses after
                # unpacking presentation bundles, rather than fixing the cut.
                assert a['state']['paperAdaptive'] and a['state'] == b['state']
                for key in ['focus', 'requested_focus', 'relation', 'representative', 'granularity']:
                    assert a['publication'][key] == b['publication'][key]
                leaves = lambda d: {e['id']: e for edge in d['layout']['edges'] for e in edge.get('bundle_members', [edge])}
                old, new = leaves(a), leaves(b)
                assert old.keys() <= new.keys(), ('prior visible canonical use lost', c['name'])
                canonical = ['id', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'canonical_source', 'canonical_target', 'resolved_source', 'semantic_bindings']
                for id, edge in old.items():
                    assert {k: edge.get(k) for k in canonical} == {k: new[id].get(k) for k in canonical}, ('canonical operands changed', c['name'], id)
            else:
                assert descriptors(a) == descriptors(b), ('canonical operands changed', c['name'])
                for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
                    assert a['layout'].get(key) == b['layout'].get(key)
            assert a['publication']['boundary'] == b['publication']['boundary']
            assert raw[c['before']] <= raw[c['after']], ('direct expression lost', c['name'])
            assert direct[c['before']] <= direct[c['after']], ('qualified direct expression lost', c['name'])
            comparisons.append(dict(name=c['name'], before=measured[c['before']], after=measured[c['after']],
                frontier_changed=changed, visible_nodes=[len(a['layout']['nodes']), len(b['layout']['nodes'])],
                visible_edges=[len(a['layout']['edges']), len(b['layout']['edges'])],
                title_passages=[len(crossings[c['before']]), len(crossings[c['after']])],
                raw_direct_goals=[len(raw[c['before']]), len(raw[c['after']])],
                qualified_direct_goals=[len(direct[c['before']]), len(direct[c['after']])],
                quality_before=rows[c['before']]['quality']['issues'], quality_after=rows[c['after']]['quality']['issues']))
    assert len(crossings['SameSource-current']) > len(crossings['SameSource-before'])
    assert measured['SameSource-current']['wire_length'] < measured['SameSource-before']['wire_length'] * .7
    j = large['joint']
    coverage = lambda ps: {g['id']: [p['id'] for p in ps if g['id'] in direct[p['capture']]] for g in j['plan']['goals']}
    before, after = coverage(j['initial']), coverage(j['panels'])
    for declared, actual in [(j['baseline_coverage'], before), (j['coverage'], after)]:
        assert all(r['panels'] == actual[r['goal']] and (r['status'] == 'fulfilled') == bool(actual[r['goal']]) for r in declared)
    prior = {r['goal'] for r in historical['joint']['coverage'] if r['status'] == 'fulfilled'}
    current = {id for id, panels in after.items() if panels}
    assert prior <= current, ('historical graph-set coverage lost', sorted(prior - current))
    result = dict(passed=True, goal_complete=False, panels=len(docs), comparisons=comparisons,
        joint=dict(before=len(prior), after=len(current), gained=sorted(current-prior), lost=sorted(prior-current)),
        title_passages={name: rows for name, rows in crossings.items() if not name.endswith('-before')},
        unresolved_quality_panels=[n for n, r in rows.items() if r['quality']['issues'] or r['quality']['line_geometry']['unrelated_contacts']], auditor_sha256=sha(Path(__file__)))
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['passed', 'panels', 'joint', 'unresolved_quality_panels']}))


if __name__ == '__main__':main()

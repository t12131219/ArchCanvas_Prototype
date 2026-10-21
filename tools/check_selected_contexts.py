"""Audit actual SVGs, canonical operands and selected context geometry."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/selected-contexts/current'
sys.path.insert(0, str(ROOT / 'tools'))
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from audit_diagram_assignments import assignments

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def contexts(doc):
    boxes = {n['id']: n for n in doc['layout']['nodes']}
    edges = {e['id']: e for e in doc['layout']['edges']}
    realized = set()
    for c in doc['layout'].get('context_lanes', []):
        p, e = boxes[c['owner']], edges[c['edge']]
        points = e['route']['points']
        low = p['x'] + p.get('design_gutter', 0) if c['side'] == 'left' else p['x'] + p['w'] - p.get('context_gutter', 0)
        high = low + p.get('context_gutter', 0) if c['side'] == 'left' else p['x'] + p['w']
        gutter = any(a['x'] == b['x'] and a['y'] != b['y'] and low < a['x'] < high for a, b in zip(points, points[1:]))
        direct = len(points) == 2 and points[0]['y'] == points[1]['y'] and any(
            d['node'] == e['source'] and any(u['edge'] == e['id'] for u in d['edges']) for d in doc['layout'].get('input_docks', []))
        used = c.get('selected') is not False and e['route']['ok'] and e['route']['target_side'] == c['side'] and (gutter or direct)
        assert (c['status'] == 'realized') == used, ('false context receipt', c['edge'])
        if used:
            target = boxes[e['target']]
            assert points[-1]['x'] == (target['x'] if c['side'] == 'left' else target['x'] + target['w'])
            assert all(m['kind'] in {'data', 'alias', 'interface-binding'} and not m.get('condition') for m in e.get('bundle_members', [e]))
            realized.add(c['edge'])
    for receipt in doc['diagnostics']['routing'].values():
        if isinstance(receipt, dict) and receipt.get('accepted') is True and 'realized_before' in receipt:
            for key, ids in receipt['realized_before'].items():
                assert set(ids) <= set(receipt['realized_candidate'][key]), ('accepted candidate lost relation', key)
    return realized


def main():
    small, large = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    assert small['implementation_sha256'] == large['implementation_sha256']
    for f, h in small['implementation_sha256'].items():assert sha(ROOT / f) == h, ('stale implementation', f)
    snapshot = small['baseline'];assert snapshot == large['baseline']
    for f, h in snapshot['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    historical = json.loads(subprocess.check_output(['git', 'show', snapshot['commit'] + ':verification/title-passages/current/large-report.json'], cwd=ROOT))
    geometry.OUT = stages.OUT = OUT
    docs, rows, direct, measured, realized = {}, {}, {}, {}, {}
    for report in [small, large]:
        for row in report['rows']:
            name = row['name'];assert name not in docs
            if name.startswith('Transformer-') and name.endswith('-before'):
                capture = historical['joint']['panels'][int(name.split('-')[2])]['capture']
                prior = next(r for r in historical['rows'] if r['name'] == capture)
                assert prior['svg_sha256'] == row['svg_sha256']
            doc = read(OUT / row['document']);svg = ET.parse(OUT / row['svg']).getroot()
            measured[name] = stages.check({**row, 'role_path_stages': doc['publication'].get('role_path_stages')}, compare_expression=False, require_quality=False, allow_label_notes=True)
            geometry.inspect(row)
            _, intrusions = passages(doc, svg)
            assert not intrusions, ('body intrusion', name, intrusions)
            assert doc['layout']['frame_title_routing'] == 'pass-through'
            goals = doc['expression_goals']['goals']
            direct[name] = {g['id'] for g, ok in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': row['quality']}, svg)) if ok}
            raw = {g['id'] for g, ok in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': row['quality']}, svg, require_quality=False)) if ok}
            assert raw == {g['goal'] for g in doc['expression_coverage'] if g['status'] == 'fulfilled'}
            realized[name] = contexts(doc)
            docs[name], rows[name] = doc, row
    comparisons = []
    canonical = ['id', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'canonical_source', 'canonical_target', 'resolved_source', 'semantic_bindings']
    full = [*canonical, 'source', 'target', 'bundle_members']
    for report in [small, large]:
        for c in report['comparisons']:
            a, b = [docs[c[k]] for k in ['before', 'after']]
            assert a['ir'] == b['ir'] and a['state'] == b['state']
            assert a['architecture'] == b['architecture'] and a['expression_goals'] == b['expression_goals']
            changed = {n['id'] for n in a['layout']['nodes']} != {n['id'] for n in b['layout']['nodes']}
            if changed:
                assert a['state']['paperAdaptive']
                leaves = lambda d: {e['id']: e for outer in d['layout']['edges'] for e in outer.get('bundle_members', [outer])}
                old, new = leaves(a), leaves(b)
                assert old.keys() <= new.keys()
                for id, e in old.items():assert {k: e.get(k) for k in canonical} == {k: new[id].get(k) for k in canonical}
            else:
                descriptors = lambda d: [{k: e.get(k) for k in full} for e in d['layout']['edges']]
                assert descriptors(a) == descriptors(b), ('canonical bindings changed', c['name'])
                for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
                    assert a['layout'].get(key) == b['layout'].get(key)
            assert a['publication']['boundary'] == b['publication']['boundary']
            assert direct[c['before']] <= direct[c['after']], ('direct expression lost', c['name'])
            comparisons.append(dict(name=c['name'], frontier_changed=changed, before=measured[c['before']], after=measured[c['after']],
                nodes=[len(a['layout']['nodes']), len(b['layout']['nodes'])], edges=[len(a['layout']['edges']), len(b['layout']['edges'])],
                contexts_before=sorted(realized[c['before']]), contexts_after=sorted(realized[c['after']]),
                direct_goals=[len(direct[c['before']]), len(direct[c['after']])]))
    # This actual selected detail caused the earlier rejection. Both physical
    # geometry and explicit input-dock relation retention must now improve.
    before, after = [rows['Transformer-panel-1-' + s]['quality'] for s in ['before', 'current']]
    assert after['line_geometry']['crossings'] < before['line_geometry']['crossings'] and after['wire_length'] < before['wire_length'] * .8
    assert after['native_width_px'] <= before['native_width_px'] and after['native_height_px'] <= before['native_height_px']
    assert realized['Transformer-panel-1-before'] <= realized['Transformer-panel-1-current']
    dock = docs['Transformer-panel-1-current']['diagnostics']['routing']['input_dock_refinement']
    assert dock['accepted'] and set(dock['realized_before']['contexts']) <= realized['Transformer-panel-1-current']
    joint = large['joint']
    coverage = lambda ps: {g['id']: [p['id'] for p in ps if g['id'] in direct[p['capture']]] for g in joint['plan']['goals']}
    for declared, actual in [(joint['baseline_coverage'], coverage(joint['initial'])), (joint['coverage'], coverage(joint['panels']))]:
        assert all(r['panels'] == actual[r['goal']] and (r['status'] == 'fulfilled') == bool(actual[r['goal']]) for r in declared)
    prior = {r['goal'] for r in historical['joint']['coverage'] if r['status'] == 'fulfilled'}
    current = {id for id, ps in coverage(joint['panels']).items() if ps}
    assert prior <= current
    result = dict(passed=True, goal_complete=False, panels=len(docs), comparisons=comparisons,
        joint=dict(before=len(prior), after=len(current), gained=sorted(current-prior), lost=sorted(prior-current)),
        unresolved_quality_panels=[n for n, r in rows.items() if r['quality']['issues'] or r['quality']['line_geometry']['unrelated_contacts']], auditor_sha256=sha(Path(__file__)))
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['passed', 'panels', 'joint', 'unresolved_quality_panels']}))


if __name__ == '__main__':main()

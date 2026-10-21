"""Audit fixed-input consumer placement from original source facts and actual SVGs."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/consumer-arguments/current'
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


def literals(doc):
    source = {n['id']: n for n in doc['ir']['nodes']}
    incoming = {e['target'] for e in doc['ir']['edges']}
    result = set()
    def guarded(n):
        return (not n or n.get('condition') or n.get('mutable') or n.get('identity_display') or n.get('observed_calls') or n.get('runtime_evidence') or n.get('evidence_status') == 'runtime-only' or n.get('kind') in {'opaque', 'control'} or n.get('semantic_type') in {'loop-template', 'iteration-region', 'conditional-region', 'observed-variant'})
    for id, n in source.items():
        proof = n.get('source_constant_input', {})
        if (n['kind'] != 'interface' or n.get('role') != 'input' or not n.get('parent') or id in incoming or guarded(n) or n.get('evidence_status') != 'static-only' or 'value' not in proof or not proof.get('scope') or not isinstance(n.get('label'), str) or len(n['label']) > 80):continue
        value = proof['value']
        if not (value is None or isinstance(value, bool) or isinstance(value, str) and len(value) <= 40 or isinstance(value, (int, float)) and math.isfinite(value)):continue
        seen = set();parent = n['parent'];safe = True
        while parent is not None:
            if parent in seen or guarded(source.get(parent)):
                safe = False;break
            seen.add(parent);parent = source[parent].get('parent')
        if safe:result.add(id)
    return result


def drawing_parents(doc):
    source = {n['id']: n for n in doc['architecture']['nodes']}
    attached = {n['node'] for n in doc['layout'].get('frame_ownership', [])}
    parents = {}
    for id, n in source.items():
        p = n.get('parent')
        while p in attached:p = source[p].get('parent')
        parents[id] = p
    return parents


def scope_geometry(doc):
    boxes = {n['id']: n for n in doc['layout']['nodes']};edges = {e['id']: e for e in doc['layout']['edges']}
    parents = drawing_parents(doc)
    for c in doc['layout'].get('cross_scope_ports', []):
        e = edges[c['edge']];a = boxes[e['source']];b = boxes[e['target']];p = boxes[c['owner']];r = e['route']
        assert parents[e['target']] == c['owner'] and p['expanded'] and r['ok']
        left = a['x'] + a['w'] <= p['x'];assert left or a['x'] >= p['x'] + p['w']
        assert r['source_side'] == c['source_side'] == ('right' if left else 'left')
        assert r['target_side'] == c['target_side'] == ('left' if left else 'right')
        assert r['points'][0]['x'] == a['x'] + (a['w'] if left else 0) and r['points'][-1]['x'] == b['x'] + (0 if left else b['w'])


def consumer_arguments(doc):
    rec = doc['diagnostics']['routing'].get('consumer_argument_refinement')
    selected = doc['layout'].get('consumer_arguments', [])
    if not rec:
        assert not selected;return
    assert len(rec['attempts']) <= rec['max_trials'] == 2
    last = [];previous = rec['before']
    for attempt in rec['attempts']:
        assert attempt['before'] == previous
        if not attempt['accepted']:continue
        a, b = attempt['before'], attempt['candidate']
        assert attempt['facts_preserved'] and (b['crossings'] < a['crossings'] or b['wire_length'] < a['wire_length'] * .98)
        assert b['crossings'] <= a['crossings'] and b['wire_length'] <= a['wire_length'] and b['contacts'] <= a['contacts'] and b['overlaps'] <= a['overlaps']
        assert b['width'] <= rec['before']['width'] and b['height'] <= rec['before']['height'] and set(b['issues']) <= set(a['issues']) and b['unplaced_labels'] <= a['unplaced_labels']
        for key, ids in attempt['realized_before'].items():assert set(ids) <= set(attempt['realized_candidate'][key])
        assert attempt['direct_goals_before'] <= attempt['direct_goals_candidate']
        previous = b;last = attempt['records']
    assert rec['selected'] == selected == last and rec['after'] == previous
    q = doc['diagnostics']['publication']
    assert q['line_geometry']['crossings'] == previous['crossings'] and q['wire_length'] == previous['wire_length']
    proved = literals(doc);boxes = {n['id']: n for n in doc['layout']['nodes']};parents = drawing_parents(doc)
    def ancestors(id):
        seen = set()
        while id is not None and id not in seen:seen.add(id);id = parents.get(id)
        return seen
    for c in selected:
        assert c['node'] in proved
        a = boxes[c['node']];b = boxes[c['target']];p = boxes[c['parent']]
        assert parents[c['node']] == parents[c['target']] == c['parent'] and p['expanded'] and not b['expanded']
        assert not a.get('cyclic') and not b.get('cyclic')
        assert c['after'] == {k: a[k] for k in ['x', 'y']} and a['y'] == b['y'] + (b['h'] - a['h']) / 2
        assert a['x'] == (b['x'] - a['w'] - 20 if c['side'] == 'left' else b['x'] + b['w'] + 20)
        lanes = [r for r in doc['layout'].get('context_lanes', []) if r['owner'] == c['parent'] and r.get('selected') is not False]
        left = p['x'] + 16 + p.get('design_gutter', 0) + (p.get('context_gutter', 0) if any(r['side'] == 'left' for r in lanes) else 0)
        right = p['x'] + p['w'] - 16 - (p.get('context_gutter', 0) if any(r['side'] == 'right' for r in lanes) else 0)
        assert a['x'] >= left and a['x'] + a['w'] <= right and a['y'] >= p['y'] + p.get('header', 0) + 8 and a['y'] + a['h'] <= p['y'] + p['h'] - 16
        uses = [e for e in doc['layout']['edges'] if e['source'] == c['node']]
        assert {e['target'] for e in uses} == {c['target']} and not any(e['target'] == c['node'] for e in doc['layout']['edges'])
        assert c['edges'] == [dict(edge=e['id'], source_port=e.get('source_port'), target_port=e.get('target_port'), kind=e['kind']) for e in uses]
        for e in uses:
            assert not any(e.get(k) for k in ['design_route', 'context_lane', 'layout_after', 'iteration', 'condition']) and not e['route'].get('feedback')
            assert all(m['kind'] in {'data', 'alias', 'interface-binding', 'control'} and not any(m.get(k) for k in ['design_route', 'context_lane', 'layout_after', 'iteration', 'condition']) for m in e.get('bundle_members', [e]))
        for id, other in boxes.items():
            if id in ancestors(c['node']):continue
            assert not (a['x'] < other['x'] + other['w'] + 12 and a['x'] + a['w'] + 12 > other['x'] and a['y'] < other['y'] + other['h'] + 12 and a['y'] + a['h'] + 12 > other['y']), ('fixed input body collision', id, c)


def main():
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    sys.path.insert(0, str(ROOT))
    from semantic_adapter.analyzer import analyze
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
        assert analyze(ROOT / extraction['source'], row['entry']) == read(ROOT / row['input'])
    small, large = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    assert small['implementation_sha256'] == large['implementation_sha256']
    for f, h in small['implementation_sha256'].items():assert sha(ROOT / f) == h, ('stale implementation', f)
    snapshot = small['baseline'];assert snapshot == large['baseline']
    for f, h in snapshot['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    historical = json.loads(subprocess.check_output(['git', 'show', snapshot['commit'] + ':verification/cross-scope-ports/current/large-report.json'], cwd=ROOT))
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
            consumer_arguments(doc)
            scope_geometry(doc)
            docs[name], rows[name] = doc, row
    comparisons = []
    canonical = ['id', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'canonical_source', 'canonical_target', 'resolved_source', 'semantic_bindings']
    full = [*canonical, 'source', 'target', 'bundle_members']
    for report in [small, large]:
        for c in report['comparisons']:
            a, b = [docs[c[k]] for k in ['before', 'after']]
            assert a['ir'] == b['ir'] and a['state'] == b['state']
            allowed = {r['node'] for r in b['layout'].get('consumer_arguments', [])}
            old_boxes = {n['id']: n for n in a['layout']['nodes']}
            for n in b['layout']['nodes']:
                assert old_boxes[n['id']] == {**n, **({k: old_boxes[n['id']][k] for k in ['x', 'y']} if n['id'] in allowed else {})}, ('unexpected node change', c['name'], n['id'])
            receipt = b['diagnostics']['routing'].get('consumer_argument_refinement')
            if receipt:
                assert receipt['before']['crossings'] == rows[c['before']]['quality']['line_geometry']['crossings']
                assert receipt['before']['wire_length'] == rows[c['before']]['quality']['wire_length']
                for r in receipt['selected']:
                    assert r['before'] == {k: old_boxes[r['node']][k] for k in ['x', 'y']}
            assert a['layout'].get('cross_scope_ports') == b['layout'].get('cross_scope_ports')
            assert realized[c['before']] <= realized[c['after']]
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
    for stem in ['Transformer-panel-0', 'MixedChoices']:
        before, after = [rows[stem + '-' + suffix]['quality'] for suffix in ['before', 'current']]
        assert after['line_geometry']['crossings'] <= before['line_geometry']['crossings']
        assert after['wire_length'] < before['wire_length'] * .98
        assert after['native_width_px'] == before['native_width_px'] and after['native_height_px'] == before['native_height_px']
    assert rows['Transformer-panel-0-current']['quality']['line_geometry']['crossings'] < 27
    for stem in ['LateChoice', 'DynamicChoice', 'GuardedChoice']:
        assert rows[stem+'-before']['svg_sha256'] == rows[stem+'-current']['svg_sha256']
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

"""Audit independent operand rows from original source facts and actual SVGs."""
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/operand-rows/current'
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


def operand_rows(doc):
    boxes = {n['id']: n for n in doc['layout']['nodes']}
    planned = {n['id']: n for n in doc['architecture']['nodes']}
    source = {n['id']: n for n in doc['ir']['nodes']}
    edges = {e['id']: e for e in doc['layout']['edges']}
    parents = drawing_parents(doc)
    selected = doc['layout'].get('operand_rows', [])
    rec = doc['diagnostics']['routing'].get('operand_row_refinement')
    if not rec:
        assert not selected
        return
    assert rec['max_arrangements'] == 2 and len(rec['attempts']) <= rec['max_trials'] == 4
    previous, last = rec['before'], []
    for trial in rec['attempts']:
        assert trial['before'] == previous and trial['route_mode'] in ['full', 'retained']
        if not trial['accepted']:continue
        a, b = trial['before'], trial['candidate']
        assert trial['facts_preserved'] and trial['distinct_terminals']
        assert trial['aligned_candidate'] == len(trial['records'])
        assert trial['aligned_candidate'] > trial['aligned_before'] or trial['ordered_candidate'] > trial['ordered_before'] or b['crossings'] < a['crossings'] or b['wire_length'] < a['wire_length'] * .98
        for k in ['crossings', 'wire_length', 'contacts', 'overlaps', 'unplaced_labels']:assert b[k] <= a[k]
        for k in ['width', 'height']:assert b[k] <= rec['before'][k]
        assert set(b['issues']) <= set(a['issues'])
        for k, ids in trial['realized_before'].items():assert set(ids) <= set(trial['realized_candidate'][k])
        assert trial['direct_goals_before'] <= trial['direct_goals_candidate']
        previous, last = b, trial['records']
    assert rec['after'] == previous and rec['selected'] == selected == last
    q = doc['diagnostics']['publication']
    assert (q['line_geometry']['crossings'], q['wire_length']) == (previous['crossings'], previous['wire_length'])
    def ancestors(id):
        seen = set()
        while id is not None and id not in seen:seen.add(id);id = parents.get(id)
        return seen
    protected = {'conditional-region', 'conditional-collection', 'loop-template', 'iteration-region', 'serial-repeat', 'repeat-instance', 'serial-remainder', 'observed-variant'}
    def guarded(n):
        return n.get('kind') in {'opaque', 'control'} or any(n.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls', 'runtime_evidence', 'repeat_contract', 'iteration']) or n.get('evidence_status') == 'runtime-only' or n.get('semantic_type') in protected
    for row in selected:
        ids = {n['node'] for n in row['nodes']};p = boxes[row['parent']];sink = boxes[row['sink']]
        assert p['expanded'] and not sink['expanded'] and not sink.get('cyclic') and parents[row['sink']] == row['parent']
        assert 2 <= len(ids) <= 6 and len({n['target_port'] for n in row['nodes']}) == len(ids)
        assert len({boxes[id]['y'] for id in ids}) == 1
        assert boxes[next(iter(ids))]['y'] == max(n['before']['y'] for n in row['nodes'])
        for n in row['nodes']:
            id = n['node'];at = boxes[id];node = planned[id];e = edges[n['edge']]
            assert not at['expanded'] and not at.get('cyclic') and not guarded(node)
            for ancestor in ancestors(id) - {id}:
                scope = planned[ancestor]
                assert not any(scope.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls', 'runtime_evidence', 'iteration'])
                assert scope.get('evidence_status') != 'runtime-only' and scope.get('kind') not in {'opaque', 'control'}
                assert scope.get('semantic_type') not in {'conditional-region', 'conditional-collection', 'loop-template', 'iteration-region', 'observed-variant'}
            assert parents[id] == row['parent'] and n['after'] == {k: at[k] for k in ['x', 'y']}
            assert e['source'] == id and e['target'] == row['sink'] and e['target_port'] == n['target_port']
            assert [v['id'] for v in edges.values() if v['source'] == id] == [e['id']] and not e.get('bundle_members')
            for use in edges.values():
                if id not in [use['source'], use['target']]:continue
                assert use['kind'] in {'data', 'alias', 'interface-binding', 'parameter-read'}
                assert not any(use.get(k) for k in ['condition', 'iteration', 'design_route', 'layout_after']) and not use['route'].get('feedback')
            inside = {id}
            while True:
                added = {k for k, v in planned.items() if v.get('parent') in inside} - inside
                if not added:break
                inside |= added
            assert not any(guarded(planned[k]) for k in inside)
            canonical = inside & source.keys()
            for use in doc['ir']['edges']:
                if use['source'] in canonical or use['target'] in canonical:
                    assert use['kind'] in {'data', 'alias', 'interface-binding', 'parameter-read', 'buffer-read', 'state-read'} and not any(use.get(k) for k in ['condition', 'iteration', 'design_route', 'layout_after'])
            lanes = [r for r in doc['layout'].get('context_lanes', []) if r['owner'] == row['parent'] and r.get('selected') is not False]
            left = p['x'] + 16 + p.get('design_gutter', 0) + (p.get('context_gutter', 0) if any(r['side'] == 'left' for r in lanes) else 0)
            right = p['x'] + p['w'] - 16 - (p.get('context_gutter', 0) if any(r['side'] == 'right' for r in lanes) else 0)
            assert at['x'] >= left and at['x'] + at['w'] <= right and at['y'] >= p['y'] + p.get('header', 0) + 8 and at['y'] + at['h'] + 20 <= sink['y']
            for other, box in boxes.items():
                if other in ancestors(id):continue
                assert not (at['x'] < box['x'] + box['w'] + 12 and at['x'] + at['w'] + 12 > box['x'] and at['y'] < box['y'] + box['h'] + 12 and at['y'] + at['h'] + 12 > box['y']), ('operand row collision', id, other)
    terminals = set()
    for e in edges.values():
        for node, role, point, side in [(e['source'], 'source', e['route']['points'][0], e['route']['source_side']), (e['target'], 'target', e['route']['points'][-1], e['route']['target_side'])]:
            key = (node, role, point['x'], point['y'])
            assert key not in terminals, ('coincident independent terminal', e['id'], key)
            terminals.add(key)
            p = boxes[node]
            if p['expanded']:continue
            if p.get('symbol'):
                assert abs((point['x'] - p['x'] - p['w']/2)**2 + (point['y'] - p['y'] - p['w']/2)**2 - (p['w']/2)**2) < 1e-5
            else:
                assert p['x']-1e-6 <= point['x'] <= p['x']+p['w']+1e-6 and p['y']-1e-6 <= point['y'] <= p['y']+p['h']+1e-6
                axis, boundary = ('x', p['x'] if side == 'left' else p['x']+p['w']) if side in ['left', 'right'] else ('y', p['y'] if side == 'top' else p['y']+p['h'])
                assert abs(point[axis] - boundary) < 1e-6


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
    historical = json.loads(subprocess.check_output(['git', 'show', snapshot['commit'] + ':verification/consumer-arguments/current/large-report.json'], cwd=ROOT))
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
            operand_rows(doc)
            scope_geometry(doc)
            docs[name], rows[name] = doc, row
    comparisons = []
    canonical = ['id', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'canonical_source', 'canonical_target', 'resolved_source', 'semantic_bindings']
    full = [*canonical, 'source', 'target', 'bundle_members']
    for report in [small, large]:
        for c in report['comparisons']:
            a, b = [docs[c[k]] for k in ['before', 'after']]
            assert a['ir'] == b['ir'] and a['state'] == b['state']
            allowed = {n['node'] for r in b['layout'].get('operand_rows', []) for n in r['nodes']}
            old_boxes = {n['id']: n for n in a['layout']['nodes']}
            for n in b['layout']['nodes']:
                assert old_boxes[n['id']] == {**n, **({k: old_boxes[n['id']][k] for k in ['x', 'y']} if n['id'] in allowed else {})}, ('unexpected node change', c['name'], n['id'])
            receipt = b['diagnostics']['routing'].get('operand_row_refinement')
            if receipt:
                assert receipt['before']['crossings'] == rows[c['before']]['quality']['line_geometry']['crossings']
                assert receipt['before']['wire_length'] == rows[c['before']]['quality']['wire_length']
                for r in receipt['selected']:
                    for n in r['nodes']:assert n['before'] == {k: old_boxes[n['node']][k] for k in ['x', 'y']}
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
    for stem in ['Transformer-panel-0', 'StaggeredOperands']:
        a, b = [docs[stem + '-' + suffix] for suffix in ['before', 'current']]
        assert b['layout'].get('operand_rows'), ('required local improvement missing', stem)
        assert rows[stem+'-current']['quality']['line_geometry']['crossings'] <= rows[stem+'-before']['quality']['line_geometry']['crossings']
        assert rows[stem+'-current']['quality']['wire_length'] <= rows[stem+'-before']['quality']['wire_length']
    assert rows['ConditionalOperands-before']['svg_sha256'] == rows['ConditionalOperands-current']['svg_sha256']
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

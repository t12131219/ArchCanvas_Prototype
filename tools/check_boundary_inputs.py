"""Recompute actual SVG geometry and exact operands independently of the planner."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/boundary-inputs/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
from semantic_adapter.analyzer import analyze
from audit_diagram_assignments import assignments
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def identity(d):
    fields = ['id', 'source', 'target', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'bundle_members']
    return dict(ir=d['ir'], nodes=[n['id'] for n in d['layout']['nodes']],
                edges=[{k: e.get(k) for k in fields} for e in d['layout']['edges']],
                open=d['publication']['open'], boundary=d['publication']['boundary'],
                roles=d['publication'].get('role_frontier'),
                nodes_accounted=d['layout']['node_accounting'], edges_accounted=d['layout']['edge_accounting'])


def main():
    reports = [read(OUT / (size + '-report.json')) for size in ['small', 'large']]
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for f, h in reports[0]['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    snapshot = read(OUT / 'snapshot.json')
    for f, h in {**snapshot['files'], **snapshot['artifacts']}.items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
        assert analyze(ROOT / extraction['source'], row['name']) == read(ROOT / row['input'])
    stages.OUT = geometry.OUT = OUT
    rows, docs, trees, metrics = {}, {}, {}, {}
    for report in reports:
        assert report['baseline'] == dict(commit=snapshot['commit'], files=snapshot['files'])
        for row in report['rows']:
            name = row['name']
            assert sha(ROOT / row['input']) == row['input_sha256']
            document = read(OUT / row['document'])
            # This producer stores stage receipts in the measured document.
            # The shared auditor then independently checks their membership,
            # source cuts, certificate roles, operands and physical exposure.
            stage_row = {**row, 'role_path_stages': document['publication'].get('role_path_stages')}
            metrics[name] = stages.check(stage_row, compare_expression=False, require_quality=False, allow_label_notes=True)
            geometry.inspect(row)
            docs[name], trees[name], rows[name] = read(OUT / row['document']), ET.parse(OUT / row['svg']).getroot(), row
            assert docs[name]['ir'] == read(ROOT / row['input'])
    comparisons, dock_count, conditional_count = [], 0, 0
    for report in reports:
        for c in report['comparisons']:
            b, a = docs[c['before']], docs[c['after']]
            assert identity(b) == identity(a), c['name']
            receipt = c['receipt']
            if receipt and receipt['accepted']:
                assert receipt['facts_preserved']
                q, p = rows[c['after']]['quality'], rows[c['before']]['quality']
                # Selection is compared to its precise intermediate baseline;
                # final presentation may additionally repair routes.
                base, candidate = receipt['before'], receipt['candidate']
                assert candidate['wire_length'] <= base['wire_length'] * .9
                assert candidate['width'] <= base['width'] * 1.12
                assert candidate['height'] <= base['height']
                assert candidate['area'] <= base['area'] * 1.12
                for k in ['crossings', 'contacts', 'overlaps', 'unplaced_labels']:
                    assert candidate[k] <= base[k]
                assert set(candidate['issues']) <= set(base['issues'])
                assert q['line_geometry']['crossings'] <= p['line_geometry']['crossings']
            boxes = {n['id']: n for n in a['layout']['nodes']}
            actual = {e['id']: e for e in a['layout']['edges']}
            for dock in a['layout'].get('input_docks', []):
                dock_count += 1
                assert dock['geometry_verified'] and dock['routes_verified']
                at, parent = boxes[dock['node']], boxes[dock['parent']]
                assert at['x'] >= parent['x'] and at['x'] + at['w'] <= parent['x'] + parent['w']
                assert at['y'] >= parent['y'] + parent['header'] and at['y'] + at['h'] <= parent['y'] + parent['h']
                assert len([n for n in a['layout']['nodes'] if n['id'] == dock['node']]) == 1
                uses = [e for e in actual.values() if e['source'] == dock['node']]
                assert dock['edges'] == [dict(edge=e['id'], target=e['target'], source_port=e['source_port'], target_port=e['target_port']) for e in uses]
                conditions = [dict(edge=m['id'], condition=m['condition']) for e in uses for m in e.get('bundle_members', [e]) if m.get('condition')]
                assert dock.get('conditional_uses', []) == conditions
                conditional_count += len(conditions)
                for region in dock['regions']:
                    target = boxes[region]
                    assert at['x'] + at['w'] <= target['x'] if dock['side'] == 'left' else at['x'] >= target['x'] + target['w']
                assert all(e['route']['ok'] for e in uses)
            comparisons.append(dict(name=c['name'], before=metrics[c['before']], after=metrics[c['after']],
                                    accepted=bool(receipt and receipt['accepted'])))
    joint = reports[1]['joint']
    goals, ir = joint['plan']['goals'], docs[joint['initial_panels'][0]['capture']]['ir']

    def coverage(panels):
        output = {}
        for panel in panels:
            name = panel['capture']
            checks = assignments(ir, goals, {**docs[name], 'quality': rows[name]['quality']}, trees[name])
            for goal, valid in zip(goals, checks):
                if valid:
                    output.setdefault(goal['id'], []).append(panel['id'])
        return output

    panels = joint['initial_panels']
    initial = coverage(panels)
    assert set(initial) == {r['goal'] for r in joint['baseline_coverage'] if r['status'] == 'fulfilled'}
    for attempt in joint['attempts']:
        assert attempt['form'] == 'inline' and attempt['target_panel'] != 'main'
        matches = [r['name'] for r in reports[1]['rows'] if r['name'].startswith('Transformer-refinement-') and docs[r['name']]['state'] == attempt['state']]
        assert len(matches) == 1
        previous = next(p for p in panels if p['id'] == attempt['target_panel'])
        b, a = docs[previous['capture']], docs[matches[0]]
        assert a['publication']['focus'] == b['publication']['focus']
        assert a['publication']['boundary'] == b['publication']['boundary']
        next_panels = [dict(id=p['id'], capture=matches[0]) if p['id'] == attempt['target_panel'] else p for p in panels]
        before, after = coverage(panels), coverage(next_panels)
        assert set(attempt['gained_goals']) == after.keys() - before.keys()
        assert set(attempt['lost_goals']) == before.keys() - after.keys()
        if attempt['accepted']:
            assert not attempt['reasons'] and after.keys() > before.keys()
            assessment = attempt['inline_assessment'] if 'inline_assessment' in attempt else attempt.get('assessment')
            if assessment:
                assert rows[matches[0]]['quality']['line_geometry']['crossings'] <= rows[previous['capture']]['quality']['line_geometry']['crossings'] + assessment['crossing_allowance']
            panels = next_panels
    assert [(p['id'], p['capture']) for p in panels] == [(p['id'], p['capture']) for p in joint['panels']]
    final = coverage(panels)
    for r in joint['coverage']:
        assert r['panels'] == final.get(r['goal'], [])
    assert initial.keys() < final.keys() and panels[0] == joint['initial_panels'][0]
    assert len(panels) == 3 and len(joint['attempts']) <= 1
    history_folder = ROOT / 'verification/cohort-folds/current'
    history = read(history_folder / 'large-render-report.json')
    frozen = next(c['previous'] for c in history['comparisons'] if c['name'] == 'Transformer')
    assert frozen['plan']['goals'] == goals
    historical = set()
    for panel in frozen['panels']:
        row = next(r for r in history['rows'] if r['name'] == panel['capture'])
        assert sha(history_folder / row['document']) == row['document_sha256']
        assert sha(history_folder / row['svg']) == row['svg_sha256']
        doc = read(history_folder / row['document'])
        assert doc['ir'] == ir
        checks = assignments(ir, goals, {**doc, 'quality': row['quality']}, ET.parse(history_folder / row['svg']).getroot())
        historical.update(g['id'] for g, valid in zip(goals, checks) if valid)
    dock_count = sum(len(d['layout'].get('input_docks', [])) for d in docs.values())
    conditional_count = sum(len(dock.get('conditional_uses', [])) for d in docs.values() for dock in d['layout'].get('input_docks', []))
    assert conditional_count >= 2
    result = dict(passed=True, goal_complete=False, auditor_sha256=sha(Path(__file__)), comparisons=comparisons,
                  auditor_dependencies={f: sha(ROOT / 'tools' / f) for f in ['check_role_path_stages.py', 'audit_adaptive_frontier.py', 'audit_diagram_assignments.py', 'audit_input_dock_receipts.py']},
                  panels=len(rows), docks=dock_count, conditional_uses=conditional_count,
                  unresolved_quality_panels=[name for name, row in rows.items() if row['quality']['issues']],
                  historical=dict(manifest_sha256=sha(history_folder / 'large-render-report.json'), direct=len(historical),
                                  missing=sorted(historical-final.keys()), added=sorted(final.keys()-historical)),
                  joint=dict(before=len(initial), after=len(final), gained=sorted(final.keys()-initial.keys()), lost=sorted(initial.keys()-final.keys())))
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(passed=True, panels=len(rows), docks=dock_count, before=len(initial), after=len(final))))


if __name__ == '__main__':
    main()

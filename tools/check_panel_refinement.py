"""Independently check replacement scopes, exact operands and native SVG geometry."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/panel-refinement/current'
sys.path[:0] = [str(ROOT / 'tools')]
import check_role_path_stages as stages
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    for f, digest in report['implementation_sha256'].items():
        assert sha(ROOT / f) == digest, ('stale implementation', f)
    stages.OUT = geometry.OUT = OUT
    docs, trees, metrics, rows = {}, {}, {}, {}
    for row in report['rows']:
        name = row['name']
        assert sha(ROOT / row['input']) == row['input_sha256']
        metrics[name] = stages.check(row, compare_expression=False, require_quality=False)
        geometry.inspect(row)
        docs[name] = read(OUT / row['document'])
        assert docs[name]['ir'] == read(ROOT / row['input'])
        trees[name] = ET.parse(OUT / row['svg']).getroot()
        rows[name] = row
    results = []
    for case in report['cases']:
        ir, goals = read(ROOT / case['input']), case['plan']['goals']

        def expressed(panels):
            found = {}
            for p in panels:
                name = p['capture']
                checks = assignments(ir, goals, {**docs[name], 'quality': rows[name]['quality']}, trees[name])
                for g, valid in zip(goals, checks):
                    if valid:
                        found.setdefault(g['id'], []).append(p['id'])
            return found

        panels = case['initial_panels']
        initial = expressed(panels)
        assert {r['goal'] for r in case['baseline_coverage'] if r['status'] == 'fulfilled'} == initial.keys()
        for t in case['attempts']:
            assert t['form'] == 'inline' and t['target_panel'] == 'local'
            matches = [r for r in report['rows'] if r['name'].startswith(case['name'] + '-trial-')
                       and all(docs[r['name']]['state'].get(k) == v for k, v in t['state'].items())]
            assert len(matches) == 1
            candidate = dict(id=t['target_panel'], capture=matches[0]['name'])
            previous = next(p for p in panels if p['id'] == t['target_panel'])
            b, a = docs[previous['capture']], docs[candidate['capture']]
            assert a['publication']['focus'] == b['publication']['focus'] == case['scope']
            assert a['publication']['boundary'] == b['publication']['boundary']
            next_panels = [candidate if p['id'] == t['target_panel'] else p for p in panels]
            before, after = expressed(panels), expressed(next_panels)
            assert set(t['gained_goals']) == after.keys() - before.keys()
            assert set(t['lost_goals']) == before.keys() - after.keys()
            if t['accepted']:
                assert t['eligible'] and not t['reasons'] and not t['lost_goals'] and t['gained_goals']
                assert not rows[candidate['capture']]['quality']['issues']
                panels = next_panels
        assert [(p['id'], p['capture']) for p in panels] == [(p['id'], p['capture']) for p in case['panels']]
        final = expressed(panels)
        assert initial.keys() < final.keys()
        for r in case['coverage']:
            assert r['panels'] == final.get(r['goal'], [])
            assert (r['status'] == 'fulfilled') == (r['goal'] in final)
        assert panels[0] == case['initial_panels'][0]
        assert len(panels) == 2 and case['rendered_trials'] <= 2
        results.append(dict(name=case['name'], before=len(initial), after=len(final),
                            native_metrics=metrics[panels[1]['capture']], passed=True))
    column_results = []
    for case in report.get('columns', []):
        b, a = docs[case['before']], docs[case['after']]
        assert b['ir'] == a['ir'] and b['publication']['focus'] == a['publication']['focus']
        assert b['publication']['boundary'] == a['publication']['boundary']
        assert {n['id'] for n in b['layout']['nodes']} == {n['id'] for n in a['layout']['nodes']}
        visible = {n['id'] for n in a['layout']['nodes']}
        assert set(case['unknowns']) <= visible
        groups = a['layout']['branch_columns']
        assert groups and all(g['status'] == 'realized' for g in groups)
        assert all(set(c['nodes']).isdisjoint(case['unknowns']) for g in groups for c in g['chains'])
        sets = []
        for name, coverage in [(case['before'], case['before_coverage']), (case['after'], case['after_coverage'])]:
            checks = assignments(a['ir'], case['plan']['goals'], {**docs[name], 'quality': rows[name]['quality']}, trees[name])
            actual = {g['id'] for g, valid in zip(case['plan']['goals'], checks) if valid}
            assert actual == {r['goal'] for r in coverage if r['status'] == 'fulfilled'}
            sets.append(actual)
        assert sets[0] <= sets[1]
        assert all(any(g['kind'] == 'unknown-boundary' and g['focus_node'] == id and g['id'] in sets[1]
                       for g in case['plan']['goals']) for id in case['unknowns'])
        column_results.append(dict(name=case['name'], columns=[len(g['chains']) for g in groups],
                                   unknown_boundaries=len(case['unknowns']), before=metrics[case['before']], after=metrics[case['after']], passed=True))
    (OUT / 'independent-report.json').write_text(json.dumps(dict(passed=True, goal_complete=False,
        auditor_sha256=sha(Path(__file__)), cases=results, columns=column_results), indent=2) + '\n')
    print(json.dumps(results))


if __name__ == '__main__':
    main()

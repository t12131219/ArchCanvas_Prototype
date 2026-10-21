"""Independently compare local expression receipts with canonical paths in SVG."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/exact-expression/current'
sys.path.insert(0, str(ROOT / 'tools'))
from audit_diagram_assignments import assignments
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    reports = [read(OUT / (size + '-report.json')) for size in ['small', 'large', 'recovery']]
    snapshot = read(OUT / 'snapshot.json')
    for file, digest in snapshot['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + file], cwd=ROOT)).hexdigest() == digest
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for report in reports:
        for file, digest in report['implementation_sha256'].items():
            assert sha(ROOT / file) == digest, ('stale producer', file)
    rows, docs, trees, truth, qualified, measurements = {}, {}, {}, {}, {}, {}
    stages.OUT = geometry.OUT = OUT
    before_names = {c['before'] for r in reports for c in r.get('comparisons', [])}
    for report in reports:
        assert report['baseline'] == snapshot
        for row in report['rows']:
            name = row['name']
            assert name not in rows
            assert sha(OUT / row['document']) == row['document_sha256'] and sha(OUT / row['svg']) == row['svg_sha256']
            doc, svg = read(OUT / row['document']), ET.parse(OUT / row['svg']).getroot()
            assert sha(ROOT / row['input']) == row['input_sha256'] and doc['ir'] == read(ROOT / row['input'])
            measurements[name] = stages.check({**row, 'role_path_stages': doc['publication'].get('role_path_stages')}, compare_expression=False, require_quality=False)
            geometry.inspect(row)
            rows[name], docs[name], trees[name] = row, doc, svg
            goals = doc['expression_goals']['goals']
            raw = {r['goal']: r['status'] == 'fulfilled' for r in doc['expression_coverage']}
            local = assignments(doc['ir'], goals, {**doc, 'quality': row['quality']}, svg, require_quality=False)
            truth[name] = {g['id'] for g, valid in zip(goals, local) if valid}
            qualified[name] = {g['id'] for g, valid in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': row['quality']}, svg)) if valid}
            if name not in before_names:
                assert all(raw[g['id']] == valid for g, valid in zip(goals, local)), ('local truth mismatch', name)
                edge_goals = [dict(id=e['id'], kind='binding', core=[], edges=[e['id']]) for e in doc['ir']['edges']]
                binding_truth = assignments(doc['ir'], edge_goals, {**doc, 'quality': row['quality']}, svg, require_quality=False)
                exact = {g['id'] for g, valid in zip(edge_goals, binding_truth) if valid}
                for receipt, goal in zip(doc['expression_coverage'], goals):
                    assert receipt['goal'] == goal['id'] and 'missing_exact_bindings' in receipt
                    required = set(goal['edges'])
                    if goal['kind'] == 'computation':
                        required.update(e['id'] for e in doc['ir']['edges'] if e['target'] == goal['focus_node'] and e['kind'] in ['data', 'alias', 'interface-binding'])
                    assert set(receipt['missing_exact_bindings']) == required - exact, ('binding receipt mismatch', name, goal['id'])
                for request in doc['publication'].get('role_frontier', {}).get('path_requests', []):
                    if 'operand_check' in request:
                        check = request['operand_check']
                        assert set(check['missing_exact_bindings']) == set(check['edges']) - exact
    comparisons, corrected = [], []
    for report in reports:
        for c in report.get('comparisons', []):
            b, a = docs[c['before']], docs[c['after']]
            assert b['ir'] == a['ir'] and b['state'] == a['state']
            historical = c.get('historical')
            if historical:
                frozen = json.loads(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + historical['report']], cwd=ROOT))
                row = next(r for r in frozen['rows'] if r['name'] == historical['capture'])
                assert row['document_sha256'] == rows[c['before']]['document_sha256']
                assert row['svg_sha256'] == rows[c['before']]['svg_sha256']
            old_raw = {g['goal'] for g in b['expression_coverage'] if g['status'] == 'fulfilled'}
            wrong = sorted(old_raw - truth[c['before']])
            corrected.extend(dict(panel=c['name'], goal=goal) for goal in wrong if goal not in {r['goal'] for r in a['expression_coverage'] if r['status'] == 'fulfilled'})
            assert qualified[c['before']] <= qualified[c['after']], ('direct expression lost', c['name'])
            same_geometry = b['layout']['nodes'] == a['layout']['nodes'] and b['layout']['edges'] == a['layout']['edges']
            comparisons.append(dict(name=c['name'], corrected_claims=len(wrong), before_direct=len(qualified[c['before']]), after_direct=len(qualified[c['after']]), same_geometry=same_geometry))
    j = reports[1]['joint']
    def coverage(panels):
        result = {g['id']: [] for g in j['plan']['goals']}
        for p in panels:
            for goal in result:
                if goal in qualified[p['capture']]:
                    result[goal].append(p['id'])
        return result
    old, new = coverage(j['initial']), coverage(j['panels'])
    for declared, actual in [(j['baseline_coverage'], old), (j['coverage'], new)]:
        for r in declared:
            assert r['panels'] == actual[r['goal']] and (r['status'] == 'fulfilled') == bool(actual[r['goal']])
    previous, current = {g for g, ids in old.items() if ids}, {g for g, ids in new.items() if ids}
    assert previous <= current and len(j['panels']) <= j['limits']['max_panels'] == 3
    assert len(j['attempts']) <= j['limits']['max_trials'] == 2
    recoveries = []
    for r in reports[2]['recoveries']:
        source, detail = docs[r['source']], docs[r['capture']]
        assert source['ir'] == detail['ir']
        requested = set(r['request']['goals'])
        assert requested and not requested & truth[r['source']]
        definitions = {g['id']: g for g in source['expression_goals']['goals']}
        assert requested <= definitions.keys()
        for goal in requested:
            g = definitions[goal]
            assert detail['state']['paperRelation'] == (g.get('relation') or 'node:' + g['focus_node'])
        expressed = requested & qualified[r['capture']]
        assert expressed == set(r['expressed_goals'])
        recoveries.append(dict(name=r['name'], requested=len(requested), expressed=len(expressed),
                               qualified=r['qualified'], previously_suppressed=True))
    historical = read(ROOT / 'verification/cohort-folds/current/large-render-report.json')['comparisons'][0]['previous']['coverage']
    historical = {r['goal'] for r in historical if r['status'] == 'fulfilled'}
    result = dict(passed=True, goal_complete=False, panels=len(rows), corrected_claims=corrected, comparisons=comparisons, recoveries=recoveries,
                  joint=dict(before=len(previous), after=len(current), gained=sorted(current-previous), lost=sorted(previous-current)),
                  historical=dict(direct=len(historical), missing=sorted(historical-current), added=sorted(current-historical)),
                  unresolved_quality_panels=[name for name, row in rows.items() if row['quality']['issues'] or row['quality']['line_geometry']['unrelated_contacts']],
                  auditor_sha256=sha(Path(__file__)), auditor_dependencies={f: sha(ROOT / 'tools' / f) for f in ['audit_diagram_assignments.py', 'audit_adaptive_frontier.py', 'check_role_path_stages.py']})
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['passed', 'panels', 'joint', 'unresolved_quality_panels']}))


if __name__ == '__main__':
    main()

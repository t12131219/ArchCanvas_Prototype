"""Recompute compact transactions from canonical facts and actual SVG paths."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/compact-main/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
from semantic_adapter.analyzer import analyze
from audit_diagram_assignments import assignments
import check_role_path_stages as stages
import audit_summary_coverage as summaries

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    reports = [read(OUT / (size + '-render-report.json')) for size in ['small', 'large']]
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for f, h in reports[0]['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    assert reports[0]['baseline'] == reports[1]['baseline']
    for f, h in reports[0]['baseline']['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', 'f6d98e9:' + f], cwd=ROOT)).hexdigest() == h
    extraction = read(OUT / 'extraction.json')
    assert sha(ROOT / extraction['source']) == extraction['source_sha256'] and not extraction['runtime_executed']
    for row in extraction['rows']:
        assert analyze(ROOT / extraction['source'], row['name']) == read(ROOT / row['input'])
    rows = reports[0]['rows'] + reports[1]['rows']
    ui = read(OUT / 'ui-report.json')
    for f, h in ui['files_sha256'].items():
        assert sha(OUT / f) == h
    rows += ui['rows']
    stages.OUT = OUT
    summaries.physical.OUT = OUT
    docs, trees, metrics, coarse, roles, discrepancies = {}, {}, {}, {}, {}, []
    for row in rows:
        name = row['name']
        # The historical raw expression evaluator only checks visible edge
        # identities. Diagram-set coverage additionally checks exact operands.
        # Verify the stronger contract below; retain every disagreement.
        metrics[name] = stages.check(row, compare_expression=False, require_quality=False)
        doc = docs[name] = read(OUT / row['document'])
        trees[name] = ET.parse(OUT / row['svg']).getroot()
        checks = assignments(doc['ir'], doc['expression_goals']['goals'], {**doc, 'quality': row['quality']}, trees[name])
        raw = {r['goal']: r['status'] == 'fulfilled' for r in doc['expression_coverage']}
        for g, valid in zip(doc['expression_goals']['goals'], checks):
            if not row['quality']['issues'] and valid != raw[g['id']]:
                discrepancies.append(dict(panel=name, goal=g['id'], exact_direct=valid, raw_expression=raw[g['id']]))
        coarse[name] = {r['goal'] for r in summaries.inspect(row) if r['form'] != 'deferred'}
        ns = {n['id']: n for n in doc['ir']['nodes']}
        visible = {n['id'] for n in doc['layout']['nodes']}
        certs = {c['id']: c for c in doc['ir'].get('semantic_contracts', [])}
        exposed = set()
        for r in doc['publication'].get('role_frontier', {}).get('roles', []):
            if r['status'] != 'exposed':
                continue
            assert r['node'] in visible
            c = certs[r['certificate']]
            assert c['node'] == r['owner']
            value = c['roles']
            for k in r['role_keys']:
                value = value[int(k)] if isinstance(value, list) else value[k]
            assert value == r['node']
            exposed.add(json.dumps([r['certificate'], r['role_keys'], r['node']]))
        roles[name] = exposed
    comparisons = []
    for c in reports[0]['comparisons'] + reports[1]['comparisons']:
        baseline, current, old = c['baseline'], c['current'], c['previous']
        assert current['plan']['goals'] == old['plan']['goals']
        goals = current['plan']['goals']
        ir = docs[baseline]['ir']

        @lru_cache(None)
        def direct(name):
            d = docs[name]
            checks = assignments(ir, goals, {**d, 'quality': d['diagnostics']['publication']}, trees[name])
            return {g['id'] for g, valid in zip(goals, checks) if valid}

        def union(names, values):
            return set().union(*(values(n) for n in names))

        initial = direct(baseline)
        for version in [old, current]:
            names = [p['capture'] for p in version['panels']]
            assert all(not docs[n]['diagnostics']['publication']['issues'] for n in names)
            actual = union(names, direct)
            reported = {r['goal'] for r in version['coverage'] if r['status'] == 'fulfilled'}
            assert actual == reported and initial <= actual
            for row in version['coverage']:
                assert row['panels'] == [p['id'] for p in version['panels'] if row['goal'] in direct(p['capture'])]
            assert len(names) <= 3 and version['rendered_trials'] <= 4
        for t in current['attempts']:
            if t['form'] != 'summary-set':
                continue
            candidates = [r['name'] for r in rows if r['name'].startswith(c['name'] + '-current-trial-')]
            matching = lambda name, state: all(docs[name]['state'].get(k) == v for k, v in state.items())
            main_name = next(n for n in candidates if matching(n, t['state']))
            names = [main_name]
            if t['detail_state']:
                detail_name = next(n for n in candidates if matching(n, t['detail_state']))
                assert docs[detail_name]['publication']['focus'] == t['anchor']
                names.append(detail_name)
            assert set(t['main_lost_goals']) == initial - direct(main_name)
            actual = union(names, direct)
            assert set(t['lost_goals']) == initial - actual and set(t['gained_goals']) == actual - initial
            assert set(t['recovery']['roles']) == roles[baseline] - union(names, lambda n: roles[n])
            assert set(t['recovery']['summaries']) == coarse[baseline] - union(names, lambda n: coarse[n])
            b, a = metrics[baseline], metrics[main_name]
            total_area = sum(metrics[n]['width'] * metrics[n]['height'] for n in names)
            total_wire = sum(metrics[n]['wire_length'] for n in names)
            assert total_area == t['total_area'] and abs(total_wire - t['total_wire_length']) <= .15
            factor = a['width'] * a['height'] / (b['width'] * b['height']) * max(1, t['metrics']['wire_length'] / t['before']['wire_length']) * max(1, (a['crossings'] + 4) / (b['crossings'] + 4))
            assert abs(factor - t['main_cost']) < 1e-9
            if t['accepted']:
                assert not t['lost_goals'] and not any(t['recovery'].values()) and t['main_cost'] < 1
                assert a['nodes'] < b['nodes'] and a['width'] * a['height'] < b['width'] * b['height']
                assert t['gained_goals'] or total_area < b['width'] * b['height'] and total_wire < b['wire_length']
        names = [p['capture'] for p in current['panels']]
        assert roles[baseline] <= union(names, lambda n: roles[n]) and coarse[baseline] <= union(names, lambda n: coarse[n])
        comparisons.append(dict(name=c['name'], before=metrics[baseline], current=metrics[names[0]],
                                old_direct=len(union([p['capture'] for p in old['panels']], direct)), current_direct=len(union(names, direct)),
                                total_area=sum(metrics[n]['width'] * metrics[n]['height'] for n in names),
                                panels=len(names), main_changed=not current['main_unchanged']))
    result = dict(schema='compact-main-independent/1', passed=True, goal_complete=False, auditor_sha256=sha(Path(__file__)),
                  panels=len(rows), fixtures_reextracted=len(extraction['rows']), metrics=metrics, comparisons=comparisons,
                  legacy_expression_discrepancies=discrepancies,
                  scope='Independent canonical stage proof, roles, helper summaries, exact operands, actual SVG geometry and frozen direct goals. Atomic coverage is never granted to a summary.')
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(panels=len(rows), comparisons=comparisons, passed=True)))


if __name__ == '__main__':
    main()

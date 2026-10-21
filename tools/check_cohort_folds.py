"""Recompute compact transactions from canonical facts and actual SVG paths."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cohort-folds/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
from semantic_adapter.analyzer import analyze
from audit_diagram_assignments import assignments
import check_role_path_stages as stages
import audit_summary_coverage as summaries
import audit_adaptive_frontier as geometry

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    reports = [read(OUT / (size + '-render-report.json')) for size in ['small', 'large']]
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for f, h in reports[0]['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    assert reports[0]['baseline'] == reports[1]['baseline']
    for f, h in reports[0]['baseline']['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', '0570bb0:' + f], cwd=ROOT)).hexdigest() == h
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed']
    for source, digest in extraction['sources'].items():
        assert sha(ROOT / source) == digest
    for row in extraction['rows']:
        assert analyze(ROOT / row['source'], row['name']) == read(ROOT / row['input'])
    rows = reports[0]['rows'] + reports[1]['rows']
    ui = read(OUT / 'ui-report.json')
    for f, h in ui['files_sha256'].items():
        assert sha(OUT / f) == h
    rows += ui['rows']
    stages.OUT = OUT
    geometry.OUT = OUT
    summaries.physical.OUT = OUT
    docs, trees, metrics, coarse, roles, discrepancies = {}, {}, {}, {}, {}, []
    geometry_issue_panels = []
    for row in rows:
        name = row['name']
        # The historical raw expression evaluator only checks visible edge
        # identities. Diagram-set coverage additionally checks exact operands.
        # Verify the stronger contract below; retain every disagreement.
        metrics[name] = stages.check(row, compare_expression=False, require_quality=False)
        geometry.inspect(row)  # Recompute contacts and overlaps even for rejected trials.
        if row['quality']['issues']:
            geometry_issue_panels.append(name)
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
    replacements_checked = 0
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
        assert initial == direct(old.get('baseline', baseline)), 'Default geometry changed exact evidence coverage.'
        for version in [old, current]:
            names = [p['capture'] for p in version['panels']]
            assert all(not docs[n]['diagnostics']['publication']['issues'] for n in names)
            actual = union(names, direct)
            reported = {r['goal'] for r in version['coverage'] if r['status'] == 'fulfilled'}
            assert actual == reported and initial <= actual
            for row in version['coverage']:
                assert row['panels'] == [p['id'] for p in version['panels'] if row['goal'] in direct(p['capture'])]
            assert len(names) <= 3 and version['rendered_trials'] <= 6
        selection = [dict(id='main', capture=baseline)]
        candidates = [r['name'] for r in rows if r['name'].startswith(c['name'] + '-current-trial-')]
        matching = lambda name, state: all(docs[name]['state'].get(k) == v for k, v in state.items())
        for t in current['attempts']:
            if t['form'] != 'summary-set':
                continue
            main_name = next(n for n in candidates if matching(n, t['state']))
            names = [main_name]
            raw = {n['id']: n for n in ir['nodes']}
            selected = set(t['owners'])
            recovered = set()
            for recovery in t['recoveries']:
                detail_name = next(n for n in candidates if matching(n, recovery['state']))
                scope = recovery['scope']
                assert docs[detail_name]['publication']['focus'] == scope
                assert recovered.isdisjoint(recovery['owners'])
                recovered.update(recovery['owners'])
                if len(recovery['owners']) > 1:
                    n = raw[scope]
                    assert n['semantic_type'] in {'source-function', 'source-module'}
                    assert not any(c['node'] == scope for c in ir.get('semantic_contracts', []))
                    assert all(raw[o]['parent'] == scope for o in recovery['owners'])
                    assert not any(n.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls', 'runtime_evidence', 'repeat_contract', 'iteration'])
                    assert n.get('evidence_status') != 'runtime-only'
                else:
                    assert recovery['owners'] == [scope]
                names.append(detail_name)
            if t['recoveries']:
                assert recovered == selected
            assert set(t['main_lost_goals']) == initial - direct(main_name)
            actual = union(names, direct)
            assert set(t['lost_goals']) == initial - actual and set(t['gained_goals']) == actual - initial
            qualified = [n for n in names if not docs[n]['diagnostics']['publication']['issues']
                         and not docs[n]['diagnostics']['publication']['line_geometry']['unrelated_contacts']]
            assert set(t['recovery']['roles']) == roles[baseline] - union(qualified, lambda n: roles[n])
            assert set(t['recovery']['summaries']) == coarse[baseline] - union(qualified, lambda n: coarse[n])
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
                selection = [dict(id='main', capture=main_name)] + [
                    dict(id='recovery:' + r['scope'], capture=n) for r, n in zip(t['recoveries'], names[1:])]
        rounds = {}
        for t in current['attempts']:
            if t['form'] != 'summary-set':
                rounds.setdefault(t['comparison_round'], []).append(t)
        for group in rounds.values():
            before_direct = union([p['capture'] for p in selection], direct)
            accepted = []
            for t in group:
                assert t['before_panels'] == [p['id'] for p in selection]
                name = next(n for n in candidates if matching(n, t['state']))
                target = t.get('target_panel', 'main') if t['form'] == 'inline' else None
                candidate = dict(id=target if target is not None else t['request'], capture=name)
                next_selection = [candidate if p['id'] == target else p for p in selection] if target is not None else [*selection, candidate]
                actual = union([p['capture'] for p in next_selection], direct)
                assert set(t['gained_goals']) == actual - before_direct
                assert set(t['lost_goals']) == before_direct - actual
                if target is not None:
                    replacements_checked += 1
                    previous = next(p['capture'] for p in selection if p['id'] == target)
                    b, a = docs[previous], docs[name]
                    assert a['publication']['focus'] == b['publication']['focus']
                    cuts = lambda d: [{k: v for k, v in r.items() if k != 'visible_node'} for r in d['publication']['boundary']]
                    assert cuts(a) == cuts(b)
                    assessment = t['inline_assessment']
                    assert assessment['before']['crossings'] == metrics[previous]['crossings']
                    assert assessment['candidate']['crossings'] == metrics[name]['crossings']
                    if 'crossing-cost' in assessment['reasons']:
                        assert metrics[name]['crossings'] > metrics[previous]['crossings'] + assessment['crossing_allowance']
                    if t['accepted']:
                        assert roles[previous] <= roles[name] and coarse[previous] <= coarse[name]
                if t['accepted']:
                    assert t['eligible'] and not t['reasons'] and not t['lost_goals'] and t['gained_goals']
                    assert not docs[name]['diagnostics']['publication']['issues']
                    accepted.append(next_selection)
            assert len(accepted) <= 1
            if accepted:
                selection = accepted[0]
        assert selection == [dict(id=p['id'], capture=p['capture']) for p in current['panels']]
        names = [p['capture'] for p in current['panels']]
        assert roles[baseline] <= union(names, lambda n: roles[n]) and coarse[baseline] <= union(names, lambda n: coarse[n])
        old_direct = union([p['capture'] for p in old['panels']], direct)
        current_direct = union(names, direct)
        comparisons.append(dict(name=c['name'], before=metrics[baseline], current=metrics[names[0]],
                                old_direct=len(old_direct), current_direct=len(current_direct),
                                previous_direct_missing=sorted(old_direct - current_direct),
                                previous_direct_added=sorted(current_direct - old_direct),
                                total_area=sum(metrics[n]['width'] * metrics[n]['height'] for n in names),
                                panels=len(names), main_changed=not current['main_unchanged']))
    result = dict(schema='cohort-folds-independent/1', passed=True, goal_complete=False, auditor_sha256=sha(Path(__file__)),
                  panels=len(rows), fixtures_reextracted=len(extraction['rows']), replacements_checked=replacements_checked, metrics=metrics, comparisons=comparisons,
                  legacy_expression_discrepancies=discrepancies,
                  geometry_issue_panels=geometry_issue_panels,
                  scope='Independent canonical stage proof, roles, helper summaries, exact operands, actual SVG geometry and frozen direct goals. Atomic coverage is never granted to a summary.')
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(panels=len(rows), comparisons=comparisons, passed=True)))


if __name__ == '__main__':
    main()

"""Check the stage evidence without declaring the full architecture goal done."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/compact-main/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    subprocess.run(['python3', 'tools/check_compact_main.py'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    tests = read(OUT / 'test-report.json')
    assert len(tests['commands']) == 55 and sum(tests['counts'].values()) == 666 and tests['counts']['compact-main'] == 10
    for f, h in tests['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale tests', f)
    for row in tests['commands']:
        assert row['exit_code'] == 0
        log = (OUT / row['log']).read_text()
        count = re.search(r'Ran (\d+) tests?' if row['name'] == 'python' else r'ℹ tests (\d+)', log)
        assert count and int(count[1]) == tests['counts'][row['name']]
        assert '\nOK\n' in log if row['name'] == 'python' else re.search(r'ℹ fail 0\b', log)
    small, large = [read(OUT / (s + '-render-report.json')) for s in ['small', 'large']]
    rows = small['rows'] + large['rows']
    assert len(rows) == 49 and small['baseline']['commit'] == large['baseline']['commit'] == 'f6d98e9'
    independent = read(OUT / 'independent-report.json')
    assert independent['passed'] and independent['panels'] == 54 and independent['fixtures_reextracted'] == 8
    assert independent['auditor_sha256'] == sha(ROOT / 'tools/check_compact_main.py')
    gaps = independent['legacy_expression_discrepancies']
    assert {r['panel'] for r in gaps} == {'InterleavedPaths-old-trial-1', 'InterleavedPaths-current-trial-3',
                                         'Transformer-old-trial-1', 'Transformer-old-trial-2',
                                         'Transformer-current-trial-3', 'Transformer-current-trial-4'}
    assert len(gaps) == 6 and all(r['raw_expression'] and not r['exact_direct'] for r in gaps)
    ui = read(OUT / 'ui-report.json')
    assert ui['passed'] and len(ui['rows']) == 5 and ui['auditor_sha256'] == sha(ROOT / 'tools/audit_compact_main_ui.cjs')
    native = read(OUT / 'browser-text-report.json')
    assert len(native['results']) == 54 and not native['failures']
    assert native['page_sha256'] == sha(OUT / 'text-qa.html') and native['probe_sha256'] == sha(OUT / 'browser-text-probe.js')
    sections = dict(re.findall(r'<section class="panel" data-panel="([^"]+)"><h2>[^<]+</h2>(.*?)</section>', (OUT / 'text-qa.html').read_text(), re.S))
    assert set(sections) == {r['name'] for r in rows + ui['rows']} == {r['name'] for r in native['results']}
    for row in rows + ui['rows']:
        assert sections[row['name']] == (OUT / row['svg']).read_text()
        measured = next(r for r in native['results'] if r['name'] == row['name'])
        assert [measured['nodes'], measured['paths']] == [row['nodes'], row['edges']]
    raw = read(OUT / 'source-expandability.json')
    assert raw['nodes'] == 3371 and raw['edges'] == 3663 and raw['all_canonical_ids_visible'] and raw['canonical_ir_unchanged']
    assert sha(ROOT / raw['input']) == raw['input_sha256']
    visual = read(OUT / 'visual-review.json')
    assert visual['reviewed'] and not visual['goal_complete']
    for f, h in visual['files_sha256'].items():
        assert sha(OUT / f) == h
    for f, h in visual['reviewer_tools_sha256'].items():
        assert sha(ROOT / f) == h
    assert (OUT / 'dedicated-reference.svg').read_bytes() == (ROOT / 'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg').read_bytes()
    cli = read(OUT / 'cli-report.json')
    assert cli['policy'] == 'compact' and cli['panels'] == 2 and cli['direct_goals'] == 7 and cli['baseline_goals'] == 5
    assert cli['main_svg_sha256'] == sha(OUT / 'PrismPath-current-trial-1.svg')
    comparisons = {c['name']: c for c in independent['comparisons']}
    assert all(c['current_direct'] == c['old_direct'] for c in comparisons.values())
    assert comparisons['PrismPath']['current']['nodes'] == 6 and comparisons['PrismPath']['before']['nodes'] == 7
    assert not comparisons['Transformer']['main_changed'] and comparisons['Transformer']['current_direct'] == 49
    active = read(ROOT / 'verification/publication/active-stage.json')
    assert active['stage'] == 'compact-main' and active['baseline_commit'] == 'f6d98e9' and not active['pending_checks']
    result = dict(schema='compact-main-validation/1', evidence_consistent=True, production_installed=True, goal_complete=False,
                  tests=666, commands=55, new_tests=10, svg_panels=49, native_panels=54,
                  native_node_texts=sum(r['node_texts'] for r in native['results']), native_port_texts=sum(r['port_texts'] for r in native['results']),
                  independent_report_sha256=sha(OUT / 'independent-report.json'), ui_report_sha256=sha(OUT / 'ui-report.json'), pending_checks=[],
                  known_legacy_expression_discrepancies=gaps,
                  remaining_objective=['Transformer semantic/visual convergence at an intermediate expandable state',
                                       'Joint multi-owner summary, container, layout and detail choice',
                                       'Unify raw expression receipts with exact operand/condition coverage',
                                       'Held-out state/control/routing/effect combinations', 'Thousands-node full SVG routing and browser performance'],
                  scope='Bounded exact-instance summary/recovery transactions are implemented and audited. Main compaction on unfamiliar inputs trades against total figure cost. Transformer summary was rejected and its main is unchanged; full goal remains unfinished.')
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

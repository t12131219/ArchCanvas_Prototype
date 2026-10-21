"""Validate this stage's current evidence, keeping the whole goal unfinished."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-path-stages/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    subprocess.run(['node', 'tools/audit_role_path_stage_ui.cjs'], cwd=ROOT, check=True)
    subprocess.run(['python3', 'tools/check_role_path_stages.py'], cwd=ROOT, check=True)
    tests = read(OUT / 'test-report.json')
    for f, h in tests['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale tests', f)
    assert len(tests['commands']) == 54 and sum(tests['counts'].values()) == 656
    assert tests['counts']['role-path-stages'] == 10
    for row in tests['commands']:
        assert row['exit_code'] == 0
        log = (OUT / row['log']).read_text()
        count = re.search(r'Ran (\d+) tests?' if row['name'] == 'python' else r'ℹ tests (\d+)', log)
        assert count and int(count[1]) == tests['counts'][row['name']]
        assert ('\nOK\n' in log if row['name'] == 'python' else re.search(r'ℹ fail 0\b', log))
    small, large = [read(OUT / (s + '-render-report.json')) for s in ['small', 'large']]
    rows = small['rows'] + large['rows']
    assert len(rows) == 29 and small['baseline'] == large['baseline']
    assert small['baseline']['commit'] == '1b9fa9c'
    for f, h in small['baseline']['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', '1b9fa9c:' + f], cwd=ROOT)).hexdigest() == h
    for name in [entry['name'] for entry in small['comparisons'] + large['comparisons']]:
        assert (OUT / (name + '-before.svg')).read_bytes() == (OUT / (name + '-default.svg')).read_bytes()
    independent = read(OUT / 'independent-report.json')
    assert independent['passed'] and independent['panels'] == 29 and independent['fixtures_reextracted'] == 6
    assert independent['auditor_sha256'] == sha(ROOT / 'tools/check_role_path_stages.py')
    assert independent['raw_ui_all_ids_and_routes_verified']
    native = read(OUT / 'browser-text-report.json')
    assert len(native['results']) == 34 and not native['failures']
    assert native['page_sha256'] == sha(OUT / 'text-qa.html') and native['probe_sha256'] == sha(OUT / 'browser-text-probe.js')
    sections = dict(re.findall(r'<section class="panel" data-panel="([^"]+)"><h2>[^<]+</h2>(.*?)</section>', (OUT / 'text-qa.html').read_text(), re.S))
    expected = {r['name']: r['svg'] for r in rows}
    expected.update({f: f for f in ['ui-PrismPath-summary.svg', 'ui-PrismPath-opened.svg', 'ui-PrismPath-detail.svg', 'ui-MixedPaths-grouped.svg', 'ui-Transformer-grouped.svg']})
    assert set(sections) == set(expected) == {r['name'] for r in native['results']}
    for name, f in expected.items():
        assert sections[name] == (OUT / f).read_text()
    for row in rows:
        measured = next(r for r in native['results'] if r['name'] == row['name'])
        assert [measured['nodes'], measured['paths']] == [row['nodes'], row['edges']]
    for crop in read(OUT / 'crop-report.json')['rows']:
        assert sha(OUT / crop['file']) == crop['sha256']
        a, b = [(OUT / crop[k]).read_text() for k in ['file', 'source']]
        assert re.sub(r'<svg\b[^>]*>', '<svg>', a, count=1) == re.sub(r'<svg\b[^>]*>', '<svg>', b, count=1)
    raw = read(OUT / 'source-expandability.json')
    assert raw['source_nodes'] == raw['visible_nodes'] == 3371 and raw['source_edges'] == raw['visible_edges'] == 3663
    assert raw['canonical_ir_unchanged'] and raw['all_canonical_ids_visible'] and raw['input_sha256'] == sha(ROOT / raw['input'])
    visual = read(OUT / 'visual-review.json')
    assert visual['reviewed'] and not visual['goal_complete']
    for f, h in visual['files_sha256'].items():
        assert sha(OUT / f) == h
    for f, h in visual['reviewer_tools_sha256'].items():
        assert sha(ROOT / f) == h
    assert (OUT / 'dedicated-reference.svg').read_bytes() == (ROOT / 'snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg').read_bytes()
    active = read(ROOT / 'verification/publication/active-stage.json')
    assert active['stage'] == 'role-path-stages' and active['baseline_commit'] == '1b9fa9c' and not active['pending_checks']
    metrics = independent['metrics']
    a, b = [metrics['Transformer-' + s] for s in ['before', 'grouped']]
    assert [a['nodes'], b['nodes'], a['edges'], b['edges']] == [80, 73, 91, 82]
    assert [a['crossings'], b['crossings'], a['direct_goals'], b['direct_goals']] == [47, 42, 33, 24]
    assert b['wire_length'] > a['wire_length']
    result = dict(schema='role-path-stages-validation/1', evidence_consistent=True, production_installed=True, goal_complete=False,
                  tests=656, commands=54, new_tests=10, svg_panels=29, native_panels=34,
                  native_node_texts=sum(r['node_texts'] for r in native['results']), native_port_texts=sum(r['port_texts'] for r in native['results']),
                  independent_report_sha256=sha(OUT / 'independent-report.json'), ui_report_sha256=sha(OUT / 'ui-report.json'), pending_checks=[],
                  remaining_objective=['Dedicated-reference semantic and visual convergence', 'Joint semantic summary, detail, container and diagram-set selection with measured route/space and explicit coverage costs',
                                       'Held-out mixed state/control/routing/effect combinations', 'Thousands-node full SVG routing and browser interaction'],
                  scope='Optional general role plus exclusive proved helper path expression; two-level expansion and canonical facts retained. Not automatic default selection or full objective completion.')
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(2)  # Stage verified; the full user objective is unfinished.


if __name__ == '__main__':
    main()

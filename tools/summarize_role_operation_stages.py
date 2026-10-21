"""Validate this optional expression stage without declaring the full goal done."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-operation-stages/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    subprocess.run(['node', 'tools/audit_role_operation_ui.cjs'], cwd=ROOT, check=True)
    subprocess.run(['python3', 'tools/check_role_operation_stages.py'], cwd=ROOT, check=True)
    report, tests, independent, native, ui, visual = [read(OUT / f) for f in [
        'render-report.json', 'test-report.json', 'independent-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json']]
    for r in [report, tests]:
        for f, h in r['implementation_sha256'].items():
            assert sha(ROOT / f) == h, ('stale producer', f)
    assert len(tests['commands']) == 53 and sum(tests['counts'].values()) == 646 and tests['counts']['role-operation-stages'] == 11
    for row in tests['commands']:
        assert row['exit_code'] == 0
        log = (OUT / row['log']).read_text()
        count = re.search(r'Ran (\d+) tests?' if row['name'] == 'python' else r'ℹ tests (\d+)', log)
        assert count and int(count[1]) == tests['counts'][row['name']]
        assert ('\nOK\n' in log if row['name'] == 'python' else re.search(r'ℹ fail 0\b', log))
    assert len(report['rows']) == 25 and len(report['comparisons']) == 7
    assert independent['passed'] and independent['panels'] == 25 and independent['fixtures_reextracted'] == 6
    assert independent['render_report_sha256'] == sha(OUT / 'render-report.json')
    assert independent['auditor_sha256'] == sha(ROOT / 'tools/check_role_operation_stages.py')
    assert independent['raw_ui_all_ids_and_paths_verified'] and independent['ui_report_sha256'] == sha(OUT / 'ui-report.json')
    assert ui['passed'] and ui['svg_byte_identical'] and ui['canonical_ir_preserved']
    assert [ui['raw_source_nodes'], ui['raw_source_edges']] == [10, 8]
    expected = {r['name']: r['svg'] for r in report['rows']}
    expected.update({f: f for f in ['ui-QuartzPath-summary.svg', 'ui-QuartzPath-opened.svg', 'ui-QuartzPath-raw.svg', 'ui-MixedStageWeave-grouped.svg', 'ui-Transformer-grouped.svg']})
    page = (OUT / 'text-qa.html').read_text()
    sections = dict(re.findall(r'<section data-panel="([^"]+)"><h2>[^<]+</h2>(.*?)</section>', page, re.S))
    assert set(sections) == set(expected) and len(native['results']) == 30 and not native['failures']
    assert {r['name'] for r in native['results']} == set(expected)
    assert native['page_sha256'] == sha(OUT / 'text-qa.html') and native['probe_sha256'] == sha(OUT / 'browser-text-probe.js')
    assert native['render_report_sha256'] == sha(OUT / 'render-report.json')
    for name, f in expected.items():
        assert sections[name] == (OUT / f).read_text(), ('inline SVG differs', name)
    for row in report['rows']:
        measured = next(r for r in native['results'] if r['name'] == row['name'])
        assert [measured['nodes'], measured['paths']] == [row['nodes'], row['edges']]
    crops = read(OUT / 'crop-report.json')
    for c in crops['rows']:
        assert sha(OUT / c['file']) == c['sha256'] and sha(OUT / c['source']) == c['source_sha256']
        crop, source = [(OUT / c[k]).read_text() for k in ['file', 'source']]
        assert re.sub(r'<svg\b[^>]*>', '<svg>', crop, count=1) == re.sub(r'<svg\b[^>]*>', '<svg>', source, count=1)
    raw = read(OUT / 'source-expandability.json')
    assert raw['source_nodes'] == raw['visible_nodes'] == 3371 and raw['source_edges'] == raw['visible_edges'] == 3663
    assert raw['canonical_ir_unchanged'] and raw['all_canonical_ids_visible'] and raw['input_sha256'] == sha(ROOT / raw['input'])
    assert visual['reviewed'] and not visual['goal_complete']
    for f, h in visual['files_sha256'].items():
        assert sha(OUT / f) == h, ('stale visual artifact', f)
    for f, h in visual['reviewer_tools_sha256'].items():
        assert sha(ROOT / f) == h, ('stale review tool', f)
    assert sha(ROOT / visual['reference']['file']) == visual['reference']['sha256']
    metrics = independent['metrics']
    a, b = [metrics['Transformer-' + v] for v in ['before', 'grouped']]
    assert [a['nodes'], b['nodes'], a['edges'], b['edges']] == [80, 78, 91, 89]
    assert [a['height'], b['height'], a['crossings'], b['crossings']] == [3656, 3564, 47, 46]
    assert [a['direct_goals'], b['direct_goals']] == [33, 29]
    for name in ['QuartzPath', 'RenamedPath']:
        assert metrics[name + '-grouped']['width'] > metrics[name + '-before']['width']
    active = read(ROOT / 'verification/publication/active-stage.json')
    assert active['stage'] == 'role-operation-stages' and not active['pending_checks']
    result = dict(schema='role-operation-stages-validation/1', evidence_consistent=True, production_installed=True, goal_complete=False,
                  tests=646, commands=53, new_tests=11, svg_panels=25, native_panels=30,
                  native_node_texts=sum(r['node_texts'] for r in native['results']), native_port_texts=sum(r['port_texts'] for r in native['results']),
                  ui=ui['results'], render_report_sha256=sha(OUT / 'render-report.json'), pending_checks=[],
                  observed_change='Optional role plus exclusive ordinary tail: Transformer 80/91 -> 78/89, height 3656 -> 3564, crossings 47 -> 46; direct goals 33 -> 29. Default byte-identical.',
                  remaining_objective=['Dedicated-reference semantic and visual convergence', 'Joint selection of semantic summaries, local details, containers and diagram sets with explicit coverage costs',
                                       'Thousands-node SVG routing and browser interaction', 'Broader held-out state/control/routing/effect combinations'],
                  scope='General local certified-role expression, exact operations/cuts and preserved detail access. No model-name recipe, default activation, global readability optimum or full-goal completion claim.')
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

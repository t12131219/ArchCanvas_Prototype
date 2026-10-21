"""Validate this completed measurement; keep convergence and performance unfinished."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-comparison/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda f: json.loads((OUT / f).read_text())

def verify():
    render = read('render-report.json'); digest = sha(OUT / 'render-report.json')
    for f, h in render['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    independent, receipts, svg, native, ui, ui_svg, visual = [read(f) for f in
        ['independent-report.json', 'receipt-report.json', 'svg-report.json', 'browser-text-report.json', 'ui-report.json', 'ui-svg-report.json', 'visual-review.json']]
    for r in [independent, receipts, svg, native, ui, ui_svg, visual]:
        assert r['render_report_sha256'] == digest
    assert independent['passed'] and independent['auditor_sha256'] == sha(ROOT / 'tools/check_adaptive_comparison.py')
    assert len(render['rows']) == independent['svg_panels'] == len(receipts['rows']) == len(svg['results']) == 22
    assert all(r['passed'] for r in receipts['rows'] + svg['results'])
    for row in render['rows']:
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        measured = next(r for r in native['results'] if r['name'] == row['name'])
        assert (measured['nodes'], measured['paths']) == (row['nodes'], row['edges'])
    assert len(native['results']) == 24 and not native['failures']
    assert ui['generic_sequence'] == [19, 19, 13, 144, 19]
    assert all(ui[k] for k in ['saved_reopened', 'canonical_ir_unchanged', 'cli_svg_equal', 'exact_return_svg'])
    assert ui['auditor_sha256'] == sha(ROOT / 'tools/audit_adaptive_comparison_ui.cjs')
    assert len(ui['selected_paths']) == 1 and len(ui_svg['results']) == 2 and all(r['passed'] for r in ui_svg['results'])
    assert ui_svg['ui_report_sha256'] == sha(OUT / 'ui-report.json')
    assert ui_svg['raw_source']['all_canonical_ids_and_paths_verified']
    for r in [ui, visual]:
        for f, h in r['artifacts_sha256'].items():
            assert sha(OUT / f) == h
    for f, h in visual['tools_sha256'].items():
        assert sha(ROOT / f) == h
    assert visual['reviewed'] and not visual['goal_complete']
    tests_dir = ROOT / 'verification/coherent-frontiers/current'
    tests = json.loads((tests_dir / 'test-report.json').read_text())
    for f, h in tests['implementation_sha256'].items():
        assert sha(ROOT / f) == h
    for command in tests['commands']:
        assert command['exit_code'] == 0
        log = (tests_dir / command['log']).read_text()
        pattern = r'Ran (\d+) tests?' if command['name'] == 'python' else r'ℹ tests (\d+)'
        assert int(re.search(pattern, log)[1]) == tests['counts'][command['name']]
        assert re.search(r'^OK$', log, re.M) if command['name'] == 'python' else re.search(r'^ℹ fail 0$', log, re.M)
    for file in ['review.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / file).read_text()
    result = {'schema': 'adaptive-comparison-validation/1', 'evidence_consistent': True,
        'goal_complete': False, 'completed_check': 'transformer-default-adaptive-comparison',
        'render_report_sha256': digest, 'tests': sum(tests['counts'].values()),
        'tests_scope': 'Existing 579-test evidence revalidated against unchanged production hashes; no new production edits or unit-test execution in this audit stage.',
        'test_report_sha256': sha(tests_dir / 'test-report.json'),
        'svg_panels': 22, 'additional_ui_svg_panels': 2,
        'native_node_texts': sum(r['node_texts'] for r in native['results']), 'native_edge_labels': sum(r['port_texts'] for r in native['results']),
        'current_elapsed_ms': independent['current_elapsed_ms'], 'before_elapsed_ms': None,
        'transformer': {'nodes': [86, 80], 'edges': [94, 91], 'width': [2230, 2166], 'height': [3776, 3656], 'crossings': [47, 48],
            'additional_paths_selected': 0, 'exposed_role_identities_preserved': independent['exposed_roles'],
            'default_adaptive_matches_independently_measured_fixed_svg': True},
        'ui_sequence': ui['generic_sequence'],
        'remaining_objective': ['Dedicated-reference semantic/visual convergence', 'Joint main summary/detail and measured diagram-set selection',
            'Thousands-node SVG routing and UI performance', 'Broader held-out state/control/routing/effect compositions',
            'Default-adaptive browser latency; full CLI render took 421.722 seconds'],
        'artifacts_sha256': {f: sha(OUT / f) for f in ['render-report.json', 'independent-report.json', 'receipt-report.json', 'svg-report.json',
            'browser-text-report.json', 'ui-report.json', 'ui-svg-report.json', 'visual-review.json', 'resume-launch.json', 'transformer-timing.json']},
        'validator_sha256': sha(Path(__file__))}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

if __name__ == '__main__':
    print(json.dumps(verify())); raise SystemExit(2)

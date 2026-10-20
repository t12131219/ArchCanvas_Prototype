"""Bind exact-role, actual SVG, browser and current regression evidence."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-identity/experiment'
STAGE = ROOT / 'verification/adaptive-role-paths/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((OUT / name).read_text())


def main():
    report = read('render-report.json'); digest = sha(OUT / 'render-report.json')
    for file, expected in report['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale producer', file)
    frozen = read('snapshot.json')
    assert frozen['base_commit'] == '4e8c90200eac6b7c23f8d72ca4aeab64b0ea45b2'
    assert sha(OUT / 'snapshot.json') == report['baseline_sha256']
    for file, expected in frozen['files'].items():
        assert sha(OUT / 'before' / Path(file).name) == expected
        original = subprocess.check_output(['git', 'show', frozen['base_commit'] + ':' + file], cwd=ROOT)
        assert hashlib.sha256(original).hexdigest() == expected
    pairs = {}
    for row in report['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        doc = read(row['document']); pairs.setdefault(row['case'], {})[row['variant']] = (row, doc)
        assert doc['ir'] == json.loads((ROOT / row['input']).read_text())
        assert not row['quality']['issues']
    assert len(pairs) == 8 and len(report['rows']) == 16
    changed = []
    for name, pair in pairs.items():
        (ar, a), (br, b) = [pair[v] for v in ['before', 'current']]
        assert a['ir'] == b['ir'] and ar['quality'] == br['quality']
        assert a['layout']['edges'] == b['layout']['edges']
        for field in ['node_accounting', 'edge_accounting']:
            assert a['layout'][field] == b['layout'][field]
        old = {n['id']: n for n in a['layout']['nodes']}
        assert old.keys() == {n['id'] for n in b['layout']['nodes']}
        for n in b['layout']['nodes']:
            previous = old[n['id']]
            if previous == n:
                continue
            assert previous['title'] == '0' and n['title'] == 'numerical guards · 0'
            assert {k for k in n if n[k] != previous.get(k)} == {'title', 'lines', 'x', 'w'}
            assert (previous['w'], n['w']) == (184, 202)
            assert previous['x'] + previous['w'] / 2 == n['x'] + n['w'] / 2
            changed.append(name)
        if name not in changed:
            assert ar['svg_sha256'] == br['svg_sha256']
    assert sorted(changed) == ['BoundedWeave', 'ConditionalWeave', 'MixedBoundary']
    for file in ['svg-report.json', 'receipt-report.json', 'native-text-report.json']:
        assert read(file)['render_report_sha256'] == digest
    assert len(read('svg-report.json')['results']) == len(read('receipt-report.json')['rows']) == 16
    assert all(r['passed'] for r in read('svg-report.json')['results'] + read('receipt-report.json')['rows'])
    native = read('native-text-report.json'); assert len(native['results']) == 16 and not native['failures']
    for file, expected in native['svg_sha256'].items():
        assert sha(OUT / file) == expected
    tests = json.loads((STAGE / 'test-report.json').read_text())
    assert sum(tests['counts'].values()) == 549 and tests['counts']['role-identity'] == 6
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    ui = json.loads((STAGE / 'ui-report.json').read_text())
    assert ui['generic_sequence'] == [28, 28, 25, 13, 144, 28]
    assert ui['canonical_ir_unchanged'] and ui['exact_return_svg'] and ui['cli_svg_equal']
    for file, expected in ui['artifacts_sha256'].items():
        assert sha(STAGE / file) == expected
    install = read('install-record.json')
    assert not any(r['exists'] for r in install['outputs'].values())
    assert install['current_renderer_loads_after_before_files']
    for file, facts in install['implementation'].items():
        assert sha(ROOT / file) == facts['sha256']
    visual = read('visual-review.json'); assert visual['agent_viewed'] and not visual['goal_complete']
    for file, expected in visual['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    for name in ['review.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / name).read_text()
    files = ['render-report.json', 'svg-report.json', 'receipt-report.json', 'native-text-report.json', 'visual-review.json', 'snapshot.json', 'install-record.json', 'review.html', 'text-qa.html', 'browser-review.png']
    support = ['tools/summarize_role_identity.py', 'tools/audit_role_identity.cjs', 'tools/check_role_identity.py', 'tools/build_role_identity_review.py', 'tests/role-identity.test.cjs', 'docs/role-identity.md']
    result = {'schema':'role-identity-validation/1', 'evidence_consistent':True, 'production_installed':True, 'goal_complete':False,
        'pairs':8, 'actual_svg_panels':16, 'tests':549, 'new_regressions':6,
        'native_node_texts':sum(r['node_texts'] for r in native['results']), 'native_edge_labels':sum(r['port_texts'] for r in native['results']),
        'routes_and_quality_equal':True, 'unchanged_complete_svgs':5, 'contextual_title_cases':changed,
        'limitations':['This fixes exact role identity and numeric member text, not global semantic frontier planning or dedicated-reference convergence.',
            'The full Transformer comparison remains live in session51885; no result is inferred from these smaller panels.',
            'No new large-graph SVG routing, browser-performance or arbitrary-runtime behavior claim.'],
        'stage_test_report_sha256':sha(STAGE / 'test-report.json'), 'stage_ui_report_sha256':sha(STAGE / 'ui-report.json'),
        'artifacts_sha256':{f:sha(OUT / f) for f in files}, 'supporting_tools_sha256':{f:sha(ROOT / f) for f in support}}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k:result[k] for k in ['evidence_consistent','production_installed','goal_complete','pairs','actual_svg_panels','tests','native_node_texts','native_edge_labels']}))


if __name__ == '__main__':
    main()

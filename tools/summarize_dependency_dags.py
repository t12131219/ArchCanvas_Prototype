"""Seal current bounded progress without claiming reference convergence."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/dependency-dags/current'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in report['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale implementation', file)
    for key in ['checkpoint', 'prior_report', 'extraction']:
        assert sha(ROOT / report[key]) == report[key + '_sha256']
    assert sha(ROOT / report['reference']['svg']) == report['reference']['svg_sha256']
    for row in report['rows']:
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256'], row['name']
        assert sha(ROOT / row['input']) == row['input_sha256']
    names = ['svg-report.json', 'dag-report.json', 'receipt-report.json', 'native-text-report.json', 'ui-report.json', 'visual-review.json']
    evidence = {name: read(OUT / name) for name in names}
    for name, item in evidence.items():
        assert item['render_report_sha256'] == digest, name
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert evidence['dag-report.json']['passed'] and evidence['receipt-report.json']['passed']
    expected = {r['svg']: r['svg_sha256'] for r in report['rows']}
    native = evidence['native-text-report.json']
    assert len(native['rows']) == len(expected) == 45 and not native['failures']
    assert {r['path'] for r in native['rows']} == set(expected)
    for r in native['rows']:
        assert r['svg_sha256'] == expected[r['path']] and not r['failures']
        assert abs(r['scale'] - 1) < .001 and r['min_font'] >= 12
    ui = evidence['ui-report.json']
    assert ui['sequence'] == [5, 9, 5, 9]
    assert all(ui[k] for k in ['canonical_ir_unchanged', 'default_svg_matches_cli', 'opened_svg_matches_cli', 'reopened_svg_matches_opened'])
    for actual, cli in [('ui-default.svg', 'ReusedCircuit-current.svg'), ('ui-opened.svg', 'ReusedCircuit-opened.svg'), ('ui-reopened.svg', 'ReusedCircuit-opened.svg')]:
        assert sha(OUT / actual) == sha(OUT / cli)
    for file, value in ui['files'].items():
        assert sha(OUT / file) == value
    for file, value in evidence['visual-review.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['canonical_ir_unchanged'] and expansion['all_canonical_ids_visible']
    assert (expansion['visible_nodes'], expansion['visible_edges']) == (3371, 3663)
    rows = {r['name']: r for r in report['rows']}
    assert rows['transformer-before']['svg_sha256'] == rows['transformer-current']['svg_sha256']
    supplemental = ['tools/audit_dependency_dags.py', 'tools/build_dependency_dag_review.py', 'tools/summarize_dependency_dags.py',
                    'tools/summarize_publication_checks.py', 'docs/dependency-dags.md', 'verification/dependency-dags/current/README.md',
                    'verification/publication/active-stage.json']
    result = {'schema': 'dependency-dag-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': sum(tests['counts'].values()), 'svg_panels': len(rows), 'native_texts': native['texts'], 'ui_counts': ui['sequence'],
              'transformer_svg_unchanged': True,
              'comparisons': evidence['dag-report.json']['comparisons'],
              'evidence_sha256': {name: sha(OUT / name) for name in names},
              'test_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'expansion_report_sha256': sha(OUT / 'source-expandability.json'),
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Bounded DAG summaries do not complete global summary/detail selection or summary-level expression coverage.',
                         'Final tuple packs remain explicit; multiple independently selectable outputs need a richer summary.',
                         'Fixed-width summaries can increase width or area despite fewer nodes.',
                         'Transformer is unchanged and remains visually distant from the dedicated reference.',
                         'Raw source projection completeness does not verify thousands-node simultaneous SVG routing or interaction.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'native_texts', 'ui_counts']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

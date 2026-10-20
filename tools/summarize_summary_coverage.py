"""Validate the current increment while keeping the full objective incomplete."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/summary-coverage/current'


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
    snapshot = read(ROOT / report['checkpoint'])
    for file, value in snapshot['files'].items():
        assert sha(ROOT / Path(report['checkpoint']).parent / 'implementation' / file) == value
    assert sha(ROOT / report['reference']['svg']) == report['reference']['svg_sha256']
    rows = {r['name']: r for r in report['rows']}
    expected = {r['svg']: r['svg_sha256'] for r in report['rows']}
    assert len(rows) == len(expected) == 44
    for row in rows.values():
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        if row['name'].endswith('-current'):
            assert row['svg_sha256'] == rows[row['name'].replace('-current', '-before')]['svg_sha256']
    names = ['svg-report.json', 'coverage-report.json', 'receipt-report.json', 'native-text-report.json', 'ui-report.json', 'visual-review.json']
    evidence = {name: read(OUT / name) for name in names}
    for name, item in evidence.items():
        assert item['render_report_sha256'] == digest, name
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert evidence['coverage-report.json']['passed'] and evidence['receipt-report.json']['passed']
    assert evidence['coverage-report.json']['auditor_sha256'] == sha(ROOT / 'tools/audit_summary_coverage.py')
    assert sum(len(r['checks']) for r in evidence['coverage-report.json']['results']) == 105
    native = evidence['native-text-report.json']
    assert not native['failures'] and len(native['rows']) == 44
    assert {r['path'] for r in native['rows']} == set(expected)
    assert sha(ROOT / native['prior_report']) == native['prior_report_sha256']
    prior = read(ROOT / native['prior_report'])
    metrics = ['texts', 'rect_texts', 'failures', 'scale', 'min_font']
    for row in native['rows']:
        assert row['svg_sha256'] == expected[row['path']] and not row['failures']
        assert abs(row['scale'] - 1) < .001 and row['min_font'] >= 12
        origin = row['origin']
        if origin['kind'] == 'prior-identical-svg':
            assert origin['report'] == native['prior_report'] and origin['report_sha256'] == native['prior_report_sha256']
            source = next(r for r in prior['rows'] if r['path'] == origin['path'])
            assert sha((ROOT / native['prior_report']).parent / source['path']) == row['svg_sha256']
        elif origin['kind'] == 'current-identical-svg':
            source = next(r for r in native['rows'] if r['path'] == origin['path'])
            assert source['origin']['kind'] == 'measured'
        else:
            assert origin['kind'] == 'measured' and origin['path'] == row['path']
            source = row
        assert source['svg_sha256'] == row['svg_sha256']
        assert all(source[k] == row[k] for k in metrics)
    assert native['texts'] == sum(r['texts'] for r in native['rows']) == 923
    ui = evidence['ui-report.json']
    assert ui['sequence'] == [6, 11, 6, 11]
    assert all(ui[k] for k in ['canonical_ir_unchanged', 'default_svg_matches_cli', 'opened_svg_matches_cli', 'reopened_svg_matches_opened'])
    assert '当前摘要已表达' in ui['folded_inspector'] and '当前操作与路径已表达' in ui['opened_inspector']
    assert ui['opened_inspector'] == ui['reopened_inspector']
    assert '不代表所有操作数' in ui['folded_inspector'] and ui['reopened_status_attribute'] == 'fulfilled'
    for actual, cli in [('ui-default.svg', 'SourceMosaic-current.svg'), ('ui-opened.svg', 'SourceMosaic-opened.svg'), ('ui-reopened.svg', 'SourceMosaic-opened.svg')]:
        assert sha(OUT / actual) == sha(OUT / cli)
    assert read(OUT / 'ui-saved.layout.json')['ir'] == read(OUT / 'SourceMosaic.json')
    for file, value in ui['files'].items():
        assert sha(OUT / file) == value
    for file, value in evidence['visual-review.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    assert all(c['exit_code'] == 0 for c in tests['commands']) and sum(tests['counts'].values()) == 442
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['canonical_ir_unchanged'] and expansion['all_canonical_ids_visible']
    assert (expansion['visible_nodes'], expansion['visible_edges']) == (3371, 3663)
    transformer = rows['transformer-current']
    assert transformer['svg_sha256'] == rows['transformer-before']['svg_sha256']
    assert sum(c['form'] == 'summary' for c in transformer['summary_coverage']) == 14
    assert sum(c['form'] == 'deferred' for c in transformer['summary_coverage']) == 60
    supplemental = ['tools/audit_summary_coverage.py', 'tools/build_summary_coverage_review.py', 'tools/summarize_summary_coverage.py',
                    'tools/summarize_publication_checks.py', 'docs/summary-coverage.md', 'verification/summary-coverage/current/README.md',
                    'verification/publication/active-stage.json']
    result = {'schema': 'summary-coverage-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': 442, 'svg_panels': 44, 'coarse_checks': 105, 'native_texts': 923, 'ui_counts': ui['sequence'],
              'transformer_svg_unchanged': True, 'transformer_summaries': 14, 'transformer_deferred': 60,
              'evidence_sha256': {name: sha(OUT / name) for name in names},
              'test_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'expansion_report_sha256': sha(OUT / 'source-expandability.json'),
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Local dependency-structure coverage excludes full operands, parameter/configuration values and runtime behavior.',
                         'Joint summary/detail selection and graph-set planning remain incomplete.',
                         'Transformer geometry is unchanged and remains distant from the dedicated reference.',
                         'Full-source projection completeness does not prove thousands-node simultaneous SVG routing or interaction.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'coarse_checks', 'native_texts', 'ui_counts']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

"""Check current conditional presentation evidence; the overall goal remains open."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/condition-predicates/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    if not (OUT / 'render-report.json').exists():
        stage = read(ROOT / 'verification/publication/active-stage.json')
        print(json.dumps({'schema': 'condition-predicates-validation/1', 'evidence_consistent': False,
                          'goal_complete': False, 'status': 'full-model-audit-pending',
                          'pending_checks': stage.get('pending_checks', [])}))
        raise SystemExit(2)
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
    extraction = read(ROOT / report['extraction'])
    assert not extraction['runtime_executed']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for entry in extraction['rows']:
        assert sha(ROOT / entry['input']) == entry['sha256']
    rows = {r['name']: r for r in report['rows']}
    expected = {r['svg']: r['svg_sha256'] for r in rows.values()}
    assert len(rows) == len(expected) == 17
    for row in rows.values():
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
    names = ['svg-report.json', 'predicate-report.json', 'receipt-report.json',
             'native-text-report.json', 'ui-report.json', 'visual-review.json']
    evidence = {name: read(OUT / name) for name in names}
    for name, item in evidence.items():
        assert item['render_report_sha256'] == digest, name
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert len(evidence['svg-report.json']['results']) == 17
    predicates = evidence['predicate-report.json']
    assert predicates['passed'] and predicates['panels'] == 17
    assert predicates['auditor_sha256'] == sha(ROOT / 'tools/audit_condition_predicates.py')
    assert predicates['summary_auditor_sha256'] == sha(ROOT / 'tools/audit_summary_coverage.py')
    assert evidence['receipt-report.json']['passed'] and len(evidence['receipt-report.json']['results']) == 17
    native = evidence['native-text-report.json']
    assert not native['failures'] and len(native['rows']) == 17
    assert {r['path'] for r in native['rows']} == set(expected)
    metrics = ['texts', 'rect_texts', 'failures', 'scale', 'min_font']
    for row in native['rows']:
        assert row['svg_sha256'] == expected[row['path']] and not row['failures']
        assert abs(row['scale'] - 1) < .001 and row['min_font'] >= 12
        origin = row['origin']
        if origin['kind'] == 'current-identical-svg':
            source = next(r for r in native['rows'] if r['path'] == origin['path'])
            assert source['origin']['kind'] == 'measured'
        else:
            assert origin['kind'] == 'measured' and origin['path'] == row['path']
            source = row
        assert source['svg_sha256'] == row['svg_sha256']
        assert all(source[k] == row[k] for k in metrics)
    assert native['texts'] == sum(r['texts'] for r in native['rows'])
    ui = evidence['ui-report.json']
    assert ui['sequence'] == [15, 20, 15, 15]
    assert all(ui[k] for k in ['canonical_ir_unchanged', 'summary_svg_matches_cli',
                              'opened_svg_matches_cli', 'reopened_svg_matches_summary'])
    for actual, cli in [('ui-summary.svg', 'ConditionalSplice-summary.svg'), ('ui-opened.svg', 'ConditionalSplice-opened.svg'),
                        ('ui-reopened.svg', 'ConditionalSplice-summary.svg')]:
        assert sha(OUT / actual) == sha(OUT / cli)
    saved = read(OUT / 'ui-saved.layout.json')
    assert saved['ir'] == read(OUT / 'ConditionalSplice.json')
    assert saved['state']['open'] == rows['ConditionalSplice-summary']['state']['open']
    for file, value in ui['files'].items():
        assert sha(OUT / file) == value
    for file, value in evidence['visual-review.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    for name in ['comparison.html', 'transformer-comparison.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / name).read_text()
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    assert all(c['exit_code'] == 0 for c in tests['commands']) and sum(tests['counts'].values()) == 458
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['canonical_ir_unchanged'] and expansion['all_canonical_ids_visible']
    assert (expansion['visible_nodes'], expansion['visible_edges']) == (3371, 3663)
    for name in ['EscapingDecision', 'UnknownDecision', 'MixedWeave', 'ConditionalCarry', 'transformer']:
        assert rows[name + '-before']['svg_sha256'] == rows[name + '-current']['svg_sha256'], name
    assert (rows['ConditionalSplice-summary-before']['nodes'], rows['ConditionalSplice-summary']['nodes'],
            rows['ConditionalSplice-opened']['nodes']) == (17, 15, 20)
    assert (rows['ConditionalSplice-before']['quality']['line_geometry']['crossings'],
            rows['ConditionalSplice-current']['quality']['line_geometry']['crossings']) == (2, 0)
    assert rows['ConditionalSplice-current']['quality']['native_height_px'] > rows['ConditionalSplice-before']['quality']['native_height_px']
    supplemental = ['tools/audit_condition_predicates.py', 'tools/build_condition_predicates_review.py',
                    'tools/summarize_condition_predicates.py', 'tools/summarize_publication_checks.py',
                    'docs/condition-predicates.md', 'verification/condition-predicates/README.md',
                    'verification/publication/active-stage.json']
    result = {'schema': 'condition-predicates-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': 458, 'svg_panels': 17, 'coarse_checks': sum(r['coarse_checks'] for r in predicates['results']),
              'native_texts': native['texts'], 'ui_counts': ui['sequence'], 'transformer_default_svg_unchanged': True,
              'quality_issues': {n: r['quality']['issues'] for n, r in rows.items() if r['quality']['issues']},
              'evidence_sha256': {name: sha(OUT / name) for name in names},
              'test_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'expansion_report_sha256': sha(OUT / 'source-expandability.json'),
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Only direct exclusively consumed source comparisons qualify; protected boundaries remain.',
                         'Summaries preserve details but do not prove arbitrary Python comparison semantics or branch reachability.',
                         'Actual layouts can become taller even when crossings decrease.',
                         'Explicit role detail is measured separately from the unchanged default Transformer state.',
                         'Global expression and diagram-set planning, reference convergence and large-graph interaction remain incomplete.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'native_texts', 'ui_counts']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

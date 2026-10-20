"""Validate current local selection evidence without claiming the full goal."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/coverage-selection/current'


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
    extraction = read(ROOT / report['extraction'])
    assert not extraction['runtime_executed']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for entry in extraction['rows']:
        assert sha(ROOT / entry['input']) == entry['sha256']
    rows = {r['name']: r for r in report['rows']}
    expected = {r['svg']: r['svg_sha256'] for r in rows.values()}
    assert len(rows) == len(expected) == 22
    for row in rows.values():
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
    names = ['svg-report.json', 'selection-report.json', 'receipt-report.json',
             'native-text-report.json', 'ui-report.json', 'visual-review.json']
    evidence = {name: read(OUT / name) for name in names}
    for name, item in evidence.items():
        assert item['render_report_sha256'] == digest, name
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    selection = evidence['selection-report.json']
    assert selection['passed'] and selection['panels'] == 22
    assert selection['auditor_sha256'] == sha(ROOT / 'tools/audit_coverage_selection.py')
    assert selection['summary_auditor_sha256'] == sha(ROOT / 'tools/audit_summary_coverage.py')
    assert evidence['receipt-report.json']['passed']
    assert len(evidence['receipt-report.json']['results']) == 22
    native = evidence['native-text-report.json']
    assert not native['failures'] and len(native['rows']) == 22
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
    assert native['texts'] == sum(r['texts'] for r in native['rows']) == 1215
    ui = evidence['ui-report.json']
    assert ui['sequence'] == [29, 25, 29, 25, 25] and ui['reopened_policy'] == 'structure'
    assert all(ui[k] for k in ['canonical_ir_unchanged', 'detail_svg_matches_frozen',
                              'structure_svg_matches_cli', 'reopened_svg_matches_structure'])
    for actual, cli in [('ui-detail.svg', 'MixedWeave-before.svg'), ('ui-structure.svg', 'MixedWeave-current.svg'),
                        ('ui-reopened.svg', 'MixedWeave-current.svg')]:
        assert sha(OUT / actual) == sha(OUT / cli)
    assert read(OUT / 'ui-saved.layout.json')['ir'] == read(OUT / 'MixedWeave.json')
    assert read(OUT / 'ui-saved.layout.json')['state']['paperAdaptivePolicy'] == 'structure'
    for file, value in ui['files'].items():
        assert sha(OUT / file) == value
    for file, value in evidence['visual-review.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    for name in ['comparison.html', 'transformer-comparison.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / name).read_text()
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    assert all(c['exit_code'] == 0 for c in tests['commands']) and sum(tests['counts'].values()) == 450
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['canonical_ir_unchanged'] and expansion['all_canonical_ids_visible']
    assert (expansion['visible_nodes'], expansion['visible_edges']) == (3371, 3663)
    b, c, p = (rows[n] for n in ['transformer-before', 'transformer-current', 'transformer-planned'])
    assert b['svg_sha256'] == c['svg_sha256'] == p['svg_sha256']
    assert (p['nodes'], p['edges']) == (94, 102)
    assert p['quality']['line_geometry']['crossings'] == 57
    assert len(p['adaptive']['attempts']) == 3 and not any(t['accepted'] for t in p['adaptive']['attempts'])
    mixed_b, mixed_c = rows['MixedWeave-before'], rows['MixedWeave-current']
    assert (mixed_b['nodes'], mixed_c['nodes']) == (29, 25)
    assert (mixed_b['quality']['line_geometry']['crossings'], mixed_c['quality']['line_geometry']['crossings']) == (0, 3)
    assert (rows['SourceMosaic-current']['nodes'], rows['SourceMosaic-manual']['nodes']) == (6, 11)
    supplemental = ['tools/audit_coverage_selection.py', 'tools/build_coverage_selection_review.py',
                    'tools/summarize_coverage_selection.py', 'tools/summarize_publication_checks.py',
                    'docs/coverage-selection.md', 'docs/semantic-granularity.md', 'verification/coverage-selection/README.md',
                    'verification/publication/active-stage.json']
    result = {'schema': 'coverage-selection-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': 450, 'svg_panels': 22, 'coarse_checks': sum(r['coarse_checks'] for r in selection['results']),
              'native_texts': 1215, 'ui_counts': ui['sequence'], 'transformer_svg_unchanged': True,
              'evidence_sha256': {name: sha(OUT / name) for name in names},
              'test_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'expansion_report_sha256': sha(OUT / 'source-expandability.json'),
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Selection is bounded and local, not global expression or diagram-set planning.',
                         'Selected alternatives can differ in detail coverage and crossing count.',
                         'Rejected trial geometry comes from producer receipts and is not independently re-rendered.',
                         'Transformer geometry remains distant from the dedicated reference.',
                         'Full-source projection does not prove thousands-node simultaneous routing or interaction.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'native_texts', 'ui_counts']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

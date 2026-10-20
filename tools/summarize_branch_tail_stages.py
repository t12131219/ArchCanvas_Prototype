"""Check current branch-tail evidence without claiming the full goal achieved."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/branch-tail-stages/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, expected in report['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale implementation', file)
    for key in ['checkpoint', 'extraction', 'prior_report']:
        assert sha(ROOT / report[key]) == report[key + '_sha256']
    checkpoint = read(ROOT / report['checkpoint'])
    for file, expected in checkpoint['files'].items():
        assert sha(ROOT / Path(report['checkpoint']).parent / 'implementation' / file) == expected
    assert sha(ROOT / report['reference']['svg']) == report['reference']['svg_sha256']
    extraction = read(ROOT / report['extraction'])
    assert not extraction['runtime_executed'] and len(extraction['rows']) == 8
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for r in extraction['rows']:
        assert sha(ROOT / r['input']) == r['sha256']
    rows = {r['name']: r for r in report['rows']}
    assert len(rows) == 20
    for r in rows.values():
        assert sha(ROOT / r['input']) == r['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / r[key]) == r[key + '_sha256']
        assert not r['quality']['issues'] and not r['quality']['line_geometry']['unrelated_contacts']
    evidence_names = ['svg-report.json', 'receipt-report.json', 'native-text-report.json', 'ui-report.json', 'visual-review.json']
    evidence = {name: read(OUT / name) for name in evidence_names}
    for name, item in evidence.items():
        assert item['render_report_sha256'] == digest, name
    assert len(evidence['svg-report.json']['results']) == 20 and all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert evidence['receipt-report.json']['passed'] and len(evidence['receipt-report.json']['results']) == 20
    native = evidence['native-text-report.json']
    assert len(native['rows']) == 20 and native['texts'] == 625 and not native['failures']
    for r in native['rows']:
        expected = next(row for row in rows.values() if row['svg'] == r['path'])
        assert r['svg_sha256'] == expected['svg_sha256']
        assert r['shape_texts'] == r['texts'] and r['scale'] == 1 and r['min_font'] >= 12 and not r['failures']
    for name in ['ReusedWeave', 'ImageWeave', 'StatefulWeave', 'MultipleInputWeave', 'WholeBranchWeave']:
        assert rows[name + '-before']['svg_sha256'] == rows[name + '-current']['svg_sha256']
    for name, nodes, edges, height in [('UnaryWeave-before', 7, 5, 644), ('UnaryWeave-current', 6, 4, 562),
                                      ('UnaryWeave-opened', 9, 6, 824), ('transformer-before', 94, 102, 4364),
                                      ('transformer-current', 89, 97, 4118)]:
        r = rows[name]
        assert (r['nodes'], r['edges'], r['quality']['native_height_px']) == (nodes, edges, height)
    current = rows['transformer-current']
    assert current['quality']['native_width_px'] == 2588 and current['quality']['line_geometry']['crossings'] == 57
    assert len([s for s in current['contract_stages']['rows'] if s.get('branch_tail') and s['status'] == 'summary']) == 5
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    assert sum(tests['counts'].values()) == 465 and tests['counts']['branch-tail-stages'] == 7
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale test evidence', file)
    ui = evidence['ui-report.json']
    assert ui['sequence'] == [6, 9, 9, 6] and ui['canonical_ir_unchanged'] and ui['saved_document_rerender_matches_opened']
    for actual, expected in [('ui-summary.svg', 'UnaryWeave-current.svg'), ('ui-opened.svg', 'UnaryWeave-opened.svg'), ('ui-refolded.svg', 'UnaryWeave-current.svg')]:
        assert sha(OUT / actual) == sha(OUT / expected)
    assert read(OUT / 'ui-saved.layout.json')['ir'] == read(OUT / 'UnaryWeave.json')
    for name in ['ui-report.json', 'visual-review.json']:
        for file, expected in evidence[name]['artifacts_sha256'].items():
            assert sha(OUT / file) == expected
    for file in ['comparison.html', 'transformer-comparison.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / file).read_text()
    recovery = read(OUT / 'source-expandability.json')
    assert sha(ROOT / recovery['input']) == recovery['input_sha256']
    assert recovery['canonical_ir_unchanged'] and recovery['all_canonical_ids_visible']
    assert (recovery['visible_nodes'], recovery['visible_edges']) == (3371, 3663)
    supplemental = ['tools/build_branch_tail_review.py', 'tools/summarize_branch_tail_stages.py', 'tools/summarize_publication_checks.py',
                    'docs/branch-tail-stages.md', 'verification/branch-tail-stages/README.md', 'verification/publication/active-stage.json']
    result = {'schema': 'branch-tail-stages-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': 465, 'svg_panels': 20, 'native_texts': 625, 'ui_sequence': ui['sequence'],
              'transformer': {'nodes': [94, 89], 'edges': [102, 97], 'height': [4364, 4118], 'width': 2588, 'crossings': 57},
              'render_report_sha256': digest, 'evidence_sha256': {name: sha(OUT / name) for name in evidence_names},
              'test_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Local summary composition is not full reference convergence or complete diagram-set planning.',
                         'Unknown/control/state/source/certified boundaries remain; unproved motifs are not automatically split.',
                         'Deeper whole-model roles and thousands-node routed interaction are not verified by this stage.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'native_texts', 'ui_sequence']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

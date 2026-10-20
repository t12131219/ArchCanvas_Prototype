"""Verify current evidence without treating bounded progress as goal completion."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/frontier-reservations/current'


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
        assert sha(ROOT / report[key]) == report[key + '_sha256'], key
    assert sha(ROOT / report['reference']['svg']) == report['reference']['svg_sha256']
    for row in report['rows']:
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256'], row['name']
        assert sha(ROOT / row['input']) == row['input_sha256'], row['name']
    evidence = {name: read(OUT / name) for name in [
        'svg-report.json', 'reservation-report.json', 'receipt-report.json',
        'native-text-report.json', 'ui-report.json', 'visual-review.json',
        'atlas-report.json', 'atlas-verification.json']}
    for name in ['svg-report.json', 'reservation-report.json', 'receipt-report.json',
                 'native-text-report.json', 'visual-review.json']:
        assert evidence[name]['render_report_sha256'] == digest, ('stale evidence', name)
    assert all(row['passed'] for row in evidence['svg-report.json']['results'])
    assert evidence['reservation-report.json']['passed'] and evidence['receipt-report.json']['passed']
    atlas = evidence['atlas-report.json']
    atlas_dir = ROOT / atlas['directory']
    assert sha(ROOT / atlas['input']) == atlas['input_sha256']
    assert sha(atlas_dir / 'manifest.json') == atlas['manifest_sha256']
    for file, value in atlas['files'].items():
        assert sha(atlas_dir / file) == value, ('stale atlas', file)
    manifest = read(atlas_dir / 'manifest.json')
    for file, value in manifest['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale atlas implementation', file)
    assert atlas['complete'] and atlas['quality_pass']
    verified_atlas = evidence['atlas-verification.json']
    assert verified_atlas['passed'] and verified_atlas['panels'] == len(manifest['panels']) == 6
    assert verified_atlas['atlas_report_sha256'] == sha(OUT / 'atlas-report.json')
    native = evidence['native-text-report.json']
    assert native['atlas_report_sha256'] == sha(OUT / 'atlas-report.json')
    expected = {row['svg']: row['svg_sha256'] for row in report['rows']}
    expected.update({'atlas/EquivalentSteps/' + p['svg']: sha(atlas_dir / p['svg']) for p in manifest['panels']})
    assert len(native['rows']) == len(expected) == 53 and not native['failures']
    assert {row['path'] for row in native['rows']} == set(expected)
    for row in native['rows']:
        assert row['svg_sha256'] == expected[row['path']]
        assert not row['failures'] and abs(row['scale'] - row['expected_scale']) < .001
        assert row['min_font'] >= 8
    ui = evidence['ui-report.json']
    assert ui['sequence'] == [10, 14, 10, 14]
    assert all(ui[k] for k in ['canonical_ir_unchanged', 'default_svg_matches_cli',
                              'adaptive_svg_matches_cli', 'reopened_svg_matches_adaptive'])
    for ui_svg, cli_svg in [('ui-default.svg', 'BranchedMosaic-current.svg'),
                            ('ui-adaptive.svg', 'BranchedMosaic-adaptive.svg'),
                            ('ui-reopened.svg', 'BranchedMosaic-adaptive.svg')]:
        assert sha(OUT / ui_svg) == sha(OUT / cli_svg)
    for file, value in ui['files'].items():
        assert sha(OUT / file) == value
    for file, value in evidence['visual-review.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    assert sum(tests['counts'].values()) == 424
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['canonical_ir_unchanged'] and expansion['all_canonical_ids_visible']
    assert (expansion['visible_nodes'], expansion['visible_edges']) == (3371, 3663)
    rows = {row['name']: row for row in report['rows']}
    transformer = {}
    for name in ['transformer-before', 'transformer-current', 'transformer-adaptive']:
        row = rows[name]
        q = row['quality']
        transformer[name] = {'nodes': row['nodes'], 'edges': row['edges'],
                             'width': q['native_width_px'], 'height': q['native_height_px'],
                             'crossings': q['line_geometry']['crossings'],
                             'contacts': len(q['line_geometry']['unrelated_contacts'])}
    tradeoff = next(row for row in evidence['reservation-report.json']['comparisons'] if row['name'] == 'transformer-current')
    assert len(tradeoff['detailed_goals_hidden']) == 3
    supplemental = ['tools/audit_frontier_reservations.py', 'tools/audit_frontier_atlas.py',
                    'tools/build_frontier_reservation_review.py', 'tools/summarize_frontier_reservations.py',
                    'tools/summarize_publication_checks.py', 'docs/frontier-reservations.md',
                    'verification/frontier-reservations/current/README.md', 'verification/publication/active-stage.json']
    result = {
        'schema': 'frontier-reservation-validation/1', 'evidence_consistent': True, 'goal_complete': False,
        'tests': sum(tests['counts'].values()), 'svg_panels': len(report['rows']), 'atlas_panels': atlas['panels'],
        'native_texts': native['texts'], 'rectangle_texts': native['rect_texts'], 'ui_counts': ui['sequence'],
        'unchanged_svg_states': [row['name'] for row in evidence['reservation-report.json']['comparisons'] if row['svg_unchanged']],
        'transformer': transformer, 'detail_tradeoff': tradeoff,
        'raw_expansion': {'nodes': expansion['visible_nodes'], 'edges': expansion['visible_edges']},
        'evidence_sha256': {name: sha(OUT / name) for name in evidence},
        'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
        'limits': [
            'Logical-frontier reservation prevents incidental detail expansion. It is not global joint summary/detail optimization.',
            'Shared-result detail requires actual producer, every consumer and exact canonical slots. Structural resemblance cannot substitute concrete result identity.',
            'Transformer default hides three previously fulfilled detailed goals while preserving 32 exposed certified roles. Crossings increase 56 to 57; dedicated reference convergence is incomplete.',
            'General DAG summaries, summary-level expression goals, graph-set planning and dense routing remain incomplete.',
            'All extracted raw source nodes are reachable. Thousands-node simultaneous SVG routing and browser interaction performance remain unverified.'
        ]}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'atlas_panels', 'native_texts', 'ui_counts']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

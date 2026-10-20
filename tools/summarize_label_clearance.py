"""Validate this increment without promoting failed experiments to convergence."""
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/label-clearance/current'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def read(file):
    return json.loads(file.read_text())


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in report['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale implementation', file)
    frozen = ROOT / report['frozen_snapshot']
    assert sha(frozen) == report['frozen_snapshot_sha256']
    snapshot = read(frozen)
    for file, value in snapshot['files'].items():
        assert sha(frozen.parent / 'implementation' / file) == value
    assert sha(ROOT / report['prior_report']) == report['prior_report_sha256']
    for row in report['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        if row['comparison']:
            assert row['comparison']['unchanged'] and row['comparison']['svg_sha256'] == row['svg_sha256']
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    evidence = {name: read(OUT / name) for name in ['svg-report.json', 'clearance-report.json', 'receipt-report.json', 'ui-report.json', 'browser-text-report.json', 'visual-review.json']}
    for r in evidence.values():
        assert r['render_report_sha256'] == digest
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert all(evidence[f]['passed'] for f in ['clearance-report.json', 'receipt-report.json', 'ui-report.json'])
    browser = evidence['browser-text-report.json']
    assert not browser['failures'] and len(browser['results']) == len(report['rows'])
    assert {r['name']: (r['nodes'], r['paths']) for r in browser['results']} == {r['name']: (r['nodes'], r['edges']) for r in report['rows']}
    for file, value in evidence['ui-report.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    for row in evidence['visual-review.json']['screenshots']:
        assert sha(OUT / row['file']) == row['sha256']
    rows = {r['name']: r for r in report['rows']}
    assert rows['ForeignSignals-auto']['refinement']['accepted']
    rejected = {name: r['refinement'] for name, r in rows.items() if r['refinement'] and not r['refinement']['accepted']}
    assert set(rejected) == {'CrossedSignals-auto', 'transformer-local', 'transformer-selected', 'transformer-local-panel'}
    failed = {r['name']: r['quality']['issues'] for r in report['rows'] if r['quality']['issues']}
    assert set(failed) == {'transformer-local', 'transformer-local-candidate', 'transformer-selected', 'transformer-selected-candidate'}
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['source_nodes'] == expansion['visible_nodes'] == 3371
    assert expansion['source_edges'] == expansion['visible_edges'] == 3663
    assert expansion['all_canonical_ids_visible'] and expansion['canonical_ir_unchanged']
    supplemental = ['tools/build_label_clearance_review.py', 'tools/audit_label_clearance.py', 'tools/audit_label_clearance_ui.cjs',
                    'tools/audit_role_detail_receipts.py', 'tools/summarize_label_clearance.py', 'tools/summarize_publication_checks.py',
                    'docs/label-clearance.md', 'verification/label-clearance/current/README.md', 'verification/publication/active-stage.json', 'verification/label-clearance/current/source-expandability.json']
    result = {'schema': 'label-clearance-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': sum(tests['counts'].values()), 'svg_panels': len(rows), 'browser_texts': browser['texts'], 'contained_texts': browser['checked'],
              'raw_source_expansion': {'nodes': expansion['visible_nodes'], 'edges': expansion['visible_edges']},
              'prior_states_svg_unchanged': sum(bool(r['comparison']) for r in rows.values()), 'ui_nodes': evidence['ui-report.json']['node_counts'],
              'adopted': ['ForeignSignals-auto'], 'rejected': list(rejected), 'failed_geometry': failed,
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Transformer selected geometry is unchanged; reference convergence is unproved.',
                         'Whole-graph adaptive semantic selection remains incomplete.',
                         'The positive geometry fixture does not prove model extraction or semantic recognition.',
                         'Clearance is scoped per drawing parent; rank/channel refinement and horizontal label spacing remain incomplete.']}
    (OUT / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

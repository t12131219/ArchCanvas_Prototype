"""Validate the increment, distinguishing semantic checks from failed geometry."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-details/current'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def read(file):
    return json.loads(file.read_text())


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in report['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale producer', file)
    frozen = ROOT / report['frozen_snapshot']
    assert sha(frozen) == report['frozen_snapshot_sha256']
    snapshot = read(frozen)
    for file, value in snapshot['files'].items():
        assert sha(frozen.parent / 'implementation' / file) == value
    assert sha(ROOT / report['prior_report']) == report['prior_report_sha256']
    prior = {r['name']: r for r in read(ROOT / report['prior_report'])['rows']}
    for row in report['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        if row['baseline_svg']:
            assert row['svg_sha256'] == prior[row['baseline_svg']]['svg_sha256']
        if row.get('cached_output'):
            cache = row['cached_output']
            assert sha(ROOT / cache['report']) == cache['report_sha256']
            origin = read(ROOT / cache['report'])
            assert sha(ROOT / cache['producer']) == origin['implementation_sha256']['tools/audit_role_details.cjs']
            old = next(r for r in origin['rows'] if r['name'] == row['name'])
            assert all(old[k] == row[k] for k in ['state', 'input_sha256', 'svg_sha256', 'document_sha256'])
            for file, value in origin['implementation_sha256'].items():
                if file != 'tools/audit_role_details.cjs':
                    assert sha(ROOT / file) == value
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    evidence = [read(OUT / file) for file in ['svg-report.json', 'receipt-report.json', 'ui-report.json', 'browser-text-report.json', 'visual-review.json']]
    for r in evidence:
        assert r['render_report_sha256'] == digest
    assert all(r['passed'] for r in evidence[0]['results']) and evidence[1]['passed']
    assert not evidence[3]['failures']
    assert {r['name']: (r['nodes'], r['paths']) for r in evidence[3]['results']} == {r['name']: (r['nodes'], r['edges']) for r in report['rows']}
    for file, value in evidence[2]['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    for r in evidence[4]['screenshots']:
        assert sha(OUT / r['file']) == r['sha256']
    failed = {r['name']: r['quality']['issues'] for r in report['rows'] if r['quality']['issues']}
    assert failed == {'transformer-local': ['canvas-area-budget'], 'transformer-selected': ['canvas-area-budget', 'edge-path-overlap']}
    assert evidence[4]['failed_geometry'] == failed
    result = {'schema': 'role-details-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': sum(tests['counts'].values()), 'svg_panels': len(report['rows']), 'browser_texts': evidence[3]['texts'],
              'default_svg_unchanged': sum(bool(r['baseline_svg']) for r in report['rows']),
              'ui_nodes': evidence[2]['node_counts'], 'failed_geometry': failed,
              'limits': ['Whole-graph adaptive semantic selection remains incomplete.',
                         'Explicit canvas refinement preserves the requested detail and reports resource or route failures; it never silently falls back.',
                         'Reference correspondence and dense cross-region layout remain unproved.']}
    (OUT / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

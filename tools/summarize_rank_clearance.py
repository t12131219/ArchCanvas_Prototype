"""Bind current implementation, independent SVG checks, browser and UI evidence."""
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/rank-clearance/current'


def read(file):
    return json.loads(file.read_text())


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in report['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale implementation', file)
    frozen = ROOT / report['frozen_snapshot']
    assert sha(frozen) == report['frozen_snapshot_sha256']
    for file, value in read(frozen)['files'].items():
        assert sha(frozen.parent / 'implementation' / file) == value
    assert sha(ROOT / report['prior_report']) == report['prior_report_sha256']
    rows = {r['name']: r for r in report['rows']}
    for row in rows.values():
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    evidence = {name: read(OUT / name) for name in ['svg-report.json', 'rank-report.json', 'receipt-report.json', 'ui-report.json', 'browser-text-report.json', 'visual-review.json']}
    for r in evidence.values():
        assert r['render_report_sha256'] == digest
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert all(evidence[f]['passed'] for f in ['rank-report.json', 'receipt-report.json', 'ui-report.json'])
    browser = evidence['browser-text-report.json']
    assert not browser['failures'] and len(browser['results']) == len(rows)
    assert {r['name']: (r['nodes'], r['paths']) for r in browser['results']} == {r['name']: (r['nodes'], r['edges']) for r in rows.values()}
    for file, value in evidence['ui-report.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    for r in evidence['visual-review.json']['screenshots']:
        assert sha(OUT / r['file']) == r['sha256']
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['visible_nodes'] == expansion['source_nodes'] == 3371
    assert expansion['visible_edges'] == expansion['source_edges'] == 3663
    assert expansion['canonical_ir_unchanged'] and expansion['all_canonical_ids_visible']
    adopted = [n for n, r in rows.items() if r['rank_refinement'] and r['rank_refinement']['accepted']]
    assert {'ChannelChain-auto', 'CrossedSignals-auto', 'transformer-local-panel', 'transformer-local'} <= set(adopted)
    failed = {n: r['quality']['issues'] for n, r in rows.items() if r['quality']['issues']}
    supplements = ['tools/audit_rank_clearance.py', 'tools/audit_rank_clearance_ui.cjs', 'tools/build_rank_clearance_review.py',
                   'tools/summarize_rank_clearance.py', 'tools/summarize_publication_checks.py', 'tools/audit_source_expandability.cjs',
                   'docs/rank-clearance.md', 'verification/rank-clearance/current/README.md', 'verification/publication/active-stage.json']
    result = {'schema': 'rank-clearance-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': sum(tests['counts'].values()), 'svg_panels': len(rows), 'browser_texts': browser['texts'], 'contained_texts': browser['checked'],
              'adopted': adopted, 'failed_geometry': failed,
              'prior_states_svg_unchanged': sum(bool(r['comparison'] and r['comparison']['unchanged']) for r in rows.values()),
              'ui_nodes': evidence['ui-report.json']['node_counts'], 'raw_source_expansion': {'nodes': expansion['visible_nodes'], 'edges': expansion['visible_edges']},
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplements},
              'limits': ['Whole-graph semantic frontier selection and reference correspondence remain unproved.',
                         'Selected Transformer whole-graph geometry still has reported budget/route limitations.',
                         'Hand-authored geometry fixtures do not prove model extraction or semantic recognition.',
                         'Rank trials are bounded, vertical and greedy; they do not solve channel allocation or arbitrary dense geometry.',
                         'Complete raw-source projection is verified, not full SVG routing or browser performance for thousands of nodes.']}
    (OUT / 'validation.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

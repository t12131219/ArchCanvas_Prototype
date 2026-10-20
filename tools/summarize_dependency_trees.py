"""Report verified local progress without treating it as goal completion."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/dependency-trees/current'


def read(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in report['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale implementation', file)
    for row in report['rows']:
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
    evidence = {name: read(OUT / name) for name in ['svg-report.json', 'tree-report.json', 'receipt-report.json', 'native-text-report.json', 'ui-report.json', 'visual-review.json']}
    for name in ['svg-report.json', 'tree-report.json', 'receipt-report.json', 'native-text-report.json', 'visual-review.json']:
        assert evidence[name]['render_report_sha256'] == digest, ('stale evidence', name)
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert evidence['tree-report.json']['passed'] and evidence['receipt-report.json']['passed']
    native = evidence['native-text-report.json']
    assert len(native['rows']) == len(report['rows']) and not native['failures']
    assert all(r['scale'] == 1 and not r['failures'] for r in native['rows'])
    ui = evidence['ui-report.json']
    assert ui['sequence'] == [6, 11, 6, 11]
    assert ui['canonical_ir_unchanged'] and ui['folded_svg_matches_cli'] and ui['reopened_svg_matches_cli']
    assert sha(OUT / 'ui-folded.svg') == sha(OUT / 'MergeWeave-current.svg')
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
    rows = {r['name']: r for r in report['rows']}
    transformer = rows['transformer-current']
    q = transformer['quality']
    supplemental = ['tools/audit_dependency_trees.py', 'tools/build_dependency_tree_review.py', 'tools/summarize_dependency_trees.py',
                    'tools/summarize_publication_checks.py', 'docs/dependency-trees.md', 'verification/dependency-trees/current/README.md',
                    'verification/publication/active-stage.json']
    result = {'schema': 'dependency-tree-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': sum(tests['counts'].values()), 'svg_panels': len(report['rows']),
              'native_texts': native['texts'], 'rectangle_texts': native['rect_texts'], 'ui_counts': ui['sequence'],
              'unchanged_svg_states': [r['name'] for r in evidence['tree-report.json']['comparisons'] if r['svg_unchanged']],
              'transformer': {'nodes': transformer['nodes'], 'edges': transformer['edges'], 'width': q['native_width_px'],
                              'height': q['native_height_px'], 'crossings': q['line_geometry']['crossings'],
                              'contacts': len(q['line_geometry']['unrelated_contacts']),
                              'detail_tradeoff': next(r for r in evidence['tree-report.json']['comparisons'] if r['name'] == 'transformer-current')},
              'raw_expansion': {'nodes': expansion['visible_nodes'], 'edges': expansion['visible_edges']},
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Only bounded converging trees and attached parameter paths gain new summaries; general DAG and graph-set planning remain incomplete.',
                         'Closed summaries do not fulfill their internal detailed expression goals. No summary-level goal credit or joint coarsening/detail search is implemented.',
                         'Transformer local summaries preserve 32 exposed certified roles, but automatic adjacent detail increases total height. Reference logic and visual correspondence remain incomplete.',
                         'Large raw source projection is complete; routing and interactive performance of thousands of simultaneous SVG nodes remain unverified.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'native_texts', 'ui_counts']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

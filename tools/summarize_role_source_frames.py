"""Validate the measured helper-frame stage without claiming goal completion."""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from audit_input_dock_receipts import verify as verify_docks
from audit_role_source_frame_receipts import verify as verify_sources

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-source-frames/current'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name):
    return json.loads((OUT / name).read_text())


def main():
    render = read('render-report.json'); digest = sha(OUT / 'render-report.json')
    for file, expected in render['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale producer', file)
    checkpoint = ROOT / render['checkpoint']
    assert sha(checkpoint) == render['checkpoint_sha256']
    for file, expected in json.loads(checkpoint.read_text())['files'].items():
        assert sha(checkpoint.parent / 'implementation' / file) == expected
    assert sha(ROOT / render['reference']['file']) == render['reference']['sha256']
    assert sha(ROOT / render['extraction']) == render['extraction_sha256']
    extraction = read('extraction.json')
    assert not extraction['runtime_executed']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
    rows = {r['name']: r for r in render['rows']}
    assert len(rows) == 21
    for row in rows.values():
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        document = read(row['document']); tree = ET.parse(OUT / row['svg'])
        assert document['ir'] == json.loads((ROOT / row['input']).read_text())
        verify_docks(document, tree); verify_sources(document, tree)
        assert not row['quality']['issues'] and not row['quality']['line_geometry']['unrelated_contacts']
    for name in ['receipt-report.json', 'svg-report.json', 'native-text-report.json', 'ui-report.json', 'ui-svg-report.json']:
        assert read(name)['render_report_sha256'] == digest
    assert len(read('receipt-report.json')['rows']) == len(read('svg-report.json')['results']) == 21
    assert all(r['passed'] for r in read('receipt-report.json')['rows'] + read('svg-report.json')['results'])
    assert len(read('receipt-report.json')['comparisons']) == 10
    native = read('native-text-report.json')
    assert len(native['results']) == 28 and not native['failures']
    for file, expected in native['svg_sha256'].items():
        assert sha(OUT / file) == expected
    tests = read('test-report.json')
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    assert sum(tests['counts'].values()) == 520 and tests['counts']['role-source-frames'] == 8
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    for row in tests['commands']:
        log = (ROOT / 'verification/local-relations/current' / row['log']).read_text()
        pattern = r'Ran (\d+) tests?' if row['name'] == 'python' else r'ℹ tests (\d+)'
        assert int(re.search(pattern, log)[1]) == tests['counts'][row['name']]
        assert re.search(r'^OK$', log, re.M) if row['name'] == 'python' else re.search(r'^ℹ fail 0$', log, re.M)
    ui = read('ui-report.json')
    assert ui['generic_sequence'] == [19, 21, 19, 39, 19, 13, 19]
    assert all(ui[k] for k in ['saved_reopened', 'canonical_ir_unchanged', 'cli_svg_equal', 'exact_refold_svg'])
    for file, expected in ui['implementation_sha256'].items():
        assert sha(ROOT / file) == expected
    for file, expected in ui['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    assert read('ui-svg-report.json')['ui_report_sha256'] == sha(OUT / 'ui-report.json')
    assert len(read('ui-svg-report.json')['results']) == 4 and all(r['passed'] for r in read('ui-svg-report.json')['results'])
    for row in ui['rows']:
        assert sha(OUT / row['document']) == row['document_sha256'] and sha(OUT / row['svg']) == row['svg_sha256']
        assert not row['quality']['issues']
        document, tree = read(row['document']), ET.parse(OUT / row['svg'])
        verify_docks(document, tree); verify_sources(document, tree)
    assert [rows['SeparateStages-' + name]['nodes'] for name in ['main-current', 'path-before', 'path-current', 'all-before', 'all-current', 'source-frames']] == [13, 20, 19, 23, 20, 21]
    changed = [p['name'] for p in render['comparisons'] if not p['svg_unchanged']]
    assert changed == ['SeparateStages-path', 'SeparateStages-all']
    for name in ['transformer-main', 'transformer-fixed-path', 'transformer-fixed-core']:
        assert sha(OUT / (name + '-before.svg')) == sha(OUT / (name + '-current.svg'))
    source = read('source-expandability.json')
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert (source['visible_nodes'], source['visible_edges']) == (3371, 3663)
    assert sha(ROOT / source['input']) == source['input_sha256']
    visual = read('visual-review.json')
    assert visual['agent_viewed'] and not visual['goal_complete']
    for file, expected in visual['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    for file in ['comparison.html', 'transformer-comparison.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / file).read_text()
    names = ['render-report.json', 'receipt-report.json', 'svg-report.json', 'native-text-report.json', 'test-report.json', 'ui-report.json', 'ui-svg-report.json', 'visual-review.json', 'source-expandability.json']
    support = ['tools/audit_role_source_frame_receipts.py', 'tools/check_role_source_frame_svgs.py', 'tools/audit_role_source_frame_ui.cjs', 'tools/check_role_source_frame_ui_svgs.py',
        'tools/build_role_source_frame_review.py', 'tools/check_browser_svg_text.js', 'tools/summarize_role_source_frames.py', 'tools/summarize_publication_checks.py']
    result = {'schema': 'role-source-frames-validation/1', 'evidence_consistent': True, 'goal_complete': False, 'render_report_sha256': digest,
        'tests': 520, 'svg_panels': 21, 'additional_ui_svg_panels': 4, 'native_node_texts': sum(r['node_texts'] for r in native['results']),
        'native_edge_labels': sum(r['port_texts'] for r in native['results']), 'generic_sequence': ui['generic_sequence'],
        'comparisons': render['comparisons'],
        'raw_source_recovery': {'nodes': 3371, 'edges': 3663, 'full_routed_ui_performance_verified': False},
        'limitations': ['This stage improves one unfamiliar helper-separated role calculation; Transformer main/path/core SVGs are unchanged and remain far from dedicated-reference organization.',
            'FFN certification currently counts direct computations and fails across an ordinary activation helper; that real fixture deliberately remains unmodified.',
            'Full reference correspondence, joint main/detail planning, broader held-out state/control/routing combinations and thousands-node routed UI remain incomplete.',
            'One measured trial only, up to128 visible edges; source-frame mode, manual offsets or explicit configuration bypass automatic helper-frame trials.',
            'Unknown/effect/condition/identity/observation/repetition and independent certificates stay protected. Source attachment does not prove helper equivalence, purity or arbitrary execution coverage.',
            'Synchronous rendering can block UI;39 UI detail objects do not denote all97 raw source facts. Fixed-profile Transformer detail does not verify default automatic detail performance.'],
        'artifacts_sha256': {name: sha(OUT / name) for name in names}, 'supporting_tools_sha256': {file: sha(ROOT / file) for file in support}}
    (OUT / 'validation-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'additional_ui_svg_panels', 'native_node_texts', 'native_edge_labels']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

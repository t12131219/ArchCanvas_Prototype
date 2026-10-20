"""Validate current evidence without declaring overall reference convergence."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from audit_input_dock_receipts import verify

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-paths/current'


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
    assert sha(ROOT / extraction['input']) == extraction['input_sha256']
    assert len(render['rows']) == 21
    rows = {r['name']: r for r in render['rows']}
    for row in rows.values():
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        document = read(row['document'])
        assert document['ir'] == json.loads((ROOT / row['input']).read_text())
        verify(document, ET.parse(OUT / row['svg']))
        assert not row['quality']['issues'] and not row['quality']['line_geometry']['unrelated_contacts']
    for name in ['receipt-report.json', 'svg-report.json', 'native-text-report.json', 'ui-report.json', 'ui-svg-report.json']:
        assert read(name)['render_report_sha256'] == digest
    assert len(read('receipt-report.json')['rows']) == len(read('svg-report.json')['results']) == 21
    assert all(r['passed'] for r in read('receipt-report.json')['rows'] + read('svg-report.json')['results'])
    native = read('native-text-report.json')
    assert len(native['results']) == 27 and not native['failures']
    for file, expected in native['svg_sha256'].items():
        assert sha(OUT / file) == expected
    tests = read('test-report.json')
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    assert sum(tests['counts'].values()) == 512 and tests['counts']['role-paths'] == 9
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    ui = read('ui-report.json')
    assert ui['generic_sequence'] == [13, 20, 20, 13, 20, 40, 20, 13]
    assert all(ui[k] for k in ['saved_reopened', 'canonical_ir_unchanged', 'cli_svg_equal', 'exact_refold_svg'])
    for file, expected in ui['implementation_sha256'].items():
        assert sha(ROOT / file) == expected
    for file, expected in ui['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    assert read('ui-svg-report.json')['ui_report_sha256'] == sha(OUT / 'ui-report.json')
    assert len(read('ui-svg-report.json')['results']) == 2 and all(r['passed'] for r in read('ui-svg-report.json')['results'])
    for row in ui['rows']:
        assert sha(OUT / row['document']) == row['document_sha256']
        assert sha(OUT / row['svg']) == row['svg_sha256']
        assert not row['quality']['issues']
        verify(read(row['document']), ET.parse(OUT / row['svg']))
    assert [rows['SeparateStages-' + name]['nodes'] for name in ['main', 'path', 'all-roles', 'source-detail']] == [13, 20, 23, 38]
    for name in ['SeparateStages', 'SameSource']:
        assert sha(OUT / (name + '-main.svg')) == sha(OUT / (name + '-before.svg')) == sha(OUT / (name + '-refolded.svg'))
    for name in ['UnknownFusion', 'BrokenCell', 'ConditionalCarry']:
        assert sha(OUT / (name + '-before.svg')) == sha(OUT / (name + '-current.svg'))
    assert sha(OUT / 'transformer-main.svg') == sha(ROOT / 'verification/input-docks/current/transformer-current.svg')
    source = read('source-expandability.json')
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert (source['visible_nodes'], source['visible_edges']) == (3371, 3663)
    assert sha(ROOT / source['input']) == source['input_sha256']
    visual = read('visual-review.json')
    assert visual['agent_viewed'] and not visual['goal_complete']
    for file, expected in visual['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    names = ['render-report.json', 'receipt-report.json', 'svg-report.json', 'native-text-report.json', 'test-report.json', 'ui-report.json', 'ui-svg-report.json', 'visual-review.json', 'source-expandability.json']
    support = ['tools/build_role_path_review.py', 'tools/audit_role_path_ui.cjs', 'tools/check_role_path_ui_svgs.py', 'tools/check_role_path_svgs.py', 'tools/check_browser_svg_text.js', 'tools/summarize_role_paths.py']
    result = {'schema': 'role-paths-validation/1', 'evidence_consistent': True, 'goal_complete': False,
        'render_report_sha256': digest, 'tests': 512, 'svg_panels': 21, 'additional_ui_svg_panels': 2,
        'native_node_texts': sum(r['node_texts'] for r in native['results']), 'native_edge_labels': sum(r['port_texts'] for r in native['results']),
        'generic_sequence': ui['generic_sequence'], 'comparisons': render['comparisons'],
        'transformer': [{k: row[k] for k in ['name', 'nodes', 'edges']} | {'width': row['quality']['native_width_px'], 'height': row['quality']['native_height_px'], 'crossings': row['quality']['line_geometry']['crossings']} for row in rows.values() if row['name'].startswith('transformer-')],
        'raw_source_recovery': {'nodes': 3371, 'edges': 3663, 'full_routed_ui_performance_verified': False},
        'limitations': ['Transformer selected paths add substantial height and crossings; fixed-profile audit does not verify default automatic layout or performance.',
            'Source wrappers, long paths, full semantic/reference correspondence, joint main/detail planning, broader held-out state/control/routing combinations and thousands-node routed UI remain incomplete.',
            'Partial selection can expose other operations sharing source ancestry; endpoint/input-flow receipts do not certify complete computation or execution coverage.',
            'Current synchronous rendering can block UI. The audited UI Expand all state has 40 nodes; the separately selected CLI source state has 38. Neither denotes all 97 raw facts.'],
        'artifacts_sha256': {name: sha(OUT / name) for name in names}, 'supporting_tools_sha256': {file: sha(ROOT / file) for file in support}}
    (OUT / 'validation-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'additional_ui_svg_panels', 'native_node_texts', 'native_edge_labels']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

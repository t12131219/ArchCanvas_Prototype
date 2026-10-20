"""Validate same-source helper certification and reversible views, not completion."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
from audit_helper_contract_receipts import check_chain
from audit_input_dock_receipts import verify as verify_docks
from audit_role_source_frame_receipts import verify as verify_frames

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/helper-contracts/current'


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
    frozen = json.loads(checkpoint.read_text())
    assert frozen['commit'] == 'f61ed50cfcd4a70c7d91f1b5c4d29114e42f3a98' and len(frozen['files']) == 41
    for file, expected in frozen['files'].items():
        assert sha(checkpoint.parent / 'implementation' / file) == expected
        original = subprocess.check_output(['git', 'show', frozen['commit'] + ':' + file], cwd=ROOT)
        assert hashlib.sha256(original).hexdigest() == expected
    assert sha(ROOT / render['reference']['file']) == render['reference']['sha256']
    assert sha(ROOT / render['extraction']) == render['extraction_sha256']
    extraction = read('extraction.json')
    assert not extraction['runtime_executed'] and len(extraction['rows']) == 12
    facts = lambda ir: {k: v for k, v in ir.items() if k not in ['semantic_contracts', 'semantic_contract_basis', 'ir_digest']}
    for row in extraction['rows']:
        assert sha(ROOT / row['source']) == row['source_sha256']
        before, current = [json.loads((ROOT / row[s]['input']).read_text()) for s in ['before', 'current']]
        assert facts(before) == facts(current)
        for side in ['before', 'current']:
            assert sha(ROOT / row[side]['input']) == row[side]['sha256']
        for cert in current.get('semantic_contracts', []):
            if 'source_chain' in cert:
                check_chain(current, cert)
    rows = {r['name']: r for r in render['rows']}; assert len(rows) == 30
    for row in rows.values():
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        document = read(row['document']); tree = ET.parse(OUT / row['svg'])
        assert document['ir'] == json.loads((ROOT / row['input']).read_text())
        verify_docks(document, tree)
        if document['publication'].get('role_frontier'):
            verify_frames(document, tree)
        assert not row['quality']['issues'] and not row['quality']['line_geometry']['unrelated_contacts']
    for name in ['receipt-report.json', 'svg-report.json', 'native-text-report.json', 'ui-report.json', 'ui-svg-report.json']:
        assert read(name)['render_report_sha256'] == digest
    assert len(read('receipt-report.json')['rows']) == len(read('svg-report.json')['results']) == 30
    assert all(r['passed'] for r in read('receipt-report.json')['rows'] + read('svg-report.json')['results'])
    assert len(read('receipt-report.json')['extraction']) == 12
    native = read('native-text-report.json')
    assert len(native['results']) == 36 and not native['failures']
    for file, expected in native['svg_sha256'].items():
        assert sha(OUT / file) == expected
    tests = read('test-report.json')
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    assert sum(tests['counts'].values()) == 533 and tests['counts']['helper-contracts'] == 5 and tests['counts']['python'] == 119
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    for row in tests['commands']:
        log = (ROOT / 'verification/local-relations/current' / row['log']).read_text()
        pattern = r'Ran (\d+) tests?' if row['name'] == 'python' else r'ℹ tests (\d+)'
        assert int(re.search(pattern, log)[1]) == tests['counts'][row['name']]
        assert re.search(r'^OK$', log, re.M) if row['name'] == 'python' else re.search(r'^ℹ fail 0$', log, re.M)
    ui = read('ui-report.json')
    assert ui['generic_sequence'] == [6, 6, 9, 6, 17, 6]
    assert all(ui[k] for k in ['saved_reopened', 'canonical_ir_unchanged', 'cli_svg_equal', 'exact_return_svg'])
    for file, expected in ui['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    ui_svg = read('ui-svg-report.json')
    assert ui_svg['ui_report_sha256'] == sha(OUT / 'ui-report.json')
    assert len(ui_svg['results']) == 2 and all(r['passed'] for r in ui_svg['results'])
    assert ui_svg['raw_source']['all_canonical_ids_and_paths_verified']
    raw = read(ui['raw_document']); ir = read('SplitChain-current.json')
    assert raw['ir'] == ir and len(ir['nodes']) == 17 and len(ir['edges']) == 12
    for row in ui['rows']:
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        assert not row['quality']['issues']
        doc, tree = read(row['document']), ET.parse(OUT / row['svg'])
        verify_docks(doc, tree); verify_frames(doc, tree)
    for name in ['ui-compact', 'ui-reopened', 'ui-restored-compact', 'ui-returned']:
        assert sha(OUT / (name + '.svg')) == rows['SplitChain-current']['svg_sha256']
    assert sha(OUT / 'ui-source-frames.svg') == rows['SplitChain-source-frames']['svg_sha256']
    for pair in render['comparisons']:
        name = pair['name']
        if name in ['UnknownChain', 'ConditionalChain', 'MutableChain', 'EscapingChain', 'DisconnectedChain']:
            assert pair['svg_unchanged'] and sha(OUT / (name + '-before.svg')) == sha(OUT / (name + '-current.svg'))
        if name.startswith('transformer-'):
            a, b = [read(name + '-' + s + '.layout.json') for s in ['before', 'current']]
            for key in ['nodes', 'edges', 'labels', 'node_accounting', 'edge_accounting', 'representatives']:
                assert a['layout'][key] == b['layout'][key]
            trees = [ET.parse(OUT / (name + '-' + s + '.svg')) for s in ['before', 'current']]
            for tree in trees:
                for element in tree.iter():
                    if element.tag.rsplit('}', 1)[-1] in ['title', 'metadata']:
                        element.text = ''
            assert ET.tostring(trees[0].getroot()) == ET.tostring(trees[1].getroot())
            assert pair['geometry_unchanged'] and not pair['svg_unchanged']
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
    support = ['tools/audit_helper_contract_receipts.py', 'tools/check_helper_contract_svgs.py', 'tools/audit_helper_contract_ui.cjs', 'tools/check_helper_contract_ui_svgs.py',
        'tools/build_helper_contract_review.py', 'tools/check_helper_browser_text.js', 'tools/summarize_helper_contracts.py', 'tools/summarize_publication_checks.py']
    result = {'schema': 'helper-contracts-validation/1', 'evidence_consistent': True, 'goal_complete': False, 'render_report_sha256': digest,
        'tests': 533, 'svg_panels': 30, 'additional_ui_svg_panels': 2, 'native_node_texts': sum(r['node_texts'] for r in native['results']),
        'native_edge_labels': sum(r['port_texts'] for r in native['results']), 'generic_sequence': ui['generic_sequence'], 'comparisons': render['comparisons'],
        'raw_source_recovery': {'nodes': 3371, 'edges': 3663, 'full_routed_ui_performance_verified': False},
        'limitations': ['Transformer main/path/core geometry unchanged; evidence titles and metadata change, not visible organization. Dedicated-reference convergence remains incomplete.',
            'Whole unary chains only; no arbitrary helper purity or alias equivalence, state/control/routing certification or execution coverage.',
            'Joint main/detail planning, broader held-out mixed combinations and thousands-node routed UI remain incomplete. Synchronous rendering can block UI.',
            'Raw UI17 nodes12 edges verifies exact canonical IDs, positions and orthogonal routes; the full paper terminal/contact audit applies to the two semantic UI states.'],
        'artifacts_sha256': {name: sha(OUT / name) for name in names}, 'supporting_tools_sha256': {file: sha(ROOT / file) for file in support}}
    (OUT / 'validation-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'additional_ui_svg_panels', 'native_node_texts', 'native_edge_labels']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

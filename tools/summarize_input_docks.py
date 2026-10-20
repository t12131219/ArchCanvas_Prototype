"""Consolidate audited progress without claiming full reference convergence."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from audit_input_dock_receipts import verify

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/input-docks/current'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name):
    return json.loads((OUT / name).read_text())


def main():
    render = read('render-report.json'); digest = sha(OUT / 'render-report.json')
    for f, h in render['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    checkpoint = ROOT / render['checkpoint']
    assert sha(checkpoint) == render['checkpoint_sha256']
    for f, h in json.loads(checkpoint.read_text())['files'].items():
        assert sha(checkpoint.parent / 'implementation' / f) == h
    assert sha(ROOT / render['reference']['file']) == render['reference']['sha256']
    extraction = ROOT / render['extraction']; assert sha(extraction) == render['extraction_sha256']
    x = json.loads(extraction.read_text()); assert not x['runtime_executed'] and len(x['rows']) == 5
    assert sha(ROOT / x['source']) == x['source_sha256']
    for row in x['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
    assert len(render['rows']) == 20
    for row in render['rows']:
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        document = read(row['document'])
        verify(document, ET.parse(OUT / row['svg']))
        assert not row['quality']['line_geometry']['unrelated_contacts']
        # Known baseline label issue is retained in these rejected states.
        if row['quality']['issues']:
            assert row['name'].startswith('LateInputs-') and row['quality']['issues'] == ['port-label-requires-note']
    for f in ['receipt-report.json', 'svg-report.json', 'native-text-report.json', 'ui-report.json']:
        assert read(f)['render_report_sha256'] == digest
    assert len(read('receipt-report.json')['rows']) == len(read('svg-report.json')['results']) == 20
    native = read('native-text-report.json'); assert len(native['results']) == 22 and not native['failures']
    for f, h in native['svg_sha256'].items():
        assert sha(OUT / f) == h
    tests = read('test-report.json'); assert all(c['exit_code'] == 0 for c in tests['commands'])
    assert sum(tests['counts'].values()) == 503 and tests['counts']['input-docks'] == 7
    for f, h in tests['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale tests', f)
    ui = read('ui-report.json'); assert ui['generic_sequence'] == [38, 41, 41, 38] and ui['transformer_sequence'] == [86, 91, 86]
    assert ui['generic_saved_reopened'] and ui['canonical_ir_unchanged'] and ui['cli_svg_equal'] and ui['exact_refold_svg']
    for f, h in ui['artifacts_sha256'].items():
        assert sha(OUT / f) == h
    reconstruction = read('ui-reconstruction.json')
    for f, h in reconstruction['implementation_sha256'].items():
        assert sha(ROOT / f) == h
    assert sha(OUT / 'cli-transformer-opened.svg') == sha(OUT / 'ui-transformer-opened.svg') == reconstruction['svg_sha256']
    assert sha(OUT / 'cli-transformer-opened.layout.json') == reconstruction['document_sha256']
    assert sha(OUT / 'ui-transformer-opened.layout.json') == reconstruction['input_sha256']
    verify(read('cli-transformer-opened.layout.json'), ET.parse(OUT / 'ui-transformer-opened.svg'))
    verify(read('cli-ui-opened.layout.json'), ET.parse(OUT / 'ui-opened.svg'))
    recovery = read('source-expandability.json')
    assert recovery['all_canonical_ids_visible'] and recovery['canonical_ir_unchanged']
    assert (recovery['visible_nodes'], recovery['visible_edges']) == (3371, 3663)
    assert sha(ROOT / recovery['input']) == recovery['input_sha256']
    for c in render['comparisons']:
        assert c['frontier_and_facts_identical']
        if c['name'] in ['BraidedInputs', 'transformer']:
            assert c['refinement']['accepted'] and c['refinement']['facts_preserved']
            assert c['current']['wire'] <= c['before']['wire'] * .9
            assert c['current']['width'] > c['before']['width']
        else:
            assert c['svg_unchanged']
    visual = read('visual-review.json'); assert visual['agent_viewed'] and not visual['goal_complete']
    for f, h in visual['artifacts_sha256'].items():
        assert sha(OUT / f) == h
    result = {'schema': 'input-docks-validation/1', 'evidence_consistent': True, 'goal_complete': False,
        'render_report_sha256': digest, 'tests': 503, 'svg_panels': 20, 'additional_ui_svg_panels': 2,
        'native_node_texts': sum(r['node_texts'] for r in native['results']), 'native_edge_labels': sum(r['port_texts'] for r in native['results']),
        'generic_sequence': ui['generic_sequence'], 'transformer_sequence': ui['transformer_sequence'],
        'comparisons': [{k: v for k, v in c.items() if k != 'refinement'} for c in render['comparisons']],
        'raw_source_recovery': {'nodes': 3371, 'edges': 3663, 'full_routed_ui_performance_verified': False},
        'limitations': ['Full semantic/reference correspondence, source wrappers, long paths, joint main/detail planning, held-out state/control/routing combinations and large routed UI performance remain incomplete.',
            'Accepted candidates increase width/area; known LateInputs label note is retained; deeper BraidedInputs docking is rejected for two unplaced labels.',
            'Current synchronous rendering blocks browser operations. Large evidence-rich layout documents can exceed the 20MB UI import limit; compact IR/state documents work.'],
        'artifacts_sha256': {f: sha(OUT / f) for f in ['render-report.json', 'receipt-report.json', 'svg-report.json', 'native-text-report.json', 'test-report.json', 'ui-report.json', 'ui-reconstruction.json', 'visual-review.json', 'source-expandability.json']}}
    (OUT / 'validation-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'additional_ui_svg_panels', 'native_node_texts', 'native_edge_labels']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

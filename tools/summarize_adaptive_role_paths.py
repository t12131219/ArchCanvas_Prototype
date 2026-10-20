"""Verify stage evidence while keeping unfinished comparisons explicit."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
from audit_input_dock_receipts import verify as verify_docks
from audit_role_source_frame_receipts import verify as verify_frames

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-role-paths/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def read(name):
    return json.loads((OUT / name).read_text())


def main():
    report = read('render-report.json'); digest = sha(OUT / 'render-report.json')
    for file, expected in report['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale producer', file)
    checkpoint = ROOT / report['checkpoint']
    assert sha(checkpoint) == report['checkpoint_sha256']
    frozen = json.loads(checkpoint.read_text())
    assert frozen['commit'] == '1cd39e0e5e34ab2396157bfff989a0b49d75e70c' and len(frozen['files']) == 41
    for file, expected in frozen['files'].items():
        assert sha(checkpoint.parent / 'implementation' / file) == expected
        actual = subprocess.check_output(['git', 'show', frozen['commit'] + ':' + file], cwd=ROOT)
        assert hashlib.sha256(actual).hexdigest() == expected
    extraction = read('extraction.json')
    assert sha(OUT / 'extraction.json') == report['extraction_sha256'] and not extraction['runtime_executed']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
    rows = {row['name']: row for row in report['rows']}
    assert len(rows) in [20, 22]
    documents = {}
    for row in rows.values():
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        document, tree = read(row['document']), ET.parse(OUT / row['svg'])
        assert document['ir'] == json.loads((ROOT / row['input']).read_text())
        verify_docks(document, tree); verify_frames(document, tree)
        assert not row['quality']['issues'] and not row['quality']['line_geometry']['unrelated_contacts']
        a = row.get('adaptive')
        if a:
            assert len(a['attempts']) <= a['measurement_limit'] == 3
            assert len(a['preflights']) <= a['preflight_limit'] == 36
            assert a['selected'] == a['baseline'] or any(t['accepted'] for t in a['attempts'])
        documents[row['name']] = document
    for name in ['BoundedWeave', 'MixedBoundary', 'ConditionalWeave']:
        row = rows[name + '-current']; adaptive = row['adaptive']
        assert len(adaptive['selected_role_paths']) == 2 and not adaptive['selected_role_details']
        whole = next(t for t in adaptive['attempts'] if t['opportunity']['kind'] == 'roles')
        assert not whole['eligible'] and 'disproportionate-area-cost' in whole['reasons']
        q = rows[name + '-whole-trial']['quality']
        assert whole['candidate']['width'] == q['native_width_px'] and whole['candidate']['height'] == q['native_height_px']
        actual = documents[name + '-current']['publication']['role_frontier']['path_requests']
        assert all(r['status'] == 'exposed' and r['operand_check']['status'] == 'fulfilled' for r in actual)
        before, after = [documents[name + '-' + s] for s in ['before', 'current']]
        canonical = {n['id']: n for n in before['ir']['nodes']}
        boundaries = lambda d: {n['id'] for n in d['layout']['nodes'] if n['id'] in canonical and
            (canonical[n['id']]['kind'] in ['opaque', 'control'] or canonical[n['id']].get('condition'))}
        assert boundaries(before) <= boundaries(after)
        for edge in after['layout']['edges']:
            if edge['id'] in {e['id'] for e in after['ir']['edges']}:
                original = next(e for e in after['ir']['edges'] if e['id'] == edge['id'])
                assert edge.get('condition') == original.get('condition')
    for name in ['SameSource', 'SeparateStages', 'UnknownFusion']:
        assert rows[name + '-before']['svg_sha256'] == rows[name + '-current']['svg_sha256']
    assert rows['BoundedWeave-main-before']['svg_sha256'] == rows['BoundedWeave-main-current']['svg_sha256']
    assert rows['BoundedWeave-current']['svg_sha256'] == rows['BoundedWeave-manual-paths']['svg_sha256']
    for name in ['receipt-report.json', 'svg-report.json', 'native-text-report.json', 'ui-report.json', 'ui-svg-report.json']:
        assert read(name)['render_report_sha256'] == digest
    assert len(read('receipt-report.json')['rows']) == len(read('svg-report.json')['results']) == len(rows)
    assert all(r['passed'] for r in read('receipt-report.json')['rows'] + read('svg-report.json')['results'])
    tests = read('test-report.json')
    assert sum(tests['counts'].values()) == 543 and tests['counts']['adaptive-role-paths'] == 6 and tests['counts']['route-memoization'] == 4
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    for row in tests['commands']:
        assert row['exit_code'] == 0
        log = (ROOT / 'verification/local-relations/current' / row['log']).read_text()
        pattern = r'Ran (\d+) tests?' if row['name'] == 'python' else r'ℹ tests (\d+)'
        assert int(re.search(pattern, log)[1]) == tests['counts'][row['name']]
        assert re.search(r'^OK$', log, re.M) if row['name'] == 'python' else re.search(r'^ℹ fail 0$', log, re.M)
    native = read('native-text-report.json')
    assert len(native['results']) == len(rows) + 6 and not native['failures']
    for file, expected in native['svg_sha256'].items():
        assert sha(OUT / file) == expected
    ui = read('ui-report.json'); assert ui['generic_sequence'] == [28, 28, 25, 13, 144, 28]
    assert all(ui[k] for k in ['saved_reopened', 'canonical_ir_unchanged', 'cli_svg_equal', 'exact_return_svg'])
    assert len(ui['selected_paths']) == 2 and len(ui['retained_manual_paths']) == 1
    for file, expected in ui['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    svg_ui = read('ui-svg-report.json')
    assert svg_ui['ui_report_sha256'] == sha(OUT / 'ui-report.json')
    assert len(svg_ui['results']) == 2 and all(r['passed'] for r in svg_ui['results'])
    assert svg_ui['raw_source']['all_canonical_ids_and_paths_verified']
    for row in ui['rows']:
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
    source = read('source-expandability.json')
    assert source['canonical_ir_unchanged'] and source['all_canonical_ids_visible']
    assert (source['visible_nodes'], source['visible_edges']) == (3371, 3663)
    assert sha(ROOT / source['input']) == source['input_sha256']
    visual = read('visual-review.json')
    assert visual['agent_viewed'] and not visual['goal_complete']
    for file, expected in visual['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    for file in ['comparison.html', 'transformer-comparison.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / file).read_text()
    pending = [] if 'transformer-current' in rows else ['transformer-default-adaptive-comparison']
    if not pending:
        assert 'transformer-before' in rows
    files = ['render-report.json', 'receipt-report.json', 'svg-report.json', 'native-text-report.json', 'test-report.json', 'ui-report.json', 'ui-svg-report.json', 'visual-review.json', 'source-expandability.json']
    support = ['tools/summarize_adaptive_role_paths.py', 'tools/summarize_publication_checks.py', 'tools/build_adaptive_role_path_review.py', 'tools/render_adaptive_role_transformer.cjs']
    result = {'schema': 'adaptive-role-paths-validation/1', 'evidence_consistent': True, 'goal_complete': False, 'pending_checks': pending,
        'render_report_sha256': digest, 'tests': sum(tests['counts'].values()), 'svg_panels': len(rows), 'additional_ui_svg_panels': 2,
        'native_node_texts': sum(r['node_texts'] for r in native['results']), 'native_edge_labels': sum(r['port_texts'] for r in native['results']),
        'generic_sequence': ui['generic_sequence'], 'comparisons': report['comparisons'],
        'limitations': ['Partial role paths improve local granularity, not global summary/detail optimization or complete dedicated-reference convergence.',
            'More detail increases height; MixedBoundary crossings rise from1 to3. Index-only role captions and long context paths remain visual issues.',
            'Three measured trials and36 preflights do not bound wall-clock time. Transformer synchronous rendering remains expensive.',
            '144-node145-edge raw UI and3371-node3663-edge raw projection do not verify thousands-node SVG routing or UI performance.',
            'Broader held-out mixtures of state, routing and effects remain incomplete.'],
        'artifacts_sha256': {file: sha(OUT / file) for file in files}, 'supporting_tools_sha256': {file: sha(ROOT / file) for file in support}}
    (OUT / 'validation-report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'pending_checks', 'tests', 'svg_panels', 'native_node_texts', 'native_edge_labels']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

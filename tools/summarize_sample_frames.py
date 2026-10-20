"""Validate representative-frame evidence without declaring the full goal done."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/sample-frames/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, expected in report['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale implementation', file)
    for key in ['checkpoint', 'extraction']:
        assert sha(ROOT / report[key]) == report[key + '_sha256']
    checkpoint = read(ROOT / report['checkpoint'])
    for file, expected in checkpoint['files'].items():
        assert sha(ROOT / Path(report['checkpoint']).parent / 'implementation' / file) == expected
    extraction = read(ROOT / report['extraction'])
    assert not extraction['runtime_executed'] and report['inputs_reused']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for key in ['ir', 'before_ir']:
        assert sha((ROOT / report['extraction']).parent / extraction[key]) == extraction[key + '_sha256']
    assert len(report['rows']) == 16 and len(report['comparisons']) == 8
    rows = {r['name']: r for r in report['rows']}
    for row in report['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        assert not row['quality']['issues']
        assert not row['quality']['line_geometry']['unrelated_contacts']
    for c in report['comparisons']:
        assert c['facts_and_expressions_identical']
        before, after = [rows[c['name'] + '-' + suffix] for suffix in ['before', 'current']]
        a, b = [read(OUT / r['document']) for r in [before, after]]
        assert a['ir'] == b['ir']
        assert a['publication']['open'] == b['publication']['open']
        attached = set(c['attached_samples'])
        assert sorted(n['id'] for n in a['layout']['nodes'] if n['id'] not in attached) == sorted(n['id'] for n in b['layout']['nodes'])
        edge_fields = ['id', 'source', 'target', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'bundle_members']
        facts = lambda d: [{k: e.get(k) for k in edge_fields} for e in d['layout']['edges']]
        assert facts(a) == facts(b)
        assert a['layout']['edge_accounting'] == b['layout']['edge_accounting']
        for key in b['layout']['node_accounting']:
            assert [i for i in a['layout']['node_accounting'][key] if i not in attached] == [i for i in b['layout']['node_accounting'][key] if i not in attached]
        assert attached <= set(a['layout']['node_accounting']['visible'])
        assert attached <= set(b['layout']['node_accounting']['attached'])
        for field in ['expression_coverage', 'summary_coverage']:
            assert a[field] == b[field]
        for field in ['role_frontier', 'boundary']:
            assert a['publication'].get(field) == b['publication'].get(field)
        for field, values in [('node_accounting', b['ir']['nodes']), ('edge_accounting', b['ir']['edges'])]:
            accounted = [item for bucket in b['layout'][field].values() for item in bucket]
            assert len(accounted) == len(set(accounted))
            assert set(accounted) == {item['id'] for item in values}
        assert c['svg_unchanged'] == ((OUT / before['svg']).read_bytes() == (OUT / after['svg']).read_bytes())
        if c['refinement'] and c['refinement']['accepted']:
            refinement = c['refinement']
            x, y = refinement['before'], refinement['candidate']
            assert refinement['facts_preserved'] and y['area'] < x['area'] * .98
            assert y['height'] <= x['height'] and y['width'] <= x['width'] and y['wire_length'] <= x['wire_length']
            assert all(y[k] <= x[k] for k in ['crossings', 'contacts', 'overlaps', 'unplaced_labels'])
            assert all(set(refinement['realized_before'][k]) <= set(refinement['realized_candidate'][k]) for k in ['entries', 'columns', 'contexts'])
    evidence_names = ['svg-report.json', 'receipt-report.json', 'native-text-report.json', 'ui-report.json', 'visual-review.json']
    evidence = {name: read(OUT / name) for name in evidence_names}
    for name, item in evidence.items():
        assert item['render_report_sha256'] == digest, ('stale evidence', name)
    assert len(evidence['svg-report.json']['results']) == 16
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert evidence['receipt-report.json']['passed'] and len(evidence['receipt-report.json']['results']) == 16
    native = evidence['native-text-report.json']
    assert len(native['rows']) == 16 and not native['failures']
    assert native['texts'] == sum(r['texts'] for r in native['rows']) == 624
    assert native['port_texts'] == sum(len(r['labels']) for r in native['port_rows']) == 16
    assert not native['port_failures']
    for row in native['rows']:
        assert sha(OUT / row['path']) == row['svg_sha256']
        assert row['shape_texts'] == row['texts'] and row['scale'] == 1 and row['min_font'] >= 13 and not row['failures']
    ui = evidence['ui-report.json']
    assert ui['implementation_sha256'] == report['implementation_sha256']
    assert ui['verifier_sha256'] == sha(ROOT / 'tools/verify_sample_frame_ui.cjs')
    assert ui['repeat_sequence'] == [9, 12, 12, 9] and ui['transformer_sequence'] == [87, 92, 87]
    assert ui['source_frame_count'] == 11
    assert all(ui[k] for k in ['canonical_ir_unchanged', 'cli_svg_identical', 'main_svg_restored', 'saved_detail_reopened', 'final_code_reload_verified'])
    assert ui['transformer_import']['canonical_nodes'] == 3371 and ui['transformer_import']['bytes'] < 20_000_000
    for name in ['ui-report.json', 'visual-review.json']:
        for file, expected in evidence[name]['artifacts_sha256'].items():
            assert sha(OUT / file) == expected
    for file in ['comparison.html', 'transformer-comparison.html', 'text-qa.html']:
        assert f'content="{digest}"' in (OUT / file).read_text()
    recovery = read(OUT / 'source-expandability.json')
    assert sha(ROOT / recovery['input']) == recovery['input_sha256']
    assert recovery['canonical_ir_unchanged'] and recovery['all_canonical_ids_visible']
    assert (recovery['visible_nodes'], recovery['visible_edges']) == (3371, 3663)
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    assert sum(tests['counts'].values()) == 489 and tests['counts']['sample-frames'] == 8
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    reference = ROOT / 'verification/generic-convergence/current/reference-expanded.svg'
    assert sha(reference) == evidence['visual-review.json']['reference_sha256']
    supplemental = ['tools/build_sample_frame_review.py', 'tools/summarize_sample_frames.py',
                    'tools/summarize_publication_checks.py', 'tools/verify_sample_frame_ui.cjs',
                    'tools/render_sample_frame_review.py', 'tools/audit_source_expandability.cjs',
                    'docs/sample-frames.md', 'docs/semantic-folding-levels.md', 'verification/sample-frames/README.md',
                    'verification/publication/active-stage.json']
    result = {'schema': 'sample-frame-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': 489, 'svg_panels': 16, 'native_texts': native['texts'],
              'repeat_sequence': ui['repeat_sequence'], 'transformer_sequence': ui['transformer_sequence'],
              'comparisons': [{k: c[k] for k in ['name', 'facts_and_expressions_identical', 'svg_unchanged', 'before', 'current']} for c in report['comparisons']],
              'render_report_sha256': digest, 'evidence_sha256': {name: sha(OUT / name) for name in evidence_names},
              'test_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'expansion_report_sha256': sha(OUT / 'source-expandability.json'),
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['Removing redundant sample frames adds no semantic certification or direct detail coverage; main correspondence to the dedicated reference remains incomplete.',
                         'Remaining crossings, source frames, condition wrappers and long paths limit reading.',
                         'Global joint fold/detail selection and broader held-out state/control/routing combinations remain incomplete.',
                         'Thousands-node routed UI performance is unverified; actual editor rendering/export also caused transient observation timeouts.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'native_texts', 'repeat_sequence', 'transformer_sequence']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

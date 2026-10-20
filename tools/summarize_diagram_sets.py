"""Validate the current diagram-set evidence while retaining the full goal."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/diagram-set/current'
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
    assert not extraction['runtime_executed'] and len(extraction['rows']) == 2
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
    assert len(report['sets']) == 6 and len(report['rows']) == 21
    for row in report['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        assert not row['quality']['issues'] and not row['quality']['line_geometry']['unrelated_contacts']
    for entry in report['sets']:
        assert sha(OUT / entry['manifest']) == entry['manifest_sha256']
        assert sha(OUT / entry['baseline']) == entry['baseline_sha256']
        assert (OUT / entry['baseline']).read_bytes() == (OUT / entry['main_svg']).read_bytes()
        m = read(OUT / entry['manifest'])
        assert entry['goals'] == len(m['coverage']) and entry['deferred'] == len(m['deferred_goals'])
        assert entry['fulfilled'] == sum(c['status'] == 'fulfilled' for c in m['coverage'])
        assert len(m['panels']) <= m['limits']['max_panels'] and len(m['attempts']) <= m['limits']['max_trials']
        assert entry['complete'] == m['complete'] == (not m['deferred_goals'])
    evidence_names = ['svg-report.json', 'receipt-report.json', 'assignment-report.json', 'native-text-report.json', 'ui-report.json', 'visual-review.json']
    evidence = {name: read(OUT / name) for name in evidence_names}
    for name, item in evidence.items():
        assert item['render_report_sha256'] == digest, ('stale evidence', name)
    assert len(evidence['svg-report.json']['results']) == 21 and all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert evidence['receipt-report.json']['passed'] and len(evidence['receipt-report.json']['results']) == 21
    assignment = evidence['assignment-report.json']
    assert assignment['passed'] and len(assignment['results']) == 6
    assert assignment['auditor_sha256'] == sha(ROOT / 'tools/audit_diagram_assignments.py')
    native = evidence['native-text-report.json']
    assert len(native['rows']) == 21 and not native['failures']
    assert native['texts'] == sum(r['texts'] for r in native['rows'])
    for r in native['rows']:
        expected = next(row for row in report['rows'] if row['svg'] == r['path'])
        assert r['svg_sha256'] == expected['svg_sha256']
        assert r['shape_texts'] == r['texts'] and r['scale'] == 1 and r['min_font'] >= 12 and not r['failures']
    ui = evidence['ui-report.json']
    assert ui['implementation_sha256'] == report['implementation_sha256']
    assert ui['sequence'] == [20, 7, 7, 20]
    assert all(ui[k] for k in ['canonical_ir_unchanged', 'main_state_restored', 'main_svg_restored', 'saved_detail_reopened', 'shared_planner_matches', 'cli_svg_identical', 'final_code_reload_verified'])
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
    assert sum(tests['counts'].values()) == 474 and tests['counts']['diagram-set'] == 9
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    reference = ROOT / 'verification/generic-convergence/current/reference-expanded.svg'
    assert sha(reference) == evidence['visual-review.json']['reference_sha256']
    supplemental = ['tools/build_diagram_set_review.py', 'tools/summarize_diagram_sets.py', 'tools/summarize_publication_checks.py',
                    'tools/audit_diagram_assignments.py', 'tools/verify_diagram_set_ui.cjs', 'tools/render_diagram_set_review.py', 'docs/diagram-set.md',
                    'verification/diagram-set/README.md', 'verification/publication/active-stage.json']
    result = {'schema': 'diagram-set-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests': 474, 'svg_panels': 21, 'native_texts': native['texts'], 'ui_sequence': ui['sequence'],
              'sets': [{k: s[k] for k in ['name', 'panels', 'goals', 'main_fulfilled', 'fulfilled', 'deferred']} for s in report['sets']],
              'render_report_sha256': digest, 'evidence_sha256': {name: sha(OUT / name) for name in evidence_names},
              'test_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'supplemental_sha256': {file: sha(ROOT / file) for file in supplemental},
              'limits': ['All six main SVGs are unchanged; main intermediate reference convergence remains incomplete.',
                         'Bounded local diagram assignment is not global joint fold/detail optimization or complete coverage.',
                         'Broader held-out mixed state/control/routing combinations and thousands-node UI performance remain unverified.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'goal_complete', 'tests', 'svg_panels', 'native_texts', 'ui_sequence']}))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

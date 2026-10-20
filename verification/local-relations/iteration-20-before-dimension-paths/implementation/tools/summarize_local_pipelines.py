#!/usr/bin/env python3
"""Validate this stage's current evidence, without declaring the full goal done."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/local-pipelines/current'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def main():
    render = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in render['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale producer', file)
    snapshot = ROOT / render['frozen_snapshot']
    assert sha(snapshot) == render['frozen_snapshot_sha256']
    for file, value in read(snapshot)['files'].items():
        assert sha(snapshot.parent / 'implementation' / file) == value
    extraction = read(ROOT / render['extraction'])
    assert sha(ROOT / render['extraction']) == render['extraction_sha256']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    fixtures = read(OUT / 'fixture-extraction.json')
    assert not fixtures['runtime_executed']
    for key in ['source', 'producer']:
        assert sha(ROOT / fixtures[key]) == fixtures[key + '_sha256']
    for row in fixtures['rows']:
        assert sha(ROOT / row['ir']) == row['ir_sha256']
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    for command in tests['commands']:
        assert command['exit_code'] == 0
        log = (ROOT / 'verification/local-relations/current' / command['log']).read_text()
        count = re.search(r'Ran (\d+) tests?' if command['name'] == 'python' else r'ℹ tests (\d+)', log)
        assert count and int(count[1]) == tests['counts'][command['name']]
    independent, browser, ui, visual = [read(OUT / name) for name in ['svg-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json']]
    for receipt in [independent, browser, ui, visual]:
        assert receipt['render_report_sha256'] == digest
    assert all(r['passed'] for r in independent['results']) and not browser['failures']
    assert {r['name']: (r['nodes'], r['paths']) for r in browser['results']} == {r['name']: (r['nodes'], r['edges']) for r in render['rows']}
    rows = {r['name']: r for r in render['rows']}
    for row in render['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        doc = read(OUT / row['document'])
        assert row.get('local_pipelines') == doc['publication'].get('local_pipelines')
        for key, objects in [('node_accounting', doc['ir']['nodes']), ('edge_accounting', doc['ir']['edges'])]:
            ids = [i for bucket in doc['layout'][key].values() for i in bucket]
            assert len(ids) == len(set(ids)) and set(ids) == {i['id'] for i in objects}
    for ref in render['reference']:
        for key in ['svg', 'raw_dom', 'graph']:
            assert sha(ROOT / ref[key]) == ref[key + '_sha256']
    for receipt in [ui, visual]:
        for file, value in receipt['artifacts_sha256'].items():
            assert sha(OUT / file) == value
    assert ui['node_counts'] == [7, 10, 10, 7]
    assert all(ui[k] for k in ['svg_matches_cli', 'canonical_unchanged', 'reopened', 'save_reopen_deterministic', 'refold_same_svg', 'summary_inspected', 'bindings_preserved'])
    assert not any(ui['quality_issues']) and not visual['goal_complete']
    summaries = lambda row: (row.get('local_pipelines') or {}).get('rows', [])
    for name, expected in [('PipelineMosaic', 2), ('InterruptedPipeline', 1), ('EscapingPipeline', 1)]:
        before, after = [rows[name + '-' + mode] for mode in ['before', 'roles']]
        assert len(summaries(after)) == expected and not summaries(before)
        assert (before['nodes'], before['edges']) == (after['nodes'], after['edges'])
        assert not after['quality']['issues']
        a, b = [read(OUT / r['document']) for r in [before, after]]
        assert a['ir'] == b['ir']
        assert a['layout']['edges'] == b['layout']['edges']
        if name != 'PipelineMosaic':
            # Verify the affected helper is not summarized, while its unaffected
            # sibling remains eligible. Labels here select evaluation objects.
            blocked = 'self.weight' if name == 'InterruptedPipeline' else 'self.smooth'
            ids = {n['id'] for n in b['architecture']['nodes'] if n.get('label') == blocked}
            assert ids and not ids.intersection(r['node'] for r in summaries(after))
    before, after = [rows['transformer-' + mode] for mode in ['before', 'roles']]
    assert (before['nodes'], before['edges']) == (after['nodes'], after['edges']) == (105, 111)
    assert len(summaries(after)) == 9 and all(r['status'] == 'summary' for r in summaries(after))
    assert before['quality']['line_geometry']['crossings'] == after['quality']['line_geometry']['crossings'] == 57
    reference = read(ROOT / 'snapshots/transformer_programmatic_guide/generated/semantic_ir.json')
    ir = read(ROOT / after['input'])
    source = next(s for s in ir['sources'] if s['sha256'] == reference['source_sha256'])
    assert sha(Path(source['physical'])) == reference['source_sha256']
    result = {'schema': 'local-pipelines-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests_passed': sum(tests['counts'].values()), 'test_counts': tests['counts'], 'svg_panels': len(rows),
              'browser_text_failures': 0, 'ui_nodes': ui['node_counts'], 'source_sha256': reference['source_sha256'],
              'transformer': {'summaries': 9, 'nodes': after['nodes'], 'edges': after['edges'],
                              'height_before_after': [before['quality']['native_height_px'], after['quality']['native_height_px']],
                              'crossings': 57, 'reference_frontier_match': False},
              'reports_sha256': {f: sha(OUT / f) for f in ['render-report.json', 'svg-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json', 'fixture-extraction.json']},
              'tools_sha256': {f: sha(ROOT / 'tools' / f) for f in ['audit_local_svg.py', 'audit_pipeline_ui.cjs', 'summarize_local_pipelines.py', 'build_inline_review.py', 'check_pipeline_fixture_extraction.py']},
              'tests_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'), 'remaining': render['remaining']}
    (OUT / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

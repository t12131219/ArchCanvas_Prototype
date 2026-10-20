#!/usr/bin/env python3
"""Validate current certified-stage evidence; do not declare the wider goal done."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/contract-stages/current'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in report['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale producer', file)
    snapshot = ROOT / report['frozen_snapshot']
    assert sha(snapshot) == report['frozen_snapshot_sha256']
    frozen = read(snapshot)
    for file, value in frozen['files'].items():
        assert sha(snapshot.parent / 'implementation' / file) == value
    assert sha(ROOT / frozen['prior_report']) == frozen['prior_report_sha256']
    prior = read(ROOT / frozen['prior_report'])
    for file, value in prior['implementation_sha256'].items():
        assert frozen['files'][file] == value
    extraction = read(ROOT / report['extraction'])
    assert sha(ROOT / report['extraction']) == report['extraction_sha256']
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
    independent, browser, ui, visual = [read(OUT / f) for f in ['svg-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json']]
    for receipt in [independent, browser, ui, visual]:
        assert receipt['render_report_sha256'] == digest
    assert all(r['passed'] for r in independent['results']) and not browser['failures']
    assert {r['name']: (r['nodes'], r['paths']) for r in browser['results']} == {r['name']: (r['nodes'], r['edges']) for r in report['rows']}
    rows = {r['name']: r for r in report['rows']}
    for row in report['rows']:
        assert not row['quality']['issues'], ('geometry', row['name'])
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        if row.get('baseline_receipt'):
            receipt = row['baseline_receipt']
            assert receipt['report_sha256'] == frozen['prior_report_sha256']
            original = next(r for r in prior['rows'] if r['name'] == receipt['row'])
            assert original['svg_sha256'] == row['svg_sha256'] and original['document_sha256'] == row['document_sha256']
            assert original['input_sha256'] == row['input_sha256'] and original['state'] == row['state']
        doc = read(OUT / row['document'])
        assert row.get('contract_stages') == doc['publication'].get('contract_stages')
        for key, objects in [('node_accounting', doc['ir']['nodes']), ('edge_accounting', doc['ir']['edges'])]:
            ids = [i for bucket in doc['layout'][key].values() for i in bucket]
            assert len(ids) == len(set(ids)) and set(ids) == {i['id'] for i in objects}
        for stage in (doc['publication'].get('contract_stages') or {}).get('rows', []):
            assert 'bypass' not in stage
            constraint = next(c for c in doc['layout']['constraint_receipts'] if c['id'] == stage['bypass_constraint'])
            assert constraint['evidence']['certificate'] == stage['certificate']
    for ref in report['reference']:
        for key in ['svg', 'raw_dom', 'graph']:
            assert sha(ROOT / ref[key]) == ref[key + '_sha256']
    for receipt in [ui, visual]:
        for file, value in receipt['artifacts_sha256'].items():
            assert sha(OUT / file) == value
    assert ui['node_counts'] == [11, 13, 13, 11, 15]
    assert all(ui[k] for k in ['svg_matches_cli', 'canonical_unchanged', 'reopened', 'save_reopen_deterministic', 'refold_same_svg', 'stage_inspected', 'bindings_preserved', 'all_stages_expanded'])
    assert not any(ui['quality_issues']) and not visual['goal_complete']
    for name, count in [('TailChain', 2), ('TailMosaic', 2), ('EscapingTail', 1), ('InterruptedTail', 1), ('ConditionalTail', 1), ('ImageResidual', 1), ('VectorResidual', 0)]:
        row = rows[name + '-roles']
        stages = row['contract_stages']['rows']
        assert len(stages) == count and all(s['status'] == 'summary' for s in stages)
        before, after = [read(OUT / rows[name + '-' + mode]['document']) for mode in ['before', 'roles']]
        assert before['ir'] == after['ir']
        conflicts = lambda d: {c['id'] for c in d['layout']['constraint_receipts'] if c['status'] == 'conflict'}
        assert conflicts(after) <= conflicts(before), ('new constraint conflict', name, conflicts(after) - conflicts(before))
    before, after = [rows['transformer-' + mode] for mode in ['before', 'roles']]
    stage_rows = after['contract_stages']['rows']
    assert len(stage_rows) == 30 and sum(s['status'] == 'summary' for s in stage_rows) == 5
    assert (before['nodes'], before['edges']) == (105, 111)
    assert (after['nodes'], after['edges']) == (100, 106)
    reference = read(ROOT / 'snapshots/transformer_programmatic_guide/generated/semantic_ir.json')
    ir = read(ROOT / after['input'])
    source = next(s for s in ir['sources'] if s['sha256'] == reference['source_sha256'])
    assert sha(Path(source['physical'])) == reference['source_sha256']
    result = {'schema': 'contract-stages-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests_passed': sum(tests['counts'].values()), 'svg_panels': len(rows), 'browser_text_failures': 0,
              'ui_nodes': ui['node_counts'], 'source_sha256': reference['source_sha256'],
              'transformer': {'candidate_stages': 30, 'visible_stages': 5, 'nodes_before_after': [before['nodes'], after['nodes']],
                              'edges_before_after': [before['edges'], after['edges']],
                              'size_before_after': [[r['quality']['native_width_px'], r['quality']['native_height_px']] for r in [before, after]],
                              'crossings_before_after': [r['quality']['line_geometry']['crossings'] for r in [before, after]],
                              'reference_frontier_match': False},
              'reports_sha256': {f: sha(OUT / f) for f in ['render-report.json', 'svg-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json', 'fixture-extraction.json']},
              'tools_sha256': {f: sha(ROOT / 'tools' / f) for f in ['audit_local_svg.py', 'audit_stage_ui.cjs', 'summarize_contract_stages.py', 'build_inline_review.py', 'check_stage_fixture_extraction.py']},
              'tests_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'), 'remaining': report['remaining']}
    (OUT / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

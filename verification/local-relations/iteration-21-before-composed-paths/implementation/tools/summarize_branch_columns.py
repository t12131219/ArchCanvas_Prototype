#!/usr/bin/env python3
"""Check current measured layout evidence without declaring the full goal done."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/branch-columns/current'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def main():
    render_file = OUT / 'render-report.json'
    render = read(render_file)
    for file, digest in render['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    snapshot = ROOT / render['frozen_snapshot']
    assert sha(snapshot) == render['frozen_snapshot_sha256']
    for file, digest in read(snapshot)['files'].items():
        assert sha(snapshot.parent / 'implementation' / file) == digest
    extraction = read(ROOT / render['extraction'])
    assert sha(ROOT / render['extraction']) == render['extraction_sha256']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for key in ['ir', 'before_ir']:
        assert sha((ROOT / render['extraction']).parent / extraction[key]) == extraction[key + '_sha256']
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    for file, digest in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale tested implementation', file)
    for command in tests['commands']:
        assert command['exit_code'] == 0
        log = (ROOT / 'verification/local-relations/current' / command['log']).read_text()
        count = re.search(r'Ran (\d+) tests?' if command['name'] == 'python' else r'ℹ tests (\d+)', log)
        assert count and int(count[1]) == tests['counts'][command['name']]
    independent, browser, ui = [read(OUT / name) for name in ['svg-report.json', 'browser-text-report.json', 'ui-report.json']]
    for receipt in [independent, browser, ui]:
        assert receipt['render_report_sha256'] == sha(render_file)
    assert all(r['passed'] for r in independent['results']) and not browser['failures']
    assert {r['name']: (r['nodes'], r['paths']) for r in browser['results']} == {r['name']: (r['nodes'], r['edges']) for r in render['rows']}
    assert {r['name']: r['crossings'] for r in independent['results']} == {r['name']: r['quality']['line_geometry']['crossings'] for r in render['rows']}
    for row in render['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
    for ref in render['reference']:
        for key in ['svg', 'raw_dom', 'graph']:
            assert sha(ROOT / ref[key]) == ref[key + '_sha256']
    for key, file in [('saved', 'mixed-ui-saved.json'), ('expanded', 'mixed-ui-expanded.json'), ('refolded', 'mixed-ui-refolded.json'), ('svg', 'mixed-ui.svg'), ('screenshot', 'mixed-ui.png')]:
        assert sha(OUT / file) == ui[key + '_sha256']
    assert ui['reopened'] and ui['canonical_unchanged'] and ui['refolded_same_frontier'] and ui['svg_matches_cli']
    assert ui['node_counts'] == [29, 33, 29]
    assert sha(OUT / 'ui-observations.json') == ui['observations_sha256']
    assert ui['deeper_manual_quality']['issues'] == ['port-label-requires-note']
    reference = read(ROOT / 'snapshots/transformer_programmatic_guide/generated/semantic_ir.json')
    rows = {r['name']: r for r in render['rows']}
    ir = read(ROOT / rows['transformer-roles']['input'])
    source = next(s for s in ir['sources'] if s['sha256'] == reference['source_sha256'])
    assert sha(Path(source['physical'])) == reference['source_sha256']
    before, after = [rows['transformer-' + v] for v in ['before', 'roles']]
    assert (before['nodes'], before['edges']) == (after['nodes'], after['edges'])
    decision = after['branch_refinement']
    assert decision['accepted'] and decision['crossings_candidate'] < decision['crossings_before']
    assert decision['contacts_candidate'] <= decision['contacts_before']
    groups = after['branch_columns']
    assert len(groups) == 3 and all(len(g['chains']) == 3 and g['status'] == 'realized' and g['routes_verified'] and g['geometry_verified'] for g in groups)
    document = read(OUT / after['document'])
    projections = [c for c in document['layout']['constraint_receipts'] if c['type'] == 'parallel-projections']
    assert sum(c['status'] == 'applied' and c['route_verified'] for c in projections) == 3
    for row in render['rows']:
        doc = read(OUT / row['document'])
        for key, items in [('node_accounting', doc['ir']['nodes']), ('edge_accounting', doc['ir']['edges'])]:
            ids = [i for bucket in doc['layout'][key].values() for i in bucket]
            assert len(ids) == len(set(ids)) and set(ids) == {i['id'] for i in items}
    assert not after['quality']['issues']
    unchanged, changed = [], []
    for name in ['MixedCircuit', 'ForeignComposition', 'UnknownFusion', 'InterruptedMixer', 'BrokenCell', 'ChosenCircuit', 'ConditionalCarry', 'EarlyBoundary', 'SharedMismatch', 'GatedMixture']:
        a, b = rows[name + '-before'], rows[name + '-roles']
        if a['svg_sha256'] == b['svg_sha256']:
            unchanged.append(name)
        else:
            changed.append({'name': name, 'nodes': [a['nodes'], b['nodes']], 'edges': [a['edges'], b['edges']],
                            'crossings': [a['quality']['line_geometry']['crossings'], b['quality']['line_geometry']['crossings']]})
    assert [c['name'] for c in changed] == ['InterruptedMixer']
    assert rows['WovenInputs-roles']['branch_refinement']['accepted']
    rejected = rows['InterruptedPaths-roles']['branch_refinement']
    assert not rejected['accepted'] and rejected['wire_candidate'] > rejected['wire_before'] * 1.1
    assert len(rows['InterruptedPaths-explicit']['branch_columns'][0]['chains']) == 2
    assert rows['InterruptedPaths-roles']['branch_columns'] == []
    extraction_fixture = read(OUT / 'fixture-extraction.json')
    for key in ['source', 'producer']:
        assert sha(ROOT / extraction_fixture[key]) == extraction_fixture[key + '_sha256']
    assert not extraction_fixture['runtime_executed']
    for row in extraction_fixture['rows']:
        assert sha(ROOT / row['ir']) == row['ir_sha256']
    assert ui['woven']['svg_matches_cli'] and ui['woven']['automatic_candidate_accepted']
    for key, file in [('input', 'WovenInputs-ui-input.json'), ('svg', 'woven-ui.svg'), ('screenshot', 'woven-ui.png')]:
        assert sha(OUT / file) == ui['woven'][key + '_sha256']
    visual = read(OUT / 'visual-review.json')
    assert visual['render_report_sha256'] == sha(render_file) and not visual['goal_complete']
    for file, digest in visual['screenshots'].items():
        assert sha(OUT / file) == digest
    result = {'schema': 'branch-columns-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests_passed': sum(tests['counts'].values()), 'test_counts': tests['counts'], 'svg_panels': len(render['rows']),
              'same_source_reference': True, 'source_sha256': reference['source_sha256'],
              'crossings_before_after': [before['quality']['line_geometry']['crossings'], after['quality']['line_geometry']['crossings']],
              'width_before_after': [before['quality']['native_width_px'], after['quality']['native_width_px']],
              'height_before_after': [before['quality']['native_height_px'], after['quality']['native_height_px']],
              'wire_length_before_after': [before['quality']['wire_length'], after['quality']['wire_length']],
              'realized_context_channels': sum(c['status'] == 'realized' for c in after['context_lanes']),
              'deferred_context_channels': sum(c['status'] == 'deferred' for c in after['context_lanes']),
              'realized_path_groups': len(groups), 'applied_projection_constraints': 3,
              'deferred_projection_constraints': sum(c['status'] == 'deferred' for c in projections),
              'unchanged_mixed_svgs': unchanged, 'changed_mixed_svgs': changed, 'regression_candidate_rejected': True,
              'new_fixture_frozen_to_current': {n: {'crossings': [rows[n + '-before']['quality']['line_geometry']['crossings'], rows[n + '-roles']['quality']['line_geometry']['crossings']],
                  'area': [rows[n + '-before']['quality']['native_width_px'] * rows[n + '-before']['quality']['native_height_px'], rows[n + '-roles']['quality']['native_width_px'] * rows[n + '-roles']['quality']['native_height_px']]}
                  for n in ['WovenInputs', 'InterruptedPaths']},
              'manual_deeper_issues': ui['deeper_manual_quality']['issues'],
              'reports_sha256': {name: sha(OUT / name) for name in ['render-report.json', 'svg-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json', 'fixture-extraction.json']},
              'tools_sha256': {name: sha(ROOT / 'tools' / name) for name in ['audit_local_svg.py', 'audit_local_expression_ui.cjs', 'build_inline_review.py', 'summarize_branch_columns.py', 'check_browser_svg_text.js', 'check_branch_fixture_extraction.py']},
              'tests_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'), 'remaining': render['remaining']}
    (OUT / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

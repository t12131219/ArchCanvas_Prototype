#!/usr/bin/env python3
"""Check current measured layout evidence without declaring the full goal done."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/context-lanes/current'


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
    decision = after['context_refinement']
    assert decision['accepted'] and decision['candidate']['crossings'] < decision['before']['crossings']
    assert decision['candidate']['contacts'] <= decision['before']['contacts']
    assert not after['quality']['issues']
    unchanged = []
    for name in ['MixedCircuit', 'ForeignComposition', 'UnknownFusion', 'InterruptedMixer', 'BrokenCell', 'ChosenCircuit', 'ConditionalCarry', 'EarlyBoundary', 'SharedMismatch', 'GatedMixture']:
        a, b = rows[name + '-before'], rows[name + '-roles']
        assert a['svg_sha256'] == b['svg_sha256']
        unchanged.append(name)
    assert rows['InterruptedMixer-roles']['context_refinement']['accepted'] is False
    visual = read(OUT / 'visual-review.json')
    assert visual['render_report_sha256'] == sha(render_file) and not visual['goal_complete']
    for file, digest in visual['screenshots'].items():
        assert sha(OUT / file) == digest
    result = {'schema': 'context-lanes-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'tests_passed': sum(tests['counts'].values()), 'test_counts': tests['counts'], 'svg_panels': len(render['rows']),
              'same_source_reference': True, 'source_sha256': reference['source_sha256'],
              'crossings_before_after': [before['quality']['line_geometry']['crossings'], after['quality']['line_geometry']['crossings']],
              'width_before_after': [before['quality']['native_width_px'], after['quality']['native_width_px']],
              'height_before_after': [before['quality']['native_height_px'], after['quality']['native_height_px']],
              'wire_length_before_after': [before['quality']['wire_length'], after['quality']['wire_length']],
              'realized_context_channels': sum(c['status'] == 'realized' for c in after['context_lanes']),
              'deferred_context_channels': sum(c['status'] == 'deferred' for c in after['context_lanes']),
              'right_side_experiment_crossings': rows['transformer-right-experiment']['quality']['line_geometry']['crossings'],
              'unchanged_mixed_svgs': unchanged, 'regression_candidate_rejected': True,
              'manual_deeper_issues': ui['deeper_manual_quality']['issues'],
              'reports_sha256': {name: sha(OUT / name) for name in ['render-report.json', 'svg-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json']},
              'tools_sha256': {name: sha(ROOT / 'tools' / name) for name in ['audit_local_svg.py', 'audit_local_expression_ui.cjs', 'build_inline_review.py', 'summarize_context_lanes.py']},
              'tests_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'), 'remaining': render['remaining']}
    (OUT / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Check evidence freshness; incomplete stage deliberately fails acceptance."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'verification/local-relations/current'


def read(name):
    return json.loads((STAGE / name).read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit_atlas(directory):
    atlas = read(directory + '/manifest.json')
    for file, digest in atlas['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale atlas implementation', file)
    panels = {p['svg']: p for p in atlas['panels']}
    for goal in atlas['expression_goals']:
        assert goal['panels'] and goal['status'] == 'fulfilled'
        for file in goal['panels']:
            panel = panels[file]
            assert not panel['quality']['issues']
            document = read(directory + '/' + panel['document'])
            receipt = next(c for c in document['expression_coverage'] if c['goal'] == goal['id'])
            assert receipt['status'] == 'fulfilled'
            tree = ET.parse(STAGE / directory / file)
            nodes = {e.attrib['data-node-id'] for e in tree.iter() if 'data-node-id' in e.attrib}
            assert set(goal['core']) <= nodes, ('missing actual SVG goal core', goal['id'])
            visible = {e.attrib['data-edge-id'] for e in tree.iter() if 'data-edge-id' in e.attrib}
            assert set(receipt['visible_edges']) <= visible, ('missing actual SVG goal paths', goal['id'])
    return atlas


def main():
    render = read('render-report.json')
    for file, digest in render['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale implementation', file)
    for row in render['rows']:
        for kind in ['svg', 'document']:
            assert sha(STAGE / row[kind]) == row[kind + '_sha256']
    extraction = read('extraction.json')
    for case in extraction['cases']:
        assert sha(ROOT / case['source']) == case['source_sha256']
        assert sha(STAGE / case['ir']) == case['ir_sha256']
    svg, browser, tests = read('svg-report.json'), read('browser-text-report.json'), read('test-report.json')
    assert svg['render_report_sha256'] == browser['render_report_sha256'] == sha(STAGE / 'render-report.json')
    assert len(svg['results']) == len(browser['panels']) == len(render['rows'])
    assert all(r['passed'] for r in svg['results'])
    assert not browser['failures']
    assert all(r['exit_code'] == 0 for r in tests['commands'])
    for file, digest in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale test implementation', file)
    review = read('self-review.json')
    assert review['render_report_sha256'] == sha(STAGE / 'render-report.json')
    for file, digest in review['images'].items():
        assert sha(STAGE / file) == digest
    atlas = audit_atlas('mixed-atlas')
    atlas_browser = read('atlas-browser-text-report.json')
    assert atlas_browser['atlas_digest'] == atlas['audit_digest'] and not atlas_browser['failures']
    assert len(atlas_browser['panels']) == len(atlas['panels'])
    regression = read('holdout-report.json')
    assert sha(ROOT / 'tools/audit_local_holdout.cjs') == regression['auditor_sha256']
    assert sha(STAGE.parent / 'iteration-02/holdout-report.json') == regression['baseline_report_sha256']
    freeze = read('heldout-freeze.json')
    assert sha(STAGE / 'heldout-freeze.json') == regression['freeze_sha256']
    for file, digest in freeze['implementation_sha256'].items():
        assert sha(STAGE.parent / 'iteration-02/implementation' / file) == digest
    for file, digest in regression['implementation_sha256'].items():
        assert sha(ROOT / file) == digest
    regression_svg, regression_browser = read('holdout-svg-report.json'), read('holdout-browser-text-report.json')
    assert regression_svg['render_report_sha256'] == regression_browser['render_report_sha256'] == sha(STAGE / 'holdout-report.json')
    assert len(regression_svg['results']) == len(regression_browser['panels']) == len(regression['rows'])
    assert all(r['passed'] for r in regression_svg['results']) and not regression_browser['failures']
    for row in regression['rows']:
        for kind in ['svg', 'document']:
            assert sha(STAGE / row[kind]) == row[kind + '_sha256']
        audit_atlas(row['atlas']['directory'])
    iteration = read('iteration-report.json')
    for file, digest in iteration['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale iteration implementation', file)
    first = STAGE.parent / 'iteration-04-first-bindings'
    assert sha(first / 'snapshot.json') == iteration['frozen_snapshot_sha256']
    for file, digest in json.loads((first / 'snapshot.json').read_text())['files'].items():
        assert sha(first / 'implementation' / file) == digest
    for comparison in iteration['comparisons']:
        assert sha(STAGE / comparison['before_svg']) == comparison['before_svg_sha256']
        assert sha(STAGE / comparison['before_document']) == comparison['before_document_sha256']
        assert comparison['same_source'] and comparison['canonical_ir_changed']
    for row in iteration['rows']:
        for kind in ['svg', 'document']:
            assert sha(STAGE / row[kind]) == row[kind + '_sha256']
        assert not row['quality']['issues'] and not row['quality']['line_geometry']['unrelated_contacts']
        if row['name'] != 'conditional-update':
            assert any(g['status'] == 'fulfilled' for g in row['iteration_goals'])
            assert any(c['status'] == 'applied' and c['route_verified'] and c['reading_order']['applied'] for c in row['constraints'])
    iteration_svg, iteration_browser = read('iteration-svg-report.json'), read('iteration-browser-text-report.json')
    assert iteration_svg['render_report_sha256'] == iteration_browser['render_report_sha256'] == sha(STAGE / 'iteration-report.json')
    assert len(iteration_svg['results']) == len(iteration_browser['panels']) == len(iteration['rows'])
    assert all(r['passed'] for r in iteration_svg['results']) and not iteration_browser['failures']
    assert review['iteration_report_sha256'] == sha(STAGE / 'iteration-report.json')
    identity = read('identity-report.json')
    for file, digest in identity['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale identity implementation', file)
    assert sha(STAGE / identity['runtime_ir']) == identity['runtime_ir_sha256']
    runtime = read(identity['runtime_ir'])['runtime']
    assert runtime['status'] == 'passed' and len(runtime['runs']) == 2
    assert all(r['status'] == 'passed' and r['replay']['matched'] for r in runtime['runs'])
    assert identity['source_sha256'] == runtime['binding']['source_sha256']
    identity_svg, identity_browser = read('identity-svg-report.json'), read('identity-browser-text-report.json')
    assert identity_svg['render_report_sha256'] == identity_browser['render_report_sha256'] == sha(STAGE / 'identity-report.json')
    assert len(identity_svg['results']) == len(identity_browser['panels']) == len(identity['rows'])
    assert all(r['passed'] for r in identity_svg['results']) and not identity_browser['failures']
    for row in identity['rows']:
        for kind in ['svg', 'document']:
            assert sha(STAGE / row[kind]) == row[kind + '_sha256']
        assert not row['quality']['issues']
        relation = row['state'].get('paperRelation')
        if relation:
            assert any(g['goal'] == 'goal:' + relation and g['status'] == 'fulfilled' for g in row['identity_goals'])
    assert review['identity_report_sha256'] == sha(STAGE / 'identity-report.json')
    report = {'schema': 'local-relations-validation/1', 'stage_status': 'in-progress', 'evidence_consistent': True,
              'goal_complete': False, 'all_acceptance_checks_pass': False,
              'tests': tests['counts'], 'static_cases': len(extraction['cases']), 'svg_panels': len(svg['results']),
              'browser_panels': len(browser['panels']), 'unresolved_panels': render['unresolved_panels'],
              'mixed_atlas': {'panels': len(atlas['panels']), 'goals': len(atlas['expression_goals']), 'unfulfilled': atlas['unfulfilled_goals'], 'quality_pass': atlas['quality_pass']},
              'composition_regression': {'quality_pass': regression['quality_pass'], 'cases': len(regression['rows']),
                                        'scope': regression['scope'], 'historical_failure_retained': True},
              'iteration_bindings': {'panels': len(iteration['rows']), 'scope': iteration['scope'],
                                     'historical_first_rendering_retained': True, 'runtime_executed': False},
              'identity_bindings': {'panels': len(identity['rows']), 'runtime_cases': len(runtime['runs']),
                                    'scope': identity['runtime_scope'], 'source_effect_locality': 'modeled prefix only; broader locality incomplete'},
              'remaining_requirements': review['remaining_requirements'],
              'render_report_sha256': sha(STAGE / 'render-report.json')}
    (STAGE / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

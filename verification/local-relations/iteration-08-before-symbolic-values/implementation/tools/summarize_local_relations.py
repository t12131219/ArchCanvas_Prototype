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


def audit_atlas(directory, require_complete=True):
    from audit_local_svg import audit_atlas_coverage
    atlas = read(directory + '/manifest.json')
    for file, digest in atlas['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale atlas implementation', file)
    panels = {p['svg']: p for p in atlas['panels']}
    for file, panel in panels.items():
        document = read(directory + '/' + panel['document'])
        tree = ET.parse(STAGE / directory / file)
        nodes = {e.attrib['data-node-id']: e for e in tree.iter() if 'data-node-id' in e.attrib}
        paths = {e.attrib['data-edge-id']: e for e in tree.iter() if 'data-edge-id' in e.attrib}
        audit_atlas_coverage(atlas, panel, document, nodes, paths)
    for goal in atlas['expression_goals']:
        if not require_complete and goal['status'] != 'fulfilled':
            assert not goal['panels']
            continue
        assert goal['panels'] and goal['status'] == 'fulfilled'
        for file in goal['panels']:
            panel = panels[file]
            assert not panel['quality']['issues']
            document = read(directory + '/' + panel['document'])
            receipt = next(c for c in document.get('atlas_expression_coverage', document['expression_coverage']) if c['goal'] == goal['id'])
            assert receipt['status'] == 'fulfilled'
            tree = ET.parse(STAGE / directory / file)
            nodes = {e.attrib['data-node-id'] for e in tree.iter() if 'data-node-id' in e.attrib}
            core = receipt['node_map'].values() if receipt.get('method') == 'structural-representative' else goal['core']
            assert set(core) <= nodes, ('missing actual SVG goal core', goal['id'])
            visible = {e.attrib['data-edge-id'] for e in tree.iter() if 'data-edge-id' in e.attrib}
            assert set(receipt['visible_edges']) <= visible, ('missing actual SVG goal paths', goal['id'])
    return atlas


def audit_representative_atlases(review):
    report = read('representative-atlas-report.json')
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale atlas comparison implementation', file)
    frozen = STAGE.parent / 'iteration-07-before-representative-atlas'
    assert sha(frozen / 'snapshot.json') == report['frozen_snapshot_sha256']
    for file, digest in json.loads((frozen / 'snapshot.json').read_text())['files'].items():
        assert sha(frozen / 'implementation' / file) == digest
    for file, digest in report['artifacts_sha256'].items():
        assert sha(STAGE / file) == digest, ('stale atlas comparison artifact', file)
    independent, browser = read('representative-atlas-svg-report.json'), read('representative-atlas-browser-text-report.json')
    assert independent['render_report_sha256'] == sha(STAGE / 'representative-atlas-report.json')
    assert review['representative_atlas_report_sha256'] == independent['render_report_sha256']
    assert all(r['passed'] for r in independent['results']) and not browser['failures']
    directories = [r[v]['directory'] for r in report['rows'] for v in ['before', 'current']] + [report['limited']['directory']]
    pages = {p['directory']: p for p in browser['pages']}
    assert len(pages) == len(browser['pages']) == len(directories) and set(pages) == set(directories)
    total, current_total = 0, 0
    for directory in directories:
        manifest = read(directory + '/manifest.json')
        page = pages[directory]
        assert page['atlas_digest'] == manifest['audit_digest'] and not page['failures']
        assert len(page['panels']) == len(manifest['panels'])
        total += len(manifest['panels'])
        if directory.endswith('-before'):
            for file, digest in manifest['implementation_sha256'].items():
                assert sha(frozen / 'implementation' / file) == digest
        else:
            limited = directory == report['limited']['directory']
            audit_atlas(directory, require_complete=not limited)
            if limited:
                assert not manifest['complete'] and manifest['unfulfilled_goals'] and manifest['omitted_panels']
            else:
                assert manifest['complete'] and manifest['quality_pass']
                current_total += len(manifest['panels'])
    assert total == browser['panels'] == len(independent['results'])
    for row in report['rows']:
        assert sha(STAGE / row['ir']) == row['ir_sha256']
        for version in ['before', 'current']:
            assert sha(STAGE / row[version]['directory'] / 'manifest.json') == row[version]['manifest_sha256']
    assert sha(STAGE / report['limited']['directory'] / 'manifest.json') == report['limited']['manifest_sha256']
    return {'panels_total': total, 'current_normal_panels': current_total,
            'comparison_cases': len(report['rows']), 'scope': report['scope'],
            'budget_limited_incomplete': True, 'rows': report['rows']}


def audit_generic_reference(review):
    directory = ROOT / 'verification/generic-convergence/current'
    report_file = directory / 'comparison-report.json'
    report = json.loads(report_file.read_text())
    assert sha(report_file) == review['generic_convergence_report_sha256']
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale generic comparison implementation', file)
    for file, digest in report['artifacts_sha256'].items():
        assert sha(directory / file) == digest, ('stale generic comparison artifact', file)
    ir = json.loads((directory / 'source.json').read_text())
    reference = ROOT / 'snapshots/transformer_programmatic_guide/generated/semantic_ir.json'
    assert sha(reference) == report['reference_ir_sha256']
    assert json.loads(reference.read_text())['source_sha256'] == report['source_sha256']
    assert sha(Path(ir['sources'][0]['physical'])) == report['source_sha256']
    browser = json.loads((directory / 'browser-text-report.json').read_text())
    assert browser['render_report_sha256'] == sha(report_file) and not browser['failures']
    assert sha(directory / 'comparison.png') == review['generic_convergence_image_sha256']
    return {'same_source': report['same_source'], 'converged': report['converged'],
            'targets': report['frontier_targets'], 'unmet_requirements': report['unmet_requirements'],
            'deeper_generic_expansion_is_separate': True,
            'report_sha256': sha(report_file)}


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
    repeat = read('repeat-report.json')
    for file, digest in repeat['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale structural comparison implementation', file)
    frozen = STAGE.parent / 'iteration-06-before-repeat-structure'
    assert sha(frozen / 'snapshot.json') == repeat['frozen_snapshot_sha256']
    for file, digest in json.loads((frozen / 'snapshot.json').read_text())['files'].items():
        assert sha(frozen / 'implementation' / file) == digest
    assert sha(ROOT / 'tests/semantic_fixtures/structural_repeats.py') == repeat['source_sha256']
    assert sha(STAGE / 'structural-repeats/baseline-extraction.json') == repeat['baseline_extraction_sha256']
    for row in read('structural-repeats/baseline-extraction.json')['cases']:
        assert sha(STAGE / row['ir']) == row['ir_sha256']
    repeat_svg, repeat_browser = read('repeat-svg-report.json'), read('repeat-browser-text-report.json')
    assert repeat_svg['render_report_sha256'] == repeat_browser['render_report_sha256'] == sha(STAGE / 'repeat-report.json')
    assert len(repeat_svg['results']) == len(repeat_browser['panels']) == len(repeat['rows'])
    assert all(r['passed'] for r in repeat_svg['results']) and not repeat_browser['failures']
    for row in repeat['rows']:
        for kind in ['svg', 'document']:
            assert sha(STAGE / row[kind]) == row[kind + '_sha256']
        assert not row['quality']['issues']
    assert review['repeat_report_sha256'] == sha(STAGE / 'repeat-report.json')
    repeat_ui = read('repeat-ui-report.json')
    assert repeat_ui['passed'] and repeat_ui['save_export_reopen_verified']
    assert repeat_ui['export_matches_saved_document_render']
    assert repeat_ui['selection'] == {'group': 1, 'source_positions': [3]}
    for file, digest in repeat_ui['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale repeat UI implementation', file)
    for file, digest in repeat_ui['files'].items():
        assert sha(STAGE / file) == digest, ('stale repeat UI artifact', file)
    assert review['repeat_ui_report_sha256'] == sha(STAGE / 'repeat-ui-report.json')
    representative_atlases = audit_representative_atlases(review)
    generic_reference = audit_generic_reference(review)
    report = {'schema': 'local-relations-validation/1', 'stage_status': 'in-progress', 'evidence_consistent': True,
              'goal_complete': False, 'all_acceptance_checks_pass': False,
              'tests': tests['counts'], 'static_cases': len(extraction['cases']), 'svg_panels': len(svg['results']),
              'svg_panels_total': sum(len(r['results']) for r in [svg, regression_svg, iteration_svg, identity_svg, repeat_svg]),
              'browser_panels': len(browser['panels']), 'unresolved_panels': render['unresolved_panels'],
              'mixed_atlas': {'panels': len(atlas['panels']), 'goals': len(atlas['expression_goals']), 'unfulfilled': atlas['unfulfilled_goals'], 'quality_pass': atlas['quality_pass']},
              'composition_regression': {'quality_pass': regression['quality_pass'], 'cases': len(regression['rows']),
                                        'scope': regression['scope'], 'historical_failure_retained': True},
              'iteration_bindings': {'panels': len(iteration['rows']), 'scope': iteration['scope'],
                                     'historical_first_rendering_retained': True, 'runtime_executed': False},
              'identity_bindings': {'panels': len(identity['rows']), 'runtime_cases': len(runtime['runs']),
                                    'scope': identity['runtime_scope'], 'source_effect_locality': 'modeled prefix only; broader locality incomplete'},
              'structural_repeats': {'panels': len(repeat['rows']), 'scope': repeat['scope'],
                                     'runtime_executed': False, 'heterogeneous_group_selection': True,
                                     'ui_save_export_reopen_verified': True,
                                     'automatic_atlas_representative_coverage': 'supported ordered source graphs only; dynamic/time/conditional collections incomplete'},
              'representative_atlases': representative_atlases,
              'same_source_reference': generic_reference,
              'remaining_requirements': review['remaining_requirements'],
              'render_report_sha256': sha(STAGE / 'render-report.json')}
    (STAGE / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

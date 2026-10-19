#!/usr/bin/env python3
"""Validate the current generic semantic/design stage, without running models.

Historical publication reports are preserved. Browser observations and visual
notes remain separate evidence, and must bind to the reports inspected.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'verification/semantic-design/current'
BASE = ROOT / 'verification/semantic-design/baseline'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def current(report):
    for file, expected in report['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale implementation', file)


def main():
    baseline = read(BASE / 'manifest.json')
    for file, expected in baseline['files'].items():
        assert sha(BASE / file) == expected, ('baseline changed', file)
        if file.startswith('snapshots/'):
            assert sha(ROOT / file) == expected, ('dedicated reference changed', file)
    analysis = read(STAGE / 'analysis-report.json')
    render = read(STAGE / 'render-report.json')
    svg = read(STAGE / 'svg-report.json')
    extraction = read(STAGE / 'external/extraction.json')
    corpus = read(STAGE / 'publication/corpus-report.json')
    browser = read(STAGE / 'publication/browser-text-report.json')
    catalog = read(STAGE / 'architecture/report.json')
    stress = read(STAGE / 'publication/stress-report.json')
    weave = read(STAGE / 'publication/weave-report.json')
    for report in [analysis, render, extraction, corpus, catalog, stress, weave]:
        current(report)
    assert not analysis['models_executed'] and analysis['cases']
    assert len(analysis['cases']) == render['cases'] == 19
    for file, expected in analysis['source_files_unchanged'].items():
        assert sha(Path(file)) == expected, ('comparison source changed', file)
    for row in analysis['cases']:
        for side in ['before', 'after']:
            ir = read(STAGE / side / (row['name'] + '.json'))
            assert ir['entry']['class'] == row['entry']
            assert ir['entry']['constructor'] == row['constructor']
        assert not row['runtime_executed_by_this_audit']
    assert render['canonical_ir_unchanged'] and render['complete_accounting']
    assert not render['current_issues']
    expected_svg = [r for r in render['results'] if not r['name'].endswith('-before')]
    assert svg['panels'] == len(expected_svg) and not svg['errors'] and not svg['title_collisions']
    assert extraction['sources_read_only'] and not extraction['model_executed']
    before = read(STAGE / 'external/manifest-before.json')
    assert before == read(STAGE / 'external/manifest-after.json')
    source_root = Path(extraction['source_root'])
    actual = [{'path': str(p.relative_to(source_root)), 'sha256': sha(p)}
              for p in sorted(source_root.rglob('*')) if p.is_file()]
    assert actual == before
    assert corpus['extraction_implementation_sha256'] == extraction['implementation_sha256']
    assert not corpus['external_models_executed'] and corpus['complete_accounting']
    assert corpus['panels'] == corpus['quality_pass'] == browser['panels']
    for key in ['errors', 'overlap', 'missing_boundary_ports', 'orphan_boundary_ports',
                'overlapping_paths', 'unrelated_contacts']:
        assert not corpus[key], key
    assert browser['audit_digest'] == corpus['audit_digest'] and not browser['failures']
    assert sum(p['panels'] for p in browser['page_results']) == corpus['panels']
    assert all(p['audit_digest'] == corpus['audit_digest'] and not p['failures']
               for p in browser['page_results'])
    assert catalog['canonical_ir_unchanged'] and catalog['complete_edge_accounting']
    assert not catalog['overlap'] and not catalog['failed_routes']
    assert not stress['failures'] and not weave['failures']
    visual = read(STAGE / 'review/self-review.json')
    assert visual['render_report_sha256'] == sha(STAGE / 'render-report.json')
    assert visual['corpus_audit_digest'] == corpus['audit_digest']
    assert visual['arbitrary_model_publication_quality_achieved'] is False
    for artifact in visual['inspected_images']:
        assert (STAGE / artifact).is_file(), artifact
    ui = read(STAGE / 'review/ui-report.json')
    current(ui)
    for row in ui['exports']:
        for key in ['document', 'svg']:
            assert sha(STAGE / row[key]) == row[key + '_sha256']
        assert row['byte_identical']
    subprocess.run(['node', '-e', r'''
const fs=require('fs'),assert=require('assert/strict'),R=require('./semantic_studio/publication-renderer.js');
const dir='verification/semantic-design/current/review/';
for(const name of ['SharedStack','SharedStack-runtime','ImageResidual']){
 const d=JSON.parse(fs.readFileSync(dir+name+'-ui.json'));
 assert.equal(d.schema,'semantic-canvas/1');
 const o=R.render(d.ir,d.state);
 assert.equal(o.svg,fs.readFileSync(dir+name+'-ui.svg','utf8'));
 assert.deepEqual(o.prepared.quality.issues,[]);
}
'''], cwd=ROOT, check=True)
    counts = {}
    for name in ['python', 'architecture', 'publication', 'projection', 'js']:
        text = (STAGE / f'test-logs/{name}.log').read_text()
        if name == 'python':
            match = re.search(r'Ran (\d+) tests', text)
            assert match and re.search(r'^OK$', text, re.M)
        else:
            match = re.search(r'(?:ℹ tests |# tests )(\d+)', text)
            assert match and re.search(r'(?:ℹ fail |# fail )0\b', text)
        counts[name] = int(match[1])
    assert counts == dict(python=65, architecture=34, publication=67, projection=4, js=6)
    report = {'schema': 'semantic-design-validation/1',
              'scope': 'bounded generic semantic contracts, reversible presentation and current audit stage',
              'tests': counts, 'matched_cases': render['cases'], 'rendered_panels': render['panels'],
              'svg_panels': svg['panels'], 'catalog_models': catalog['models'], 'catalog_states': catalog['states'],
              'external_candidates': extraction['extracted'], 'external_files_unchanged': len(actual),
              'corpus_panels': corpus['panels'], 'browser_panels': browser['panels'],
              'stress_panels': stress['panels'], 'weave_panels': weave['panels'],
              'all_current_automated_checks_pass': True,
              'arbitrary_model_publication_quality_achieved': False,
              'remaining_directions': visual['remaining_directions'],
              'implementation_sha256': {**analysis['implementation_sha256'], **render['implementation_sha256'],
                  'tools/audit_design_svg.py': sha(ROOT / 'tools/audit_design_svg.py'),
                  'tools/summarize_semantic_design.py': sha(Path(__file__))},
              'report_sha256': {str(p.relative_to(STAGE)): sha(p) for p in [
                  STAGE / 'analysis-report.json', STAGE / 'render-report.json', STAGE / 'svg-report.json',
                  STAGE / 'publication/corpus-report.json', STAGE / 'publication/browser-text-report.json',
                  STAGE / 'review/self-review.json', STAGE / 'review/ui-report.json']}}
    (STAGE / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ['implementation_sha256', 'report_sha256']}, ensure_ascii=False))


if __name__ == '__main__':
    main()

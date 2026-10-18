#!/usr/bin/env python3
"""Validate the current topology milestone without relabelling historical evidence."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'verification/publication/topology-layout'
BASE = ROOT / 'verification/publication/topology-layout-baseline'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def current(report):
    for name, expected in report['implementation_sha256'].items():
        assert sha(ROOT / name) == expected, ('stale current evidence', name)


def main():
    corpus = read(STAGE / 'corpus-report.json')
    compare = read(STAGE / 'comparison.json')
    baseline = read(BASE / 'baseline.json')
    browser = read(STAGE / 'browser-text-report.json')
    atlas = read(STAGE / 'GatedMixture-atlas/manifest.json')
    atlas_text = read(STAGE / 'GatedMixture-text-report.json')
    accepted_text = read(STAGE / 'accepted-text-report.json')
    stress = read(STAGE / 'stress-report.json')
    weave = read(STAGE / 'weave-report.json')
    catalog = read(ROOT / 'verification/architecture/report.json')
    extraction = read(ROOT / 'verification/architecture/corpus/extraction.json')
    for report in [corpus, compare, atlas, stress, weave, catalog, extraction]:
        current(report)
    assert not catalog['overlap'] and not catalog['failed_routes']
    assert corpus['extraction_implementation_sha256'] == extraction['implementation_sha256']
    for name, expected in baseline['implementation_sha256'].items():
        assert sha(BASE / name) == expected, ('archived code changed', name)
    assert compare['baseline_digest'] == baseline['audit_digest']
    assert compare['current_digest'] == corpus['audit_digest'] == browser['audit_digest']
    assert not compare['regressions'] and compare['all_accounting_and_cuts_identical']
    assert compare['semantic_findings_identical'] and compare['canonical_ir_unchanged']
    assert corpus['panels'] == corpus['quality_pass'] == browser['panels'] == compare['external_panels']
    assert not corpus['errors'] and not corpus['overlap'] and not corpus['orphan_boundary_ports']
    assert not corpus['missing_boundary_ports'] and not corpus['unrelated_contacts']
    assert not browser['failures'] and all(p['audit_digest'] == corpus['audit_digest'] for p in browser['page_results'])
    assert not stress['failures'] and not weave['failures']
    assert atlas['complete'] and atlas['quality_pass'] and not atlas_text['failures']
    assert atlas['audit_digest'] == atlas_text['audit_digest'] and atlas_text['panels'] == len(atlas['panels'])
    assert not accepted_text['failures']
    for row in accepted_text['results']:
        assert sha(STAGE / row['file']) == row['sha256']
    assert len(accepted_text['results']) == len(compare['original_accepted'])
    sources = read(ROOT / 'verification/architecture/corpus/manifest-before.json')
    source_root = Path(extraction['source_root'])
    actual = [{'path': str(p.relative_to(source_root)), 'sha256': sha(p)}
              for p in sorted(source_root.rglob('*')) if p.is_file()]
    assert actual == sources and len(actual) == compare['external_files_unchanged']
    tests = {}
    for name in ['python', 'architecture', 'publication', 'projection']:
        log = (STAGE / f'test-logs/{name}.log').read_text()
        if name == 'python':
            match = re.search(r'Ran (\d+) tests', log)
            assert match and re.search(r'^OK$', log, re.M)
        else:
            match = re.search(r'(?:ℹ tests |# tests )(\d+)', log)
            assert match and re.search(r'(?:ℹ fail |# fail )0\b', log)
        tests[name] = int(match[1])
    # The SVG was obtained through the actual editor export dialog. Rebuilding
    # it checks the same source/state and catches divergent UI and CLI geometry.
    check = subprocess.run(['node', '-e', r'''
const fs=require('fs'),assert=require('assert/strict'),R=require('./semantic_studio/publication-renderer.js');
const base='verification/publication/topology-layout/',doc=JSON.parse(fs.readFileSync(base+'GatedMixture-ui.layout.json'));
assert.equal(doc.schema,'semantic-canvas/1');const out=R.render(doc.ir,doc.state);
assert.equal(out.svg,fs.readFileSync(base+'GatedMixture-ui.svg','utf8'));
assert.deepEqual(out.prepared.quality.issues,[]);assert.equal(out.prepared.quality.line_geometry.crossings,0);
assert.equal(out.prepared.routing.topology_refinement.accepted,true);assert.equal(out.graph.publication.unknowns,1);
console.log(JSON.stringify({byte_identical:true,title:doc.ir.title,focus:doc.state.paperFocus||null,quality:out.prepared.quality}));
'''], cwd=ROOT, capture_output=True, text=True, check=True)
    ui = json.loads(check.stdout)
    implementation = dict(compare['implementation_sha256'])
    for folder in ['semantic_adapter', 'tests']:
        for p in (ROOT / folder).rglob('*'):
            if p.suffix in ['.py', '.cjs']:
                implementation[str(p.relative_to(ROOT))] = sha(p)
    for name in ['tools/summarize_topology_layout.py', 'tools/summarize_publication_checks.py']:
        implementation[name] = sha(ROOT / name)
    artifacts = [p for p in STAGE.rglob('*') if p.is_file() and p.name != 'summary.json']
    report = {'schema': 'publication-topology-summary/1', 'active_stage': 'topology-layout',
              'audit_digest': corpus['audit_digest'], 'historical_digest': baseline['audit_digest'],
              'tests': tests, 'test_total': sum(tests.values()), 'external_panels': corpus['panels'],
              'external_files_unchanged': len(actual), 'external_svg_identical': compare['external_svg_identical'],
              'external_candidates_accepted': len(compare['external_accepted']),
              'external_candidates_rejected': len(compare['external_rejected']),
              'original_catalog_panels': compare['original_catalog_panels'],
              'source_architecture_states': catalog['states'],
              'original_improvements': compare['original_accepted'], 'browser_node_texts': browser['node_texts'],
              'stress_panels': stress['panels'], 'woven_panels': weave['panels'], 'ui_export': ui,
              'implementation_sha256': implementation,
              'artifact_sha256': {str(p.relative_to(ROOT)): sha(p) for p in artifacts},
              'limits': compare['limits'] + ['Earlier reports outside topology-layout describe the archived milestone; their fixed-position and byte-equality claims are not rerun against changed layouts.',
                  'Actual visual review still finds folded turns and long bypasses. Positive examples do not establish publication quality for arbitrary models.']}
    (STAGE / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['test_total', 'external_panels', 'external_files_unchanged',
          'external_candidates_accepted', 'external_candidates_rejected', 'original_catalog_panels', 'browser_node_texts']}))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Validate configuration evidence, including known visual regressions.

Reads existing AST, unit, browser and renderer receipts; never runs a model.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'verification/publication/configuration'
BASE = ROOT / 'verification/publication/configuration-baseline'


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
    stress = read(STAGE / 'stress-report.json')
    weave = read(STAGE / 'weave-report.json')
    catalog = read(ROOT / 'verification/architecture/report.json')
    extraction = read(ROOT / 'verification/architecture/corpus/extraction.json')
    for report in [corpus, compare, stress, weave, catalog, extraction]:
        current(report)
    for name, expected in baseline['implementation_sha256'].items():
        assert sha(BASE / name) == expected, ('archived code changed', name)
    assert compare['baseline_digest'] == baseline['audit_digest']
    assert compare['current_digest'] == corpus['audit_digest'] == browser['audit_digest']
    assert corpus['extraction_implementation_sha256'] == extraction['implementation_sha256']
    assert compare['canonical_ir_unchanged'] and compare['semantic_facts_identical']
    assert compare['common_scopes_cuts_identical'] and compare['complete_accounting']
    assert corpus['complete_accounting'] and not corpus['external_models_executed']
    assert not compare['external_models_executed']
    assert corpus['panels'] == corpus['quality_pass'] == browser['panels'] == compare['current_panels']
    assert compare['common_panels'] + len(compare['new_presentation_panels']) == compare['current_panels']
    assert compare['common_panels'] + len(compare['removed_presentation_panels']) == compare['baseline_panels']
    assert not catalog['overlap'] and not catalog['failed_routes']
    for key in ['errors', 'overlap', 'missing_boundary_ports', 'orphan_boundary_ports',
                'unrelated_contacts', 'overlapping_paths']:
        assert not corpus[key], key
    assert not browser['failures'] and not stress['failures'] and not weave['failures']
    assert all(p['audit_digest'] == corpus['audit_digest'] and not p['failures']
               for p in browser['page_results'])
    assert sum(p['panels'] for p in browser['page_results']) == corpus['panels']
    increases = compare['crossing_increases']
    assert compare['regressions'] == [dict(id=r['id'], focus=r['focus'], kind='more-crossings')
                                      for r in increases]
    review = read(STAGE / 'self-review.json')
    assert review['audit_digest'] == corpus['audit_digest']
    assert review['arbitrary_model_publication_quality_achieved'] is False
    assert review['known_regressions'] == compare['regressions']
    for row in increases:
        assert row['after']['crossings'] > row['before']['crossings']
        for key in ['before_svg', 'after_svg', 'document']:
            assert (STAGE / row[key]).is_file()
        assert (STAGE / f"review/{row['id']}-comparison.png").is_file()
    atlases = {}
    for name in ['ConvNet', 'ShapeDrivenFusion']:
        atlas = read(STAGE / f'{name}-atlas/manifest.json')
        text = read(STAGE / f'{name}-text-report.json')
        current(atlas)
        assert atlas['complete'] and atlas['quality_pass'] and not atlas['omitted_panels']
        assert text['audit_digest'] == atlas['audit_digest'] and not text['failures']
        assert text['panels'] == len(atlas['panels'])
        atlases[name] = dict(panels=text['panels'], audit_digest=atlas['audit_digest'])
    inspector = (STAGE / 'ConvNet-inspector.txt').read_text()
    for token in ['7 * 7 * 16', 'configuration_proof', 'e00016', 'arg:1', 'not-performed']:
        assert token in inspector
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
    check = subprocess.run(['node', '-e', r'''
const fs=require('fs'),assert=require('assert/strict'),R=require('./semantic_studio/publication-renderer.js');
const base='verification/publication/configuration/',results=[];
for(const name of ['ConvNet','ShapeDrivenFusion']){
 const doc=JSON.parse(fs.readFileSync(base+name+'-ui.layout.json'));
 assert.equal(doc.schema,'semantic-canvas/1');const out=R.render(doc.ir,doc.state);
 assert.equal(out.svg,fs.readFileSync(base+name+'-ui.svg','utf8'));
 assert.deepEqual(out.prepared.quality.issues,[]);
 assert.equal(out.graph.publication.unknowns,name==='ConvNet'?0:1);
 assert.ok(out.graph.publication.configuration_arithmetic.length>0);
 results.push({name,byte_identical:true,quality:out.prepared.quality,
  configuration_proofs:out.graph.publication.configuration_arithmetic.length});
}
console.log(JSON.stringify(results));
'''], cwd=ROOT, capture_output=True, text=True, check=True)
    ui = json.loads(check.stdout)
    implementation = dict(compare['implementation_sha256'])
    for folder in ['semantic_adapter', 'tests']:
        for p in (ROOT / folder).rglob('*'):
            if p.suffix in ['.py', '.cjs', '.json']:
                implementation[str(p.relative_to(ROOT))] = sha(p)
    for name in ['tools/summarize_configuration.py', 'tools/summarize_publication_checks.py',
                 'tools/build_architecture_examples.py', 'README.md', 'docs/publication-view.md',
                 'verification/publication/active-stage.json']:
        implementation[name] = sha(ROOT / name)
    artifacts = [p for p in STAGE.rglob('*') if p.is_file() and p.name != 'summary.json']
    report = dict(schema='publication-configuration-summary/1', active_stage='configuration',
                  audit_digest=corpus['audit_digest'], historical_digest=baseline['audit_digest'],
                  tests=tests, test_total=sum(tests.values()), external_models=corpus['models'],
                  external_panels=corpus['panels'], external_files_unchanged=len(actual),
                  configuration_models=compare['configuration_models'],
                  literal_expressions=compare['literal_expressions'],
                  common_panels=compare['common_panels'], common_crossings=compare['common_crossings'],
                  known_visual_regressions=compare['regressions'],
                  browser_node_texts=browser['node_texts'], browser_port_texts=browser['port_texts'],
                  source_architecture_states=catalog['states'], catalog_models=catalog['models'],
                  stress_panels=stress['panels'], woven_panels=weave['panels'],
                  atlases=atlases, ui_exports=ui, implementation_sha256=implementation,
                  artifact_sha256={str(p.relative_to(ROOT)): sha(p) for p in artifacts},
                  arbitrary_model_publication_quality_achieved=False, limits=compare['limits'])
    (STAGE / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ['test_total', 'external_panels',
          'external_files_unchanged', 'configuration_models', 'literal_expressions',
          'common_crossings', 'known_visual_regressions', 'browser_node_texts']}))


if __name__ == '__main__':
    main()

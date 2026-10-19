#!/usr/bin/env python3
"""Check this iteration's evidence; do not equate clean checks with completion."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/inline-sequences/current'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def read(file):
    return json.loads(file.read_text())


def main():
    render_file = OUT / 'render-report.json'
    render = read(render_file)
    for file, digest in render['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    snapshot_file = ROOT / render['frozen_snapshot']
    assert sha(snapshot_file) == render['frozen_snapshot_sha256']
    for file, digest in read(snapshot_file)['files'].items():
        assert sha(snapshot_file.parent / 'implementation' / file) == digest
    extraction = read(ROOT / render['extraction'])
    assert sha(ROOT / render['extraction']) == render['extraction_sha256']
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for key in ['ir', 'before_ir']:
        assert sha(OUT / extraction[key]) == extraction[key + '_sha256']
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
    expected = {r['name']: (r['nodes'], r['edges']) for r in render['rows']}
    assert {r['name']: (r['nodes'], r['paths']) for r in browser['results']} == expected
    for row in render['rows']:
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
    for ref in render['reference']:
        for key in ['svg', 'raw_dom', 'graph']:
            assert sha(ROOT / ref[key]) == ref[key + '_sha256']
    reference_ir = read(ROOT / 'snapshots/transformer_programmatic_guide/generated/semantic_ir.json')
    generic_ir = read(ROOT / next(r['input'] for r in render['rows'] if r['name'] == 'transformer-semantic'))
    source = next(s for s in generic_ir['sources'] if s['sha256'] == reference_ir['source_sha256'])
    assert sha(Path(source['physical'])) == reference_ir['source_sha256']
    for key, file in [('saved', 'coupled-ui-saved.json'), ('expanded', 'coupled-ui-expanded.json'), ('refolded', 'coupled-ui-refolded.json'), ('svg', 'coupled-ui.svg'), ('screenshot', 'coupled-ui.png')]:
        assert sha(OUT / file) == ui[key + '_sha256']
    assert ui['reopened'] and ui['canonical_unchanged'] and ui['refolded_svg_byte_identical']
    assert ui['node_counts'] == [31, 33, 31]
    assert not render['goal_complete'] and not render['reference_frontier_match']
    result = {'schema': 'inline-sequence-validation/1', 'evidence_consistent': True, 'goal_complete': False,
              'test_counts': tests['counts'], 'tests_passed': sum(tests['counts'].values()), 'svg_panels': len(render['rows']),
              'source_sha256': reference_ir['source_sha256'], 'same_source_reference': True,
              'render_report_sha256': sha(render_file), 'svg_report_sha256': sha(OUT / 'svg-report.json'),
              'browser_report_sha256': sha(OUT / 'browser-text-report.json'), 'ui_report_sha256': sha(OUT / 'ui-report.json'),
              'audit_tool_sha256': sha(ROOT / 'tools/audit_local_svg.py'), 'summary_tool_sha256': sha(Path(__file__)),
              'tests_report_sha256': sha(ROOT / 'verification/local-relations/current/test-report.json'),
              'unresolved_geometry': render['unresolved'], 'remaining': render['remaining'],
              'prior_stage_reports': 'Historical evidence is preserved in the frozen iteration-10 snapshot. Old current-directory reports have not been re-certified against this implementation.'}
    (OUT / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

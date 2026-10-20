"""Bind route equality, actual SVG audits, browser timings and production tests."""
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/route-memoization/experiment'
STAGE = ROOT / 'verification/adaptive-role-paths/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda name: json.loads((OUT / name).read_text())


def main():
    report, browser = read('render-report.json'), read('browser-report.json')
    digest = sha(OUT / 'render-report.json')
    assert report['status'] == browser['status'] == 'complete'
    assert browser['kernel_report_sha256'] == digest
    assert browser['implementation_sha256'] == report['implementation_sha256']
    for file, expected in report['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale producer', file)
    assert (ROOT / 'semantic_studio/architecture-layout.js').read_bytes() == (OUT / 'architecture-layout-candidate.js').read_bytes()
    baseline = subprocess.check_output(['git', 'show', 'a137543cc6a354901dfc457469f8160f4da034ca:semantic_studio/architecture-layout.js'], cwd=ROOT)
    assert baseline == (OUT / 'architecture-layout-before.js').read_bytes()
    pairs = {}
    for row in report['rows']:
        pairs.setdefault(row['case'], {})[row['variant']] = row
        assert sha(ROOT / row['input']) == row['input_sha256']
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
    assert len(pairs) == 10 and len(report['rows']) == 20
    svg = read('svg-report.json')
    assert svg['render_report_sha256'] == digest and len(svg['results']) == 20
    assert all(row['passed'] for row in svg['results'])
    assert {r['case'] for r in browser['rows']} == pairs.keys()
    for row in browser['rows']:
        assert row['exact_match'] and row['cli_svg_match']
        before, candidate = [pairs[row['case']][v] for v in ['before', 'candidate']]
        assert before['svg_sha256'] == candidate['svg_sha256'] and before['document_sha256'] == candidate['document_sha256']
        for v in ['before', 'candidate']:
            result = row[v]
            assert len(result['timings_ms']) == 4 and result['measured_ms'] == result['timings_ms'][1:]
            assert result['canonical_ir_unchanged']
            assert result['svg_sha256'] == [before['svg_sha256']] * 4
            assert len(set(result['routes_sha256'])) == 1 and result['routes_sha256'] == row['before']['routes_sha256']
            assert result['quality'] == before['quality']
            assert row[v + '_median_ms'] == sorted(result['measured_ms'])[1]
        assert row['speedup'] == row['before_median_ms'] / row['candidate_median_ms']
    tests = json.loads((STAGE / 'test-report.json').read_text())
    assert sum(tests['counts'].values()) == 543 and tests['counts']['route-memoization'] == 4
    for file, expected in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == expected, ('stale tests', file)
    assert all(row['exit_code'] == 0 for row in tests['commands'])
    row = next(r for r in tests['commands'] if r['name'] == 'route-memoization')
    log = (ROOT / 'verification/local-relations/current' / row['log']).read_text()
    assert re.search(r'^ℹ tests 4$', log, re.M) and re.search(r'^ℹ fail 0$', log, re.M)
    profiles = read('cpu-profile-summary.json')
    for row in profiles['rows']:
        compressed = OUT / row['profile']; assert sha(compressed) == row['compressed_sha256']
        raw = gzip.decompress(compressed.read_bytes()); assert hashlib.sha256(raw).hexdigest() == row['profile_sha256']
        assert sha(OUT / row['layout_source']) == row['layout_sha256']
        profile = json.loads(raw); assert len(profile['samples']) == row['samples']
        nodes = {n['id']: n for n in profile['nodes']}; totals = {}
        for node_id, delta in zip(profile['samples'], profile['timeDeltas']):
            f = nodes[node_id]['callFrame']; key = (f['functionName'], f['url'].split('/')[-1], f['lineNumber'] + 1)
            totals[key] = totals.get(key, 0) + delta
        top = [{'function': k[0], 'file': k[1], 'line': k[2], 'self_ms': us / 1000} for k, us in sorted(totals.items(), key=lambda pair: -pair[1])[:15]]
        assert top == row['top']
    install = read('install-record.json')
    assert install['before_outputs_absent'] and install['current_renderer_loads_after_before_files']
    assert install['candidate_layout_sha256'] == sha(ROOT / 'semantic_studio/architecture-layout.js')
    ui = json.loads((STAGE / 'ui-report.json').read_text())
    assert ui['generic_sequence'] == [28, 28, 25, 13, 144, 28]
    assert ui['canonical_ir_unchanged'] and ui['exact_return_svg'] and ui['cli_svg_equal']
    visual = read('visual-review.json')
    assert visual['agent_viewed'] and not visual['goal_complete']
    for file, expected in visual['artifacts_sha256'].items():
        assert sha(OUT / file) == expected
    files = ['render-report.json', 'svg-report.json', 'browser-report.json', 'cpu-profile-summary.json', 'visual-review.json', 'install-record.json',
        'architecture-layout-before.js', 'architecture-layout-candidate.js', 'benchmark-worker.js', 'browser-benchmark.html', 'browser-benchmark.png']
    support = ['tools/benchmark_route_memoization.cjs', 'tools/check_route_memoization.py', 'tools/summarize_route_memoization.py', 'tests/route-memoization.test.cjs', 'docs/route-memoization.md']
    result = {'schema': 'route-memoization-validation/1', 'evidence_consistent': True, 'production_installed': True, 'goal_complete': False,
        'kernel_pairs': 10, 'actual_svg_panels': 20, 'browser_pairs': 10, 'tests': 543, 'route_regressions': 4, 'exact_route_comparisons': 932,
        'generic_ui_sequence': ui['generic_sequence'], 'browser_results': [{k: row[k] for k in ['case', 'before_median_ms', 'candidate_median_ms', 'speedup']} for row in browser['rows']],
        'scope': 'Current generic route implementation; fixed-frontier kernel timings and exact outputs. Complete adaptive and thousands-node routing/browser performance remain unverified.',
        'limitations': ['No new semantic recognition, frontier selection or visual improvement is claimed for this cache.',
            'ConditionalCarry retains its existing unplaced-label issue in the fixed-frontier kernel test.',
            'The full Transformer default adaptive comparison in session51885 remains pending; never replace it with these kernel panels.',
            'Before/candidate CLI wall times may include concurrent system load and VM overhead; browser medians are separately measured.'],
        'artifacts_sha256': {file: sha(OUT / file) for file in files}, 'supporting_tools_sha256': {file: sha(ROOT / file) for file in support},
        'stage_test_report_sha256': sha(STAGE / 'test-report.json'), 'stage_ui_report_sha256': sha(STAGE / 'ui-report.json')}
    (OUT / 'validation-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['evidence_consistent', 'production_installed', 'goal_complete', 'kernel_pairs', 'actual_svg_panels', 'browser_pairs', 'tests']}))


if __name__ == '__main__':
    main()

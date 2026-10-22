"""Bind native-browser observations and actual UI exports to formal captures."""
import json
import xml.etree.ElementTree as ET
from check_stage_routes import ROOT, OUT, reports, sha, read


if __name__ == '__main__':
    captures = reports()
    rows = [r for report in captures for r in report['rows']]
    expected = {c['svg']: c for row in rows for c in row['results']}
    browser = read(OUT/'browser-dom-checks.json')
    assert len(browser) == len(expected) == 28
    assert {r['file'] for r in browser} == expected.keys()
    for row in browser:
        c = expected[row['file']]
        assert len(row['nodes']) == c['nodes']
        assert all(t['inside'] for n in row['nodes'] for t in n['texts'])
        assert all(t['inside'] for t in row['labels'])
    pairs = [('ui-LayeredPatch.svg', 'LayeredPatch-current.svg'),
             ('ui-SummarizedPatch-open.svg', 'SummarizedPatch-open-current.svg'),
             ('ui-SummarizedPatch-reopened.svg', 'ui-SummarizedPatch-open.svg'),
             ('ui-SummarizedPatch-coarse.svg', 'SummarizedPatch-current.svg')]
    for a, b in pairs: assert sha(OUT/a) == sha(OUT/b), (a, b)
    ir = read(OUT/'SummarizedPatch.json')
    saved = read(OUT/'ui-summary-open.json')
    assert saved['ir'] == ir
    assert saved['state']['paperAuto'] is False
    source = ET.parse(OUT/'ui-SummarizedPatch-source.svg').getroot()
    ids = {e.get('data-id') for e in source.iter() if e.get('data-id')}
    edges = {e.get('data-edge-id') for e in source.iter() if e.get('data-edge-id')}
    assert ids == {n['id'] for n in ir['nodes']}
    assert edges == {e['id'] for e in ir['edges']}
    tests = read(OUT/'test-report.json')
    assert len(tests['commands']) == 93 and sum(tests['counts'].values()) == 1022
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, h in tests['implementation_sha256'].items(): assert sha(ROOT/file) == h, file
    for report in captures:
        for file, h in report['implementation_sha256'].items(): assert sha(ROOT/file) == h, file
    files = ['browser-dom-checks.json', 'test-report.json', 'independent-checks.json',
             'small-report.json', 'Transformer-F0-report.json', *[f'Transformer-F1-{i}-report.json' for i in range(3)],
             'route-review.png', 'route-compact.png', 'ui-summary-open.json', 'ui-SummarizedPatch-source.svg',
             *{file for pair in pairs for file in pair}]
    files += [p.name for p in OUT.glob('*.html')]
    result = dict(schema='stage-routes-progress/1', goal_complete=False,
                  baseline='38a2d66', passed=True, test_groups=93, tests=1022,
                  formal_svgs=28, native_text_nodes=sum(len(r['nodes']) for r in browser),
                  native_text_failures=0, ui_source_nodes=len(ids), ui_source_edges=len(edges),
                  ui_expansion=[10, 13, 16], ui_reopen_svg_equal=True,
                  ui_return='Reimported original coarse document; not a refold-controls claim',
                  transformer_f0_f1_svg_unchanged=True, transformer_convergence_complete=False,
                  limitations=['Transformer F0/F1 joint control round trip remains pending',
                               'Thousands-node SVG performance remains unverified',
                               'Coarse/fine overall reference convergence remains incomplete'],
                  files_sha256={f:sha(OUT/f) for f in files},
                  auditor_sha256=sha(ROOT/'tools/check_stage_routes_ui.py'))
    (OUT/'progress-report.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['files_sha256','auditor_sha256']}))

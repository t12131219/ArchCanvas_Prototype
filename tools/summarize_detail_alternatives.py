"""Check current bounded-detail evidence; full architecture objective stays open."""
import hashlib
import json
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/detail-alternatives/experiment'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda f: json.loads((OUT / f).read_text())

def main():
    render = read('render-report.json')
    digest = sha(OUT / 'render-report.json')
    tests = read('test-report.json')
    for report in [render, tests]:
        for f, h in report['implementation_sha256'].items():
            assert sha(ROOT / f) == h, ('stale producer', f)
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    assert sum(tests['counts'].values()) == 569 and tests['counts']['detail-alternatives'] == 10
    for c in tests['commands']:
        log = (ROOT / 'verification/local-relations/current' / c['log']).read_text()
        match = re.search(r'Ran (\d+) tests?' if c['name'] == 'python' else r'ℹ tests (\d+)', log)
        assert match and int(match[1]) == tests['counts'][c['name']]
    svg, independent, assignments, native, ui, visual = [read(f) for f in ['svg-report.json', 'independent-report.json', 'assignment-report.json', 'browser-text-report.json', 'ui-report.json', 'visual-review.json']]
    assert all(report['render_report_sha256'] == digest for report in [svg, independent, assignments, native, ui, visual])
    assert independent['passed'] and assignments['passed'] and all(r['passed'] for r in svg['results'])
    assert independent['auditor_sha256'] == sha(ROOT / 'tools/check_detail_alternatives.py')
    assert assignments['auditor_sha256'] == sha(ROOT / 'tools/audit_diagram_assignments.py')
    assert len(render['rows']) == len(svg['results']) == len(native['results']) == 42
    assert not native['failures']
    assert {r['name'] for r in render['rows']} == {r['name'] for r in svg['results']} == {r['name'] for r in native['results']}
    for row in render['rows']:
        assert sha(OUT / row['svg']) == row['svg_sha256'] and sha(OUT / row['document']) == row['document_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256'] and not row['quality']['issues']
        measured = next(r for r in native['results'] if r['name'] == row['name'])
        assert measured['nodes'] == row['nodes'] and measured['paths'] == row['edges']
    assert ui['sequence'] == [6,7,7,6] and ui['nested_sequence'] == [6,15,6] and ui['pagination_observed']
    assert ui['main_svg_restored'] and ui['detail_svg_restored'] and ui['canonical_ir_unchanged'] and ui['cli_svg_identical']
    assert ui['auditor_sha256'] == sha(ROOT / 'tools/audit_detail_alternatives_ui.cjs')
    for f, h in ui['artifacts_sha256'].items():
        assert sha(OUT / f) == h
    for f, h in visual['tools_sha256'].items():
        assert sha(ROOT / f) == h
    assert visual['reviewed']
    for f, h in visual['artifacts_sha256'].items():
        assert sha(OUT / f) == h
    comparisons = {c['name']:c for c in render['comparisons']}
    for c in comparisons.values():
        assert (OUT / c['before']['main_svg']).read_bytes() == (OUT / c['current']['main_svg']).read_bytes()
        assert c['current']['fulfilled'] >= c['before']['fulfilled']
    for name in ['NestedWorkshop','BrokenWorkshop','LongCurve','RefactoredCurve','FiberBlend']:
        c = comparisons[name]
        assert c['current']['fulfilled'] > c['before']['fulfilled']
    assert comparisons['ConditionalWorkshop']['current']['fulfilled'] == 11
    assert comparisons['Transformer-fixed']['current']['fulfilled'] == 60
    result = {'schema':'detail-alternatives-validation/1', 'evidence_consistent':True, 'production_installed':True, 'goal_complete':False,
        'tests':sum(tests['counts'].values()), 'new_tests':10, 'svg_panels':42, 'native_node_texts':sum(r['node_texts'] for r in native['results']),
        'native_edge_labels':sum(r['port_texts'] for r in native['results']), 'ui_sequence':ui['sequence'], 'nested_ui_sequence':ui['nested_sequence'],
        'all_main_svgs_identical':True, 'render_report_sha256':digest,
        'pending_checks':['transformer-default-adaptive-comparison'],
        'remaining_objective':['Dedicated-reference semantic/visual convergence','Joint main summary/detail and measured diagram-set selection','Thousands-node SVG routing and UI performance','Broader held-out state/control/routing/effect compositions'],
        'scope':'Verified exact nested/local detail alternatives and real paged UI navigation. Fixed Transformer and all main figures unchanged. Additional detail panels do not establish main-figure convergence.'}
    (OUT / 'validation-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
    raise SystemExit(2)
if __name__=='__main__':main()

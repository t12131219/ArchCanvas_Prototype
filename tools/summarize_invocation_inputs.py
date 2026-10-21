"""Validate this stage and retain the full goal's unfinished requirements."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'verification/invocation-inputs/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda f: json.loads((OUT/f).read_text())

def main():
    render, tests = read('render-report.json'), read('test-report.json')
    digest = sha(OUT/'render-report.json')
    for report in [render, tests]:
        for f, h in report['implementation_sha256'].items():
            assert sha(ROOT/f) == h, ('stale producer', f)
    for command in tests['commands']:
        assert command['exit_code'] == 0
        log = (OUT/command['log']).read_text()
        match = re.search(r'Ran (\d+) tests?' if command['name']=='python' else r'ℹ tests (\d+)', log)
        assert match and int(match[1]) == tests['counts'][command['name']]
    assert tests['counts']['invocation-inputs'] == 12
    independent, native, ui, ui_svg, roles, visual, references = [read(f) for f in [
        'independent-report.json','browser-text-report.json','ui-report.json','ui-svg-report.json','receipt-report.json','visual-review.json','reference-report.json']]
    for report in [independent,native,ui,ui_svg,roles,visual,references]:
        assert report['render_report_sha256'] == digest
    assert independent['passed'] and independent['auditor_sha256'] == sha(ROOT/'tools/check_invocation_inputs.py')
    assert len(render['rows']) == len(independent['results']) == 27
    assert len(native['results']) == 30 and not native['failures']
    for row in render['rows']:
        assert sha(OUT/row['svg']) == row['svg_sha256'] and sha(OUT/row['document']) == row['document_sha256']
        measured = next(r for r in native['results'] if r['name'] == row['name'])
        assert measured['nodes'] == row['nodes'] and measured['paths'] == row['edges']
    assert ui['sequence'] == [26,26,20,49,26] and ui['canonical_ir_unchanged'] and ui['cli_svg_equal'] and ui['exact_return_svg']
    assert ui['auditor_sha256'] == sha(ROOT/'tools/audit_invocation_inputs_ui.cjs')
    assert ui_svg['raw_source']['all_canonical_ids_and_paths_verified']
    for report in [ui,visual]:
        for f,h in report['artifacts_sha256'].items():
            assert sha(OUT/f) == h
    assert visual['reviewed']
    for f,h in visual['tools_sha256'].items():
        assert sha(ROOT/f) == h
    for f,h in references['references_sha256'].items():
        assert sha(ROOT/f) == h
    for f,h in references['crops'].items():
        assert sha(OUT/f) == h
    source = read('source-expandability.json')
    assert sha(ROOT/source['input']) == source['input_sha256']
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert source['visible_nodes'] == source['source_nodes'] == 3371
    assert source['visible_edges'] == source['source_edges'] == 3663
    from check_invocation_adaptive import verify
    adaptive = verify()
    assert adaptive['passed'] and adaptive['same_as_fixed_svg']
    rows = {r['name']:r for r in render['rows']}
    a,b = [rows['Transformer-fixed-'+v] for v in ['before','current']]
    assert [a['nodes'],b['nodes']] == [80,80]
    assert a['quality']['native_width_px'] == b['quality']['native_width_px'] == 2166
    assert a['quality']['native_height_px'] == b['quality']['native_height_px'] == 3656
    assert a['quality']['line_geometry']['crossings'] == b['quality']['line_geometry']['crossings'] == 48
    assert b['routing']['invocation_input_refinement']['accepted'] is False
    result = {'schema':'invocation-inputs-validation/1','evidence_consistent':True,'production_installed':True,'goal_complete':False,
              'tests':sum(tests['counts'].values()),'new_tests':18,'svg_panels':27,'native_panels':30,
              'native_node_texts':sum(r['node_texts'] for r in native['results']),'native_edge_labels':sum(r['port_texts'] for r in native['results']),
              'ui_sequence':ui['sequence'],'render_report_sha256':digest,'pending_checks':[],
              'adaptive':{'report_sha256':sha(OUT/'adaptive-report.json'),'independent_report_sha256':sha(OUT/'adaptive-independent-report.json'),
                          'same_as_fixed_svg':True,'elapsed_ms':adaptive['current_elapsed_ms']},
              'remaining_objective':['Dedicated-reference semantic and visual convergence','Joint summary/detail and diagram-set planning','Thousands-node SVG routing and browser interaction','Broader held-out state/control/routing/effect combinations'],
              'scope':'Fixed values and invocation scope are explicit; header layouts with measured regressions are rejected. No Transformer default geometry improvement claimed. Full goal unfinished.'}
    (OUT/'validation-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
    raise SystemExit(2)

if __name__ == '__main__':
    main()

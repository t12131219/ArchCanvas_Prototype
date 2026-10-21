"""Verify current long-path progress without declaring the full objective complete."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/serial-paths/experiment'
read=lambda f:json.loads((OUT/f).read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    render=read('render-report.json'); digest=sha(OUT/'render-report.json')
    for f,h in render['implementation_sha256'].items():
        assert sha(ROOT/f)==h, ('stale SVG producer',f)
    tests=read('test-report.json')
    for f,h in tests['implementation_sha256'].items():
        assert sha(ROOT/f)==h, ('stale test producer',f)
    assert all(r['exit_code']==0 for r in tests['commands'])
    assert sum(tests['counts'].values())==559 and tests['counts']['serial-paths']==10
    svg=read('svg-report.json'); native=read('native-text-report.json'); ui=read('ui-validation.json'); visual=read('visual-review.json')
    assert svg['render_report_sha256']==native['render_report_sha256']==visual['render_report_sha256']==digest
    assert len(render['rows'])==len(svg['results'])==len(native['results'])==30
    assert all(r['passed'] for r in svg['results']) and not native['failures']
    assert {r['name'] for r in render['rows']}=={r['name'] for r in svg['results']}=={r['name'] for r in native['results']}
    for row in render['rows']:
        assert sha(OUT/row['svg'])==row['svg_sha256'] and not row['quality']['issues']
        assert sha(ROOT/row['input'])==row['input_sha256'] and sha(OUT/row['document'])==row['document_sha256']
        measured=next(r for r in native['results'] if r['name']==row['name'])
        assert measured['nodes']==row['nodes'] and measured['paths']==row['edges']
    assert ui['sequence']==[5,12,12,19,5,34,5] and ui['all_original_ids_visible'] and ui['canonical_ir_unchanged'] and ui['byte_identical_reopen_refold_return']
    source=read('source-expandability.json')
    assert sha(ROOT/source['input'])==source['input_sha256']
    assert source['source_nodes']==source['visible_nodes']==3371 and source['source_edges']==source['visible_edges']==3663
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    for row in ui['rows']:
        assert sha(OUT/('ui-'+row['name']+'.svg'))==row['svg_sha256'] and row['cli_svg_equal']
        assert sha(OUT/('ui-'+row['name']+'.json'))==row['document_sha256']
    comparisons={r['name']:r for r in render['comparisons']}
    for name in ['LongCurve','MixedCurve','StatefulCurve','RefactoredCurve','VariedCurve','BoundedWeave','MixedBoundary','ConditionalWeave']:
        c=comparisons[name];assert c['current']['nodes']<c['before']['nodes'] and c['current']['height']<c['before']['height']
        assert c['current']['crossings']==c['before']['crossings']
    for name in ['EscapingCurve','Transformer-fixed','SameSource','GatedMixture','Bounded-requested']:
        assert comparisons[name]['svg_equal'] and comparisons[name]['routes_equal']
    assert comparisons['LateCurve']['before']==comparisons['LateCurve']['current'] and comparisons['LateCurve']['routes_equal']
    assert visual['reviewed'] and sha(OUT/visual['screenshot'])==visual['screenshot_sha256']
    for f in ['review.html','text-qa.html']:
        assert digest in (OUT/f).read_text()
    baseline=read('snapshot.json')
    for f,h in baseline['files'].items():
        data=(OUT/'before'/Path(f).name).read_bytes()
        assert hashlib.sha256(data).hexdigest()==h
        assert data==subprocess.check_output(['git','show',baseline['commit']+':'+f],cwd=ROOT)
    report={'schema':'serial-paths-validation/1','evidence_consistent':True,'production_installed':True,'goal_complete':False,
        'tests':sum(tests['counts'].values()),'new_tests':10,'svg_panels':30,'native_node_texts':sum(r['node_texts']for r in native['results']),
        'native_edge_labels':sum(r['port_texts']for r in native['results']),'ui_sequence':ui['sequence'],'render_report_sha256':digest,
        'unchanged_complete_svgs':['EscapingCurve','Transformer-fixed','SameSource','GatedMixture','Bounded-requested'],
        'pending_checks':['transformer-default-adaptive-comparison'],
        'remaining_objective':['Dedicated-reference semantic/visual convergence','Joint summary/detail and diagram-set planning','Thousands-node SVG routing and UI performance','Broader held-out state/control/routing/effect combinations'],
        'scope':'Verified long-source-path compression and reversible detail. Historical reports retain their original producers; fixed Transformer equality is not an adaptive or dedicated-reference convergence result.'}
    (OUT/'validation-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report))
    raise SystemExit(2)

if __name__=='__main__':main()

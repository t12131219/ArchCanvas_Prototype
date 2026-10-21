"""Validate the installed local-granularity change without declaring the full goal done."""
from pathlib import Path
import hashlib
import json
import re
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'verification/coherent-frontiers/current'
sha = lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda f:json.loads((OUT/f).read_text())
def main():
    render,tests = read('render-report.json'),read('test-report.json')
    digest = sha(OUT/'render-report.json')
    for report in [render,tests]:
        for f,h in report['implementation_sha256'].items():
            assert sha(ROOT/f) == h, ('stale producer',f)
    for command in tests['commands']:
        assert command['exit_code'] == 0
        log=(OUT/command['log']).read_text()
        match=re.search(r'Ran (\d+) tests?' if command['name']=='python' else r'ℹ tests (\d+)',log)
        assert match and int(match[1]) == tests['counts'][command['name']]
    assert tests['counts']['coherent-frontiers'] == 10
    svg,independent,native,ui,visual,references=[read(f)for f in ['svg-report.json','independent-report.json','browser-text-report.json','ui-report.json','visual-review.json','reference-report.json']]
    assert all(r['render_report_sha256'] == digest for r in [svg,independent,native,ui,visual,references])
    assert independent['passed'] and all(r['passed'] for r in svg['results'])
    assert independent['auditor_sha256'] == sha(ROOT/'tools/check_coherent_frontiers.py')
    assert len(render['rows']) == len(svg['results']) == len(native['results']) == 25
    assert not native['failures']
    for row in render['rows']:
        assert sha(OUT/row['svg']) == row['svg_sha256']
        assert sha(OUT/row['document']) == row['document_sha256']
        measured=next(r for r in native['results'] if r['name']==row['name'])
        assert measured['nodes']==row['nodes'] and measured['paths']==row['edges']
    assert ui['sequence']==[7,10,10,7] and ui['main_svg_restored'] and ui['detail_svg_restored'] and ui['canonical_ir_unchanged'] and ui['cli_svg_identical']
    assert ui['auditor_sha256']==sha(ROOT/'tools/audit_coherent_frontiers_ui.cjs')
    for report in [ui,visual]:
        for f,h in report['artifacts_sha256'].items():assert sha(OUT/f)==h
    assert visual['reviewed']
    for f,h in visual['tools_sha256'].items():assert sha(ROOT/f)==h
    for f,h in references['references_sha256'].items():assert sha(ROOT/f)==h
    rows={r['name']:r for r in render['rows']}
    a,b=[rows['Transformer-fixed-'+v]for v in ['before','current']]
    assert [a['nodes'],b['nodes']]==[86,80]
    assert [a['quality']['line_geometry']['crossings'],b['quality']['line_geometry']['crossings']]==[47,48]
    assert next(c for c in render['comparisons'] if c['name']=='Transformer-overview')['svg_equal']
    source=read('source-expandability.json')
    assert sha(ROOT/source['input'])==source['input_sha256']
    assert source['source_nodes']==source['visible_nodes']==3371 and source['source_edges']==source['visible_edges']==3663
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    completed_comparison = None
    if (ROOT/'verification/adaptive-comparison/current/visual-review.json').exists():
        from summarize_adaptive_comparison import verify
        completed_comparison = verify()
    result={'schema':'coherent-frontiers-validation/1','evidence_consistent':True,'production_installed':True,'goal_complete':False,
        'tests':sum(tests['counts'].values()),'new_tests':10,'svg_panels':len(render['rows']),
        'native_node_texts':sum(r['node_texts']for r in native['results']),'native_edge_labels':sum(r['port_texts']for r in native['results']),
        'ui_sequence':ui['sequence'],'render_report_sha256':digest,
        'raw_source_projection':{'nodes':3371,'edges':3663,'all_ids_preserved':True,'full_svg_routing_verified':False},
        'transformer_fixed':{'nodes':[a['nodes'],b['nodes']],'width':[a['quality']['native_width_px'],b['quality']['native_width_px']],
            'height':[a['quality']['native_height_px'],b['quality']['native_height_px']],'crossings':[47,48]},
        'pending_checks':[] if completed_comparison else ['transformer-default-adaptive-comparison'],
        'completed_adaptive_comparison':{'file':'verification/adaptive-comparison/current/validation-report.json',
            'sha256':sha(ROOT/'verification/adaptive-comparison/current/validation-report.json')} if completed_comparison else None,
        'remaining_objective':['Dedicated-reference semantic/visual convergence','Joint main summary/detail and measured diagram-set selection','Thousands-node SVG routing and UI performance','Broader held-out state/control/routing/effect compositions'],
        'scope':'Generic automatic presentation consistency improves one main-figure organization defect. Direct join/computation detail goals deferred by folding are recorded as unfulfilled, not credited as semantic coverage. All concrete facts and independent detail remain. Full objective unfinished.'}
    (OUT/'validation-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(2)
if __name__=='__main__':main()

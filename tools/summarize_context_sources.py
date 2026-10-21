"""Validate current routing-stage evidence without declaring the full goal done."""
import hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/context-sources/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    subprocess.run(['python3','tools/check_context_sources.py'],cwd=ROOT,check=True)
    r=read(OUT/'render-report.json');tests=read(OUT/'test-report.json');native=read(OUT/'browser-text-report.json');ui=read(OUT/'ui-report.json');ind=read(OUT/'independent-report.json')
    for report in [r,tests]:
        for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    for row in tests['commands']:
        assert row['exit_code']==0
        log=(OUT/row['log']).read_text();count=re.search(r'Ran (\d+) tests?' if row['name']=='python' else r'ℹ tests (\d+)',log)
        assert count and int(count[1])==tests['counts'][row['name']]
        assert ('\nOK\n' in log if row['name']=='python' else re.search(r'ℹ fail 0\b',log))
    assert native['render_report_sha256']==sha(OUT/'render-report.json') and not native['failures']
    assert native['page_sha256']==sha(OUT/'text-qa.html') and native['probe_sha256']==sha(OUT/'browser-text-probe.js')
    assert len(native['results'])==len(r['rows'])+3
    assert {x['name'] for x in native['results']}=={x['name'] for x in r['rows']}|{'ui-planned.svg','ui-folded.svg','ui-raw.svg'}
    for row in r['rows']:
        n=next(x for x in native['results'] if x['name']==row['name']);assert n['nodes']==row['nodes'] and n['paths']==row['edges']
    assert ui['passed'] and ui['sequence']==[14,14,11,14,14] and ind['raw_ui_all_ids_and_paths_verified']
    for f,h in ui['files_sha256'].items():assert sha(OUT/f)==h
    assert ind['render_report_sha256']==sha(OUT/'render-report.json') and ind['auditor_sha256']==sha(ROOT/'tools/check_context_sources.py')
    assert ind['negative_svg_panels']==2 and ind['rejection_report_sha256']==sha(OUT/'rejection-report.json') and ind['negative_svg_report_sha256']==sha(OUT/'negative-svg-report.json')
    assert ind['ui_report_sha256']==sha(OUT/'ui-report.json')
    source=read(OUT/'source-expandability.json');assert source['source_nodes']==source['visible_nodes']==3371 and source['source_edges']==source['visible_edges']==3663
    assert source['canonical_ir_unchanged'] and source['all_canonical_ids_visible'] and source['input_sha256']==sha(ROOT/source['input'])
    visual=read(OUT/'visual-review.json')
    for f,h in visual['files_sha256'].items():assert sha(OUT/f)==h
    assert visual['reviewed'] and not visual['goal_complete']
    active=read(ROOT/'verification/publication/active-stage.json');assert active['stage']=='context-sources' and not active['pending_checks']
    result={'schema':'context-source-validation/1','evidence_consistent':True,'production_installed':True,'goal_complete':False,
      'tests':sum(tests['counts'].values()),'new_tests':8,'svg_panels':len(r['rows']),'negative_svg_panels':2,'native_panels':len(native['results']),
      'native_node_texts':sum(x['node_texts'] for x in native['results']),'native_edge_labels':sum(x['port_texts'] for x in native['results']),
      'ui_sequence':ui['sequence'],'render_report_sha256':sha(OUT/'render-report.json'),'pending_checks':[],
      'remaining_objective':['Dedicated-reference semantic and visual convergence','Joint summary/detail and diagram-set planning','Thousands-node SVG routing and browser interaction','Broader held-out state/control/routing/effect combinations'],
      'scope':'Fixed role frontier and exact node geometry. A source-side routing improvement only; no full adaptive Transformer run or large-graph browser performance claim.'}
    (OUT/'validation-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(2)
if __name__=='__main__':main()

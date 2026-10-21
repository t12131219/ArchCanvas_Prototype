"""Validate joint expression evidence, retaining full-goal incompleteness."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/joint-expressions/current'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    subprocess.run(['node','tools/audit_joint_expressions_ui.cjs'],cwd=ROOT,check=True)
    subprocess.run(['python3','tools/check_joint_expressions.py'],cwd=ROOT,check=True)
    report=read(OUT/'render-report.json');tests=read(OUT/'test-report.json');native=read(OUT/'browser-text-report.json')
    ui=read(OUT/'ui-report.json');independent=read(OUT/'independent-report.json')
    for r in [report,tests]:
        for f,h in r['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    assert len(tests['commands'])==51 and sum(tests['counts'].values())==630 and tests['counts']['joint-expressions']==9
    for row in tests['commands']:
        assert row['exit_code']==0;log=(OUT/row['log']).read_text()
        count=re.search(r'Ran (\d+) tests?' if row['name']=='python' else r'ℹ tests (\d+)',log)
        assert count and int(count[1])==tests['counts'][row['name']]
        assert ('\nOK\n' in log if row['name']=='python' else re.search(r'ℹ fail 0\b',log))
    assert len(report['rows'])==84 and len(report['sets'])==24
    assert native['render_report_sha256']==sha(OUT/'render-report.json') and not native['failures']
    assert native['page_sha256']==sha(OUT/'text-qa.html') and native['probe_sha256']==sha(OUT/'browser-text-probe.js')
    expected={r['name']:r['svg'] for r in report['rows']}
    expected.update({f:f for f in ['ui-SourceMosaic-planned.svg','ui-SourceMosaic-raw.svg','ui-MixedWeave-planned.svg','ui-MixedWeave-detail.svg']})
    assert len(native['results'])==88 and {r['name'] for r in native['results']}==set(expected)
    page=(OUT/'text-qa.html').read_text();sections=dict(re.findall(r'<section data-panel="([^"]+)"><h2>[^<]+</h2>(.*?)</section>',page,re.S))
    assert set(sections)==set(expected)
    for name,f in expected.items():assert sections[name]==(OUT/f).read_text(),('inline SVG differs',name)
    for row in report['rows']:
        measured=next(r for r in native['results'] if r['name']==row['name'])
        assert measured['nodes']==row['nodes'] and measured['paths']==row['edges']
    assert ui['passed'] and ui['svg_byte_identical'] and ui['canonical_ir_preserved']
    assert independent['passed'] and independent['panels']==84 and independent['raw_ui_all_ids_and_paths_verified']
    assert independent['render_report_sha256']==sha(OUT/'render-report.json') and independent['ui_report_sha256']==sha(OUT/'ui-report.json')
    assert independent['auditor_sha256']==sha(ROOT/'tools/check_joint_expressions.py')
    source=read(OUT/'source-expandability.json')
    assert source['source_nodes']==source['visible_nodes']==3371 and source['source_edges']==source['visible_edges']==3663
    assert source['canonical_ir_unchanged'] and source['all_canonical_ids_visible'] and source['input_sha256']==sha(ROOT/source['input'])
    results={r['name']:r for r in independent['results']}
    assert [results['Transformer-'+v]['fulfilled'] for v in ['before','current']]==[49,41]
    assert (OUT/'Transformer-before-initial.svg').read_bytes()==(OUT/'Transformer-current-initial.svg').read_bytes()
    visual=read(OUT/'visual-review.json');assert visual['reviewed'] and not visual['goal_complete']
    for f,h in visual['files_sha256'].items():assert sha(OUT/f)==h
    active=read(ROOT/'verification/publication/active-stage.json');assert active['stage']=='joint-expressions' and not active['pending_checks']
    result={'schema':'joint-expressions-validation/1','evidence_consistent':True,'production_installed':True,'goal_complete':False,
        'tests':630,'commands':51,'new_tests':9,'svg_panels':84,'native_panels':88,
        'native_node_texts':sum(r['node_texts'] for r in native['results']),'native_edge_labels':sum(r['port_texts'] for r in native['results']),
        'ui':ui['results'],'render_report_sha256':sha(OUT/'render-report.json'),'pending_checks':[],
        'known_regression':'Transformer at two trials: 49/1855 -> 41/1855 directly expressed goals, unchanged main SVG.',
        'remaining_objective':['Dedicated-reference semantic and visual convergence','Budget-efficient joint summary/detail, container and diagram-set planning',
            'Thousands-node SVG routing and browser interaction','Broader held-out state/control/routing/effect combinations'],
        'scope':'Explicit bounded local competition between inline expansion and independent details. Default sequential policy preserved; no global optimum or dedicated convergence claim.'}
    (OUT/'validation-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(2)
if __name__=='__main__':main()

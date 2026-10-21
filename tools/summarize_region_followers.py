"""Verify stage evidence and keep the full architecture goal explicitly unfinished."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/region-followers/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    subprocess.run(['node','tools/audit_region_followers_ui.cjs'],cwd=ROOT,check=True)
    subprocess.run(['python3','tools/check_region_followers.py'],cwd=ROOT,check=True)
    report=read(OUT/'render-report.json')
    tests=read(OUT/'test-report.json')
    native=read(OUT/'browser-text-report.json')
    ui=read(OUT/'ui-report.json')
    independent=read(OUT/'independent-report.json')
    for r in [report,tests]:
        for f,h in r['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    assert len(tests['commands'])==49 and sum(tests['counts'].values())==614
    assert tests['counts']['region-followers']==9
    for row in tests['commands']:
        assert row['exit_code']==0
        log=(OUT/row['log']).read_text()
        count=re.search(r'Ran (\d+) tests?' if row['name']=='python' else r'ℹ tests (\d+)',log)
        assert count and int(count[1])==tests['counts'][row['name']]
        assert ('\nOK\n' in log if row['name']=='python' else re.search(r'ℹ fail 0\b',log))
    assert native['render_report_sha256']==sha(OUT/'render-report.json') and not native['failures']
    assert native['page_sha256']==sha(OUT/'text-qa.html') and native['probe_sha256']==sha(OUT/'browser-text-probe.js')
    expected={r['name']:r['svg'] for r in report['rows']}
    expected.update({f:f for f in ['GuardedInputs-rejected.svg','ui-planned.svg','ui-folded.svg','ui-raw.svg']})
    assert len(report['rows'])==31 and len(native['results'])==35
    assert {r['name'] for r in native['results']}==set(expected)
    # The page measured by the browser must contain the exact native SVG bytes.
    page=(OUT/'text-qa.html').read_text()
    sections=dict(re.findall(r'<section data-panel="([^"]+)"><h2>[^<]+</h2>(.*?)</section>',page,re.S))
    assert set(sections)==set(expected)
    for name,f in expected.items():assert sections[name]==(OUT/f).read_text(),('inline SVG differs',name)
    for row in report['rows']:
        measured=next(r for r in native['results'] if r['name']==row['name'])
        assert measured['nodes']==row['nodes'] and measured['paths']==row['edges']
    assert ui['passed'] and ui['sequence']==[15,15,10,15,15]
    assert ui['canonical_nodes']==15 and ui['canonical_edges']==12
    for f,h in ui['files_sha256'].items():assert sha(OUT/f)==h
    assert independent['passed'] and independent['svg_panels']==32 and independent['negative_svg_panels']==1
    assert independent['render_report_sha256']==sha(OUT/'render-report.json')
    assert independent['auditor_sha256']==sha(ROOT/'tools/check_region_followers.py')
    assert independent['rejection_report_sha256']==sha(OUT/'rejection-report.json')
    assert independent['ui_report_sha256']==sha(OUT/'ui-report.json') and independent['raw_ui_all_ids_and_paths_verified']
    source=read(OUT/'source-expandability.json')
    assert source['source_nodes']==source['visible_nodes']==3371 and source['source_edges']==source['visible_edges']==3663
    assert source['canonical_ir_unchanged'] and source['all_canonical_ids_visible'] and source['input_sha256']==sha(ROOT/source['input'])
    visual=read(OUT/'visual-review.json')
    assert visual['reviewed'] and not visual['goal_complete']
    for f,h in visual['files_sha256'].items():assert sha(OUT/f)==h
    active=read(ROOT/'verification/publication/active-stage.json')
    assert active['stage']=='region-followers' and not active['pending_checks']
    result={'schema':'region-follower-validation/1','evidence_consistent':True,'production_installed':True,
        'goal_complete':False,'tests':614,'commands':49,'new_tests':9,'svg_panels':31,'negative_svg_panels':1,
        'native_panels':35,'native_node_texts':sum(r['node_texts'] for r in native['results']),
        'native_edge_labels':sum(r['port_texts'] for r in native['results']),'ui_sequence':ui['sequence'],
        'render_report_sha256':sha(OUT/'render-report.json'),'pending_checks':[],
        'remaining_objective':['Dedicated-reference semantic and visual convergence','Joint summary/detail and diagram-set planning',
            'Thousands-node SVG routing and browser interaction','Broader held-out state/control/routing/effect combinations'],
        'scope':'Fixed role frontier; only recorded follower x coordinates change. Current full adaptive execution and large SVG/UI performance are not verified.'}
    (OUT/'validation-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
    raise SystemExit(2)

if __name__=='__main__':main()

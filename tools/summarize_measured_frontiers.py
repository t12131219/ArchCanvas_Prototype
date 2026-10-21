"""Validate final-geometry selection evidence without closing the full goal."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/measured-frontiers/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    subprocess.run(['node','tools/audit_measured_frontiers_ui.cjs'],cwd=ROOT,check=True)
    subprocess.run(['python3','tools/check_measured_frontiers.py'],cwd=ROOT,check=True)
    report=read(OUT/'render-report.json');tests=read(OUT/'test-report.json')
    native=read(OUT/'browser-text-report.json');ui=read(OUT/'ui-report.json')
    independent=read(OUT/'independent-report.json')
    for r in [report,tests]:
        for f,h in r['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    assert len(tests['commands'])==50 and sum(tests['counts'].values())==621
    assert tests['counts']['measured-frontiers']==7
    for row in tests['commands']:
        assert row['exit_code']==0
        log=(OUT/row['log']).read_text()
        count=re.search(r'Ran (\d+) tests?' if row['name']=='python' else r'ℹ tests (\d+)',log)
        assert count and int(count[1])==tests['counts'][row['name']]
        assert ('\nOK\n' in log if row['name']=='python' else re.search(r'ℹ fail 0\b',log))
    assert native['render_report_sha256']==sha(OUT/'render-report.json') and not native['failures']
    assert native['page_sha256']==sha(OUT/'text-qa.html') and native['probe_sha256']==sha(OUT/'browser-text-probe.js')
    expected={r['name']:r['svg'] for r in report['rows']}
    expected.update({f:f for f in ['ui-planned.svg','ui-folded.svg','ui-raw.svg','ui-adaptive.svg']})
    assert len(report['rows'])==24 and len(native['results'])==28 and len(report['replays'])==3
    assert {r['name'] for r in native['results']}==set(expected)
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
    assert independent['passed'] and independent['panels']==24
    assert independent['render_report_sha256']==sha(OUT/'render-report.json')
    assert independent['auditor_sha256']==sha(ROOT/'tools/check_measured_frontiers.py')
    assert independent['ui_report_sha256']==sha(OUT/'ui-report.json') and independent['raw_ui_all_ids_and_paths_verified']
    source=read(OUT/'source-expandability.json')
    assert source['source_nodes']==source['visible_nodes']==3371 and source['source_edges']==source['visible_edges']==3663
    assert source['canonical_ir_unchanged'] and source['all_canonical_ids_visible'] and source['input_sha256']==sha(ROOT/source['input'])
    visual=read(OUT/'visual-review.json')
    assert visual['reviewed'] and not visual['goal_complete']
    for f,h in visual['files_sha256'].items():assert sha(OUT/f)==h
    active=read(ROOT/'verification/publication/active-stage.json')
    assert active['stage']=='measured-frontiers' and not active['pending_checks']
    by={r['name']:r for r in report['rows']}
    for name in ['CrossedBranches','Transformer']:
        assert by[name+'-before']['selected_metrics_match'] is False
        assert by[name+'-current']['selected_metrics_match'] is True
    result={'schema':'measured-frontier-validation/1','evidence_consistent':True,'production_installed':True,
        'goal_complete':False,'tests':621,'commands':50,'new_tests':7,'svg_panels':24,'independent_candidate_replays':3,
        'native_panels':28,'native_node_texts':sum(r['node_texts'] for r in native['results']),
        'native_edge_labels':sum(r['port_texts'] for r in native['results']),'ui_sequence':ui['sequence'],
        'render_report_sha256':sha(OUT/'render-report.json'),'pending_checks':[],
        'remaining_objective':['Dedicated-reference semantic and visual convergence','Joint summary/detail and diagram-set planning',
            'Thousands-node SVG routing and browser interaction','Broader held-out state/control/routing/effect combinations'],
        'scope':'Final geometry participates in bounded automatic selection. Full old/current Transformer auto runs completed; only the small three candidates were independently replayed as SVG. No global joint planning or large raw SVG/UI performance claim.'}
    (OUT/'validation-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
    raise SystemExit(2)

if __name__=='__main__':main()

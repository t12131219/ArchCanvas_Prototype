"""Bind current implementation to actual SVG, UI and browser review evidence."""
import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/adaptive-frontier/current'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    digest = sha(OUT / 'render-report.json')
    for file, value in report['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale implementation', file)
    if report.get('report_completion'):
        completion = report['report_completion']
        measured_file = ROOT / completion['render_pass_report']
        assert sha(measured_file) == completion['render_pass_report_sha256']
        measured = read(measured_file)
        assert completion['changed_files'] == ['tools/audit_adaptive_frontier.cjs']
        for file, value in measured['implementation_sha256'].items():
            if file not in completion['changed_files']:
                assert sha(ROOT / file) == value, ('changed measured renderer', file)
        for before, after in zip(measured['rows'], report['rows'], strict=True):
            assert before == {k:v for k,v in after.items() if k not in ['selected','configuration_paths']}
    frozen = ROOT / report['frozen_snapshot']
    assert sha(frozen) == report['frozen_snapshot_sha256']
    for file, value in read(frozen)['files'].items():
        assert sha(frozen.parent / 'implementation' / file) == value
    assert sha(ROOT / report['prior_report']) == report['prior_report_sha256']
    rows = {r['name']: r for r in report['rows']}
    for row in rows.values():
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg','document']:
            assert sha(OUT / row[key]) == row[key+'_sha256']
    tests = read(ROOT / 'verification/local-relations/current/test-report.json')
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for file, value in tests['implementation_sha256'].items():
        assert sha(ROOT / file) == value, ('stale tests', file)
    evidence = {name:read(OUT / name) for name in ['svg-report.json','adaptive-report.json','receipt-report.json','ui-report.json','browser-text-report.json','visual-review.json']}
    for value in evidence.values():
        assert value['render_report_sha256'] == digest
    assert all(r['passed'] for r in evidence['svg-report.json']['results'])
    assert all(evidence[file]['passed'] for file in ['adaptive-report.json','receipt-report.json','ui-report.json'])
    browser = evidence['browser-text-report.json']
    assert not browser['failures'] and len(browser['results']) == len(rows)
    assert {r['name']:(r['nodes'],r['paths']) for r in browser['results']} == {r['name']:(r['nodes'],r['edges']) for r in rows.values()}
    for file, value in evidence['ui-report.json']['artifacts_sha256'].items():
        assert sha(OUT / file) == value
    for screen in evidence['visual-review.json']['screenshots']:
        assert sha(OUT / screen['file']) == screen['sha256']
    expansion = read(OUT / 'source-expandability.json')
    assert sha(ROOT / expansion['input']) == expansion['input_sha256']
    assert expansion['canonical_ir_unchanged'] and expansion['all_canonical_ids_visible']
    assert expansion['source_nodes'] == expansion['visible_nodes'] == 3371
    assert expansion['source_edges'] == expansion['visible_edges'] == 3663
    assert rows['transformer-default']['svg_sha256'] == rows['transformer-adaptive']['svg_sha256']
    assert all(not a['accepted'] for a in rows['transformer-adaptive']['adaptive']['attempts'])
    adopted = {name:[a['gain'] for a in r['adaptive']['attempts'] if a['accepted']] for name,r in rows.items() if r['adaptive']}
    supplements = ['tools/audit_adaptive_frontier.py','tools/audit_adaptive_frontier_ui.cjs','tools/build_adaptive_frontier_review.py',
                  'tools/summarize_adaptive_frontier.py','tools/audit_role_detail_receipts.py','tools/summarize_publication_checks.py',
                  'docs/adaptive-frontier.md','verification/adaptive-frontier/current/README.md','verification/publication/active-stage.json']
    result = {'schema':'adaptive-frontier-validation/1','evidence_consistent':True,'goal_complete':False,'tests':sum(tests['counts'].values()),
              'svg_panels':len(rows),'browser_texts':browser['texts'],'contained_texts':browser['checked'],'adopted_gains':adopted,
              'prior_states_svg_unchanged':sum(bool(r.get('comparison',{}).get('unchanged')) for r in rows.values() if r.get('comparison')),
              'ui_node_counts':evidence['ui-report.json']['node_counts'],'raw_source_expansion':{'nodes':3371,'edges':3663},
              'failed_geometry':{name:r['quality']['issues'] for name,r in rows.items() if r['quality']['issues']},
              'supplemental_sha256':{file:sha(ROOT/file) for file in supplements},
              'limits':['Additive bounded local refinement only; no global coarsening or optimal frontier search.',
                        'Transformer selected SVG remains unchanged; reference logic/geometry correspondence is incomplete.',
                        'The synchronous routed search has a trial count cap, not a proven runtime or large-graph performance bound.',
                        'Full-thousands-node SVG routing and browser performance remain unverified.',
                        'Automatic graph-set planning, dense cross-region readability and broader unseen combinations remain incomplete.']}
    (OUT / 'validation-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
    raise SystemExit(2)


if __name__ == '__main__':
    main()

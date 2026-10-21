"""Verify completed full adaptive output against its frozen, audited predecessor."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import xml.etree.ElementTree as ET
import audit_local_svg as shared

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / 'verification/invocation-inputs/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())

def verify():
    report = read(OUT/'adaptive-report.json')
    assert report['terminal']
    for f, h in report['implementation_sha256'].items():
        assert sha(ROOT/f) == h, ('stale adaptive production', f)
    old = ROOT/report['baseline']['directory']
    assert sha(old/'render-report.json') == report['baseline']['report_sha256']
    old_report = read(old/'render-report.json')
    snapshot = read(OUT/'snapshot.json')
    for f, h in snapshot['files'].items():
        assert old_report['implementation_sha256'][f] == h
        assert sha(OUT/'before'/Path(f).name) == h
    before, current = report['baseline']['row'], report['current']
    assert before == next(r for r in old_report['rows'] if r['name'] == 'transformer-current')
    assert before['state'] == current['state'] and current['state']['paperAdaptive']
    assert sha(old/before['svg']) == before['svg_sha256'] and sha(old/before['document']) == before['document_sha256']
    assert sha(OUT/current['svg']) == current['svg_sha256'] and sha(OUT/current['document']) == current['document_sha256']
    assert sha(ROOT/current['input']) == before['input_sha256'] == current['input_sha256']
    a, b = read(old/before['document']), read(OUT/current['document'])
    assert a['ir'] == b['ir'] == read(ROOT/current['input'])
    roles = lambda d: sorted((r['certificate'], r['role_keys'], r['node']) for r in d['publication']['role_frontier']['roles'] if r['status'] == 'exposed')
    assert roles(a) == roles(b)
    for bucket, key in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
        ids = sum(b['layout'][bucket].values(), [])
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in b['ir'][key]}
    assert b['publication']['adaptive_frontier'] == current['adaptive']
    assert current['elapsed_ms'] > 0
    q = current['quality']
    assert not q['issues'] and not q['route_failures'] and not q['line_geometry']['unrelated_contacts']
    assert b['publication']['invocation_inputs'] == current['invocation_inputs']
    tree = ET.parse(OUT/current['svg'])
    actual = {e.get('data-node-id'): e for e in tree.iter() if e.get('data-node-id')}
    for row in current['invocation_inputs']['rows']:
        if row['status'] in ['visible','docked']:
            assert row['node'] in actual and row['label'] in ''.join(actual[row['node']].itertext())
    row = {**current, 'svg': str(OUT/current['svg']), 'document': str(OUT/current['document']),
           'local_pipelines': b['publication'].get('local_pipelines'), 'contract_stages': b['publication'].get('contract_stages'),
           'context_lanes': b['layout'].get('context_lanes', []), 'branch_columns': b['layout'].get('branch_columns', []),
           'compound_alignments': b['layout'].get('compound_alignments', [])}
    shared.audit_pipeline_summaries(b, row, actual)
    with tempfile.TemporaryDirectory(prefix='archcanvas-invocation-adaptive-') as temporary:
        folder = Path(temporary)
        (folder/'render-report.json').write_text(json.dumps({'rows':[row]}))
        shared.OUT = folder
        sys.argv = [__file__]
        shared.main()
        physical = read(folder/'svg-report.json')
    fixed = next(r for r in read(OUT/'render-report.json')['rows'] if r['name'] == 'Transformer-fixed-current')
    same_fixed = sha(OUT/current['svg']) == fixed['svg_sha256']
    result = {'schema':'invocation-adaptive-independent/1','adaptive_report_sha256':sha(OUT/'adaptive-report.json'), 'auditor_sha256':sha(Path(__file__)),
              'passed':True,'physical':physical,'same_as_fixed_svg':same_fixed,'exposed_exact_roles':len(roles(b)),
              'selected_additional_paths':len(current['adaptive']['selected_role_paths']), 'current_elapsed_ms':current['elapsed_ms'],
              'goal_complete':False,'scope':'Completed CLI default adaptive run with original facts, exact roles and actual SVG paths. Does not measure browser adaptive latency or thousands-node interaction.'}
    (OUT/'adaptive-independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

if __name__ == '__main__':
    print(json.dumps(verify()))

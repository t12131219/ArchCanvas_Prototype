"""Independently audit saved source facts, automatic choices and actual SVG paths."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/coherent-frontiers/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
from semantic_adapter.analyzer import analyze
import audit_local_svg as geometry
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
report = read(OUT / 'render-report.json')
for f, h in report['implementation_sha256'].items():
    assert sha(ROOT / f) == h, ('stale producer', f)
snapshot = read(OUT / 'snapshot.json')
assert sha(OUT / 'snapshot.json') == report['baseline_sha256']
for f, h in snapshot['files'].items():
    saved = OUT / 'before' / Path(f).name
    assert sha(saved) == h
    assert saved.read_bytes() == subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)
extraction = read(OUT / 'extraction.json')
assert sha(ROOT / extraction['source']) == extraction['source_sha256']
for row in extraction['rows']:
    assert sha(ROOT / row['input']) == row['sha256']
    assert analyze(ROOT / extraction['source'], row['entry']) == read(ROOT / row['input'])
for row in report['rows']:
    doc = read(OUT / row['document'])
    assert doc['ir'] == read(ROOT / row['input'])
    assert sha(ROOT / row['input']) == row['input_sha256']
    assert sha(OUT / row['document']) == row['document_sha256']
    assert sha(OUT / row['svg']) == row['svg_sha256']
    tree = ET.parse(OUT / row['svg'])
    nodes = {n.get('data-node-id'):n for n in tree.iter() if n.get('data-node-id')}
    paths = {n.get('data-edge-id'):n for n in tree.iter() if n.get('data-edge-id')}
    assert len(nodes) == row['nodes'] and len(paths) == row['edges']
    q = row['quality']
    assert list(map(float, tree.getroot().get('viewBox').split()))[2:] == [q['native_width_px'], q['native_height_px']]
    segments = [list(zip(p, p[1:])) for p in [[(float(x),float(y)) for x,y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', p.get('d'))] for p in paths.values()]]
    crossings = 0
    for i, first in enumerate(segments):
        for second in segments[i+1:]:
            for a,b in first:
                for c,d in second:
                    if (a[0] == b[0]) == (c[0] == d[0]): continue
                    v,w,h,k = (a,b,c,d) if a[0] == b[0] else (c,d,a,b)
                    crossings += min(h[0],k[0]) < v[0] < max(h[0],k[0]) and min(v[1],w[1]) < h[1] < max(v[1],w[1])
    assert crossings == q['line_geometry']['crossings']
    assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
    assert not q['line_geometry']['unrelated_contacts']
    assert all(p['same_value'] for p in q['line_geometry']['overlapping_paths'])
    for bucket,key in [('node_accounting','nodes'),('edge_accounting','edges')]:
        ids = [at for group in doc['layout'][bucket].values() for at in group]
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in doc['ir'][key]}
    planned = {n['id']:n for n in doc['architecture']['nodes']}
    positions = {n['id']:n for n in doc['layout']['nodes']}
    for choice in row['choices']:
        assert len(choice['nodes']) > 1
        assert choice['status'] == ('expanded' if choice['used']+choice['delta'] <= choice['budget'] else 'deferred')
        assert choice['delta'] == len(choice['nodes']) * (sum(.25 if c[0] == 'interface' else 1 for c in choice['profile'][1])-1)
        for id in choice['nodes']:
            assert planned[id]['presentation_only']
            assert id in nodes and positions[id]['expanded'] == (choice['status'] == 'expanded')
            members = set(planned[id]['canonical_members'])
            assert all(not n.get('mutable') and not n.get('condition') and n['kind'] not in ['opaque','control'] and not n.get('identity_display') and n.get('evidence_status') != 'runtime-only' for n in doc['ir']['nodes'] if n['id'] in members)
            assert all(not e.get('condition') and not e.get('iteration') and e['kind'] in ['data','alias','interface-binding','parameter-read'] for e in doc['ir']['edges'] if e['source'] in members or e['target'] in members)
    for cut in doc['publication']['boundary']:
        original = next(e for e in doc['ir']['edges'] if e['id'] == cut['id'])
        assert all(cut.get(k) == original.get(k) for k in ['source','target','source_port','target_port','kind','condition','evidence'])
    docks(doc,tree); returns(doc,tree)
    geometry.audit_pipeline_summaries(doc,row,nodes)
    geometry.audit_contract_stages(doc,row,nodes)
by = {r['name']:r for r in report['rows']}
comparisons = []
for pair in report['comparisons']:
    a,b = [by[pair[k]] for k in ['before','current']]
    assert pair['svg_equal'] == ((OUT/a['svg']).read_bytes() == (OUT/b['svg']).read_bytes())
    # A folded detail does not count as a newly fulfilled direct goal.
    da,db = [read(OUT / row['document']) for row in [a,b]]
    exposed = lambda d: sorted((r['certificate'],r['role_keys'],r['node']) for r in d['publication'].get('role_frontier',{}).get('roles',[]) if r['status'] == 'exposed')
    assert exposed(da) == exposed(db)
    protected = lambda d: {n['id'] for n in d['architecture']['nodes'] if n['kind'] in ['opaque','control'] or n.get('condition') or n.get('mutable') or n.get('identity_display')}
    protected_ids = protected(da) | protected(db)
    visible = lambda d: {n['id'] for n in d['layout']['nodes']}
    assert visible(da) & protected_ids == visible(db) & protected_ids
    comparisons.append({'name':pair['name'], 'main_svg_equal':pair['svg_equal'], 'before_expression_counts':a['expression_counts'], 'current_expression_counts':b['expression_counts'], 'exposed_roles_unchanged':True, 'protected_visibility_unchanged':True})
geometry.OUT = OUT; sys.argv = [__file__]; geometry.main()
result = {'schema':'coherent-frontiers-independent/1', 'render_report_sha256':sha(OUT/'render-report.json'), 'auditor_sha256':sha(Path(__file__)), 'source_fixtures':len(extraction['rows']), 'svg_panels':len(report['rows']), 'comparisons':comparisons, 'passed':True, 'goal_complete':False}
(OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'svg_panels':len(report['rows']), 'passed':True}))

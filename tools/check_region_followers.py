"""Inspect actual source-side SVG geometry and exact before/after facts."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/region-followers/current'
sys.path[:0]=[str(ROOT),str(ROOT/'tools')]
import audit_local_svg as geometry
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report=read(OUT/'render-report.json')
for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('producer changed',f)
for f,h in report['baseline']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',report['baseline']['commit']+':'+f],cwd=ROOT)).hexdigest()==h
results=[]
rejection=read(OUT/'rejection-report.json')
assert rejection['passed'] and rejection['baseline_preserved']
assert rejection['render_report_sha256']==sha(OUT/'render-report.json')
assert rejection['producer_sha256']==sha(ROOT/'tools/audit_region_followers_rejection.cjs')
for f,h in rejection['files_sha256'].items():assert sha(OUT/f)==h
baseline_row=next(r for r in report['rows'] if r['name']=='GuardedInputs-current')
candidate_doc=read(OUT/'GuardedInputs-rejected.layout.json')
baseline_doc=read(OUT/baseline_row['document'])
assert candidate_doc['ir']==baseline_doc['ir']
for field in ['node_accounting','edge_accounting','representatives','frame_ownership']:
    assert candidate_doc['layout'].get(field)==baseline_doc['layout'].get(field)
assert candidate_doc['publication']==baseline_doc['publication']
assert [{k:v for k,v in e.items() if k!='route'} for e in candidate_doc['layout']['edges']]==[{k:v for k,v in e.items() if k!='route'} for e in baseline_doc['layout']['edges']]
changed={r['node']:r for r in rejection['records']}
for a,b in zip(baseline_doc['layout']['nodes'],candidate_doc['layout']['nodes']):
    assert a['id']==b['id']
    if a['id'] not in changed:assert a==b
    else:
        assert {k:v for k,v in a.items() if k!='x'}=={k:v for k,v in b.items() if k!='x'}
        assert changed[a['id']]['before']=={'x':a['x'],'y':a['y']}
        assert changed[a['id']]['after']=={'x':b['x'],'y':b['y']}
negative={**baseline_row,'name':'GuardedInputs-rejected','svg':'GuardedInputs-rejected.svg',
    'document':'GuardedInputs-rejected.layout.json','receipt':None,
    'quality':candidate_doc['diagnostics']['publication']}
negative.update(svg_sha256=sha(OUT/negative['svg']),document_sha256=sha(OUT/negative['document']))
assert negative['quality']['wire_length']==rejection['candidate_wire']>rejection['before_wire']==baseline_row['quality']['wire_length']
assert baseline_row['receipt']['accepted'] is False
for row in report['rows']+[negative]:
    doc=read(OUT/row['document']);tree=ET.parse(OUT/row['svg'])
    assert sha(OUT/row['svg'])==row['svg_sha256'] and sha(OUT/row['document'])==row['document_sha256']
    assert sha(ROOT/row['input'])==row['input_sha256'] and doc['ir']==read(ROOT/row['input'])
    assert not row['quality']['issues'] and not row['quality']['route_failures']
    if row.get('reuse'):
        historical=read(ROOT/row['reuse']['report'])
        for f,h in report['baseline']['files'].items():assert historical['implementation_sha256'][f]==h,('reused producer differs',f)
        old=next(r for r in historical['rows'] if r['name']=='Transformer-current')
        assert sha(ROOT/row['reuse']['svg'])==old['svg_sha256']==row['svg_sha256']
        assert read(ROOT/row['reuse']['document'])==doc
        assert old['input_sha256']==row['input_sha256'] and old['state']==row['state']
    nodes={n.get('data-node-id'):n for n in tree.iter() if n.get('data-node-id')}
    paths={n.get('data-edge-id'):n for n in tree.iter() if n.get('data-edge-id')}
    positions={n['id']:n for n in doc['layout']['nodes']}
    assert set(nodes)==set(positions) and len(paths)==row['edges']
    for bucket,key in [('node_accounting','nodes'),('edge_accounting','edges')]:
        ids=[v for group in doc['layout'][bucket].values() for v in group]
        assert len(ids)==len(set(ids)) and set(ids)=={n['id'] for n in doc['ir'][key]}
    lines={id:[(float(x),float(y)) for x,y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',p.get('d'))] for id,p in paths.items()}
    edges={e['id']:e for e in doc['layout']['edges']}
    length=sum(abs(a[0]-b[0])+abs(a[1]-b[1]) for ps in lines.values() for a,b in zip(ps,ps[1:]))
    assert abs(round(length,1)-row['quality']['wire_length'])<1e-6
    segments=[list(zip(ps,ps[1:])) for ps in lines.values()];crossings=0
    for i,first in enumerate(segments):
        for second in segments[i+1:]:
            for a,b in first:
                for c,d in second:
                    if (a[0]==b[0])==(c[0]==d[0]):continue
                    v,w,h,k=(a,b,c,d) if a[0]==b[0] else (c,d,a,b)
                    crossings+=min(h[0],k[0])<v[0]<max(h[0],k[0]) and min(v[1],w[1])<h[1]<max(v[1],w[1])
    assert crossings==row['quality']['line_geometry']['crossings']
    receipt=row.get('receipt') or {}
    if receipt.get('accepted'):
        parents={n['id']:n.get('parent') for n in doc['architecture']['nodes']}
        def owner(node,parent):
            while node and parents.get(node)!=parent:node=parents.get(node)
            return node
        for record in receipt['records']:
            p=positions[record['node']];parent=positions[record['parent']]
            assert record['before']['y']==record['after']['y']==p['y'] and p['x']==record['after']['x']
            assert not p['expanded'] and not p.get('cyclic')
            actual=nodes[p['id']];xy=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',actual.get('transform'))))
            assert xy==[p['x'],p['y']]
            incoming=[e for e in edges.values() if e['target']==p['id']]
            expected=[{k:e[k] for k in ['source','target','source_port','target_port']}|{'edge':e['id']} for e in incoming]
            assert expected==record['inputs']
            assert {owner(e['source'],record['parent']) for e in incoming}=={record['source_region']}
            source=positions[record['source_region']];assert p['y']>=source['y']+source['h']
            assert parent['x']+16<=p['x'] and p['x']+p['w']<=parent['x']+parent['w']-16
            for e in incoming:assert all(m['kind'] in ['data','alias','interface-binding'] and not m.get('condition') for m in e.get('bundle_members',[e]))
            for peer in positions.values():
                if peer['id']==p['id'] or parents.get(peer['id'])!=record['parent']:continue
                assert not (p['x']<peer['x']+peer['w']+8 and p['x']+p['w']+8>peer['x'] and p['y']<peer['y']+peer['h']+8 and p['y']+p['h']+8>peer['y'])
    docks(doc,tree);returns(doc,tree)
    geometry.audit_pipeline_summaries(doc,{**row,'local_pipelines':doc['publication'].get('local_pipelines')},nodes)
    geometry.audit_contract_stages(doc,{**row,'contract_stages':doc['publication'].get('contract_stages')},nodes)
    results.append({'name':row['name'],'crossings':crossings,'wire_length':round(length,1),'passed':True})
by={r['name']:r for r in report['rows']}
for pair in report['comparisons']:
    a,b=[by[pair[k]] for k in ['before','current']];da,db=[read(OUT/r['document']) for r in [a,b]]
    assert da['ir']==db['ir']
    for field in ['node_accounting','edge_accounting','representatives','frame_ownership']:assert da['layout'].get(field)==db['layout'].get(field),(pair['name'],field)
    pa,pb=[{n['id']:n for n in d['layout']['nodes']} for d in [da,db]]
    assert pa.keys()==pb.keys()
    receipt=b.get('receipt') or {};changed={r['node']:r for r in receipt.get('records',[])} if receipt.get('accepted') else {}
    for id,n in pa.items():
        if id not in changed:assert n==pb[id],(pair['name'],id,'unrecorded geometry change')
        else:
            assert {k:v for k,v in n.items() if k!='x'}=={k:v for k,v in pb[id].items() if k!='x'}
            assert changed[id]['before']=={'x':n['x'],'y':n['y']}
    if receipt.get('accepted'):
        assert b['quality']['line_geometry']['unrelated_contacts'].__len__()<=a['quality']['line_geometry']['unrelated_contacts'].__len__()
        assert b['quality']['native_width_px']*b['quality']['native_height_px']<=a['quality']['native_width_px']*a['quality']['native_height_px']
    edge_facts=lambda d:[{k:v for k,v in e.items() if k!='route'} for e in d['layout']['edges']]
    assert edge_facts(da)==edge_facts(db)
    for field in ['boundary','open','role_frontier','local_pipelines','contract_stages','invocation_inputs']:assert da['publication'].get(field)==db['publication'].get(field),(pair['name'],field)
    assert pair['svg_equal']==((OUT/a['svg']).read_bytes()==(OUT/b['svg']).read_bytes())
    assert b['quality']['wire_length']<=a['quality']['wire_length'] and b['quality']['line_geometry']['crossings']<=a['quality']['line_geometry']['crossings']
# Generic audit also checks physical terminals, original slots and exact cuts.
geometry.OUT=OUT
saved=sys.argv;sys.argv=[saved[0]]
try:geometry.main()
finally:sys.argv=saved
result={'schema':'region-follower-independent/1','render_report_sha256':sha(OUT/'render-report.json'),'auditor_sha256':sha(Path(__file__)),
        'negative_svg_panels':1,'rejection_report_sha256':sha(OUT/'rejection-report.json'),
        'svg_panels':len(results),'results':results,'passed':True,'goal_complete':False}
(OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'svg_panels':len(results),'passed':True}))
# Raw source UI exports carry exact canonical identities and real route points.
if (OUT/'ui-report.json').exists():
    ui=read(OUT/'ui-report.json')
    for f,h in ui['files_sha256'].items():assert sha(OUT/f)==h
    raw=read(OUT/'ui-raw-projection.json');ir=read(OUT/'ui-raw-state.json')['ir'];tree=ET.parse(OUT/'ui-raw.svg')
    nodes={n.get('data-id'):n for n in tree.iter() if n.get('data-id')}
    paths={n.get('data-edge-id'):n for n in tree.iter() if n.get('data-edge-id')}
    assert set(nodes)=={n['id'] for n in ir['nodes']} and set(paths)=={e['id'] for e in ir['edges']}
    for p in raw['nodes']:
        xy=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',nodes[p['id']].get('transform'))));assert xy==[p['x'],p['y']]
    for e in raw['edges']:
        ps=[(float(x),float(y)) for x,y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',paths[e['id']].get('d'))]
        assert ps==[(p['x'],p['y']) for p in e['route']['points']]
        assert e['route']['ok'] and paths[e['id']].get('data-route-valid')=='true'
        assert all(a[0]==b[0] or a[1]==b[1] for a,b in zip(ps,ps[1:]))
    result.update(ui_report_sha256=sha(OUT/'ui-report.json'),raw_ui_nodes=len(nodes),raw_ui_edges=len(paths),raw_ui_all_ids_and_paths_verified=True)
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')

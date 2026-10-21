"""Inspect actual source-side SVG geometry and exact before/after facts."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/context-sources/current'
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
for row in report['rows']:
    doc=read(OUT/row['document']);tree=ET.parse(OUT/row['svg'])
    assert sha(OUT/row['svg'])==row['svg_sha256'] and sha(OUT/row['document'])==row['document_sha256']
    assert sha(ROOT/row['input'])==row['input_sha256'] and doc['ir']==read(ROOT/row['input'])
    assert not row['quality']['issues'] and not row['quality']['route_failures']
    if row.get('reuse'):
        historical=read(ROOT/row['reuse']['report'])
        for f,h in report['baseline']['files'].items():assert historical['implementation_sha256'][f]==h,('reused producer differs',f)
        old=next(r for r in historical['rows'] if r['name']=='Transformer-fixed-current')
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
    for change in (row.get('receipt') or {}).get('changes',[]):
        if not row['receipt']['accepted']:continue
        e=edges[change['edge']];p=positions[e['source']];first,second=lines[e['id']][:2]
        assert e['route']['source_side']==change['side']
        assert first[0]==p['x']+(p['w'] if change['side']=='right' else 0)
        assert second[1]==first[1] and (second[0]>first[0])==(change['side']=='right')
        assert all(m['kind'] in ['data','alias','interface-binding'] and not m.get('condition') for m in e.get('bundle_members',[e]))
    docks(doc,tree);returns(doc,tree)
    geometry.audit_pipeline_summaries(doc,{**row,'local_pipelines':doc['publication'].get('local_pipelines')},nodes)
    geometry.audit_contract_stages(doc,{**row,'contract_stages':doc['publication'].get('contract_stages')},nodes)
    results.append({'name':row['name'],'crossings':crossings,'wire_length':round(length,1),'passed':True})
by={r['name']:r for r in report['rows']}
for pair in report['comparisons']:
    a,b=[by[pair[k]] for k in ['before','current']];da,db=[read(OUT/r['document']) for r in [a,b]]
    assert da['ir']==db['ir']
    for field in ['nodes','node_accounting','edge_accounting','representatives','frame_ownership']:assert da['layout'].get(field)==db['layout'].get(field),(pair['name'],field)
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
result={'schema':'context-source-independent/1','render_report_sha256':sha(OUT/'render-report.json'),'auditor_sha256':sha(Path(__file__)),
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
# A real shorter-wire proposal is rejected because an established channel is lost.
if (OUT/'rejection-report.json').exists():
    import tempfile
    rejection=read(OUT/'rejection-report.json')
    assert rejection['render_report_sha256']==sha(OUT/'render-report.json')
    assert rejection['tool_sha256']==sha(ROOT/'tools/audit_context_sources_rejection.cjs')
    receipt=rejection['receipt'];assert not receipt['accepted'] and receipt['candidate']['wire_length']<receipt['before']['wire_length']
    assert set(receipt['realized_before']['contexts'])-set(receipt['realized_candidate']['contexts'])
    a,b=rejection['rows'];assert (OUT/a['svg']).read_bytes()==(OUT/b['svg']).read_bytes()
    for row in rejection['rows']:
        assert sha(OUT/row['svg'])==row['svg_sha256'] and sha(OUT/row['document'])==row['document_sha256']
        assert sha(ROOT/row['input'])==row['input_sha256']
    with tempfile.TemporaryDirectory(prefix='archcanvas-rejected-context-') as directory:
        folder=Path(directory)
        rows=[{**r,'svg':str(OUT/r['svg']),'document':str(OUT/r['document'])} for r in rejection['rows']]
        (folder/'render-report.json').write_text(json.dumps({'rows':rows}))
        geometry.OUT=folder;saved=sys.argv;sys.argv=[saved[0]]
        try:geometry.main()
        finally:sys.argv=saved
        negative=read(folder/'svg-report.json')
    negative.update(rejection_report_sha256=sha(OUT/'rejection-report.json'),scope='Actual preserved baseline SVG paths and exact slots for the rejected shorter-wire request; candidate channel loss is checked from the renderer receipt.')
    (OUT/'negative-svg-report.json').write_text(json.dumps(negative,indent=2)+'\n')
    result.update(rejection_report_sha256=sha(OUT/'rejection-report.json'),negative_svg_panels=2,negative_svg_report_sha256=sha(OUT/'negative-svg-report.json'))
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')

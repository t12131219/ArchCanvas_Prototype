"""Measure serialized paths independently; never repair historical receipts."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/measured-frontiers/current'
sys.path[:0]=[str(ROOT),str(ROOT/'tools')]
import audit_local_svg as geometry
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    small=read(OUT/'small-render-report.json');large=read(OUT/'large-render-report.json')
    assert small['implementation_sha256']==large['implementation_sha256']
    assert small['baseline']==large['baseline']
    report={**small,'rows':small['rows']+large['rows'],'comparisons':small['comparisons']+large['comparisons']}
    # Adapt the stage report to the generic physical-terminal auditor's schema.
    # The dedicated checks below still validate these receipts against the IR.
    for row in report['rows']:
        publication=read(OUT/row['document'])['publication']
        row['contract_stages']=publication.get('contract_stages')
        row['local_pipelines']=publication.get('local_pipelines')
    (OUT/'render-report.json').write_text(json.dumps(report,indent=2)+'\n')
    for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    for f,h in report['baseline']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',report['baseline']['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    results=[];documents={}
    for row in report['rows']:
        doc=read(OUT/row['document']);documents[row['name']]=doc
        assert sha(OUT/row['svg'])==row['svg_sha256'] and sha(OUT/row['document'])==row['document_sha256']
        assert sha(ROOT/row['input'])==row['input_sha256'] and doc['ir']==read(ROOT/row['input'])
        if row.get('reuse'):
            prior=read(OUT/row['reuse']['report'])
            assert sha(OUT/row['reuse']['report'])==row['reuse']['report_sha256']
            assert prior['terminal'] and prior['frozen']==report['baseline']
            assert prior['svg_sha256']==row['svg_sha256'] and prior['document_sha256']==row['document_sha256']
            assert prior['input_sha256']==row['input_sha256'] and prior['state']==row['state']
            assert prior['elapsed_ms']==row['elapsed_ms']
        tree=ET.parse(OUT/row['svg']);svg=tree.getroot()
        nodes={n.get('data-node-id'):n for n in tree.iter() if n.get('data-node-id')}
        paths={n.get('data-edge-id'):n for n in tree.iter() if n.get('data-edge-id')}
        assert set(nodes)=={n['id'] for n in doc['layout']['nodes']} and len(nodes)==row['nodes']
        assert set(paths)=={e['id'] for e in doc['layout']['edges']} and len(paths)==row['edges']
        for bucket,key in [('node_accounting','nodes'),('edge_accounting','edges')]:
            ids=[v for group in doc['layout'][bucket].values() for v in group]
            assert len(ids)==len(set(ids)) and set(ids)=={v['id'] for v in doc['ir'][key]}
        lines={id:[(float(x),float(y)) for x,y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',p.get('d'))] for id,p in paths.items()}
        length=sum(abs(a[0]-b[0])+abs(a[1]-b[1]) for ps in lines.values() for a,b in zip(ps,ps[1:]))
        segments=[list(zip(ps,ps[1:])) for ps in lines.values()];crossings=0
        for i,first in enumerate(segments):
            for second in segments[i+1:]:
                for a,b in first:
                    for c,d in second:
                        if (a[0]==b[0])==(c[0]==d[0]):continue
                        v,w,h,k=(a,b,c,d) if a[0]==b[0] else (c,d,a,b)
                        crossings+=min(h[0],k[0])<v[0]<max(h[0],k[0]) and min(v[1],w[1])<h[1]<max(v[1],w[1])
        quality=doc['diagnostics']['publication']
        assert row['quality']==quality and not quality['issues'] and not quality['route_failures']
        assert round(length,1)==quality['wire_length'] and crossings==quality['line_geometry']['crossings']
        box=list(map(float,svg.get('viewBox').split()))
        assert box[2:]==[quality['native_width_px'],quality['native_height_px']]
        assert float(svg.get('width').removesuffix('px'))==box[2] and float(svg.get('height').removesuffix('px'))==box[3]
        actual={**row['actual_metrics'],'nodes':len(nodes),'edges':len(paths),'width':box[2],'height':box[3],'area':box[2]*box[3],'crossings':crossings}
        assert actual==row['actual_metrics']
        adaptive=doc['publication'].get('adaptive_frontier')
        assert adaptive==row['adaptive']
        matches=adaptive['selected']==actual if adaptive else None
        assert row['selected_metrics_match']==matches
        if '-current' in row['name'] and adaptive:assert matches,('selected metrics differ from actual SVG',row['name'])
        docks(doc,tree);returns(doc,tree)
        geometry.audit_pipeline_summaries(doc,{**row,'local_pipelines':doc['publication'].get('local_pipelines')},nodes)
        geometry.audit_contract_stages(doc,{**row,'contract_stages':doc['publication'].get('contract_stages')},nodes)
        results.append({'name':row['name'],'crossings':crossings,'wire_length':round(length,1),'selected_metrics_match':matches,'passed':True})
    by={r['name']:r for r in report['rows']}
    for replay in report['replays']:
        receipt=by['MixedWeave-current']['adaptive']['attempts'][replay['attempt']]
        assert by[replay['name']]['actual_metrics']==receipt['candidate']
        assert receipt['accepted']==replay['selected'] and receipt['eligible']==replay['eligible']
        assert documents[replay['name']]['ir']==documents['MixedWeave-current']['ir']
    for pair in report['comparisons']:
        a,b=[documents[pair[k]] for k in ['before','current']]
        assert a['ir']==b['ir']
        assert a['publication']['boundary']==b['publication']['boundary']
    assert by['CrossedBranches-before']['selected_metrics_match'] is False
    assert by['CrossedBranches-current']['selected_metrics_match'] is True
    geometry.OUT=OUT;saved=sys.argv;sys.argv=[saved[0]]
    try:geometry.main()
    finally:sys.argv=saved
    result={'schema':'measured-frontier-independent/1','auditor_sha256':sha(Path(__file__)),
        'render_report_sha256':sha(OUT/'render-report.json'),'panels':len(results),'results':results,'passed':True,'goal_complete':False}
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
        result.update(ui_report_sha256=sha(OUT/'ui-report.json'),raw_ui_nodes=len(nodes),raw_ui_edges=len(paths),raw_ui_all_ids_and_paths_verified=True)
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'panels':len(results),'passed':True}))

if __name__=='__main__':main()

"""Audit the rejected prototype's SVGs and diagnose the next layout boundary."""
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments
from check_coincident_ports import unmap
from check_final_sample_frames import terminals
from check_title_passages import passages

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/source-corridors/current'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda p:json.loads(p.read_text())


def compare(a,b):
    for k in ['ir','state','architecture','publication','expression_goals','summary_goals']:
        assert a[k]==b[k],('changed facts',k)
    for k in ['node_accounting','edge_accounting','representatives','frame_ownership','frame_title_routing']:
        assert a['layout'].get(k)==b['layout'].get(k)
    boxes=lambda d:[{**p,'y':unmap(d,p['y']),'h':unmap(d,p['y']+p['h'])-unmap(d,p['y'])} for p in d['layout']['nodes']]
    assert boxes(a)==boxes(b)
    assert len(a['layout']['edges'])==len(b['layout']['edges'])
    for e,f in zip(a['layout']['edges'],b['layout']['edges']):
        assert {k:v for k,v in e.items() if k!='route'}=={k:v for k,v in f.items() if k!='route'}
        for endpoint,side in [(0,'source_side'),(-1,'target_side')]:
            p,q=e['route']['points'][endpoint],f['route']['points'][endpoint]
            assert e['route'][side]==f['route'][side] and p['x']==q['x'] and unmap(a,p['y'])==unmap(b,q['y'])


if __name__=='__main__':
    report=read(OUT/'experiment-report.json');assert report['decision']=='not-adopted'
    for f,h in report['producer_sha256'].items():assert sha(ROOT/f)==h
    for f,h in read(OUT/'snapshot.json')['files'].items():
        assert sha(ROOT/f)==h,'experiment must not enter production'
        assert hashlib.sha256(subprocess.check_output(['git','show',report['baseline']+':'+f],cwd=ROOT)).hexdigest()==h
    assert sha(ROOT/report['input'])==report['input_sha256']
    geometry.OUT=OUT;docs=[];direct=[];measurements=[]
    for suffix in ['before','candidate']:
        d=read(OUT/('main-'+suffix+'.layout.json'));svg=ET.parse(OUT/('main-'+suffix+'.svg')).getroot()
        assert d['ir']==read(ROOT/report['input'])
        visible={g.get('data-id') for g in svg.iter() if g.get('data-id')}
        assert visible=={p['id'] for p in d['layout']['nodes']}
        row=dict(name=suffix,document='main-'+suffix+'.layout.json',svg='main-'+suffix+'.svg',quality=d['diagnostics']['publication'])
        measured=geometry.inspect(row);titles,bodies=passages(d,svg);assert not bodies
        terminals(d)
        goals=d['expression_goals']['goals'];covered={g['id'] for g,ok in zip(goals,assignments(d['ir'],goals,{**d,'quality':row['quality']},svg)) if ok}
        measurements.append(dict(nodes=len(visible),edges=len(d['layout']['edges']),crossings=measured['crossings'],contacts=measured['contacts'],overlaps=measured['overlaps'],node_intrusions=0,title_passages=len(titles),direct_goals=len(covered)))
        direct.append(covered);docs.append(d)
    a,b=docs;compare(a,b);assert direct[0]<=direct[1]
    assert (OUT/'main-before.svg').read_bytes()==(ROOT/'verification/source-navigation/current/ui-main.svg').read_bytes()
    negative=[]
    for kind in ['slot','condition','terminal']:
        bad=copy.deepcopy(b)
        if kind=='slot':bad['layout']['edges'][0]['target_port']='wrong-result'
        elif kind=='condition':bad['layout']['edges'][0]['condition']={'branch':'invented','outcome':'true'}
        else:bad['layout']['edges'][0]['route']['points'][0]['x']+=4
        try:compare(a,bad)
        except AssertionError:negative.append(kind)
        else:raise AssertionError(('corruption accepted',kind))
    log=(OUT/'prototype-tests.log').read_text();assert 'ℹ tests 4' in log and 'ℹ fail 0' in log
    # Quantify where fixed-terminal routing can and cannot help. The Manhattan
    # bound ignores obstacles and semantic lanes, so it is deliberately optimistic.
    detours=[]
    for e in a['layout']['edges']:
        ps=e['route']['points'];wire=sum(abs(p['x']-q['x'])+abs(p['y']-q['y']) for p,q in zip(ps,ps[1:]))
        lower=abs(ps[0]['x']-ps[-1]['x'])+abs(ps[0]['y']-ps[-1]['y'])
        detours.append(dict(edge=e['id'],wire=wire,lower_bound=lower,excess=wire-lower,relation=e.get('design_route',{}).get('kind')))
    source={n['id']:n for n in a['architecture']['nodes']};positions={n['id']:n for n in a['layout']['nodes']}
    bypass=[]
    for e in a['layout']['edges']:
        if e.get('design_route',{}).get('kind')!='bypass':continue
        c=next(c for c in a['architecture']['semantic_contracts'] if c['id']==e['design_route']['certificate'])
        bypass.append(dict(edge=e['id'],owner=e['design_route']['owner'],owner_label=source[e['design_route']['owner']]['label'],
            owner_box=positions.get(e['design_route']['owner']),certificate=c['id'],branch_path=c['roles']['branch_path'],
            visible_branch_representatives=sorted({a['layout']['representatives'].get(n) for n in c['roles']['branch_path']} - {None}),
            detour=next(r for r in detours if r['edge']==e['id'])))
    qa,qb=report['before'],report['candidate']
    result=dict(passed=True,goal_complete=False,decision='not-adopted',panels=measurements,
        wire_reduction_percent=100*(qa['wire_length']-qb['wire_length'])/qa['wire_length'],
        height_reduction_px=qa['native_height_px']-qb['native_height_px'],negative_rejections=negative,
        optimistic_fixed_terminal_wire_bound=sum(r['lower_bound'] for r in detours),
        bypass_detour_excess=sum(r['excess'] for r in detours if r['relation']=='bypass'),
        detours=sorted(detours,key=lambda r:r['excess'],reverse=True),bypass_evidence=bypass,
        limitations=['Prototype CLI evidence only; no new production behavior','Only the current main semantic state was formally compared','No new browser performance, broad mixed-model or graph-set coverage claim'],
        auditor_sha256=sha(Path(__file__)),files_sha256={f:sha(OUT/f) for f in ['main-before.svg','main-candidate.svg','experiment-report.json','prototype.patch','prototype-tests.log']})
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['passed','wire_reduction_percent','height_reduction_px','decision','bypass_detour_excess']}))

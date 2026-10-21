"""Check closed-condition evidence and actual SVGs without invoking the JS rule."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments
from check_final_sample_frames import terminals
from check_title_passages import passages
from check_local_bypasses import compare

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/contained-bypasses/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()


def boundaries(d, s):
    by={n['id']:n for n in d['architecture']['nodes']};raw={n['id']:n for n in d['ir']['nodes']}
    reps=d['layout']['representatives'];ps={p['id']:p for p in d['layout']['nodes']};all_edges=d['ir']['edges']
    found={}
    for r in s.get('contained_boundaries',[]):
        id=r['boundary'];assert id not in found;found[id]=r
        assert id in ps and not ps[id].get('expanded') and by[id]['kind']=='composite' and not by[id].get('presentation_only')
        members=[key for key,v in reps.items() if v==id];inside=set(members)
        assert members==r['members'] and 2<=len(members)<=256
        for key in members:
            n=by[key]
            assert n['kind'] not in ['opaque','buffer'] and n.get('evidence_status')!='runtime-only'
            assert not any(n.get(k) for k in ['mutable','identity_display','observed_calls','runtime_evidence','iteration','repeat_contract'])
        incident=[e for e in all_edges if e['source'] in inside or e['target'] in inside]
        assert all(e['kind'] in ['data','alias','interface-binding','parameter-read','control'] and not e.get('iteration') for e in incident)
        cuts=[e for e in incident if (e['source'] in inside)!=(e['target'] in inside)]
        assert r['cuts']==cuts and not any(e['kind']=='control' or e.get('condition') for e in cuts)
        conditions=[dict(node=key,condition=by[key]['condition']) for key in members if by[key].get('condition')]
        assert conditions==r['conditions']
        for condition in [c['condition'] for c in conditions]+[e['condition'] for e in incident if e.get('condition')]:
            assert condition['branch'] in inside and by[condition['branch']]['kind']=='control'
        phis=[dict(node=key,inputs=[e for e in incident if e['target']==key]) for key in members if by[key].get('operator')=='phi']
        assert r['phis']==phis and phis
        for phi in phis:
            inputs=phi['inputs'];assert 1<=len(inputs)<=2
            ctrl=inputs[0]['condition']['branch'];assert by[ctrl]['operator']=='if'
            assert len({e['condition']['outcome'] for e in inputs})==len(inputs)
            for e in inputs:
                assert e['kind']=='data' and e['source'] in inside and e['condition']['branch']==ctrl
                assert e['target_port']==e['condition']['outcome'] and e['target_port'] in ['true','false']
            branches=[e for e in incident if e['source']==ctrl and e['kind']=='control']
            assert len(branches)==2 and {e['target_port'] for e in branches}=={'true','false'}
            for e in branches:assert e['target'] in inside and by[e['target']]['condition']==dict(branch=ctrl,outcome=e['target_port'])
        assert r['control_edges']==[e for e in incident if e['kind']=='control']
        # The boundary records source conditions exactly; no canonical facts
        # have been rewritten to make the enclosed alternatives agree.
        for key in members:assert by[key].get('condition')==raw[key].get('condition')
    for m in s['mapping']:
        n=by[m['canonical']]
        assert m['visible']==reps[m['canonical']] and n['kind'] not in ['opaque','state','buffer'] and not n.get('mutable')
        if n['kind']=='control' or n.get('condition') or n.get('operator')=='phi':
            assert m['visible'] in found
            if n.get('operator')=='phi':assert len(next(r for r in found[m['visible']]['phis'] if r['node']==n['id'])['inputs'])==2
    return len(found)


def scopes(d):
    by={n['id']:n for n in d['architecture']['nodes']};ps={p['id']:p for p in d['layout']['nodes']}
    attached={r['node'] for r in d['layout'].get('frame_ownership',[])}
    def chain(id):
        result=[]
        while id is not None and id not in result:
            result.append(id);id=by[id].get('parent')
            while id in attached:id=by[id].get('parent')
        return result
    count=0
    for s in d['layout'].get('local_bypasses',[]):
        c=next(c for c in d['architecture']['semantic_contracts'] if c['id']==s['certificate']);r=c['roles']
        e=next(e for e in d['layout']['edges'] if e['id']==s['edge']);p=e['route']['points']
        assert e['design_route']==dict(kind='bypass',certificate=c['id'],owner=s['owner'])
        assert (s['skip'],s['skip_slot'],s['add'])==(r['skip'],r['skip_slot'],r['add'])
        assert e['resolved_source']==r['skip'] and e['source_port']==r['skip_slot'] and e['canonical_target']==r['add']
        assert e['source']==s['source'] and e['target']==s['target'] and e['kind']=='data'
        assert not any(e.get(k) for k in ['condition','iteration','context_lane','bundle_members'])
        assert s['mapping']==[dict(canonical=id,visible=d['layout']['representatives'][id]) for id in r['branch_path']]
        count+=boundaries(d,s)
        ends=set(chain(e['source'])+chain(e['target']));frontier=[]
        for m in s['mapping']:
            assert m['visible'] in ps and m['visible']!=e['source']
            if m['visible']==e['target']:continue
            outer=m['visible']
            for id in chain(outer):
                if id in ends:break
                if id in ps:outer=id
            if outer not in frontier:frontier.append(outer)
        assert s['frontier']==frontier and frontier and not ends.intersection(frontier)
        boxes=[ps[id] for id in frontier];left=min(p['x'] for p in boxes)
        assert s['geometry_verified'] and e['route']['ok'] and len(p)==4
        assert e['route']['source_side']==e['route']['target_side']==s['side']=='left'
        assert p[0]['y']==p[1]['y'] and p[1]['x']==p[2]['x'] and p[2]['y']==p[3]['y']
        assert p[0]['x']>p[1]['x'] and p[3]['x']>p[2]['x']
        assert left-52<=p[1]['x']<=left-16 and p[1]['y']<=min(p['y'] for p in boxes) and p[2]['y']>=max(p['y']+p['h'] for p in boxes)
        receipt=next(c for c in d['layout']['constraint_receipts'] if c['type']=='bypass' and c['properties']['certificate']==s['certificate'])
        assert receipt['status']=='applied' and receipt['route_verified'] and receipt['consumption']=='local-bypass-lane'
    return count


if __name__=='__main__':
    reports=[read(OUT/(name+'-report.json')) for name in ['small','large']]
    assert reports[0]['implementation_sha256']==reports[1]['implementation_sha256']
    for f,h in reports[0]['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    for f,h in reports[0]['baseline_sha256'].items():assert hashlib.sha256(subprocess.check_output(['git','show',reports[0]['base']+':'+f],cwd=ROOT)).hexdigest()==h
    geometry.OUT=OUT;comparisons=[];changed=[];main=None
    for report in reports:
        for row in report['rows']:
            assert sha(ROOT/row['input'])==row['input_sha256'];docs=[];measured=[];direct=[]
            for result in row['results']:
                for key in ['svg','document']:assert sha(OUT/result[key])==result[key+'_sha256']
                d=read(OUT/result['document']);svg=ET.parse(OUT/result['svg']).getroot()
                assert d['ir']==read(ROOT/row['input']) and d['layout']['frame_title_routing']=='pass-through'
                for kind,key in [('nodes','node_accounting'),('edges','edge_accounting')]:
                    ids=sum(d['layout'][key].values(),[]);assert len(ids)==len(set(ids)) and set(ids)=={n['id'] for n in d['ir'][kind]}
                m=geometry.inspect(dict(name=row['name']+'-'+result['suffix'],**result));title,body=passages(d,svg)
                assert not body,('body intrusion',row['name'],body);terminals(d);count=scopes(d)
                goals=d['expression_goals']['goals'];covered={g['id'] for g,ok in zip(goals,assignments(d['ir'],goals,{**d,'quality':result['quality']},svg)) if ok}
                direct.append(covered);docs.append(d)
                measured.append(dict(nodes=len(m['nodes']),edges=len(m['paths']),wire=result['quality']['wire_length'],crossings=m['crossings'],contacts=m['contacts'],overlaps=m['overlaps'],contained_boundaries=count,direct_goals=len(covered)))
            a,b=docs;compare(a,b);assert direct[0]<=direct[1]
            assert measured[1]['crossings']<=measured[0]['crossings'] and measured[1]['contacts']<=measured[0]['contacts'] and measured[1]['overlaps']<=measured[0]['overlaps']
            comparisons.append(dict(name=row['name'],before=measured[0],current=measured[1]))
            if measured[1]['contained_boundaries']:changed.append(row['name'])
            if row['name']=='Transformer-panel-0':main=(a,b)
    assert main
    negative=[]
    for kind in ['slot','condition','member','cut','witness','removed-boundary']:
        a,b=main;bad=copy.deepcopy(b);s=next(s for s in bad['layout']['local_bypasses'] if s.get('contained_boundaries'));r=s['contained_boundaries'][0]
        if kind=='slot':r['phis'][0]['inputs'][0]['target_port']='wrong'
        elif kind=='condition':r['conditions'][0]['condition']['branch']='invented'
        elif kind=='member':r['members'].pop()
        elif kind=='cut':r['cuts'].append(dict(id='invented'))
        elif kind=='witness':s['mapping'][0]['visible']=s['target']
        else:del s['contained_boundaries']
        try:compare(a,bad);scopes(bad)
        except (AssertionError,KeyError):negative.append(kind)
        else:raise AssertionError(('corruption accepted',kind))
    result=dict(passed=True,goal_complete=False,comparisons=comparisons,changed_cases=changed,negative_rejections=negative,
        auditor_sha256=sha(Path(__file__)),reports_sha256={n:sha(OUT/(n+'-report.json')) for n in ['small','large']})
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(dict(passed=True,panels=len(comparisons)*2,changed_cases=changed,negative_rejections=negative)))

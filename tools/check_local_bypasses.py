"""Independently check certified branch geometry against actual SVG paths."""
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

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/local-bypasses/current'
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()


def compare(a,b):
    for key in ['ir','state','architecture','publication','expression_goals','summary_goals']:
        assert a[key]==b[key],('facts changed',key)
    for key in ['node_accounting','edge_accounting','representatives','frame_ownership','frame_title_routing']:
        assert a['layout'].get(key)==b['layout'].get(key)
    boxes=lambda d:[{**p,'y':unmap(d,p['y']),'h':unmap(d,p['y']+p['h'])-unmap(d,p['y'])} for p in d['layout']['nodes']]
    assert boxes(a)==boxes(b),'pre-compaction positions changed'
    for e,f in zip(a['layout']['edges'],b['layout']['edges'],strict=True):
        assert {k:v for k,v in e.items() if k!='route'}=={k:v for k,v in f.items() if k!='route'}
        for endpoint,side in [(0,'source_side'),(-1,'target_side')]:
            p,q=e['route']['points'][endpoint],f['route']['points'][endpoint]
            assert e['route'][side]==f['route'][side] and p['x']==q['x'] and unmap(a,p['y'])==unmap(b,q['y'])
    old={r['id'] for r in a['layout']['constraint_receipts'] if r['status']=='applied'}
    new={r['id'] for r in b['layout']['constraint_receipts'] if r['status']=='applied'}
    assert old<=new


def local_scopes(d):
    ps={p['id']:p for p in d['layout']['nodes']};nodes={n['id']:n for n in d['architecture']['nodes']}
    attached={r['node'] for r in d['layout'].get('frame_ownership',[])}
    parents={}
    for id,n in nodes.items():
        parent=n.get('parent')
        while parent in attached:parent=nodes[parent].get('parent')
        parents[id]=parent
    def chain(id):
        result=[]
        while id is not None and id not in result:result.append(id);id=parents.get(id)
        return result
    for s in d['layout'].get('local_bypasses',[]):
        c=next(c for c in d['architecture']['semantic_contracts'] if c['id']==s['certificate']);r=c['roles']
        e=next(e for e in d['layout']['edges'] if e['id']==s['edge']);p=e['route']['points']
        assert e['design_route']==dict(kind='bypass',certificate=c['id'],owner=s['owner'])
        assert (s['skip'],s['skip_slot'],s['add'])==(r['skip'],r['skip_slot'],r['add'])
        assert e['resolved_source']==r['skip'] and e['source_port']==r['skip_slot'] and e['canonical_target']==r['add']
        assert e['source']==s['source'] and e['target']==s['target'] and e['kind']=='data'
        assert not any(e.get(k) for k in ['condition','iteration','context_lane','bundle_members'])
        expected=[dict(canonical=id,visible=d['layout']['representatives'][id]) for id in r['branch_path']]
        assert s['mapping']==expected
        ends=set(chain(e['source'])+chain(e['target']));frontier=[]
        for m in expected:
            n=nodes[m['canonical']]
            assert n['kind'] not in ['opaque','control','state','buffer'] and not n.get('mutable') and not n.get('condition') and n.get('operator')!='phi'
            assert m['visible'] in ps and m['visible']!=e['source']
            if m['visible']==e['target']:continue
            outer=m['visible']
            for id in chain(outer):
                if id in ends:break
                if id in ps:outer=id
            if outer not in frontier:frontier.append(outer)
        assert s['frontier']==frontier and frontier and not ends.intersection(frontier)
        rects=[ps[id] for id in frontier];left=min(p['x'] for p in rects)
        assert s['geometry_verified'] and e['route']['ok'] and len(p)==4
        assert e['route']['source_side']==e['route']['target_side']==s['side']=='left'
        assert p[0]['y']==p[1]['y'] and p[1]['x']==p[2]['x'] and p[2]['y']==p[3]['y']
        assert p[0]['x']>p[1]['x'] and p[3]['x']>p[2]['x']
        assert left-52<=p[1]['x']<=left-16 and p[1]['y']<=min(p['y'] for p in rects) and p[2]['y']>=max(p['y']+p['h'] for p in rects)
        receipt=next(c for c in d['layout']['constraint_receipts'] if c['type']=='bypass' and c['properties']['certificate']==s['certificate'])
        assert receipt['status']=='applied' and receipt['route_verified'] and receipt['consumption']=='local-bypass-lane'


if __name__=='__main__':
    reports=[read(OUT/(name+'-report.json')) for name in ['small','large']]
    assert reports[0]['implementation_sha256']==reports[1]['implementation_sha256']
    assert reports[0]['base']==reports[1]['base'] and reports[0]['baseline_sha256']==reports[1]['baseline_sha256']
    for f,h in reports[0]['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale implementation',f)
    for f,h in reports[0]['baseline_sha256'].items():
        assert hashlib.sha256(subprocess.check_output(['git','show',reports[0]['base']+':'+f],cwd=ROOT)).hexdigest()==h
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
                boxes={p['id']:p for p in d['layout']['nodes']};assert set(m['nodes'])==set(boxes)
                for id,node in m['nodes'].items():
                    xy=list(map(float,re.fullmatch(r'translate\(([-+\d.eE]+),([-+\d.eE]+)\)',node.get('transform')).groups()))
                    assert xy==[boxes[id]['x'],boxes[id]['y']]
                assert not body,('body intrusion',row['name'],body);terminals(d);local_scopes(d)
                goals=d['expression_goals']['goals'];covered={g['id'] for g,ok in zip(goals,assignments(d['ir'],goals,{**d,'quality':result['quality']},svg)) if ok}
                direct.append(covered);docs.append(d)
                measured.append(dict(nodes=len(m['nodes']),edges=len(m['paths']),wire=result['quality']['wire_length'],crossings=m['crossings'],contacts=m['contacts'],overlaps=m['overlaps'],intrusions=0,title_passages=len(title),direct_goals=len(covered),local_bypasses=len(d['layout'].get('local_bypasses',[]))))
            a,b=docs;compare(a,b);assert direct[0]<=direct[1]
            assert measured[1]['crossings']<=measured[0]['crossings'] and measured[1]['contacts']<=measured[0]['contacts'] and measured[1]['overlaps']<=measured[0]['overlaps']
            comparisons.append(dict(name=row['name'],before=measured[0],current=measured[1]))
            if measured[1]['local_bypasses']:changed.append(row['name'])
            if row['name']=='Transformer-panel-0':main=(a,b)
    assert main and 'MixedWeave' in changed,'unfamiliar composition must exercise the same rule'
    negative=[]
    for kind in ['slot','condition','terminal','frontier','witness']:
        a,b=main;bad=copy.deepcopy(b);s=bad['layout']['local_bypasses'][0];e=next(e for e in bad['layout']['edges'] if e['id']==s['edge'])
        if kind=='slot':e['source_port']='wrong'
        elif kind=='condition':e['condition']=dict(branch='invented')
        elif kind=='terminal':e['route']['points'][0]['x']+=4
        elif kind=='frontier':s['frontier']=[e['target']]
        else:s['mapping'][0]['visible']=e['source']
        try:compare(a,bad);local_scopes(bad)
        except AssertionError:negative.append(kind)
        else:raise AssertionError(('corruption accepted',kind))
    result=dict(passed=True,goal_complete=False,comparisons=comparisons,changed_cases=changed,negative_rejections=negative,
        auditor_sha256=sha(Path(__file__)),reports_sha256={n:sha(OUT/(n+'-report.json')) for n in ['small','large']})
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(dict(passed=True,panels=len(comparisons)*2,changed_cases=changed,negative_rejections=negative)))

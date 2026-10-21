"""Audit actual SVGs, exact uses and physical port ties independently."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from check_operand_rows import contexts, scope_geometry
from check_final_sample_frames import terminals
from check_declared_operands import declared_rows
from check_final_scope_entries import final_entries
from check_module_arguments import arguments
from audit_diagram_assignments import assignments
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/coincident-ports/current'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()


def unmap(doc,y):
    r=doc['diagnostics']['routing'].get('empty_band_compaction')
    if not r or not r['accepted']:return y
    removed=0;value=y
    for band in r['bands']:
        if value>=band['top']-removed:y+=band['bottom']-band['top']
        removed+=band['bottom']-band['top']
    return y


def tie_geometry(doc):
    r=doc['diagnostics']['routing'].get('coincident_port_refinement')
    if not r:
        assert not doc['layout'].get('coincident_ports');return []
    boxes={p['id']:{**p,'y':unmap(doc,p['y']),'h':unmap(doc,p['y']+p['h'])-unmap(doc,p['y'])} for p in doc['layout']['nodes']}
    edges={e['id']:e for e in doc['layout']['edges']};previous=r['before'];selected=[];seen=set()
    assert r['max_trials']==3 and len(r['attempts'])<=3
    for trial in r['attempts']:
        assert trial['before']==previous
        plan=trial['plan'];p=boxes[plan['node']];assert not p.get('expanded') and not p.get('cyclic')
        axis='x' if plan['side'] in ['top','bottom'] else 'y';otheraxis='y' if axis=='x' else 'x'
        keys=lambda rows:[(row['edge'],row['source']) for row in rows]
        assert sorted(keys(plan['before']))==sorted(keys(plan['after'])) and keys(plan['before'])!=keys(plan['after'])
        for item in plan['before']+plan['after']:
            e=edges[item['edge']];assert (e['source'] if item['source'] else e['target'])==plan['node']
            assert (e['target'] if item['source'] else e['source'])==item['other'];o=boxes[item['other']]
            coord=o[axis]+o['w' if axis=='x' else 'h']/2
            dist=abs(o[otheraxis]+o['h' if axis=='x' else 'w']/2-p[otheraxis]-p['h' if axis=='x' else 'w']/2)
            assert item['coordinate']==coord and abs(item['distance']-dist)<1e-7
            for m in e.get('bundle_members',[e]):
                assert m['kind'] in ['data','alias','interface-binding'] and not any(m.get(k) for k in ['design_route','context_lane','iteration','layout_after'])
        expected=sorted(plan['before'],key=lambda i:(i['coordinate'],i['distance'],i['other'],i['edge'],i['source']))
        assert plan['after']==expected
        # A different primary coordinate must keep its relative order.
        for a in plan['before']:
            for b in plan['before']:
                if a['coordinate']<b['coordinate']:assert keys(plan['after']).index((a['edge'],a['source']))<keys(plan['after']).index((b['edge'],b['source']))
        if trial['accepted']:
            assert trial['facts_preserved'] and trial['physical_terminals_preserved'] and trial['distinct_terminals']
            before,after=trial['before'],trial['candidate'];assert after['crossings']<before['crossings']
            for k in ['width','height','wire_length','contacts','overlaps','unplaced_labels']:assert after[k]<=before[k]
            assert set(after['issues'])<=set(before['issues'])
            for k,ids in trial['realized_before'].items():assert set(ids)<=set(trial['realized_candidate'][k])
            assert trial['direct_goals_before']<=trial['direct_goals_candidate']
            choice=dict(node=plan['node'],side=plan['side'],order=[{k:i[k] for k in ['edge','source','other']} for i in plan['after']])
            selected.append(choice);previous=trial['candidate']
    assert r['after']==previous and r['selected']==selected==doc['layout'].get('coincident_ports',[])
    compact=doc['diagnostics']['routing'].get('empty_band_compaction')
    if compact:assert compact['before']==previous
    else:
        q=doc['diagnostics']['publication'];assert (q['line_geometry']['crossings'],q['wire_length'])==(previous['crossings'],previous['wire_length'])
    for choice in selected:
        actual=[]
        for e in edges.values():
            for source in [True,False]:
                if (e['source'] if source else e['target'])!=choice['node'] or e['route']['source_side' if source else 'target_side']!=choice['side']:continue
                point=e['route']['points'][0 if source else -1];coord=point['x' if choice['side'] in ['top','bottom'] else 'y']
                actual.append((coord,dict(edge=e['id'],source=source,other=e['target'] if source else e['source'])))
        assert [row for _,row in sorted(actual,key=lambda row:row[0])]==choice['order'],'physical order disagrees with selected tie'
    return selected


def comparison(a,b):
    for k in ['ir','state','architecture','publication','expression_goals','summary_goals']:assert a[k]==b[k],('changed facts',k)
    for k in ['node_accounting','edge_accounting','representatives','frame_ownership','frame_title_routing']:assert a['layout'].get(k)==b['layout'].get(k)
    restored=lambda d:[{**p,'y':unmap(d,p['y']),'h':unmap(d,p['y']+p['h'])-unmap(d,p['y'])} for p in d['layout']['nodes']]
    assert restored(a)==restored(b),'port refinement must not relocate or resize nodes'
    selected=tie_geometry(b);allowed={(c['node'],c['side']) for c in selected}
    aa=a['layout']['edges'];bb=b['layout']['edges'];assert len(aa)==len(bb)
    for e,f in zip(aa,bb):
        assert {k:v for k,v in e.items() if k!='route'}=={k:v for k,v in f.items() if k!='route'},'exact binding changed'
        for source in [True,False]:
            side='source_side' if source else 'target_side';assert e['route'][side]==f['route'][side]
            node=e['source' if source else 'target'];i=0 if source else -1
            if (node,e['route'][side]) not in allowed:
                x,y=e['route']['points'][i],f['route']['points'][i]
                assert x['x']==y['x'] and unmap(a,x['y'])==unmap(b,y['y']),'unselected terminal changed'
    qa,qb=[d['diagnostics']['publication'] for d in [a,b]]
    for k in ['native_width_px','native_height_px','wire_length']:assert qb[k]<=qa[k]
    assert qb['min_canvas_font_px']==qa['min_canvas_font_px']
    for k in ['crossings']:assert qb['line_geometry'][k]<=qa['line_geometry'][k]
    for k in ['unrelated_contacts','overlapping_paths']:assert len(qb['line_geometry'][k])<=len(qa['line_geometry'][k])
    return selected


def main():
    reports=[read(OUT/(s+'-report.json')) for s in ['small','large','extra']]
    for r in reports:assert r['implementation_sha256']==reports[0]['implementation_sha256'] and r['baseline']==reports[0]['baseline']
    for f,h in reports[0]['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    for f,h in reports[0]['baseline']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',reports[0]['baseline']['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    assert reports[2]['producer_sha256']==sha(ROOT/'tools/audit_coincident_extra.cjs')
    geometry.OUT=stages.OUT=OUT;docs={};rows={};direct={};measured={};inherited=[]
    for report in reports:
        for row in report['rows']:
            n=row['name'];doc=read(OUT/row['document']);svg=ET.parse(OUT/row['svg']).getroot()
            assert sha(OUT/row['document'])==row['document_sha256'] and sha(OUT/row['svg'])==row['svg_sha256']
            assert sha(ROOT/row['input'])==row['input_sha256'] and doc['ir']==read(ROOT/row['input'])
            contacts=row['quality']['line_geometry']['unrelated_contacts']
            measured[n]=stages.check({**row,'role_path_stages':doc['publication'].get('role_path_stages')},compare_expression=False,require_quality=not contacts)
            geometry.inspect(row);_,bodies=passages(doc,svg);assert not bodies,(n,bodies)
            contexts(doc);scope_geometry(doc);terminals(doc);declared_rows(doc);final_entries(doc);arguments(doc,svg);tie_geometry(doc)
            if contacts:inherited.append(dict(name=n,count=len(contacts)))
            goals=doc['expression_goals']['goals'];direct[n]={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg)) if ok}
            docs[n]=doc;rows[n]=row
    checked=[]
    for report in reports:
        for c in report['comparisons']:
            a,b=[docs[c[k]] for k in ['before','after']];selected=comparison(a,b);assert direct[c['before']]<=direct[c['after']]
            checked.append(dict(name=c['name'],selected=selected,before=measured[c['before']],after=measured[c['after']]))
    a,b=docs['ForeignChoice-before'],docs['ForeignChoice-current'];negative=[]
    for kind in ['canonical-slot','condition','physical-terminal','physical-order','fake-distance']:
        bad=copy.deepcopy(b)
        if kind=='canonical-slot':bad['layout']['edges'][1]['target_port']='wrong'
        elif kind=='condition':bad['layout']['edges'][1]['condition']['outcome']='wrong'
        elif kind=='physical-terminal':bad['layout']['edges'][0]['route']['points'][0]['x']+=4
        elif kind=='physical-order':
            r=bad['layout']['coincident_ports'][0];r['order'][0],r['order'][1]=r['order'][1],r['order'][0]
            bad['diagnostics']['routing']['coincident_port_refinement']['selected']=copy.deepcopy(bad['layout']['coincident_ports'])
        else:
            for plan in bad['diagnostics']['routing']['coincident_port_refinement']['attempts']:
                for at in ['before','after']:
                    for p in plan['plan'][at]:p['distance']+=7
        try:comparison(a,bad)
        except AssertionError:negative.append(dict(kind=kind,rejected=True))
        else:raise AssertionError(('accepted corruption',kind))
    sets={s:set().union(*(direct['Transformer-panel-'+str(i)+'-'+s] for i in range(3))) for s in ['before','current']};assert sets['before']<=sets['current']
    result=dict(passed=True,goal_complete=False,panels=len(rows),comparisons=checked,negative_checks=negative,contact_panels=inherited,
                graph_set_direct=dict(before=len(sets['before']),after=len(sets['current']),lost=sorted(sets['before']-sets['current'])),auditor_sha256=sha(Path(__file__)))
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['passed','panels','graph_set_direct']}))
if __name__=='__main__':main()

"""Check common-map compaction from actual SVG geometry and immutable facts."""
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

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/empty-bands/current'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()


def transformation(a,b):
    for key in ['ir','state','architecture','publication','expression_goals','summary_goals']:
        assert a.get(key)==b.get(key),('changed facts',key)
    for key in ['node_accounting','edge_accounting','representatives','frame_ownership','frame_title_routing','cross_scope_ports']:
        assert a['layout'].get(key)==b['layout'].get(key),('changed display identity',key)
    r=b['diagnostics']['routing'].get('empty_band_compaction')
    if not r or not r['accepted']:
        assert a['layout']==b['layout']
        return []
    assert r['bands_preserved'] and r['direct_goals_candidate']>=r['direct_goals_before']
    bands=r['bands'];assert bands and all(g['bottom']-g['top']>=16 for g in bands)
    assert all(a['bottom']<b['top'] for a,b in zip(bands,bands[1:]))
    T=lambda y:y-sum(max(0,min(y,g['bottom'])-g['top']) for g in bands)
    old={n['id']:n for n in a['layout']['nodes']};new={n['id']:n for n in b['layout']['nodes']};assert old.keys()==new.keys()
    protected=[]
    for id,p in old.items():
        assert new[id]=={**p,'y':T(p['y']),'h':T(p['y']+p['h'])-T(p['y'])},('not common node map',id)
        if not p.get('expanded'):assert new[id]['h']==p['h']
        protected.append((p['y']-8,p['y']+(p['header'] if p.get('expanded') else p['h'])+8))
        if p.get('expanded'):protected.append((p['y']+p['h']-8,p['y']+p['h']+8))
    for p in a['layout']['labels']:protected.append((p['y']-8,p['y']+p['h']+8))
    for e in a['layout']['edges']:
        ps=e['route']['points']
        for p in [ps[0],ps[-1]]:protected.append((p['y']-8,p['y']+8))
        for p,q in zip(ps,ps[1:]):
            if p['y']==q['y']:protected.append((p['y']-8,p['y']+8))
    for c in a['layout'].get('compound_alignments',[]):
        if c.get('input_band_verified'):
            band=c['input_band'];floor=max(old[id]['y']+old[id]['h'] for id in band['inputs'])
            protected.append((floor-8,floor+band['gap_y']+8))
    for gap in r['protected_gaps']:protected.append((gap['y']-8,gap['y']+gap['h']+8))
    for band in bands:
        assert any(w['top']<=band['top']<band['bottom']<=w['bottom'] for w in r['windows'])
        assert all(band['bottom']<=low or band['top']>=high for low,high in protected),('band not empty',band)
    assert b['layout']['labels']==[{**p,'y':T(p['y'])} for p in a['layout']['labels']]
    assert b['layout']['edges']==[{**e,'route':{**e['route'],'points':[{**p,'y':T(p['y'])} for p in e['route']['points']]}} for e in a['layout']['edges']], 'path or exact binding changed'
    for key in ['consumer_arguments','operand_rows','declared_operand_rows']:
        rows=copy.deepcopy(a['layout'].get(key,[]))
        for row in rows:
            for n in row.get('nodes',[row]):
                for at in ['before','after']:
                    if at in n:n[at]['y']=T(n[at]['y'])
        assert rows==b['layout'].get(key,[]),('stale current coordinates',key)
    for c in b['layout'].get('compound_alignments',[]):
        before=next(x for x in a['layout'].get('compound_alignments',[]) if x['parent']==c['parent'])
        assert c==before, 'established entry or clearance lost'
    for key,ids in r['realized_before'].items():assert set(ids)<=set(r['realized_candidate'][key])
    qa,qb=a['diagnostics']['publication'],b['diagnostics']['publication']
    assert qa['line_geometry']['crossings']==qb['line_geometry']['crossings']
    for key in ['native_width_px','wire_length']:assert qb[key]<=qa[key]
    assert qb['native_height_px']<qa['native_height_px'] and qb['min_canvas_font_px']==qa['min_canvas_font_px']
    for key in ['unrelated_contacts','overlapping_paths']:assert len(qb['line_geometry'][key])<=len(qa['line_geometry'][key])
    assert not qb['route_failures'] and not qb['unplaced_port_labels'] and set(qb['issues'])<=set(qa['issues'])
    return bands


def main():
    reports=[read(OUT/(s+'-report.json')) for s in ['small','large']]
    for r in reports:assert r['implementation_sha256']==reports[0]['implementation_sha256'] and r['baseline']==reports[0]['baseline']
    for f,h in reports[0]['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale implementation',f)
    for f,h in reports[0]['baseline']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',reports[0]['baseline']['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    geometry.OUT=stages.OUT=OUT
    docs={};rows={};measured={};direct={};contacts=[]
    for report in reports:
        for row in report['rows']:
            n=row['name'];doc=read(OUT/row['document']);svg=ET.parse(OUT/row['svg']).getroot()
            assert sha(OUT/row['document'])==row['document_sha256'] and sha(OUT/row['svg'])==row['svg_sha256']
            assert sha(ROOT/row['input'])==row['input_sha256'] and doc['ir']==read(ROOT/row['input'])
            unresolved=row['quality']['line_geometry']['unrelated_contacts']
            measured[n]=stages.check({**row,'role_path_stages':doc['publication'].get('role_path_stages')},compare_expression=False,require_quality=not unresolved)
            geometry.inspect(row);_,bodies=passages(doc,svg);assert not bodies,(n,bodies)
            contexts(doc);scope_geometry(doc);terminals(doc);declared_rows(doc);final_entries(doc);arguments(doc,svg)
            if unresolved:contacts.append(dict(name=n,count=len(unresolved)))
            goals=doc['expression_goals']['goals'];direct[n]={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg)) if ok}
            docs[n]=doc;rows[n]=row
    checked=[]
    for report in reports:
        for c in report['comparisons']:
            a,b=docs[c['before']],docs[c['after']];bands=transformation(a,b);assert direct[c['before']]<=direct[c['after']]
            # Contact defects are reported explicitly; the geometry audit above
            # recomputes them from paths. No contact may be introduced by a map.
            qa,qb=[rows[c[k]]['quality'] for k in ['before','after']]
            assert len(qb['line_geometry']['unrelated_contacts'])<=len(qa['line_geometry']['unrelated_contacts'])
            checked.append(dict(name=c['name'],bands=bands,before=measured[c['before']],after=measured[c['after']]))
    bad=[];a,b=docs['ForeignPassage-before'],docs['ForeignPassage-current']
    for kind in ['concrete-height','label-position','physical-terminal','conditional-slot','cross-title-band']:
        d=copy.deepcopy(b)
        if kind=='concrete-height':next(n for n in d['layout']['nodes'] if n['id']=='a')['h']+=4
        elif kind=='label-position':d['layout']['labels'][0]['y']+=3
        elif kind=='physical-terminal':d['layout']['edges'][0]['route']['points'][-1]['y']+=8
        elif kind=='conditional-slot':d['layout']['edges'][0]['target_port']='different'
        else:
            # Keep all new coordinates consistent with the forged map, so
            # only the independent title/obstacle exclusion can reject it.
            bands=[{'top':50,'bottom':90}];T=lambda y:y-max(0,min(y,90)-50)
            d['diagnostics']['routing']['empty_band_compaction']['bands']=bands
            d['layout']['nodes']=[{**p,'y':T(p['y']),'h':T(p['y']+p['h'])-T(p['y'])} for p in a['layout']['nodes']]
            d['layout']['labels']=[{**p,'y':T(p['y'])} for p in a['layout']['labels']]
            d['layout']['edges']=[{**e,'route':{**e['route'],'points':[{**p,'y':T(p['y'])} for p in e['route']['points']]}} for e in a['layout']['edges']]
        try:transformation(a,d)
        except AssertionError:bad.append(dict(kind=kind,rejected=True))
        else:raise AssertionError(('corruption accepted',kind))
    sets={s:set().union(*(direct['Transformer-panel-'+str(i)+'-'+s] for i in range(3))) for s in ['before','current']};assert sets['before']<=sets['current']
    result=dict(passed=True,goal_complete=False,panels=len(rows),comparisons=checked,negative_checks=bad,contact_panels=contacts,
                graph_set_direct=dict(before=len(sets['before']),after=len(sets['current']),lost=sorted(sets['before']-sets['current'])),auditor_sha256=sha(Path(__file__)))
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['passed','panels','graph_set_direct']}))
if __name__=='__main__':main()

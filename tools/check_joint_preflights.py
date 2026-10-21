"""Recompute joint decisions from frozen IR, actual SVG and measured paths."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification/joint-preflights/current'
sys.path[:0]=[str(ROOT),str(ROOT/'tools')]
import audit_local_svg as geometry
from audit_diagram_assignments import assignments
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
CRITICAL={'unknown-boundary','state-interface','selection','conditional-join','conditional-region','iteration-binding','iteration-template','same-object-calls','observed-parameter-aliases'}

def main():
    small,large=[read(OUT/(s+'-render-report.json')) for s in ['small','large']]
    assert small['implementation_sha256']==large['implementation_sha256'] and small['baseline']==large['baseline']
    report={**small,**{k:small[k]+large[k] for k in ['rows','sets','comparisons']}}
    (OUT/'render-report.json').write_text(json.dumps(report,indent=2)+'\n')
    subprocess.run(['node','tools/audit_joint_preflight_projections.cjs'],cwd=ROOT,check=True)
    for f,h in report['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale producer',f)
    for f,h in report['baseline']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',report['baseline']['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    docs={};trees={};rows={r['name']:r for r in report['rows']};metrics={}
    for row in report['rows']:
        name=row['name'];doc=read(OUT/row['document']);docs[name]=doc
        assert sha(OUT/row['svg'])==row['svg_sha256'] and sha(OUT/row['document'])==row['document_sha256']
        assert sha(ROOT/row['input'])==row['input_sha256'] and doc['ir']==read(ROOT/row['input'])
        tree=ET.parse(OUT/row['svg']);trees[name]=tree.getroot();svg=tree.getroot()
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
        q=doc['diagnostics']['publication'];assert row['quality']==q
        qualified=not(q['issues'] or q['route_failures'] or q['unplaced_port_labels'] or q['line_geometry']['unrelated_contacts'] or any(not p['same_value'] for p in q['line_geometry']['overlapping_paths']) or q['min_canvas_font_px']<12)
        assert bool(qualified)==row['qualified']
        assert round(length,1)==q['wire_length'] and crossings==q['line_geometry']['crossings']
        box=list(map(float,svg.get('viewBox').split()));assert box[2:]==[q['native_width_px'],q['native_height_px']]
        assert float(svg.get('width').removesuffix('px'))==box[2] and float(svg.get('height').removesuffix('px'))==box[3]
        metrics[name]={'nodes':len(nodes),'edges':len(paths),'width':box[2],'height':box[3],'area':box[2]*box[3],'crossings':crossings,'wire_length':round(length,1)}
        docks(doc,tree);returns(doc,tree)
        geometry.audit_pipeline_summaries(doc,row,nodes);geometry.audit_contract_stages(doc,row,nodes)
    projections=read(OUT/'projection-report.json')
    assert projections['passed'] and projections['render_report_sha256']==sha(OUT/'render-report.json')
    assert projections['auditor_sha256']==sha(ROOT/'tools/audit_joint_preflight_projections.cjs')
    projected={r['name']:r for r in projections['results']}
    results=[]
    for entry in report['sets']:
        goals=entry['plan']['goals'];ir=read(ROOT/entry['input']);ids=[g['id'] for g in goals]
        assert len(ids)==len(set(ids)) and len(entry['panels'])<=entry['limits']['maxPanels']
        def per(row):return assignments(ir,goals,{**docs[row],'quality':rows[row]['quality']},trees[row])
        def union(panels):
            checks=[per(p['row']) for p in panels]
            return [[p['id'] for p,check in zip(panels,checks) if check[i]] for i in range(len(goals))]
        def expressed(panels):return {g['id'] for g,panels in zip(goals,union(panels)) if panels}
        initial=entry['name']+'-initial';panels=[{'id':'main','row':initial}]
        initial_done=expressed(panels)
        assert [r['goal'] for r in entry['baseline_coverage'] if r['status']=='fulfilled']==[g['id'] for g in goals if g['id'] in initial_done]
        if 'rendered_trials' in entry:
            assert entry['rendered_trials']<=entry['limits']['maxTrials']
            assert len({a['row'] for a in entry['attempts']})==entry['rendered_trials']
            rounds={}
            for a in entry['attempts']:rounds.setdefault(a['comparison_round'],[]).append(a)
            for p in entry.get('preflights',[]):rounds.setdefault(p['comparison_round'],[])
            rounds=dict(sorted(rounds.items()))
            checked_projections=0
            if entry.get('preflights'):
                replay=projected[entry['name']]
                assert len(replay['records'])==len(entry['preflights'])
                assert replay['projected_trials']==entry['projected_trials']<=24
            for round_id,group in rounds.items():
                done=expressed(panels);eligible=[]
                for receipt,probe in zip(entry.get('preflights',[]),projected.get(entry['name'],{}).get('records',[])):
                    if receipt['comparison_round']!=round_id:continue
                    checked_projections+=1
                    for k in ['request','state','comparison_round','projected_nodes','projected_edges','role_request']:
                        assert receipt[k]==probe[k],('stale projection',entry['name'],k)
                    nodes=set(probe['projected_nodes']);edges=set(probe['projected_edges']);op=receipt['opportunity'];request=probe['role_request']
                    reasons=[]
                    if (op['kind']=='roles' and (not request or request['status']!='expanded') or
                        op['kind']=='role-path' and (not request or request['status']!='exposed')):reasons.append('protected-or-deferred-role')
                    potential=[]
                    for goal in goals:
                        if goal['id'] in done:continue
                        required=set(goal['edges'])
                        if goal['kind']=='computation':required.update(e['id'] for e in ir['edges'] if e['target']==goal['focus_node'] and e['kind'] in {'data','alias','interface-binding'})
                        if set(goal['core'])<=nodes and required<=edges:potential.append(goal['id'])
                    if not potential:reasons.append('no-new-projected-goals')
                    assert receipt['possible_goals']==potential and receipt['reasons']==reasons and receipt['eligible']==(not reasons)
                    if reasons:assert not any(a['state']==receipt['state'] for a in entry['attempts'])
                for a in group:
                    assert a['before_panels']==[p['id'] for p in panels]
                    candidate={'id':'main' if a['form']=='inline' else a['request'],'row':a['row']}
                    next_panels=[candidate,*panels[1:]] if a['form']=='inline' else [*panels,candidate]
                    new=expressed(next_panels);gained=new-done;lost=done-new
                    assert a['gained_goals']==[g['id'] for g in goals if g['id'] in gained]
                    assert a['lost_goals']==[g['id'] for g in goals if g['id'] in lost]
                    before_area=sum(metrics[p['row']]['area'] for p in panels);after_area=sum(metrics[p['row']]['area'] for p in next_panels)
                    cost=max(1,after_area/max(1,before_area))*len(next_panels)/len(panels)
                    b=a['selection_benefit'];assert abs(cost-b['cost'])<1e-9
                    assert [before_area,after_area,len(panels),len(next_panels)]==[b[k] for k in ['before_area','after_area','before_panels','after_panels']]
                    vector=[0,0,0]
                    for g in goals:
                        if g['id'] in gained:vector[0 if g['kind'] in CRITICAL else 2 if g['kind']=='computation' else 1]+=g['priority']
                    assert all(abs(v/cost-s)<1e-9 for v,s in zip(vector,b['score']))
                    assert all(a['metrics'][k]==v for k,v in metrics[a['row']].items() if k!='wire_length')
                    reasons=[]
                    if not rows[a['row']]['qualified']:reasons.append('figure-quality')
                    if a['form']=='inline':
                        assessment=a['inline_assessment']
                        if not assessment['accepted']:reasons.extend(assessment['reasons'])
                    if not gained:reasons.append('no-new-direct-goals')
                    if lost:reasons.append('previous-direct-goals-lost')
                    assert a['eligible']==(not reasons)
                    assert a['reasons']==reasons+(['lower-measured-benefit'] if a['eligible'] and not a['accepted'] else [])
                    if a['eligible']:eligible.append((a,next_panels))
                selected=[p for p in eligible if p[0]['accepted']]
                assert len(selected)==bool(eligible)
                if selected:
                    # The production comparator uses a 1e-9 tolerance. These
                    # captured winners have no near-tie score ambiguities.
                    winner=sorted(eligible,key=lambda p:(*[-v for v in p[0]['selection_benefit']['score']],p[0]['selection_benefit']['cost'],p[0]['request']))[0]
                    assert selected[0][0]['request']==winner[0]['request']
                    panels=selected[0][1]
            assert checked_projections==len(entry.get('preflights',[]))
            if 'preflight_deferred' in entry:
                assert all(p['reason']=='projection-budget' for p in entry['preflight_deferred'])
                assert not entry['preflight_deferred'] or entry['projected_trials']==24
                rendered=[a for a in entry['attempts'] if a['rendered']]
                assert len(rendered)==entry['rendered_trials']
                assert len({a['row'] for a in rendered})==len(rendered)
            assert [(p['id'],p['row']) for p in panels]==[(p['id'],p['row']) for p in entry['panels']]
        else:
            assert len(entry['attempts'])<=entry['limits']['maxTrials']
        actual=union(entry['panels']);final_done=expressed(entry['panels'])
        assert initial_done<=final_done
        for goal,claimed,found in zip(goals,entry['coverage'],actual):
            assert claimed['goal']==goal['id'] and claimed['panels']==found
            assert claimed['status']==('fulfilled' if found else 'deferred') and claimed['method']==('direct-canonical-paths' if found else None)
        deferred=[g['id'] for g,p in zip(goals,actual) if not p]
        assert deferred==entry['deferred_goals'] and entry['complete']==(not deferred)
        assert entry['main_unchanged']==((OUT/rows[initial]['svg']).read_bytes()==(OUT/rows[entry['panels'][0]['row']]['svg']).read_bytes())
        for p in entry['panels'][1:]:assert rows[p['row']]['qualified']
        results.append({'name':entry['name'],'fulfilled':len(final_done),'goals':len(goals),'panels':len(entry['panels']),
            'main_nodes':rows[entry['panels'][0]['row']]['nodes'],'total_area':sum(metrics[p['row']]['area'] for p in entry['panels']),
            'main_unchanged':entry['main_unchanged'],'passed':True})
    extraction=read(ROOT/'verification/joint-expressions/current/extraction.json')
    assert sha(ROOT/extraction['source'])==extraction['source_sha256'] and not extraction['runtime_executed']
    from semantic_adapter.analyzer import analyze
    for item in extraction['rows']:
        assert sha(ROOT/item['input'])==item['sha256']
        assert analyze(ROOT/extraction['source'],item['name'])==read(ROOT/item['input'])
    ui=read(OUT/'ui-report.json')
    assert ui['passed']
    for f,h in ui['files_sha256'].items():assert sha(OUT/f)==h,('stale UI evidence',f)
    raw=read(OUT/'ui-raw-projection.json');ir=read(OUT/'ui-SourceMosaic-raw.json')['ir'];tree=ET.parse(OUT/'ui-SourceMosaic-raw.svg')
    raw_nodes={n.get('data-id'):n for n in tree.iter() if n.get('data-id')}
    raw_paths={n.get('data-edge-id'):n for n in tree.iter() if n.get('data-edge-id')}
    assert set(raw_nodes)=={n['id'] for n in ir['nodes']} and set(raw_paths)=={e['id'] for e in ir['edges']}
    for p in raw['nodes']:
        xy=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',raw_nodes[p['id']].get('transform'))));assert xy==[p['x'],p['y']]
    for e in raw['edges']:
        ps=[(float(x),float(y)) for x,y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',raw_paths[e['id']].get('d'))]
        assert ps==[(p['x'],p['y']) for p in e['route']['points']]
        assert e['route']['ok'] and raw_paths[e['id']].get('data-route-valid')=='true'
    selected={p['row'] for entry in report['sets'] for p in entry['panels']}
    assert all(row['selected']==(row['name'] in selected) for row in report['rows'])
    geometry.OUT=OUT;saved=sys.argv;sys.argv=[saved[0]]
    try:geometry.main()
    finally:sys.argv=saved
    result={'schema':'joint-preflights-independent/1','auditor_sha256':sha(Path(__file__)),'render_report_sha256':sha(OUT/'render-report.json'),
        'panels':len(rows),'ui_report_sha256':sha(OUT/'ui-report.json'),'raw_ui_all_ids_and_paths_verified':True,'results':results,'metrics':metrics,'passed':True,'goal_complete':False,
        'scope':'Actual SVG, canonical paths, independent goal assignments and per-round measured choices. Full user objective remains unfinished.'}
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'panels':len(rows),'sets':len(results),'passed':True}))
if __name__=='__main__':main()

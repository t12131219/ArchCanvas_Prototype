"""Independent source, canonical binding, summary and actual SVG path checks."""
import json
import xml.etree.ElementTree as ET
from check_stage_sample_frames import ROOT, read, sha
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
import audit_local_svg as summaries
OUT=ROOT/'verification/stage-routes/current'

def reports():
    return [read(OUT/name) for name in ['small-report.json','Transformer-F0-report.json',*[f'Transformer-F1-{i}-report.json' for i in range(3)]]]

def fulfilled(d,key):
    return {r['goal'] for r in d[key] if r['status']=='fulfilled'}

def geometry(routes):
    count=0
    for i,e in enumerate(routes):
        for f in routes[i+1:]:
            for p,q in zip(e['route']['points'],e['route']['points'][1:]):
                for a,b in zip(f['route']['points'],f['route']['points'][1:]):
                    if (p['x']==q['x'])==(a['x']==b['x']):continue
                    u,v,c,d=(p,q,a,b) if p['x']==q['x'] else (a,b,p,q)
                    count+=min(c['x'],d['x'])<u['x']<max(c['x'],d['x']) and min(u['y'],v['y'])<c['y']<max(u['y'],v['y'])
    return count

if __name__=='__main__':
    captures=reports(); hashes=captures[0]['implementation_sha256']
    for file,h in hashes.items():assert sha(ROOT/file)==h, ('stale implementation',file)
    extraction=read(OUT/'extraction.json');assert not extraction['runtime_executed']
    assert sha(ROOT/extraction['source'])==extraction['source_sha256']
    for row in extraction['rows']:assert sha(ROOT/row['input'])==row['sha256']
    content.OUT=operands.OUT=OUT
    rows=[]
    for report in captures:
        assert report['implementation_sha256']==hashes
        for row in report['rows']:
            assert sha(ROOT/row['input'])==row['input_sha256']
            docs=[]
            for c in row['results']:
                d,_,_=content.inspect(c,row['name']+'-'+c['suffix'],sequences.check_operation,require_quality=False)
                assert d['ir']==read(ROOT/row['input']);operands.check_svg_bindings(c,d)
                svg=ET.parse(OUT/c['svg']).getroot();nodes={n.get('data-node-id'):n for n in svg.iter() if n.get('data-node-id')}
                summaries.audit_pipeline_summaries(d,{'local_pipelines':d['publication'].get('local_pipelines')},nodes)
                summaries.audit_contract_stages(d,{'contract_stages':d['publication'].get('contract_stages')},nodes)
                q=d['diagnostics']['publication'];assert q==c['quality']
                assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
                assert geometry(d['layout']['edges'])==q['line_geometry']['crossings']
                docs.append(d)
            a,b=docs
            if row['comparison']=='coarse-vs-open':
                assert len(b['layout']['nodes'])>len(a['layout']['nodes'])
                assert any(c['form']=='operation-paths' and c['status']=='fulfilled' for c in b['summary_coverage'])
            else:
                for key in ['ir','architecture','publication','expression_goals','summary_goals']:assert a[key]==b[key],(row['name'],key)
                for key in ['nodes','node_accounting','edge_accounting','representatives','frame_ownership']:assert a['layout'].get(key)==b['layout'].get(key),(row['name'],key)
                for key in ['expression_coverage','summary_coverage']:assert fulfilled(a,key)<=fulfilled(b,key)
                before={e['id']:e for e in a['layout']['edges']};changed=[]
                for e in b['layout']['edges']:
                    old=before[e['id']];assert {k:v for k,v in old.items() if k!='route'}=={k:v for k,v in e.items() if k!='route'}
                    assert [old['route'][k] for k in ['source_side','target_side']]==[e['route'][k] for k in ['source_side','target_side']]
                    assert [old['route']['points'][0],old['route']['points'][-1]]==[e['route']['points'][0],e['route']['points'][-1]]
                    if old['route']!=e['route']:changed.append(e['id'])
                r=b['diagnostics']['routing'].get('route_shortcuts')
                if r and r.get('final_stage_frontier'):
                    assert set(changed)=={v['edge'] for v in r['selected']}
                    assert all(not v['lost_summaries'] and v['summary_goals_candidate']>=v['summary_goals_before'] for v in r['selected'])
                    assert len(r['attempts'])<=48 and r['max_edges']==12
                old,new=[c['quality'] for c in row['results']]
                for key in ['native_width_px','native_height_px','wire_length']:assert new[key]<=old[key]
                assert new['line_geometry']['crossings']<=old['line_geometry']['crossings']
                assert new['min_canvas_font_px']>=old['min_canvas_font_px']
                if row['name'].startswith('Transformer-') or row['name'].endswith('-roles'):assert row['results'][0]['svg_sha256']==row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'],nodes=[len(d['layout']['nodes']) for d in docs],crossings=[c['quality']['line_geometry']['crossings'] for c in row['results']],wire=[c['quality']['wire_length'] for c in row['results']]))
    result=dict(schema='stage-routes-independent/1',baseline='38a2d66',implementation_sha256=hashes,rows=rows,formal_svgs=sum(len(r['rows'])*2 for r in captures),goal_complete=False)
    (OUT/'independent-checks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(rows))

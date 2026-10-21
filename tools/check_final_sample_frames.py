"""Independently verify final frame attachments and the actual common SVG map."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/final-sample-frames/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from check_operand_rows import contexts, scope_geometry
from audit_diagram_assignments import assignments
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def terminals(doc):
    boxes = {p['id']: p for p in doc['layout']['nodes']}
    used = set()
    for e in doc['layout']['edges']:
        for node, role, point, side in [(e['source'], 'source', e['route']['points'][0], e['route']['source_side']), (e['target'], 'target', e['route']['points'][-1], e['route']['target_side'])]:
            key = (node, role, point['x'], point['y'])
            assert key not in used, ('coincident terminals', e['id'])
            used.add(key);p = boxes[node]
            if p.get('expanded'):continue
            if p.get('symbol'):
                assert abs((point['x']-p['x']-p['w']/2)**2+(point['y']-p['y']-p['w']/2)**2-(p['w']/2)**2) < 1e-5
            else:
                assert p['x']-1e-6 <= point['x'] <= p['x']+p['w']+1e-6 and p['y']-1e-6 <= point['y'] <= p['y']+p['h']+1e-6
                axis, boundary = ('x', p['x'] if side == 'left' else p['x']+p['w']) if side in ['left','right'] else ('y', p['y'] if side == 'top' else p['y']+p['h'])
                assert abs(point[axis]-boundary)<1e-6


def transformation(a, b):
    r = b['diagnostics']['routing'].get('final_sample_frame_refinement')
    if not r or not r['accepted']:
        assert a['layout'] == b['layout'], 'no accepted transformation must retain actual layout'
        return []
    old = {p['id']: p for p in a['layout']['nodes']};new = {p['id']: p for p in b['layout']['nodes']}
    planned = {p['id']: p for p in a['architecture']['nodes']}
    frames = r['frames'];move = {f['node']: f['target'] for f in frames};removed = set(move)
    assert old.keys()-new.keys() == removed and not new.keys()-old.keys()
    assert removed.isdisjoint(move.values())
    assert r['direct_goals_before'] <= r['direct_goals_candidate'] and not r['lost_goals']
    bands = r['bands'];assert bands
    assert all(x['bottom']-x['top']>=16 for x in bands)
    assert all(x['bottom']<y['top'] for x,y in zip(bands,bands[1:]))
    T = lambda y: y-sum(max(0,min(y,g['bottom'])-g['top']) for g in bands)
    protected = []
    for id,p in new.items():
        prev = old[id]
        assert p['x']==prev['x'] and p['w']==prev['w'] and p['y']==T(prev['y']) and p['h']==T(prev['y']+prev['h'])-T(prev['y'])
        if not p.get('expanded'):assert p['h']==prev['h']
        protected.append((prev['y']-8,prev['y']+(p['header'] if p.get('expanded') else prev['h'])+8))
    for p in a['layout']['labels']:protected.append((p['y']-8,p['y']+p['h']+8))
    for e in a['layout']['edges']:
        ps=e['route']['points']
        for p in [ps[0],ps[-1]]:protected.append((p['y']-8,p['y']+8))
        for p,q in zip(ps,ps[1:]):
            if p['y']==q['y']:protected.append((p['y']-8,p['y']+8))
    for gap in bands:
        assert any(w['top']<=gap['top'] and gap['bottom']<=w['bottom'] for w in r['windows'])
        assert all(gap['bottom']<=low or gap['top']>=high for low,high in protected), ('not globally empty',gap)
    records = {f['node']: f for f in b['layout']['frame_ownership']}
    for frame in frames:
        n=planned[frame['node']];parent=planned[frame['target']]
        sample=n['sequence_sample'];seq=parent['sequence_frontier']
        assert frame==records[n['id']] and n['semantic_type']=='repeat-instance' and parent['semantic_type']=='serial-repeat'
        assert sample['sequence']==parent['id'] and sample['index']==n['repeat_index']
        assert seq['samples']==[s for s in seq['samples'] if s['instance']==n['id']] and len(seq['samples'])==1 and not seq['unclassified']
        assert n['structure_representative']['status']=='proved' and old[n['id']]['expanded'] and old[parent['id']]['expanded']
        assert frame['sequence_sample']['source_positions']==n['structure_representative']['indices']
        assert frame['sequence_sample']['module_identity']==n.get('module_identity')
        assert frame['source']==n.get('source',[]) and frame['source_parent']==n.get('source_parent',n['parent'])
        assert 'Detail: source call '+str(n['repeat_index']+1) in ' '.join(new[parent['id']]['captions'])
        children=[p for p in planned.values() if p.get('parent')==parent['id'] and p['id'] in old and p['id']!=n['id']]
        assert children and all(s['semantic_type']=='serial-remainder' and not old[s['id']].get('expanded') and s['sequence_remainder']['representative']==n['id'] for s in children)
        positions=sorted([n['repeat_index']]+[i for s in children for i in s['sequence_remainder']['indices']])
        assert positions==list(range(parent['repeat_contract']['count']))
        members={n['id']}
        while True:
            extra={p['id'] for p in planned.values() if p.get('parent') in members}-members
            if not extra:break
            members |= extra
        for id in members:
            node=planned[id]
            assert node['kind']!='opaque' and not any(node.get(k) for k in ['mutable','identity_display','observed_calls'])
        assert not any(e['kind']=='state-write' and (e['source'] in members or e['target'] in members) for e in a['ir']['edges'])
        if old[n['id']].get('design_gutter'):
            assert new[parent['id']]['design_gutter']>=old[n['id']]['x']+old[n['id']]['design_gutter']-new[parent['id']]['x']
    assert len(a['layout']['edges'])==len(b['layout']['edges'])
    for e,f in zip(a['layout']['edges'],b['layout']['edges']):
        assert e.keys()==f.keys()
        for k in e:
            if k=='route':
                assert {k:v for k,v in e[k].items() if k!='points'}=={k:v for k,v in f[k].items() if k!='points'}
                assert f[k]['points']==[{**p,'y':T(p['y'])} for p in e[k]['points']]
            elif k=='design_route':assert f[k]=={**e[k],'owner':move.get(e[k]['owner'],e[k]['owner'])}
            else:assert e[k]==f[k], ('binding changed',e['id'],k)
    for key in ['edge_accounting','cross_scope_ports','context_lanes','input_docks','compound_alignments','branch_columns']:
        assert a['layout'].get(key)==b['layout'].get(key), key
    for bucket,ids in a['layout']['node_accounting'].items():
        expected=set(ids)-removed if bucket=='visible' else set(ids)|removed if bucket=='attached' else set(ids)
        assert set(b['layout']['node_accounting'][bucket])==expected
    assert b['layout']['frame_ownership']==[{**f,'target':move.get(f['target'],f['target'])} for f in a['layout'].get('frame_ownership',[])+frames]
    assert b['layout']['representatives']=={id:move.get(target,target) for id,target in a['layout']['representatives'].items()}
    for key in ['consumer_arguments','operand_rows']:
        import copy
        expected=copy.deepcopy(a['layout'].get(key))
        for row in expected or []:
            for n in row.get('nodes',[row]):
                for where in ['before','after']:
                    if where in n:n[where]['y']=T(n[where]['y'])
        assert expected==b['layout'].get(key), key
    oldq,newq=[d['diagnostics']['publication'] for d in [a,b]]
    assert newq['native_height_px']<oldq['native_height_px'] and newq['native_width_px']<=oldq['native_width_px'] and newq['wire_length']<=oldq['wire_length']
    assert newq['line_geometry']['crossings']<=oldq['line_geometry']['crossings']
    assert set(newq['issues'])<=set(oldq['issues'])
    for kind in ['unrelated_contacts','overlapping_paths']:assert len(newq['line_geometry'][kind])<=len(oldq['line_geometry'][kind])
    applied={c['id'] for c in a['layout']['constraint_receipts'] if c['status']=='applied'}
    assert applied<={c['id'] for c in b['layout']['constraint_receipts'] if c['status']=='applied'}
    return frames


def main():
    extraction=read(OUT/'extraction.json');assert not extraction['runtime_executed'] and sha(ROOT/extraction['source'])==extraction['source_sha256']
    for row in extraction['rows']:
        ir=read(ROOT/row['input']);assert sha(ROOT/row['input'])==row['sha256'] and validate_ir(ir)['ok']
        assert analyze(ROOT/extraction['source'],row['entry'])==ir
    small,large=[read(OUT/(s+'-report.json')) for s in ['small','large']]
    assert small['implementation_sha256']==large['implementation_sha256']
    for f,h in small['implementation_sha256'].items():assert sha(ROOT/f)==h, ('stale implementation',f)
    snapshot=small['baseline'];assert snapshot==large['baseline']
    for f,h in snapshot['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',snapshot['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    historical=json.loads(subprocess.check_output(['git','show',snapshot['commit']+':verification/operand-rows/current/large-report.json'],cwd=ROOT))
    geometry.OUT=stages.OUT=OUT
    docs={};rows={};direct={};measured={};title_counts={}
    for report in [small,large]:
        for row in report['rows']:
            name=row['name'];assert name not in docs
            if name.startswith('Transformer-') and name.endswith('-before'):
                capture=historical['joint']['panels'][int(name.split('-')[2])]['capture'];prior=next(r for r in historical['rows'] if r['name']==capture)
                assert prior['svg_sha256']==row['svg_sha256']
            doc=read(OUT/row['document']);svg=ET.parse(OUT/row['svg']).getroot()
            measured[name]=stages.check({**row,'role_path_stages':doc['publication'].get('role_path_stages')},compare_expression=False,require_quality=False,allow_label_notes=True)
            geometry.inspect(row);passage,intrusions=passages(doc,svg);assert not intrusions, ('body intrusion',name,intrusions)
            title_counts[name]=len(passage);assert doc['layout']['frame_title_routing']=='pass-through'
            goals=doc['expression_goals']['goals']
            direct[name]={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg)) if ok}
            raw={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg,require_quality=False)) if ok}
            assert raw=={g['goal'] for g in doc['expression_coverage'] if g['status']=='fulfilled'}
            contexts(doc);scope_geometry(doc);terminals(doc)
            docs[name]=doc;rows[name]=row
    comparisons=[]
    for report in [small,large]:
        for c in report['comparisons']:
            a,b=[docs[c[k]] for k in ['before','after']]
            for key in ['ir','architecture','expression_goals','state','publication']:assert a[key]==b[key], (c['name'],key)
            frames=transformation(a,b);assert direct[c['before']]<=direct[c['after']]
            tree=ET.parse(OUT/rows[c['after']]['svg']).getroot();visible={n.get('data-node-id'):n for n in tree.iter() if n.get('data-node-id')}
            for f in frames:
                text=' '.join(''.join(n.itertext()) for n in visible[f['target']] if n.tag.endswith('text'))
                assert 'Detail: source call '+str(f['sequence_sample']['index']+1) in text
            comparisons.append(dict(name=c['name'],attached_frames=[f['node'] for f in frames],before=measured[c['before']],after=measured[c['after']],nodes=[len(a['layout']['nodes']),len(b['layout']['nodes'])],edges=[len(a['layout']['edges']),len(b['layout']['edges'])],direct_goals=[len(direct[c['before']]),len(direct[c['after']])]))
    for name in ['ConditionalNeighborRuns','Transformer-panel-0']:assert next(c for c in comparisons if c['name']==name)['attached_frames']
    joint=large['joint'];coverage=lambda ps:{g['id']:[p['id'] for p in ps if g['id'] in direct[p['capture']]] for g in joint['plan']['goals']}
    for declared,actual in [(joint['baseline_coverage'],coverage(joint['initial'])),(joint['coverage'],coverage(joint['panels']))]:
        assert all(r['panels']==actual[r['goal']] and (r['status']=='fulfilled')==bool(actual[r['goal']]) for r in declared)
    prior={r['goal'] for r in historical['joint']['coverage'] if r['status']=='fulfilled'};current={id for id,ps in coverage(joint['panels']).items() if ps};assert prior<=current
    result=dict(passed=True,goal_complete=False,panels=len(docs),comparisons=comparisons,title_passages=title_counts,joint=dict(before=len(prior),after=len(current),lost=sorted(prior-current)),unresolved_quality_panels=[n for n,r in rows.items() if r['quality']['issues'] or r['quality']['line_geometry']['unrelated_contacts']],auditor_sha256=sha(Path(__file__)))
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['passed','panels','joint','unresolved_quality_panels']}))


if __name__=='__main__':main()

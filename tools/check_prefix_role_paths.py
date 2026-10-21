"""Independent source/certificate/alias/cut and actual SVG audit for prefix stages."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/prefix-role-paths/current'
sys.path[:0] = [str(ROOT), str(ROOT/'tools')]
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from check_operand_rows import contexts, scope_geometry
from check_final_sample_frames import terminals
from audit_diagram_assignments import assignments
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    extraction=read(OUT/'extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT/extraction['source'])==extraction['source_sha256']
    for row in extraction['rows']:
        ir=read(ROOT/row['input']);assert validate_ir(ir)['ok'] and sha(ROOT/row['input'])==row['sha256']
        assert analyze(ROOT/extraction['source'],row['name'])==ir
    reports=[read(OUT/'small-report.json')]
    if '--small' not in sys.argv:reports.append(read(OUT/'large-report.json'))
    snapshot=reports[0]['baseline']
    for report in reports:
        assert report['implementation_sha256']==reports[0]['implementation_sha256'] and report['baseline']==snapshot
    for f,h in reports[0]['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale implementation',f)
    for f,h in snapshot['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',snapshot['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    geometry.OUT=stages.OUT=OUT
    docs,rows,direct,measured,counts={},{},{},{},{}
    for report in reports:
        for row in report['rows']:
            name=row['name'];assert name not in docs
            doc=read(OUT/row['document']);svg=ET.parse(OUT/row['svg']).getroot()
            measured[name]=stages.check({**row,'role_path_stages':doc['publication'].get('role_path_stages')},compare_expression=False,require_quality=True)
            geometry.inspect(row)
            passage,intrusions=passages(doc,svg);assert not intrusions,('concrete obstacle intrusion',name,intrusions)
            assert doc['layout']['frame_title_routing']=='pass-through';counts[name]=len(passage)
            goals=doc['expression_goals']['goals']
            direct[name]={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg)) if ok}
            raw={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg,require_quality=False)) if ok}
            assert raw=={r['goal'] for r in doc['expression_coverage'] if r['status']=='fulfilled'}
            contexts(doc);scope_geometry(doc);terminals(doc)
            docs[name]=doc;rows[name]=row
    comparisons=[]
    for report in reports:
        for c in report['comparisons']:
            a,b=[docs[c[k]] for k in ['before','after']]
            assert a['ir']==b['ir'] and a['expression_goals']==b['expression_goals'] and a['state']==b['state']
            new=[r for r in b['publication'].get('role_path_stages',{}).get('rows',[]) if r.get('direction')=='helper-before-role']
            old=[r for r in a['publication'].get('role_path_stages',{}).get('rows',[])]
            assert not any(r.get('direction')=='helper-before-role' for r in old)
            # Detailed goals covered by the role's actual operation become
            # unfulfilled in the main summary. Only that loss is legitimate.
            hidden={r['anchor'] for r in new if r['status']=='summary'}
            lost=direct[c['before']]-direct[c['after']]
            by_goal={g['id']:g for g in a['expression_goals']['goals']}
            assert all(set(by_goal[id]['core'])&hidden for id in lost),('unexplained goal loss',c['name'],lost)
            if not new:assert (OUT/rows[c['before']]['svg']).read_bytes()==(OUT/rows[c['after']]['svg']).read_bytes()
            kinds={n['id']:n['kind'] for n in a['ir']['nodes']}
            for key in ['opaque','control']:
                before={n['id'] for n in a['layout']['nodes'] if kinds.get(n['id'])==key}
                assert before<={n['id'] for n in b['layout']['nodes'] if kinds.get(n['id'])==key}
            comparisons.append(dict(name=c['name'],before=measured[c['before']],after=measured[c['after']],new_stages=len(new),direct_goals=[len(direct[c['before']]),len(direct[c['after']])],lost_direct_goals=sorted(lost)))
    joint_result=None
    if len(reports)>1:
        historical=json.loads(subprocess.check_output(['git','show',snapshot['commit']+':verification/final-sample-frames/current/large-report.json'],cwd=ROOT))
        joint=reports[1]['joint'];coverage=lambda ps:{g['id']:[p['id'] for p in ps if g['id'] in direct[p['capture']]] for g in joint['plan']['goals']}
        for declared,actual in [(joint['baseline_coverage'],coverage(joint['initial'])),(joint['coverage'],coverage(joint['panels']))]:
            assert all(r['panels']==actual[r['goal']] and (r['status']=='fulfilled')==bool(actual[r['goal']]) for r in declared)
        prior={r['goal'] for r in historical['joint']['coverage'] if r['status']=='fulfilled'}
        current={id for id,ps in coverage(joint['panels']).items() if ps}
        assert prior<=current,('graph-set lost goals',sorted(prior-current))
        for i,p in enumerate(historical['joint']['panels']):
            row=next(r for r in historical['rows'] if r['name']==p['capture'])
            assert rows['Transformer-panel-'+str(i)+'-before']['svg_sha256']==row['svg_sha256']
        joint_result=dict(before=len(prior),after=len(current),lost=sorted(prior-current),gained=sorted(current-prior))
    negatives=[]
    if len(reports)>1:
        main=rows['Transformer-panel-0-current']
        for kind in ['result-slot','target-slot','missing-consumer-provenance']:
            altered=read(OUT/main['document'])
            stage=next(r for r in altered['publication']['role_path_stages']['rows'] if r.get('direction')=='helper-before-role')
            incoming=next(e for e in stage['cuts'] if e['target'] in stage['helper_path']['canonical_members'])
            outgoing=next(e for e in stage['cuts'] if e['source']==stage['anchor'])
            cut=outgoing if kind=='missing-consumer-provenance' else incoming
            carriers=[e for e in altered['layout']['edges'] if cut['id'] in e.get('originals',[e['id']])]
            if kind=='result-slot':carriers[0]['source_port']='unproved-result-slot'
            elif kind=='target-slot':carriers[0]['target_port']='unproved-operand'
            else:
                assert len(carriers)>1
                carriers[0]['originals'].remove(cut['id'])
            with tempfile.NamedTemporaryFile(dir=OUT,suffix='.layout.json',mode='w+') as f:
                json.dump(altered,f);f.flush();p=Path(f.name)
                test={**main,'document':p.name,'document_sha256':sha(p),'role_path_stages':altered['publication']['role_path_stages']}
                try:stages.check(test,compare_expression=False)
                except AssertionError:
                    tb=sys.exc_info()[2]
                    while tb.tb_next:tb=tb.tb_next
                    assert tb.tb_frame.f_code.co_name=='check' and tb.tb_frame.f_locals.get('e',{}).get('id')==cut['id']
                    negatives.append(dict(kind=kind,rejected=True,cut=cut['id']))
                else:raise AssertionError(('corrupt projection accepted',kind))
    result=dict(passed=True,goal_complete=False,panels=len(rows),comparisons=comparisons,joint=joint_result,title_passages=counts,negative_projection_checks=negatives,
                unresolved_quality_panels=[n for n,r in rows.items() if r['quality']['issues'] or r['quality']['line_geometry']['unrelated_contacts']],auditor_sha256=sha(Path(__file__)))
    if len(reports)>1:(OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:result[k] for k in ['passed','panels','joint','unresolved_quality_panels']}))


if __name__=='__main__':main()

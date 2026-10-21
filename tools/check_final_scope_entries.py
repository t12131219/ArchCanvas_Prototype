"""Independently audit final side entries, immutable bindings and actual SVGs."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/source-columns/current'
sys.path[:0]=[str(ROOT/'tools')]
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from check_operand_rows import contexts,scope_geometry,drawing_parents
from check_final_sample_frames import terminals
from check_module_arguments import arguments
from check_declared_operands import declared_rows
from audit_diagram_assignments import assignments
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()


def final_entries(doc):
    rec=doc['diagnostics']['routing'].get('final_scope_entry_refinement')
    if not rec:return []
    assert rec['max_trials']==6 and len(rec['attempts'])<=6
    previous=rec['before'];selected={c['edge']:c for c in rec['initial_entries']}
    edges={e['id']:e for e in doc['layout']['edges']};boxes={n['id']:n for n in doc['layout']['nodes']};parents=drawing_parents(doc)
    canonical={e['id']:e for e in doc['ir']['edges']}
    groups=set()
    for t in rec['attempts']:
        assert t['before']==previous and t['route_mode'] in ['full','retained']
        source={edges[c['edge']]['source'] for c in t['entries']};owner={c['owner'] for c in t['entries']};assert len(source)==len(owner)==1
        groups.add((next(iter(source)),next(iter(owner))));assert len(groups)<=3
        peers={at for c in t['entries'] for at in [edges[c['edge']]['source'],edges[c['edge']]['target']]}
        assert set(t['refreshed_edges'])=={e['id'] for e in edges.values() if e['source'] in peers or e['target'] in peers}
        if not t['accepted']:continue
        a,b=t['before'],t['candidate'];assert t['facts_preserved'] and t['distinct_terminals'] and b['crossings']<a['crossings']
        for key in ['contacts','wire_length','overlaps','unplaced_labels']:assert b[key]<=a[key]
        for key in ['width','height']:assert b[key]<=rec['before'][key]
        assert set(b['issues'])<=set(a['issues'])
        for key,ids in t['realized_before'].items():assert set(ids)<=set(t['realized_candidate'][key])
        assert t['direct_goals_before']<=t['direct_goals_candidate']
        previous=b;selected.update({c['edge']:c for c in t['entries']})
    assert rec['after']==previous and rec['selected']==list(selected.values())==doc['layout'].get('cross_scope_ports',[])
    later=doc['diagnostics']['routing'].get('coincident_port_refinement') or doc['diagnostics']['routing'].get('empty_band_compaction')
    if later:assert (later['before']['crossings'],later['before']['wire_length'])==(previous['crossings'],previous['wire_length'])
    else:
        q=doc['diagnostics']['publication'];assert (q['line_geometry']['crossings'],q['wire_length'])==(previous['crossings'],previous['wire_length'])
    def ancestors(id):
        seen=set()
        while id is not None and id not in seen:seen.add(id);id=parents.get(id)
        return seen
    for c in selected.values():
        e=edges[c['edge']];a,b,p=boxes[e['source']],boxes[e['target']],boxes[c['owner']];r=e['route']
        for m in e.get('bundle_members',[e]):
            raw=canonical[m['id']]
            for key in ['kind','source_port','target_port','condition','evidence']:assert m.get(key)==raw.get(key), ('changed canonical binding',m['id'],key)
            assert m['canonical_source']==raw['source'] and m['canonical_target']==raw['target']
        assert p['expanded'] and parents[e['target']]==c['owner'] and c['owner'] not in ancestors(e['source'])
        assert e['source'] not in ancestors(e['target']) and e['target'] not in ancestors(e['source'])
        assert not any(e.get(k) for k in ['condition','iteration','design_route','context_lane','layout_after']) and not r.get('feedback')
        for m in e.get('bundle_members',[e]):assert m['kind'] in ['data','alias','interface-binding'] and not any(m.get(k) for k in ['condition','iteration','design_route','context_lane','layout_after'])
        left=a['x']+a['w']<=p['x'];assert left or a['x']>=p['x']+p['w']
        assert c['source_side']==('right' if left else 'left') and c['target_side']==('left' if left else 'right')
        assert r['ok'] and r['source_side']==c['source_side'] and r['target_side']==c['target_side']
        assert r['points'][0]['x']==a['x']+(a['w'] if left else 0) and r['points'][-1]['x']==b['x']+(0 if left else b['w'])
    return list(selected.values())


def main():
    reports=[read(OUT/(s+'-report.json')) for s in ['small','large']]
    for report in reports:assert report['implementation_sha256']==reports[0]['implementation_sha256'] and report['baseline']==reports[0]['baseline']
    for f,h in reports[0]['implementation_sha256'].items():assert sha(ROOT/f)==h,('stale implementation',f)
    for f,h in reports[0]['baseline']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',reports[0]['baseline']['commit']+':'+f],cwd=ROOT)).hexdigest()==h
    geometry.OUT=stages.OUT=OUT
    docs,rows,direct,measured={}, {}, {}, {}
    inherited_contacts=[]
    for report in reports:
        for row in report['rows']:
            name=row['name'];doc=read(OUT/row['document']);svg=ET.parse(OUT/row['svg']).getroot()
            assert sha(OUT/row['document'])==row['document_sha256'] and sha(OUT/row['svg'])==row['svg_sha256']
            assert sha(ROOT/row['input'])==row['input_sha256'] and doc['ir']==read(ROOT/row['input'])
            contacts=row['quality']['line_geometry']['unrelated_contacts']
            if contacts:
                # Preserve explicit pre-existing defects as audit findings.
                # Verify the entire SVG against the frozen renderer for this
                # exact state, including the extra local-fold roundtrip panel.
                script="const fs=require('fs'),crypto=require('crypto'),load=require('./tools/load_publication_renderer.cjs'),B=load('/tmp/archcanvas-source-columns-before-478ae13'),d=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write(crypto.createHash('sha256').update(B.render(d.ir,d.state).svg).digest('hex'));"
                old_sha=subprocess.check_output(['node','-e',script,str(OUT/row['document'])],cwd=ROOT,text=True)
                assert old_sha==row['svg_sha256'],('new contact defect',name)
                inherited_contacts.append(dict(name=name,contacts=len(contacts),frozen_svg_identical=True))
            assert not row['quality']['issues'] and not row['quality']['unplaced_port_labels']
            measured[name]=stages.check({**row,'role_path_stages':doc['publication'].get('role_path_stages')},compare_expression=False,require_quality=not contacts)
            geometry.inspect(row);_,bodies=passages(doc,svg);assert not bodies,(name,bodies)
            contexts(doc);scope_geometry(doc);terminals(doc);arguments(doc,svg);declared_rows(doc);final_entries(doc)
            goals=doc['expression_goals']['goals'];direct[name]={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg)) if ok}
            docs[name]=doc;rows[name]=row
    comparisons=[]
    for report in reports:
        for c in report['comparisons']:
            a,b=[docs[c[k]] for k in ['before','after']]
            for key in ['ir','state','architecture','publication','expression_goals','summary_goals']:assert a.get(key)==b.get(key),(c['name'],key)
            for key in ['nodes','node_accounting','edge_accounting','representatives','frame_ownership','bounds','declared_operand_rows']:assert a['layout'].get(key)==b['layout'].get(key),(c['name'],key)
            edge_facts=lambda d:[{k:v for k,v in e.items() if k!='route'} for e in d['layout']['edges']]
            assert edge_facts(a)==edge_facts(b)
            rec=b['diagnostics']['routing'].get('final_scope_entry_refinement')
            if rec:assert rec['initial_entries']==a['layout'].get('cross_scope_ports',[])
            assert direct[c['before']]<=direct[c['after']]
            qa,qb=rows[c['before']]['quality'],rows[c['after']]['quality']
            for key in ['wire_length','native_width_px','native_height_px']:assert qb[key]<=qa[key]
            assert qb['line_geometry']['crossings']<=qa['line_geometry']['crossings']
            assert len(qb['line_geometry']['unrelated_contacts'])<=len(qa['line_geometry']['unrelated_contacts'])
            comparisons.append(dict(name=c['name'],before=measured[c['before']],after=measured[c['after']],selected=final_entries(b),direct_goals=[len(direct[c['before']]),len(direct[c['after']])]))
    negatives=[];main=docs['Transformer-panel-0-current']
    for kind in ['physical-side','physical-terminal','condition','canonical-slot','forgot-initial-entry']:
        doc=copy.deepcopy(main);rec=doc['diagnostics']['routing']['final_scope_entry_refinement'];c=rec['selected'][-1];e=next(e for e in doc['layout']['edges'] if e['id']==c['edge'])
        if kind=='physical-side':e['route']['target_side']='right'
        elif kind=='physical-terminal':e['route']['points'][-1]['x']+=8
        elif kind=='condition':e['condition']={'branch':'guarded'}
        elif kind=='forgot-initial-entry':rec['selected']=rec['selected'][1:];doc['layout']['cross_scope_ports']=copy.deepcopy(rec['selected'])
        else:e['target_port']='wrong'
        try:final_entries(doc)
        except AssertionError:negatives.append(dict(kind=kind,rejected=True))
        else:raise AssertionError(('corrupt final entry accepted',kind))
    sets={s:set().union(*(direct['Transformer-panel-'+str(i)+'-'+s] for i in range(3))) for s in ['before','current']};assert sets['before']<=sets['current']
    result=dict(passed=True,goal_complete=False,panels=len(rows),inherited_contact_panels=inherited_contacts,comparisons=comparisons,negative_checks=negatives,graph_set_direct=dict(before=len(sets['before']),after=len(sets['current']),lost=sorted(sets['before']-sets['current'])),auditor_sha256=sha(Path(__file__)))
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['passed','panels','graph_set_direct']}))
if __name__=='__main__':main()

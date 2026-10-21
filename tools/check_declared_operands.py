"""Audit declared input order against real Python ASTs and rendered geometry."""
import ast
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'verification/operand-order/current'
sys.path[:0] = [str(ROOT), str(ROOT/'tools')]
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from check_operand_rows import contexts, scope_geometry, drawing_parents
from check_final_sample_frames import terminals
from check_module_arguments import arguments
from audit_diagram_assignments import assignments
from semantic_adapter.analyzer import analyze
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def declared_rows(doc):
    raw = {n['id']: n for n in doc['ir']['nodes']}
    canonical = {e['id']: e for e in doc['ir']['edges']}
    visible = {e['id']: e for e in doc['layout']['edges']}
    boxes = {n['id']: n for n in doc['layout']['nodes']}
    planned = {n['id']: n for n in doc['architecture']['nodes']}
    parents = drawing_parents(doc)
    rec = doc['diagnostics']['routing'].get('declared_operand_refinement')
    selected = doc['layout'].get('declared_operand_rows', [])
    if not rec:
        assert not selected
        return []
    assert rec['max_arrangements'] == 3 and len(rec['attempts']) <= rec['max_trials'] == 6
    previous = rec['before'];chosen = {}
    for trial in rec['attempts']:
        assert trial['before'] == previous and trial['order'] == 'declared' and trial['route_mode'] in ['full', 'retained']
        if not trial['accepted']:continue
        a, b = trial['before'], trial['candidate']
        assert trial['facts_preserved'] and trial['distinct_terminals']
        assert trial['aligned_candidate'] == len(trial['records'])
        assert trial['aligned_candidate'] > trial['aligned_before'] or trial['ordered_candidate'] > trial['ordered_before'] or b['crossings'] < a['crossings'] or b['wire_length'] < a['wire_length']*.98
        for key in ['crossings', 'wire_length', 'contacts', 'overlaps', 'unplaced_labels']:assert b[key] <= a[key]
        for key in ['width', 'height']:assert b[key] <= rec['before'][key]
        assert set(b['issues']) <= set(a['issues'])
        for key, ids in trial['realized_before'].items():assert set(ids) <= set(trial['realized_candidate'][key])
        assert trial['direct_goals_before'] <= trial['direct_goals_candidate']
        chosen.update({r['sink']: r for r in trial['records']});previous = b
    assert rec['after'] == previous and rec['selected'] == selected == list(chosen.values())
    q = doc['diagnostics']['publication']
    assert (q['line_geometry']['crossings'], q['wire_length']) == (previous['crossings'], previous['wire_length'])
    trees = {};checked = []
    for row in selected:
        proof = row['declaration'];assert proof['rule_version'] == 'declared-operand-order/1' and proof['owner'] == row['sink']
        assert [n['node'] for n in row['nodes']] == [n['node'] for n in proof['inputs']]
        assert len({boxes[n['node']]['y'] for n in row['nodes']}) == 1
        centers = [boxes[n['node']]['x']+boxes[n['node']]['w']/2 for n in row['nodes']]
        assert all(a < b for a, b in zip(centers, centers[1:]))
        locs = []
        for n, p in zip(row['nodes'], proof['inputs']):
            e, binding, input = visible[n['edge']], canonical[n['edge']], raw[p['input']]
            assert {k: boxes[n['node']][k] for k in ['x','y']} == n['after']
            assert e['source'] == n['node'] == p['node'] and e['target'] == row['sink'] == input['parent'] == p['owner']
            assert e['kind'] == binding['kind'] == 'interface-binding' and e['evidence'] == binding['evidence'] == 'source-dependency'
            assert e['canonical_target'] == binding['target'] == input['id'] and e['canonical_source'] == binding['source']
            assert e['target_port'] == binding['target_port'] == n['target_port'] == input['slot'] == p['slot']
            assert input['kind'] == 'interface' and input['role'] == 'input' and input['evidence_status'] == 'static-only'
            assert input['source'] == [p['source']]
            loc = p['source'];file = loc['file']
            if file not in trees:trees[file] = ast.parse(Path(file).read_text())
            matches = [(f, a) for f in ast.walk(trees[file]) if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))
                       for a in [*f.args.posonlyargs, *f.args.args, *f.args.kwonlyargs]
                       if a.lineno == loc['line'] and a.col_offset == loc['column']]
            assert len(matches) == 1
            f, arg = matches[0];assert f.name == loc['symbol'].split('.')[-1] and arg.arg == input['slot']
            locs.append((file, loc['symbol'], arg.lineno, arg.col_offset))
            assert not e.get('bundle_members') and not any(e.get(k) or binding.get(k) for k in ['condition', 'iteration', 'design_route', 'layout_after'])
            assert len([x for x in visible.values() if x['source'] == n['node']]) == 1
            assert not boxes[n['node']].get('expanded') and not boxes[row['sink']].get('expanded')
            assert parents[n['node']] == parents[row['sink']] == row['parent']
            # Source, unknown and effect boundaries remain guarded independently
            # of the proof receipt. Includes hidden descendants and ancestors.
            inside = {n['node']};changed = True
            while changed:
                before = len(inside);inside.update(id for id, at in planned.items() if at.get('parent') in inside);changed = len(inside) != before
            protected = {'conditional-region','conditional-collection','loop-template','iteration-region','serial-repeat','repeat-instance','serial-remainder','observed-variant'}
            for id in inside:
                at = planned[id]
                assert at['kind'] not in ['opaque','control'] and at.get('semantic_type') not in protected
                assert not any(at.get(k) for k in ['condition','mutable','identity_display','observed_calls','runtime_evidence','repeat_contract','iteration']) and at.get('evidence_status') != 'runtime-only'
            for use in canonical.values():
                if use['source'] in inside or use['target'] in inside:
                    assert use['kind'] in ['data','alias','interface-binding','parameter-read','buffer-read','state-read'] and not any(use.get(k) for k in ['condition','iteration','design_route','layout_after'])
            for id in [n['node'], row['sink']]:
                at = parents[id]
                while at is not None:
                    ancestor = planned[at]
                    assert ancestor['kind'] not in ['opaque','control'] and not any(ancestor.get(k) for k in ['condition','mutable','identity_display','observed_calls','runtime_evidence','iteration']) and ancestor.get('evidence_status') != 'runtime-only'
                    at = parents.get(at)
        assert len({r[:2] for r in locs}) == 1 and locs == sorted(locs) and len(set(locs)) == len(locs)
        checked.append(dict(sink=row['sink'], slots=[n['target_port'] for n in row['nodes']]))
    return checked


def main():
    extraction = read(OUT/'extraction.json');assert not extraction['runtime_executed'] and sha(ROOT/extraction['source']) == extraction['source_sha256']
    for r in extraction['rows']:assert sha(ROOT/r['input']) == r['sha256'] and analyze(ROOT/extraction['source'], r['name']) == read(ROOT/r['input'])
    reports = [read(OUT/(s+'-report.json')) for s in ['small','large']]
    for r in reports:assert r['implementation_sha256'] == reports[0]['implementation_sha256'] and r['baseline'] == reports[0]['baseline']
    for f, h in reports[0]['implementation_sha256'].items():assert sha(ROOT/f) == h, ('stale producer',f)
    for f, h in reports[0]['baseline']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',reports[0]['baseline']['commit']+':'+f],cwd=ROOT)).hexdigest() == h
    geometry.OUT = stages.OUT = OUT
    docs, rows, direct, measured, ordered = {}, {}, {}, {}, {}
    for report in reports:
        for row in report['rows']:
            name = row['name'];doc = read(OUT/row['document']);svg = ET.parse(OUT/row['svg']).getroot()
            assert sha(OUT/row['document']) == row['document_sha256'] and sha(OUT/row['svg']) == row['svg_sha256']
            assert doc['ir'] == read(ROOT/row['input']) and sha(ROOT/row['input']) == row['input_sha256']
            measured[name] = stages.check({**row,'role_path_stages':doc['publication'].get('role_path_stages')},compare_expression=False,require_quality=True)
            geometry.inspect(row);_, bodies = passages(doc,svg);assert not bodies,(name,bodies)
            contexts(doc);scope_geometry(doc);terminals(doc);arguments(doc,svg)
            goals=doc['expression_goals']['goals'];direct[name]={g['id'] for g,ok in zip(goals,assignments(doc['ir'],goals,{**doc,'quality':row['quality']},svg)) if ok}
            ordered[name]=declared_rows(doc);docs[name]=doc;rows[name]=row
    comparisons=[]
    for report in reports:
        for c in report['comparisons']:
            a,b=[docs[c[k]] for k in ['before','after']]
            for key in ['ir','state','architecture','publication','expression_goals','expression_coverage','summary_goals','summary_coverage']:assert a.get(key)==b.get(key), (c['name'],key)
            for key in ['node_accounting','edge_accounting','representatives','frame_ownership','bounds']:assert a['layout'].get(key)==b['layout'].get(key), (c['name'],key)
            edge_facts=lambda d:[{k:v for k,v in e.items() if k!='route'} for e in d['layout']['edges']]
            assert edge_facts(a)==edge_facts(b)
            changed={n['node'] for r in b['layout'].get('declared_operand_rows',[]) for n in r['nodes']}
            aa={n['id']:n for n in a['layout']['nodes']};bb={n['id']:n for n in b['layout']['nodes']};assert aa.keys()==bb.keys()
            for id,p in aa.items():assert {k:v for k,v in p.items() if id not in changed or k not in ['x','y']} == {k:v for k,v in bb[id].items() if id not in changed or k not in ['x','y']}, ('unrelated geometry changed',c['name'],id)
            assert direct[c['before']]<=direct[c['after']]
            for key in ['wire_length','native_width_px','native_height_px']:assert rows[c['after']]['quality'][key]<=rows[c['before']]['quality'][key]
            assert rows[c['after']]['quality']['line_geometry']['crossings']<=rows[c['before']]['quality']['line_geometry']['crossings']
            comparisons.append(dict(name=c['name'],before=measured[c['before']],after=measured[c['after']],selected=ordered[c['after']],direct_goals=[len(direct[c['before']]),len(direct[c['after']])]))
    negatives=[];main=docs['Transformer-panel-0-current']
    assert len(ordered['Transformer-panel-0-current'])>=1
    for kind in ['slot','declaration-source','column-order','canonical-binding','recorded-position']:
        doc=copy.deepcopy(main);r=doc['layout']['declared_operand_rows'][0]
        if kind=='slot':r['nodes'][0]['target_port']='wrong'
        elif kind=='declaration-source':r['declaration']['inputs'][0]['source']['line']+=50
        elif kind=='column-order':
            boxes={n['id']:n for n in doc['layout']['nodes']};a,b=[boxes[n['node']] for n in r['nodes'][:2]];a['x'],b['x']=b['x'],a['x']
        elif kind=='recorded-position':r['nodes'][0]['after']['x']+=20
        else:next(e for e in doc['layout']['edges'] if e['id']==r['nodes'][0]['edge'])['canonical_source']='wrong'
        # Keep duplicated receipts consistent so corruption must be caught
        # against the original source/binding or actual geometry.
        rec=doc['diagnostics']['routing']['declared_operand_refinement'];rec['selected']=copy.deepcopy(doc['layout']['declared_operand_rows'])
        for t in rec['attempts']:
            if t['accepted']:
                t['records']=[copy.deepcopy(next(r for r in rec['selected'] if r['sink']==p['sink'])) for p in t['records']]
        try:declared_rows(doc)
        except AssertionError:negatives.append(dict(kind=kind,rejected=True))
        else:raise AssertionError(('corrupt order accepted',kind))
    sets={suffix:set().union(*(direct['Transformer-panel-'+str(i)+'-'+suffix] for i in range(3))) for suffix in ['before','current']};assert sets['before']<=sets['current']
    result=dict(passed=True,goal_complete=False,panels=len(rows),comparisons=comparisons,declared_rows=ordered,negative_checks=negatives,graph_set_direct=dict(before=len(sets['before']),after=len(sets['current']),lost=sorted(sets['before']-sets['current'])),auditor_sha256=sha(Path(__file__)))
    (OUT/'independent-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['passed','panels','graph_set_direct']}))
if __name__=='__main__':main()

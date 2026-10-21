"""Audit invocation returns and actual SVG geometry independently of the JS lowering."""
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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/normal-returns/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
FLOW = {'data', 'alias', 'interface-binding'}


def normal_returns(d):
    raw = {n['id']: n for n in d['ir']['nodes']}
    edges = {e['id']: e for e in d['ir']['edges']}
    plan = {n['id']: n for n in d['architecture']['nodes']}
    boxes = {n['id']: n for n in d['layout']['nodes']}
    physical = {m['id']: m for e in d['layout']['edges'] for m in e.get('bundle_members', [e])}
    ins = {}
    for e in edges.values():ins.setdefault(e['target'], []).append(e)
    applied = []
    for r in d['publication'].get('normal_returns', {}).get('rows', []):
        group = plan[r['group']]
        region = group['return_region']
        inside = set(region['canonical_members'])
        selection = raw[region['aggregate']]['return_selection']
        assert r['selection'] == selection and group['normal_return'] == {k: v for k, v in r.items() if k not in ['status', 'attached_edges']}
        chosen = next(s for s in region['return_sites'] if s['node'] == selection['selected'])
        assert chosen == r['selected_return']
        control = raw[region['control']]
        assert not any(n.get('parent') == control['parent'] and n['kind'] == 'opaque' and n.get('reason') in ['unsupported-statement', 'unsupported-expression'] for n in raw.values())
        p = r['predicate'];n = raw[p['node']]
        assert n['kind'] == 'interface' and n['role'] == 'input' and n['evidence_status'] == 'static-only'
        assert n['slot'] == p['slot'] and n['parent'] == control['parent'] and not ins.get(n['id'])
        assert type(p['value']) is bool and n['source_constant_input']['value'] is p['value'] and selection['call_constants'][n['slot']] is p['value']
        assert any(s['expression'] == n['slot'] for s in control['source'])
        assert ins[control['id']] == [p['edge']] and edges[p['edge']['id']] == p['edge'] and p['edge']['kind'] == 'control'
        branches = [e for e in edges.values() if e['source'] == control['id']]
        assert branches == r['branch_witnesses'] and len(branches) == 2 and {e['target_port'] for e in branches} == {'true', 'false'}
        for e in branches:
            assert e['kind'] == 'control' and not e.get('condition') and not e.get('iteration')
            assert raw[e['target']]['condition'] == dict(branch=control['id'], outcome=e['target_port'])
        for site in region['return_sites']:
            conditions = [];at = raw[site['node']]['parent']
            while at != control['parent']:
                if raw[at].get('condition'):conditions.append(raw[at]['condition'])
                at = raw[at]['parent']
            assert conditions == site['source_conditions']
        if chosen['source_conditions']:
            assert chosen['source_conditions'] == [dict(branch=control['id'], outcome='true' if p['value'] else 'false')]
        else:
            other = next(s for s in region['return_sites'] if s != chosen)
            assert p['value'] is False and other['source_conditions'] == [dict(branch=control['id'], outcome='true')]
            empty = next(e['target'] for e in branches if e['target_port'] == 'false')
            assert not any(n.get('parent') == empty for n in raw.values())
        binding = edges[chosen['edge']]
        assert binding == r['binding'] and binding['source'] == chosen['node'] and binding['target'] == region['aggregate']
        assert binding['kind'] == 'interface-binding' and binding['source_port'] == chosen['source_port'] and binding['target_port'] == chosen['aggregate_slot']
        expected_cuts = [e for e in edges.values() if (e['source'] in inside) != (e['target'] in inside)]
        assert region['cuts'] == expected_cuts
        todo = [chosen['node']];seen = set();needed = set();witness = set()
        while todo:
            at = todo.pop()
            if at in seen:continue
            seen.add(at);assert ins.get(at)
            for e in ins[at]:
                assert e['kind'] in FLOW and not e.get('condition') and not e.get('iteration')
                witness.add(e['id'])
                if e['source'] in inside:todo.append(e['source'])
                else:needed.add(e['id'])
        assert r['dependency_witnesses'] == [e for e in edges.values() if e['id'] in witness]
        incoming = [e for e in expected_cuts if e['target'] in inside]
        selected = [e for e in incoming if e['id'] in needed]
        alternatives = [e for e in incoming if e['id'] not in needed and e['id'] != p['edge']['id']]
        assert selected == r['selected_inputs'] and alternatives == r['alternative_inputs'] and selected and alternatives
        assert not any(raw[id]['kind'] in ['opaque', 'state', 'buffer', 'parameter'] or raw[id].get('mutable') or raw[id].get('runtime_evidence') or raw[id].get('identity_display') for id in inside)
        visible = r['group'] in boxes
        assert r['status'] == ('summary' if visible else 'folded')
        if visible:
            assert not boxes[r['group']].get('expanded')
            assert r['attached_edges'] == [e['id'] for e in alternatives]
            for e in alternatives:assert e['id'] in d['layout']['edge_accounting']['attached'] and e['id'] not in physical
            for e in selected + [p['edge']]:assert e['id'] in physical
            for site in region['return_sites']:assert site['node'] not in boxes
            assert region['aggregate'] not in boxes
            applied.append(r['group'])
        else:assert not r['attached_edges']
    return applied


def compare(a, b):
    assert a['ir'] == b['ir'] and a['state'] == b['state'] and a['expression_goals'] == b['expression_goals']
    assert a['publication']['open'] == b['publication']['open']
    alternatives = {e['id'] for r in b['publication'].get('normal_returns', {}).get('rows', []) for e in r['alternative_inputs'] if e['id'] in r['attached_edges']}
    uses = lambda d: {e['id']: e for wire in d['layout']['edges'] for e in wire.get('bundle_members', [wire])}
    old, new = uses(a), uses(b)
    assert old.keys() - new.keys() == alternatives and new.keys() <= old.keys()
    for id, e in new.items():
        for k in ['canonical_source', 'canonical_target', 'resolved_source', 'source_port', 'target_port', 'kind', 'condition', 'originals']:
            assert e.get(k) == old[id].get(k), ('binding changed', id, k)


if __name__ == '__main__':
    reports = [read(OUT / (n + '-report.json')) for n in ['small', 'large']]
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for f, h in reports[0]['implementation_sha256'].items():assert sha(ROOT / f) == h, ('stale producer', f)
    for f, h in reports[0]['baseline_sha256'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', reports[0]['base'] + ':' + f], cwd=ROOT)).hexdigest() == h
    geometry.OUT = OUT;rows = [];changed = [];main = None
    for report in reports:
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            docs = [];measurements = [];direct = []
            for result in row['results']:
                for k in ['svg', 'document']:assert sha(OUT / result[k]) == result[k + '_sha256']
                d = read(OUT / result['document']);svg = ET.parse(OUT / result['svg']).getroot()
                assert d['ir'] == read(ROOT / row['input'])
                for kind, key in [('nodes', 'node_accounting'), ('edges', 'edge_accounting')]:
                    ids = sum(d['layout'][key].values(), [])
                    assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in d['ir'][kind]}
                measured = geometry.inspect(dict(name=row['name'] + '-' + result['suffix'], **result))
                titles, bodies = passages(d, svg);assert not bodies, ('body intrusion', row['name'], bodies)
                terminals(d);applied = normal_returns(d)
                goals = d['expression_goals']['goals']
                fulfilled = {g['id'] for g, ok in zip(goals, assignments(d['ir'], goals, {**d, 'quality': result['quality']}, svg)) if ok}
                direct.append(fulfilled);docs.append(d)
                measurements.append(dict(nodes=len(measured['nodes']),edges=len(measured['paths']),wire=result['quality']['wire_length'],
                    crossings=measured['crossings'],contacts=measured['contacts'],overlaps=measured['overlaps'],intrusions=0,
                    title_passages=len(titles),direct_goals=len(fulfilled),normal_returns=len(applied),bounds=d['layout']['bounds']))
            a, b = docs;compare(a, b)
            assert direct[0] <= direct[1], ('direct expression lost', row['name'], sorted(direct[0] - direct[1]))
            for k in ['crossings', 'contacts', 'overlaps', 'wire']:
                assert measurements[1][k] <= measurements[0][k], ('geometry regression', row['name'], k)
            if measurements[1]['normal_returns']:changed.append(row['name'])
            rows.append(dict(name=row['name'],before=measurements[0],current=measurements[1]))
            if row['name'] == 'Transformer-panel-0':main = b
    assert main and 'Invocation-FixedTuple' in changed and 'Invocation-DefaultReturn' in changed
    assert 'Invocation-FixedPair' not in changed
    rejected = read(OUT / 'rejected-pair.json')
    for k in ['svg', 'document']:assert sha(OUT / rejected[k]) == rejected[k + '_sha256']
    rejected_doc = read(OUT / rejected['document']);rejected_svg = ET.parse(OUT / rejected['svg']).getroot()
    assert rejected_doc['ir'] == read(ROOT / rejected['input']) and rejected_doc['state'] == rejected['state']
    geometry.inspect(dict(name='rejected-pair',svg=rejected['svg'],document=rejected['document'],quality=rejected['candidate']))
    assert not passages(rejected_doc, rejected_svg)[1];terminals(rejected_doc);normal_returns(rejected_doc)
    assert rejected['candidate']['line_geometry']['crossings'] > rejected['baseline']['line_geometry']['crossings']
    pair = next(r for r in rows if r['name'] == 'Invocation-FixedPair')
    assert pair['before'] == pair['current']
    negative = []
    for kind in ['fixed-value', 'selected-slot', 'dependency-witness', 'attached-edge', 'false-condition']:
        bad = copy.deepcopy(main);r = next(r for r in bad['publication']['normal_returns']['rows'] if r['status'] == 'summary')
        if kind == 'fixed-value':r['predicate']['value'] = not r['predicate']['value']
        elif kind == 'selected-slot':r['selected_return']['aggregate_slot'] = '99'
        elif kind == 'dependency-witness':r['dependency_witnesses'] = []
        elif kind == 'attached-edge':r['attached_edges'] = []
        else:r['selected_return']['source_conditions'] = [dict(branch='invented', outcome='false')]
        # Also alter the presentation copy so rejection depends on raw evidence.
        next(n for n in bad['architecture']['nodes'] if n['id'] == r['group'])['normal_return'] = {k: v for k, v in r.items() if k not in ['status', 'attached_edges']}
        try:normal_returns(bad)
        except (AssertionError, StopIteration):negative.append(kind)
        else:raise AssertionError(('corruption accepted', kind))
    result = dict(passed=True,goal_complete=False,comparisons=rows,changed_cases=changed,negative_rejections=negative,
        rejected_candidate=dict(svg=rejected['svg'],crossings=[rejected['baseline']['line_geometry']['crossings'],rejected['candidate']['line_geometry']['crossings']]),
        auditor_sha256=sha(Path(__file__)),reports_sha256={n:sha(OUT / (n + '-report.json')) for n in ['small', 'large']})
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(passed=True,panels=len(rows)*2,changed_cases=changed,negative_rejections=negative)))

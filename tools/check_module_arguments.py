"""Independently check source arguments, ownership, bindings and actual SVGs."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/module-arguments/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_title_passages import passages
from check_operand_rows import contexts, scope_geometry
from check_final_sample_frames import terminals
from audit_diagram_assignments import assignments
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def arguments(doc, svg):
    ns = {n['id']: n for n in doc['ir']['nodes']}
    planned = {n['id']: n for n in doc['architecture']['nodes']}
    visible = {n.get('data-node-id'): n for n in svg.iter() if n.get('data-node-id')}
    positions = {n['id']: n for n in doc['layout']['nodes']}
    edges = doc['ir']['edges']
    checked = []
    for r in doc['publication'].get('module_arguments', {}).get('rows', []):
        n, target = ns[r['node']], ns[r['input']]
        proof, value = n['module_resource_binding'], n['symbolic_value']
        assert proof == r['proof'] and value == r['symbolic_value']
        assert proof['rule_version'] == 'source-module-binding/1' and proof['status'] == 'proved'
        assert proof['read'] == n['id'] and proof['reference'] == n['module_identity'] == r['module_identity'] == value['reference']
        assert proof['allocation'] == 'fresh-framework-construction' and proof['construction_evidence']
        assert value['kind'] == 'module-resource' and value['rule_version'] == 'source-symbolic-value/1'
        assert r['framework_type'] == n['resource_framework_type'] == value['framework_type']
        assert r['configuration'] == n['resource_constructor']
        assert len([x for x in ns.values() if x.get('module_resource') and x.get('module_identity') == r['module_identity']]) == 1
        assert not any(e['target'] == n['id'] for e in edges)
        assert [e for e in edges if e['source'] == n['id']] == [r['edge']]
        e = r['edge']
        assert e['kind'] == 'interface-binding' and e['source_port'] == 'out' and e['target'] == target['id'] and e['target_port'] == r['argument'] == target['label']
        assert not any(e.get(k) for k in ['condition', 'iteration', 'design_route'])
        assert target['kind'] == 'interface' and target['role'] == 'input' and target['parent'] == r['consumer']
        assert ns[r['consumer']]['parent'] == n['parent']
        for other in ns.values():
            if other['id'] == n['id'] or other.get('module_identity') != r['module_identity']:continue
            at = other['id']
            while at is not None and at != r['consumer']:at = ns[at].get('parent')
            assert at == r['consumer'], ('shared object outside summarized consumer', other['id'])
        for id in [n['id'], target['id'], r['consumer']]:
            at = id
            while at is not None:
                p = ns[at]
                assert p['kind'] not in ['opaque', 'control'] and p['evidence_status'] == 'static-only'
                assert not any(p.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls', 'runtime_evidence', 'iteration'])
                at = p.get('parent')
        assert r['consumer'] in visible
        if r['status'] == 'attached':
            assert not positions[r['consumer']].get('expanded') and n['id'] not in visible
            assert n['id'] in doc['layout']['node_accounting']['attached'] and e['id'] in doc['layout']['edge_accounting']['attached']
            assert doc['layout']['representatives'][n['id']] == r['consumer']
            assert r in planned[r['consumer']]['module_arguments']
            # Verify the displayed argument, rather than trusting its receipt.
            captions = ''.join(''.join(t.itertext()) for t in visible[r['consumer']].iter()
                               if t.tag.endswith('text') and 'paper-caption' in t.get('class', '').split())
            for token in ['Module arg', r['argument'], r['framework_type'].split('.')[-1]]:
                assert token in captions
        else:
            assert r['status'] == 'source-detail' and positions[r['consumer']]['expanded'] and n['id'] in visible and target['id'] in visible
            actual = next(edge for edge in doc['layout']['edges'] if edge['id'] == e['id'])
            assert actual['source'] == n['id'] and actual['target'] == target['id']
            assert actual['canonical_source'] == n['id'] and actual['canonical_target'] == target['id']
            assert actual['source_port'] == 'out' and actual['target_port'] == r['argument']
            assert not planned[r['consumer']].get('module_arguments')
        checked.append(dict(node=n['id'], consumer=r['consumer'], status=r['status']))
    return checked


def main():
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        ir = read(ROOT / row['input'])
        assert validate_ir(ir)['ok'] and sha(ROOT / row['input']) == row['sha256']
        assert analyze(ROOT / extraction['source'], row['name']) == ir
    reports = [read(OUT / 'small-report.json'), read(OUT / 'large-report.json')]
    snapshot = reports[0]['baseline']
    for report in reports:
        assert report['implementation_sha256'] == reports[0]['implementation_sha256'] and report['baseline'] == snapshot
    for f, h in reports[0]['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale implementation', f)
    for f, h in snapshot['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    geometry.OUT = stages.OUT = OUT
    docs, rows, direct, measured, attached = {}, {}, {}, {}, {}
    for report in reports:
        for row in report['rows']:
            name = row['name']
            assert name not in docs
            doc = read(OUT / row['document']); svg = ET.parse(OUT / row['svg']).getroot()
            measured[name] = stages.check({**row, 'role_path_stages': doc['publication'].get('role_path_stages')}, compare_expression=False, require_quality=True)
            geometry.inspect(row)
            _, bodies = passages(doc, svg)
            assert not bodies, (name, bodies)
            goals = doc['expression_goals']['goals']
            direct[name] = {g['id'] for g, ok in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': row['quality']}, svg)) if ok}
            raw = {g['id'] for g, ok in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': row['quality']}, svg, require_quality=False)) if ok}
            assert raw == {r['goal'] for r in doc['expression_coverage'] if r['status'] == 'fulfilled'}
            contexts(doc); scope_geometry(doc); terminals(doc)
            attached[name] = arguments(doc, svg)
            docs[name] = doc; rows[name] = row
    comparisons = []
    for report in reports:
        for c in report['comparisons']:
            a, b = [docs[c[k]] for k in ['before', 'after']]
            assert a['ir'] == b['ir'] and a['expression_goals'] == b['expression_goals'] and a['state'] == b['state']
            assert a['publication']['open'] == b['publication']['open']
            old_uses = {m['id']: m for edge in a['layout']['edges'] for m in edge.get('bundle_members', [edge])}
            new_uses = {m['id']: m for edge in b['layout']['edges'] for m in edge.get('bundle_members', [edge])}
            for id in old_uses.keys() & new_uses.keys():
                keys = ['canonical_source', 'canonical_target', 'source_port', 'target_port', 'kind', 'condition', 'evidence']
                assert [old_uses[id].get(k) for k in keys] == [new_uses[id].get(k) for k in keys], ('changed canonical use', c['name'], id)
            removed = {r['node'] for r in b['publication'].get('module_arguments', {}).get('rows', []) if r['status'] == 'attached'}
            assert direct[c['before']] <= direct[c['after']], ('lost expression', c['name'], direct[c['before']] - direct[c['after']])
            for n in a['layout']['nodes']:
                if n['id'] not in {p['id'] for p in b['layout']['nodes']} and n['id'] not in removed:
                    assert n['id'] in {r['node'] for r in b['layout'].get('frame_ownership', [])}
            comparisons.append(dict(name=c['name'], before=measured[c['before']], after=measured[c['after']], arguments=attached[c['after']], direct_goals=[len(direct[c['before']]), len(direct[c['after']])]))
    negatives = []
    name = next(name for name in docs if any(r['status'] == 'attached' for r in attached[name]))
    for kind in ['binding-port', 'module-reference', 'display-label', 'representative']:
        altered = read(OUT / rows[name]['document']); svg = ET.parse(OUT / rows[name]['svg']).getroot()
        r = next(r for r in altered['publication']['module_arguments']['rows'] if r['status'] == 'attached')
        if kind == 'binding-port': r['edge']['target_port'] = 'foreign'
        elif kind == 'module-reference': r['module_identity'] = 'foreign'
        elif kind == 'display-label':
            node = next(n for n in svg.iter() if n.get('data-node-id') == r['consumer'])
            for child in node.iter():
                if child.tag.endswith('tspan'):child.text = 'omitted'
            for child in list(node):
                if child.tag.endswith('title'):node.remove(child)
        else: altered['layout']['representatives'][r['node']] = r['node']
        try: arguments(altered, svg)
        except AssertionError: negatives.append(dict(kind=kind, rejected=True))
        else: raise AssertionError(('corrupt module argument accepted', kind))
    graphset = {}
    for suffix in ['before', 'current']:
        graphset[suffix] = set().union(*(direct['Transformer-panel-' + str(i) + '-' + suffix] for i in range(3)))
    assert graphset['before'] <= graphset['current']
    result = dict(passed=True, goal_complete=False, panels=len(rows), comparisons=comparisons, module_arguments=attached,
                  graph_set_direct=dict(before=len(graphset['before']), after=len(graphset['current']), lost=sorted(graphset['before'] - graphset['current'])),
                  negative_checks=negatives, auditor_sha256=sha(Path(__file__)))
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(passed=True, panels=len(rows), graph_set_direct=result['graph_set_direct'])))


if __name__ == '__main__':
    main()

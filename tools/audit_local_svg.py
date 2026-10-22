#!/usr/bin/env python3
"""Independent XML/path audit of actual generated SVG, not layout flags."""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/local-relations/current'


def audit_atlas_coverage(manifest, panel, document, nodes, paths):
    """Check representative substitutions against freshly recomputed Python facts."""
    sys.path.insert(0, str(ROOT))
    from semantic_adapter.schema import validate_ir
    assert validate_ir(document['ir'])['ok'], 'stale structure in atlas document'
    goals = {g['id']: g for g in manifest['expression_goals']}
    receipts = document.get('atlas_expression_coverage', document['expression_coverage'])
    assert receipts == panel['expression_coverage']
    ir_nodes = {n['id']: n for n in document['ir']['nodes']}
    ir_edges = {e['id']: e for e in document['ir']['edges']}
    routes = document['layout']['edges']

    def actual_edges(edge_ids):
        for edge_id in edge_ids:
            assert any(p['id'] in paths and any(edge_id in {m['id'], *m.get('originals', [])}
                       for m in p.get('bundle_members', [p])) for p in routes), ('no actual canonical path', edge_id)

    for receipt in receipts:
        if receipt['status'] != 'fulfilled' or panel['quality']['issues']:
            continue
        goal = goals[receipt['goal']]
        assert set(receipt['visible_edges']) <= paths.keys()
        if receipt.get('method', 'direct') == 'direct':
            assert set(goal['core']) <= nodes.keys()
            actual_edges(goal['edges'])
            continue
        assert receipt['method'] == 'structural-representative'
        assert not goal.get('identity') and goal['kind'] not in {'instance-boundary', 'external-interface'}
        sequence = ir_nodes[receipt['sequence']]['repeat_contract']['structure']
        group = sequence['groups'][receipt['group']]
        assert group['status'] == 'proved'
        assert receipt['representative'] == group['representative']
        assert receipt['instance'] in group['instances']
        assert receipt['source_positions'] == [i + 1 for i in group['indices']]
        rows = {r['instance']: r for r in sequence['instances']}
        source, target = rows[receipt['instance']], rows[receipt['representative']]
        assert source['structure'] == target['structure']
        target_by_slot = {slot: node for node, slot in target['node_mapping'].items()}
        assert receipt['node_map'] == {node: target_by_slot[source['node_mapping'][node]] for node in goal['core']}
        assert set(receipt['node_map'].values()) <= nodes.keys()
        counterpart = goals[receipt['representative_goal']]
        assert counterpart['kind'] == goal['kind'] and not counterpart.get('identity')
        assert set(counterpart['core']) == set(receipt['node_map'].values())
        assert set(receipt['edge_map']) == set(goal['edges'])
        assert set(counterpart['edges']) == set(receipt['edge_map'].values())
        for original, mapped in receipt['edge_map'].items():
            a, b = ir_edges[original], ir_edges[mapped]
            slot = source['node_mapping'][a['target']]
            assert target['node_mapping'][b['target']] == slot
            assert a.get('target_port', 'in') == b.get('target_port', 'in')
            normalized = lambda e: 'value' if e['kind'] in {'data', 'alias', 'interface-binding'} else e['kind']
            assert normalized(a) == normalized(b)
            bindings = source['structure']['operations'][slot]['bindings']
            assert sum(v['port'] == a.get('target_port', 'in') and v['kind'] == normalized(a) for v in bindings) == 1
        assert any(c['goal'] == counterpart['id'] and c['status'] == 'fulfilled' for c in document['expression_coverage'])
        actual_edges(counterpart['edges'])
        frame = nodes[receipt['representative']]
        text = re.sub(r'\s', '', ''.join(''.join(e.itertext()) for e in frame if e.tag.endswith('text')))
        assert 'structureonly' in text
        assert 'sourcepositions' + ','.join(map(str, receipt['source_positions'])) in text


def audit_binding_rows(pipeline, display, text):
    """Rebuild every printed use independently from already checked canonical bindings."""
    assert display['schema'] == 'dependency-binding-rows/1'
    assert pipeline['source_reads'] and pipeline['dependency_dag']
    refs = {o['node']: '#' + str(i + 1) for i, o in enumerate(pipeline['operations'])}
    reads = [dict(node=r['node'], reference='read' + str(i + 1), expression=r['expression'])
             for i, r in enumerate(pipeline['source_reads'])]
    inputs = []
    for b in pipeline['external_inputs']:
        if not any(i['node'] == b['port_node'] for i in inputs):
            inputs.append(dict(node=b['port_node'], label=b['label'], producer=b['producer'],
                               source_port=b['source_port'], reference='input' + str(len(inputs) + 1)))
    assert display['reads'] == reads and display['inputs'] == inputs
    rows = []
    for operation in pipeline['operations']:
        uses = []
        for b in pipeline['bindings']:
            if b['target'] != operation['node']:
                continue
            value = refs.get(b['producer'])
            if value is None:
                read = next((r for r in reads if r['node'] == b['producer']), None)
                external = next((e for e in pipeline['external_inputs'] if e['edge'] == b['edge']), None)
                input = next((i for i in inputs if external and i['node'] == external['port_node']), None)
                record = read or input
                if record is not None:
                    value = record['reference'] + '(' + json.dumps(record['expression'] if read else record['label'], ensure_ascii=False) + ')'
            if value is None:
                continue
            value += '[' + b['source_port'] + ']' if b['source_port'] != 'out' else ''
            uses.append({k: b[k] for k in ['edge', 'producer', 'source_port', 'target', 'target_port']} | dict(value=value))
        uses.sort(key=lambda b: (str(b['target_port']), b['edge']))
        line = refs[operation['node']] + ' ' + operation['label']
        if uses:
            line += ' ← ' + '; '.join(b['target_port'] + '=' + b['value'] for b in uses)
        rows.append(dict(node=operation['node'], reference=refs[operation['node']], label=operation['label'], uses=uses, text=line))
        assert re.sub(r'\s', '', line) in text, ('missing binding row', line)
    assert display['rows'] == rows
    result = pipeline['dependency_dag']['result']
    title = 'Result ' + result + ' · ' + next(o['label'] for o in pipeline['operations'] if refs[o['node']] == result)
    assert display['title'] == title and re.sub(r'\s', '', title) in text


def audit_pipeline_summaries(document, row, nodes):
    from semantic_adapter.symbolic_values import derive
    receipt = document['publication'].get('local_pipelines')
    assert receipt == row.get('local_pipelines')
    if not receipt:
        return
    canonical = {n['id']: n for n in document['ir']['nodes']}
    planned = {n['id']: n for n in document['architecture']['nodes']}
    edges = document['ir']['edges']
    facts = derive(document['ir']['nodes'], edges)
    ins = {}
    for e in edges:
        ins.setdefault(e['target'], []).append(e)

    def resolve(node, slot='out'):
        seen = set()
        while node not in seen:
            seen.add(node)
            n, incoming = canonical[node], ins.get(node, [])
            if n['kind'] not in ['interface', 'value-alias'] or n.get('operator') or len(incoming) != 1 or incoming[0].get('condition'):
                break
            e = incoming[0]
            if e['kind'] not in ['data', 'alias', 'interface-binding']:
                break
            # Match publication.policy/local-pipelines resolution exactly.
            # Interface terminals preserve the producer's output port; only a
            # value alias with an explicit slot rewrites the port.  ``dict.get``
            # cannot be used directly because extracted aliases commonly carry
            # an explicit JSON null slot.
            outer = (n.get('slot') if n['kind'] == 'value-alias' and n.get('slot') is not None
                     else e.get('source_port', 'out'))
            slot = slot if outer == 'out' else outer if slot == 'out' else outer + '.' + slot
            node = e['source']
        return node, slot

    for r in receipt['rows']:
        node = r['node']
        assert r['visible_node'] == node and node in nodes
        assert planned[node]['local_pipeline'] == {k: v for k, v in r.items() if k not in ['status', 'visible_node', 'detailed_operations_exposed']}
        members = {node}
        changed = True
        while changed:
            added = {n['id'] for n in planned.values() if n.get('parent') in members} - members
            members.update(added)
            changed = bool(added)
        display_members = members.copy()
        members &= canonical.keys()
        assert members == set(r['canonical_members']) and len(members) == len(r['canonical_members'])
        partitions = display_members - canonical.keys()
        assert partitions == {p['node'] for p in r.get('display_partitions', [])}
        for partition in r.get('display_partitions', []):
            n = planned[partition['node']]
            operand = r['rule_version'] == 'local-pipelines/6' and partition.get('semantic_type') == 'operand-expression'
            assert n['presentation_only'] and n['semantic_type'] == ('operand-expression' if operand else 'structural-region')
            descendants = {n['id']}
            changed = True
            while changed:
                added = {c['id'] for c in planned.values() if c.get('parent') in descendants} - descendants
                descendants.update(added); changed = bool(added)
            descendants &= canonical.keys()
            assert len(descendants) == len(partition['canonical_members']) == len(n['canonical_members'])
            assert descendants == set(partition['canonical_members']) == set(n['canonical_members'])
            cuts = [e for e in edges if (e['source'] in descendants) != (e['target'] in descendants)]
            assert partition['cuts'] == cuts
            if operand:
                assert partition['ports'] == n['boundary_ports'] == [dict(id=e['id'], direction='output' if e['source'] in descendants else 'input',
                    source=e['source'], source_port=e['source_port'], target=e['target'], target_port=e['target_port'], evidence=e['evidence']) for e in cuts]
            else:
                assert n['boundary_ports'] == cuts
        if r['rule_version'] in ['local-pipelines/2', 'local-pipelines/3', 'local-pipelines/4', 'local-pipelines/5', 'local-pipelines/6']:
            boundaries = [n for n in planned.values() if n['id'] in members and n['kind'] == 'composite']
            assert {n['id'] for n in boundaries} == {b['node'] for b in r['source_boundaries']}
            for boundary in r['source_boundaries']:
                n = canonical[boundary['node']]
                assert n['kind'] == 'composite' and planned[n['id']]['semantic_type'] in {'source-function', 'source-module'}
                assert boundary['parent'] == planned[n['id']].get('parent')
                assert boundary['source'] == n.get('source', []) and boundary['module_identity'] == n.get('module_identity')
                inside = {n['id']}
                changed = True
                while changed:
                    added = {c['id'] for c in canonical.values() if c.get('parent') in inside} - inside
                    inside.update(added)
                    changed = bool(added)
                assert inside <= members
                assert boundary['cuts'] == [e for e in edges if (e['source'] in inside) != (e['target'] in inside)]
                if n['id'] != node:
                    assert not any(e['source'] == n['id'] or e['target'] == n['id'] for e in edges)
        for id in display_members:
            n = planned[id]
            assert n['kind'] not in ['opaque', 'control'] and n.get('evidence_status') != 'runtime-only'
            protected = ['condition', 'mutable', 'identity_display', 'observed_calls', 'semantic_contracts', 'repeat_contract', 'iteration', 'runtime_evidence']
            if id == node and r.get('owner_identity'):
                assert r.get('source_reads') and r['rule_version'] == 'local-pipelines/6'
                assert r['owner_identity'] == n['identity_display'] and n['identity_display']['kind'] == 'same-object-calls'
                protected.remove('identity_display')
            assert not any(n.get(k) for k in protected)
        cuts = [e for e in edges if (e['source'] in members) != (e['target'] in members)]
        assert cuts == r['cuts']
        ordered = [o['node'] for o in r['operations']]
        assert 2 <= len(ordered) and len(ordered) == len(set(ordered))
        assert len(ordered) <= 6 or r['rule_version'] == 'local-pipelines/5' and r.get('path_display')
        if r.get('path_display'):
            runs, signature = [], None
            for o in r['operations']:
                n = canonical[o['node']]
                label = n.get('framework_type', '').split('.')[-1] if n.get('framework_type') else n['function_target'].split('.')[-1] if n.get('source_framework_function') and n['source_framework_function'] == n.get('function_target') else n['operator']
                key = (n.get('operator'), n.get('framework_type'), label,
                       'framework-type' if n.get('framework_type') else 'source-framework-function' if n.get('source_framework_function') and n['source_framework_function'] == n.get('function_target') else 'operator')
                if key == signature:
                    runs[-1]['operations'].append(o['node'])
                else:
                    runs.append(dict(label=label, operations=[o['node']]))
                    signature = key
            assert r['path_display']['schema'] == 'dependency-path-display/1' and r['path_display']['runs'] == runs
            assert not r.get('dependency_dag') and not r.get('dependency_tree')
        for a in r['auxiliary_reads']:
            assert facts[a['node']] == a['fact'] and a['fact']['kind'] == 'tensor-attribute'
        expected = [e for e in edges if e['target'] in ordered]
        assert [e['id'] for e in expected] == [b['edge'] for b in r['bindings']]
        adjacency = set()
        for b, e in zip(r['bindings'], expected):
            assert (b['producer'], b['source_port']) == resolve(e['source'], e.get('source_port', 'out'))
            assert (b['target'], b['target_port']) == (e['target'], e['target_port'])
            if b['producer'] in ordered:
                adjacency.add((b['producer'], b['target']))
        if r.get('dependency_dag'):
            assert r['rule_version'] in ['local-pipelines/4', 'local-pipelines/5', 'local-pipelines/6'] and r['form'] == 'dependency-dag-summary'
            assert len(ordered) <= 6
            steps = r['dependency_dag']['nodes']
            assert [s['node'] for s in steps] == ordered
            assert [s['reference'] for s in steps] == ['#' + str(i + 1) for i in range(len(ordered))]
            references = {s['reference']: s['node'] for s in steps}
            indices = {n: i for i, n in enumerate(ordered)}
            actual_dag = []
            for step in steps:
                expected_uses = [b for b in r['bindings'] if b['target'] == step['node'] and b['producer'] in ordered]
                assert len(step['inputs']) == len(expected_uses)
                for use, binding in zip(step['inputs'], expected_uses):
                    assert set(use) == {'edge', 'reference', 'source_port', 'target_port'}
                    assert references[use['reference']] == binding['producer']
                    assert indices[binding['producer']] < indices[binding['target']], 'cyclic or non-topological DAG reference'
                    assert (use['edge'], use['source_port'], use['target_port']) == (binding['edge'], binding['source_port'], binding['target_port'])
                    actual_dag.append((binding['producer'], binding['target']))
            assert set(actual_dag) == adjacency
            sinks = set(ordered) - {a for a, b in adjacency}
            assert sinks == {ordered[-1]} and r['result_operation'] == ordered[-1]
            assert references[r['dependency_dag']['result']] == ordered[-1]
            assert set(r['entry_operations']) == set(ordered) - {b for a, b in adjacency}
            assert r.get('source_reads') or len(actual_dag) > len(set(actual_dag)) or any(sum(a == id for a, b in adjacency) > 1 for id in ordered)
        elif r.get('dependency_tree'):
            assert len(ordered) <= 6
            visited, tree_edges = [], set()
            binding_by = {b['edge']: b for b in r['bindings']}

            def visit(t):
                visited.append(t['node'])
                assert len(visited) <= len(ordered)
                for child in t['inputs']:
                    b = binding_by[child['edge']]
                    assert b['producer'] == child['expression']['node'] and b['target'] == t['node']
                    assert (b['source_port'], b['target_port']) == (child['source_port'], child['target_port'])
                    tree_edges.add((b['producer'], b['target']))
                    visit(child['expression'])
            visit(r['dependency_tree'])
            assert len(visited) == len(set(visited)) and set(visited) == set(ordered)
            assert tree_edges == adjacency
            assert r['result_operation'] == ordered[-1] == r['dependency_tree']['node']
            assert set(r['entry_operations']) == set(ordered) - {b for a, b in adjacency}
            assert any(sum(b == id for a, b in adjacency) > 1 for id in ordered)
            assert all(sum(a == id for a, b in adjacency) <= 1 for id in ordered)
        else:
            assert adjacency == set(zip(ordered, ordered[1:]))
        if r['rule_version'] in ['local-pipelines/3', 'local-pipelines/4', 'local-pipelines/5', 'local-pipelines/6']:
            assert r['output_bindings'] == [dict(edge=e['id'], producer=resolve(e['source'], e.get('source_port', 'out'))[0],
                                                source_port=resolve(e['source'], e.get('source_port', 'out'))[1],
                                                target=e['target'], target_port=e['target_port'])
                                            for e in cuts if e['source'] in members]
            assert all(b['producer'] == ordered[-1] for b in r['output_bindings'])
            for resource in r['parameter_reads']:
                n = canonical[resource['node']]
                assert n['kind'] == 'parameter' and resource['source'] == n.get('source', [])
                assert resource['module_identity'] == n.get('module_identity')
                assert not ins.get(n['id'])
                assert resource['edges'] == [e for e in edges if e['source'] == n['id']]
                for e in resource['edges']:
                    assert e['kind'] in ['data', 'parameter-read'] and e['target'] in ordered
                    assert e['id'] in document['layout']['edge_accounting']['attached']
                    title = ''.join(nodes[node].find('{http://www.w3.org/2000/svg}title').itertext())
                    assert f"Parameter read {e['id']}: {n['id']} → {e['target']} [{e['target_port']}]" in title
        if r['rule_version'] in ['local-pipelines/2', 'local-pipelines/3', 'local-pipelines/4', 'local-pipelines/5']:
            outputs = [n for n in planned.values() if n['id'] in members and n.get('parent') == node and n['kind'] == 'interface' and n.get('role') == 'output']
            assert outputs
            for output in outputs:
                es = ins.get(output['id'], [])
                assert len(es) == 1 and resolve(es[0]['source'], es[0].get('source_port', 'out'))[0] == ordered[-1]
        for e in cuts:
            if e['source'] in members:
                assert resolve(e['source'], e.get('source_port', 'out'))[0] == ordered[-1]
        for o in r['operations']:
            n = planned[o['node']]
            assert o['operator'] == n.get('operator') and o['framework_type'] == n.get('framework_type')
            label = n.get('framework_type', '').split('.')[-1] if n.get('framework_type') else n['function_target'].split('.')[-1] if n.get('source_framework_function') and n['source_framework_function'] == n.get('function_target') else n['operator']
            assert o['label'] == label
        reads = r.get('source_reads', [])
        expected_reads = {b['producer'] for b in r['bindings'] if b['kind'] == 'source-read'}
        assert expected_reads == {p['node'] for p in reads} and len(reads) == len(expected_reads)
        for resource in reads:
            n = canonical[resource['node']]
            assert n['kind'] in ['state', 'buffer'] and n['operator'] == 'attribute' and n['evidence_status'] == 'static-only'
            assert resource['expression'] == 'self.' + resource['attribute'] == n['source'][0]['expression']
            assert resource['attribute'] == n['attribute_name'] and resource['source'] == n['source']
            assert not ins.get(n['id']) and resource['edges'] == [e for e in edges if e['source'] == n['id']]
            assert resource['edges'] and all(e['kind'] in ['data', 'alias', 'interface-binding'] and e['source_port'] == 'out' and e['target'] in ordered for e in resource['edges'])
        if reads:
            expected_inputs = [b for b in r['bindings'] if b['kind'] == 'value' and b['producer'] not in ordered]
            assert len(expected_inputs) == len(r['external_inputs'])
            for b, expected in zip(r['external_inputs'], expected_inputs):
                assert all(b[k] == v for k, v in expected.items())
                n = canonical[b['port_node']]
                assert n['kind'] == 'interface' and n['role'] == 'input' and n['parent'] == node
                assert b['label'] == (n.get('slot') or n['label']) and resolve(n['id']) == (b['producer'], b['source_port'])
                assert b['reference'] == '#' + str(ordered.index(b['target']) + 1)
        measured = next(n for n in document['layout']['nodes'] if n['id'] == node)
        assert (r['status'] == 'expanded') == measured['expanded']
        assert r['detailed_operations_exposed'] == all(id in nodes for id in ordered)
        text = re.sub(r'\s', '', ''.join(''.join(e.itertext()) for e in nodes[node] if e.tag.endswith('text')))
        if r['status'] == 'summary':
            alternate = measured.get('read_binding_rows')
            if alternate:
                audit_binding_rows(r, alternate, text)
                assert planned[node]['local_pipeline_binding_rows'] == alternate
            heading = measured.get('source_heading')
            if heading:
                assert alternate and r.get('dependency_dag')
                assert heading == dict(schema='source-summary-heading/1', node=node,
                    label=canonical[node]['label'], result_title=alternate['title'])
                assert planned[node]['paper']['source_heading'] == heading
                title_text = re.sub(r'\s', '', ''.join(measured['lines']))
                assert title_text == re.sub(r'\s', '', 'Source: ' + canonical[node]['label'])
                assert title_text in text
                assert re.sub(r'\s', '', alternate['title'] + ' · Dependency DAG') in text
            labels = {o['node']: o['label'] for o in r['operations']}

            def label(t):
                return labels[t['node']] + (' ← {' + '; '.join(label(c['expression']) for c in t['inputs']) + '}' if t['inputs'] else '')
            expected_title = ('Result' + r['dependency_dag']['result']) if r.get('dependency_dag') else label(r['dependency_tree']) if r.get('dependency_tree') else '→'.join(o['label'] for o in r['operations'])
            if r.get('path_display'):
                expected_title = ' → '.join(s['label'] + (f" · {len(s['operations'])} calls" if len(s['operations']) > 1 else '') for s in r['path_display']['runs'])
            assert re.sub(r'\s', '', expected_title) in text
            if r.get('dependency_dag') and not alternate:
                assert 'DependencyDAG' in text
                for step in r['dependency_dag']['nodes']:
                    uses = sorted(step['inputs'], key=lambda i: (str(i['target_port']), i['edge']))
                    ref = lambda i: i['reference'] + ('[' + i['source_port'] + ']' if i['source_port'] != 'out' else '')
                    line = step['reference'] + labels[step['node']] + ('←' + ';'.join(i['target_port'] + '=' + ref(i) for i in uses) if uses else '')
                    assert re.sub(r'\s', '', line) in text, ('missing physical DAG formula', line)
            for resource in reads if not alternate else []:
                for e in resource['edges']:
                    line = 'Reads ' + resource['expression'] + ' → #' + str(ordered.index(e['target']) + 1) + '[' + e['target_port'] + ']'
                    assert re.sub(r'\s', '', line) in text
            for b in r.get('external_inputs', []) if not alternate else []:
                assert re.sub(r'\s', '', f"Input {b['label']} → {b['reference']}[{b['target_port']}]") in text
            if r.get('owner_identity'):
                d = r['owner_identity']
                assert re.sub(r'\s', '', f"{d['label']} · source call {d['invocation']}/{d['count']}") in text
            assert not r['detailed_operations_exposed']
            assert all(c['status'] != 'fulfilled' for c in document['expression_coverage'] if c['goal'] in {'goal:node:' + id for id in ordered})
        title = ''.join(nodes[node].find('{http://www.w3.org/2000/svg}title').itertext())
        assert planned[node]['label'] in title and r['scope'] in title


def audit_contract_stages(document, row, nodes):
    """Recheck the narrow certified role cut independently of the JS recipe."""
    receipt = document['publication'].get('contract_stages')
    assert receipt == row.get('contract_stages')
    if not receipt:
        return
    canonical = {n['id']: n for n in document['ir']['nodes']}
    planned = {n['id']: n for n in document['architecture']['nodes']}
    certificates = {c['id']: c for c in document['ir'].get('semantic_contracts', [])}
    edges = document['ir']['edges']
    incoming = {}
    for edge in edges:
        incoming.setdefault(edge['target'], []).append(edge)

    def resolve(node, slot):
        seen = set()
        while node not in seen:
            seen.add(node)
            n, ins = canonical[node], incoming.get(node, [])
            if n['kind'] not in ['interface', 'value-alias'] or n.get('operator') or len(ins) != 1 or ins[0].get('condition'):
                break
            e = ins[0]
            if e['kind'] not in ['data', 'alias', 'interface-binding']:
                break
            outer = n.get('slot') if n['kind'] == 'value-alias' else None
            outer = e.get('source_port', 'out') if outer is None else outer
            slot = slot if outer == 'out' else outer if slot == 'out' else outer + '.' + slot
            node = e['source']
        return node, slot

    for r in receipt['rows']:
        c = certificates[r['certificate']]
        assert c['rule'] == 'residual-postnorm' and c['rule_version'] == 'source-contracts/1'
        assert r['certificate_node'] == c['node'] == c['roles']['normalization']
        core = set(r['canonical_members'])
        tail = r.get('branch_tail')
        expected = {c['roles']['add'], c['roles']['normalization']}
        if tail:
            expected.update([tail['node'], *tail['aliases']])
            assert tail['node'] == c['roles']['branch'] and c['roles']['branch_slot'] == 'out'
            n = canonical[tail['node']]
            assert n['kind'] == 'compute' and not any(n.get(k) for k in ['mutable', 'condition', 'identity_display', 'observed_calls', 'runtime_evidence'])
            assert n.get('evidence_status') != 'runtime-only'
            assert any(i != n['id'] and canonical[i]['kind'] == 'compute' for i in c['roles']['branch_path'])
            ins = [e for e in edges if e['target'] == n['id'] and e['kind'] in ['data', 'alias', 'interface-binding']]
            assert len(ins) == 1
            e = ins[0]
            assert tail['input'] == {'edge': e['id'], 'node': resolve(e['source'], e.get('source_port', 'out'))[0],
                                     'slot': resolve(e['source'], e.get('source_port', 'out'))[1], 'target': n['id'], 'target_port': e['target_port']}
            assert (tail['input']['node'], tail['input']['slot']) != (c['roles']['skip'], c['roles']['skip_slot'])
            label = n.get('framework_type', '').split('.')[-1] or (n.get('function_target', '').split('.')[-1]
                if n.get('source_framework_function') == n.get('function_target') else '') or n['operator']
            assert tail['label'] == label
            at = n['id']
            for alias in tail['aliases']:
                uses = [e for e in edges if e['source'] == at]
                assert len(uses) == 1 and uses[0]['target'] == alias and uses[0].get('source_port', 'out') == 'out'
                a = canonical[alias]
                assert a['kind'] == 'value-alias' and a.get('slot') is None and not a.get('operator')
                assert not any(a.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls', 'runtime_evidence'])
                assert len(incoming[alias]) == 1
                at = alias
            uses = [e for e in edges if e['source'] == at]
            assert len(uses) == 1 and uses[0]['id'] == tail['output_edge'] and uses[0]['target'] == c['roles']['add']
            for e in edges:
                if e['source'] == n['id'] or e['target'] == n['id']:
                    assert not e.get('condition')
                    assert e['kind'] in ['data', 'alias', 'interface-binding'] or (e['kind'] in ['parameter-read', 'buffer-read', 'state-read']
                        and e['target'] == n['id'] and canonical[e['source']]['kind'] in ['parameter', 'buffer', 'state'])
            if tail.get('placement'):
                scope = tail['placement']['source_parent']
                assert planned[r['node']]['parent'] == scope
                assert all(canonical[i]['parent'] == scope for i in [tail['node'], c['roles']['add'], c['roles']['normalization']])
                assert all(i in document['publication']['open'] for i in tail['placement']['partitions'])
        assert core == expected
        assert set(n['id'] for n in planned.values() if n.get('parent') == r['node']) == core
        assert c['roles']['skip'] not in core
        assert (c['roles']['branch'] in core) == bool(tail)
        assert not planned[r['node']].get('semantic_contracts')
        assert r['certificate'] in planned[c['node']]['semantic_contracts']
        assert document['architecture']['semantic_contracts'] == document['ir']['semantic_contracts']
        cuts = [e for e in edges if (e['source'] in core) != (e['target'] in core)]
        assert cuts == r['cuts'] == planned[r['node']]['boundary_ports']
        inside = [e for e in edges if e['source'] in core and e['target'] in core]
        assert len(inside) == 1 + (1 + len(tail['aliases']) if tail else 0) and [e['id'] for e in inside] == r['internal_edges']
        norm_input = [e for e in inside if e['target'] == c['roles']['normalization']]
        assert len(norm_input) == 1 and norm_input[0]['source'] == c['roles']['add'] and norm_input[0].get('source_port', 'out') == 'out'
        assert [e for e in edges if e['source'] == c['roles']['add']] == norm_input
        for operand in r['operands']:
            e = next(e for e in edges if e['id'] == operand['edge'])
            role = operand['role']
            assert (operand['node'], operand['slot']) == resolve(e['source'], e.get('source_port', 'out'))
            assert (operand['node'], operand['slot']) == (c['roles'][role], c['roles'][role + '_slot'])
            assert (operand['target'], operand['target_port']) == (e['target'], e['target_port'])
        assert {o['role'] for o in r['operands']} == {'skip', 'branch'}
        if r['status'] == 'folded':
            assert r['node'] not in nodes
            continue
        assert r['node'] in nodes
        text = re.sub(r'\s', '', ''.join(''.join(e.itertext()) for e in nodes[r['node']] if e.tag.endswith('text')))
        assert 'Add&Norm' in text and c['roles']['normalization_type'].split('.')[-1] in text
        if tail:
            assert re.sub(r'\s', '', tail['label']) in text
        measured = next(n for n in document['layout']['nodes'] if n['id'] == r['node'])
        assert measured['expanded'] == (r['status'] == 'expanded')
        assert r['detailed_operations_exposed'] == {i for i in core if canonical[i]['kind'] == 'compute'}.issubset(nodes)
        if r['status'] == 'summary':
            assert not core.intersection(nodes)
            assert all(g['status'] != 'fulfilled' for g in document['expression_coverage'] if g['goal'] in {'goal:node:' + n for n in core})
        title = ''.join(nodes[r['node']].find('{http://www.w3.org/2000/svg}title').itertext())
        assert r['certificate'] in title and r['scope'] in title

    for repair in receipt.get('partitions', []):
        group = planned[repair['node']]
        assert group.get('presentation_only') and group['semantic_type'] == 'structural-region'
        children = [n['id'] for n in planned.values() if n.get('parent') == repair['node']]
        todo, members = children[:], []
        for at in todo:
            if at in canonical:
                members.append(at)
            todo.extend(n['id'] for n in planned.values() if n.get('parent') == at)
        assert repair['children'] == children
        assert repair['canonical_members'] == group['canonical_members']
        assert len(members) == len(set(members)) == len(repair['canonical_members'])
        assert set(repair['canonical_members']) == set(members)
        cuts = [e for e in edges if (e['source'] in members) != (e['target'] in members)]
        assert repair['cuts'] == group['boundary_ports'] == cuts
        assert next(f for f in document['architecture']['findings'] if f['id'] == group['finding'])['members'] == children


def main():
    global OUT
    if '--input-docks' in sys.argv:
        sys.argv.append('--return-regions')
    if '--return-regions' in sys.argv:
        sys.argv.append('--sample-frames')
    if '--sample-frames' in sys.argv:
        sys.argv.append('--entry-bands')
    if '--entry-bands' in sys.argv:
        sys.argv.append('--dags')
    if '--adaptive' in sys.argv:
        sys.argv.append('--rank-clearance')
    if '--rank-clearance' in sys.argv:
        sys.argv.append('--clearance')
    if '--clearance' in sys.argv:
        sys.argv.append('--role-details')
    if '--role-details' in sys.argv:
        sys.argv.append('--dimensions')
    if '--trees' in sys.argv:
        sys.argv.append('--dimensions')
    if '--reservations' in sys.argv:
        sys.argv.append('--dimensions')
    if '--dags' in sys.argv or '--summary-coverage' in sys.argv:
        sys.argv.append('--dimensions')
    if '--composed' in sys.argv:
        sys.argv.append('--dimensions')
    if '--dimensions' in sys.argv:
        sys.argv.append('--stability')
    if '--stability' in sys.argv:
        sys.argv.append('--stages')
    if '--stages' in sys.argv:
        sys.argv.append('--pipelines')
    if '--pipelines' in sys.argv:
        sys.argv.append('--flows')
    if '--flows' in sys.argv:
        sys.argv.append('--branches')
    if '--branches' in sys.argv:
        sys.argv.append('--context')
    if '--context' in sys.argv:
        sys.argv.append('--expressions')
    if '--symbolic' in sys.argv:
        OUT = ROOT / 'verification/symbolic-values/current'
    if '--canvas' in sys.argv:
        OUT = ROOT / 'verification/canvas-medium/current'
    if '--expressions' in sys.argv:
        OUT = ROOT / 'verification/local-expressions/current'
    if '--roles' in sys.argv:
        OUT = ROOT / 'verification/role-frontier/current'
    if '--frames' in sys.argv:
        OUT = ROOT / 'verification/frame-ownership/current'
    if '--inline' in sys.argv:
        OUT = ROOT / 'verification/inline-sequences/current'
    if '--context' in sys.argv:
        OUT = ROOT / 'verification/context-lanes/current'
    if '--branches' in sys.argv:
        OUT = ROOT / 'verification/branch-columns/current'
    if '--flows' in sys.argv:
        OUT = ROOT / 'verification/flow-entries/current'
    if '--pipelines' in sys.argv:
        OUT = ROOT / 'verification/local-pipelines/current'
    if '--stages' in sys.argv:
        OUT = ROOT / 'verification/contract-stages/current'
    if '--stability' in sys.argv:
        OUT = ROOT / 'verification/stage-stability/current'
    if '--dimensions' in sys.argv:
        OUT = ROOT / 'verification/dimension-paths/current'
    if '--composed' in sys.argv:
        OUT = ROOT / 'verification/composed-paths/current'
    if '--role-details' in sys.argv:
        OUT = ROOT / 'verification/role-details/current'
    if '--clearance' in sys.argv:
        OUT = ROOT / 'verification/label-clearance/current'
    if '--rank-clearance' in sys.argv:
        OUT = ROOT / 'verification/rank-clearance/current'
    if '--adaptive' in sys.argv:
        OUT = ROOT / 'verification/adaptive-frontier/current'
    if '--trees' in sys.argv:
        OUT = ROOT / 'verification/dependency-trees/current'
    if '--reservations' in sys.argv:
        OUT = ROOT / 'verification/frontier-reservations/current'
    if '--dags' in sys.argv:
        OUT = ROOT / 'verification/dependency-dags/current'
    if '--coverage-selection' in sys.argv:
        OUT = ROOT / 'verification/coverage-selection/current'
    if '--condition-predicates' in sys.argv:
        OUT = ROOT / 'verification/condition-predicates/current'
    if '--branch-tail-stages' in sys.argv:
        OUT = ROOT / 'verification/branch-tail-stages/current'
    if '--diagram-set' in sys.argv:
        OUT = ROOT / 'verification/diagram-set/current'
    if '--summary-coverage' in sys.argv:
        OUT = ROOT / 'verification/summary-coverage/current'
    if '--entry-bands' in sys.argv:
        OUT = ROOT / 'verification/entry-bands/current'
    if '--sample-frames' in sys.argv:
        OUT = ROOT / 'verification/sample-frames/current'
    if '--return-regions' in sys.argv:
        OUT = ROOT / 'verification/return-regions/current'
    if '--input-docks' in sys.argv:
        OUT = ROOT / 'verification/input-docks/current'
    report_file = 'representative-atlas-report.json' if '--atlases' in sys.argv else 'repeat-report.json' if '--repeats' in sys.argv else 'identity-report.json' if '--identities' in sys.argv else 'iteration-report.json' if '--iterations' in sys.argv else 'holdout-report.json' if '--holdout' in sys.argv else 'render-report.json'
    report = json.loads((OUT / report_file).read_text())
    if '--inline' in sys.argv or '--frames' in sys.argv or '--roles' in sys.argv or '--expressions' in sys.argv:
        sys.path.insert(0, str(ROOT))
        from semantic_adapter.schema import validate_ir
        extraction = json.loads((ROOT / report['extraction']).read_text())
        assert hashlib.sha256((ROOT / report['extraction']).read_bytes()).hexdigest() == report['extraction_sha256']
        assert hashlib.sha256((ROOT / extraction['source']).read_bytes()).hexdigest() == extraction['source_sha256']
        for file, digest in report['implementation_sha256'].items():
            assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, ('stale inline producer', file)
    if '--symbolic' in sys.argv:
        sys.path.insert(0, str(ROOT))
        from semantic_adapter.schema import validate_ir
        extraction_file = OUT / 'extraction.json'
        assert hashlib.sha256(extraction_file.read_bytes()).hexdigest() == report['extraction_sha256']
        extraction = json.loads(extraction_file.read_text())
        comparisons = {r['name']: r for r in report['comparisons']}
        for row in extraction['rows']:
            source = ROOT / row['source']
            assert hashlib.sha256(source.read_bytes()).hexdigest() == row['source_sha256']
            current_file = OUT / row['current']['ir']
            assert hashlib.sha256(current_file.read_bytes()).hexdigest() == row['current']['ir_sha256']
            ir = json.loads(current_file.read_text())
            assert validate_ir(ir)['ok'], ('invalid current symbolic evidence', row['name'])
            groups = [n['repeat_contract']['structure']['groups'] for n in ir['nodes'] if n.get('repeat_contract')]
            assert [[{k: g[k] for k in ['status', 'indices', 'representative']} for g in gs] for gs in groups] == [s['groups'] for s in comparisons[row['name']]['current']]
    if '--atlases' in sys.argv:
        for file, digest in report['artifacts_sha256'].items():
            assert hashlib.sha256((OUT / file).read_bytes()).hexdigest() == digest
        directories = [r[v]['directory'] for r in report['rows'] for v in ['before', 'current']] + [report['limited']['directory']]
        atlas_rows = []
        for directory in directories:
            manifest = json.loads((OUT / directory / 'manifest.json').read_text())
            for panel in manifest['panels']:
                atlas_rows.append({**panel, 'name': directory + '/' + panel['label'], 'svg': directory + '/' + panel['svg'],
                                   'document': directory + '/' + panel['document'], 'svg_sha256': report['artifacts_sha256'][directory + '/' + panel['svg']],
                                   'atlas_manifest': manifest, 'atlas_panel': panel})
        report['rows'] = atlas_rows
    results = []
    for row in report['rows']:
        source = OUT / row['svg']
        assert hashlib.sha256(source.read_bytes()).hexdigest() == row['svg_sha256']
        document = json.loads((OUT / row['document']).read_text())
        if '--input-docks' in sys.argv:
            from audit_input_dock_receipts import verify as verify_docks
            verify_docks(document, ET.parse(source))
        if '--return-regions' in sys.argv:
            from audit_return_region_receipts import verify
            verify(document, ET.parse(source))
        canonical = {e['id']: e for e in document['ir']['edges']}
        if '--inline' in sys.argv or '--frames' in sys.argv or '--roles' in sys.argv or '--expressions' in sys.argv:
            # JS JSON serialization normalizes 1.0 to 1. Python's existing
            # digest preserves that spelling. Validate the hashed source IR,
            # then independently compare every transported fact by JSON value;
            # do not reseal the exported document or claim its old hash passes.
            source_ir = json.loads((ROOT / row['input']).read_text())
            assert validate_ir(source_ir)['ok'], 'stale source repeat certificate'
            assert source_ir == document['ir'], 'document changed canonical facts'
            original = {n['id']: n for n in source_ir['nodes']}
            children = {}
            for n in original.values():
                children.setdefault(n.get('parent'), []).append(n['id'])

            def closure(node):
                members, todo = set(), [node]
                while todo:
                    at = todo.pop()
                    members.add(at)
                    todo.extend(children.get(at, []))
                return members

            for n in document['architecture']['nodes']:
                remainder = n.get('sequence_remainder')
                if not remainder:
                    continue
                indices = remainder['indices']
                assert len(indices) >= 2 and indices == list(range(indices[0], indices[-1] + 1))
                sequence = original[remainder['sequence']]['repeat_contract']
                group = sequence['structure']['groups'][remainder['structure_group']]
                assert group['status'] == 'proved'
                assert all(i in group['indices'] for i in indices)
                assert [original[call]['repeat_index'] for call in remainder['instances']] == indices
                members = set().union(*(closure(call) for call in remainder['instances']))
                assert members == set(n['canonical_members'])
                cuts = [e for e in document['ir']['edges'] if (e['source'] in members) != (e['target'] in members)]
                assert cuts == n['boundary_ports'], 'suffix lost or modified a canonical boundary'
        tree = ET.parse(source)
        if '--canvas' in sys.argv or '--inline' in sys.argv or '--frames' in sys.argv or '--roles' in sys.argv or '--expressions' in sys.argv:
            assert hashlib.sha256((ROOT / row['input']).read_bytes()).hexdigest() == row['input_sha256']
            assert hashlib.sha256((OUT / row['document']).read_bytes()).hexdigest() == row['document_sha256']
            q = row['quality']
            if q.get('medium') == 'canvas':
                vb = list(map(float, tree.getroot().get('viewBox').split()))
                assert tree.getroot().get('width') == str(int(vb[2]) if vb[2].is_integer() else vb[2]) + 'px'
                assert tree.getroot().get('height') == str(int(vb[3]) if vb[3].is_integer() else vb[3]) + 'px'
                assert vb[2:] == [q['native_width_px'], q['native_height_px']]
                assert 'font-below-8pt' not in q['issues']
                assert row['selected'] == row['state']['paperGranularity']
            for bucket, key in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
                values = [v for a in document['layout'][bucket].values() for v in a]
                assert len(values) == len(set(values))
                assert set(values) == {v['id'] for v in document['ir'][key]}
        nodes = {e.attrib['data-node-id']: e for e in tree.iter() if 'data-node-id' in e.attrib}
        paths = {e.attrib['data-edge-id']: e for e in tree.iter() if 'data-edge-id' in e.attrib}
        if '--pipelines' in sys.argv:
            audit_pipeline_summaries(document, row, nodes)
        audit_contract_stages(document, row, nodes)
        if '--dimensions' in sys.argv:
            from audit_dimension_paths import audit as audit_dimensions
            audit_dimensions(document, row, nodes)
        if '--frames' in sys.argv or '--roles' in sys.argv or '--expressions' in sys.argv:
            owners = document['layout'].get('frame_ownership', [])
            assert owners == row['frame_ownership'] == document['publication'].get('frame_ownership', [])
            planned = {n['id']: n for n in document['architecture']['nodes']}
            incidents = {e[k] for e in document['ir']['edges'] for k in ['source', 'target']}
            for record in owners:
                owner = planned[record['node']]
                assert record['node'] not in nodes and record['target'] in nodes
                assert owner['id'] not in incidents
                assert not any(owner.get(k) for k in ['semantic_contracts', 'contract_roles', 'condition', 'mutable', 'identity_display', 'observed_calls'])
                assert record['label'] == owner['label'] and record['module_identity'] == owner.get('module_identity')
                assert document['layout']['representatives'].get(owner['id'], record['target']) == record['target']
                assert record['label'] in ''.join(nodes[record['target']].find('{http://www.w3.org/2000/svg}title').itertext())
                if record['kind'] == 'same-call-source':
                    parent = planned[owner['parent']]
                    assert parent['semantic_type'] == 'repeat-instance'
                    assert owner['module_identity'] == parent['module_identity']
                elif record['kind'] == 'expanded-dependency-region':
                    assert owner['presentation_only'] and owner['semantic_type'] in ['structural-region', 'computation-region', 'dependency-band', 'dependency-panel']
                elif record['kind'] == 'sequence-sample':
                    parent = planned[owner['parent']]
                    seq = parent['sequence_frontier']
                    source_parent = original[parent['id']]
                    contract = source_parent['repeat_contract']
                    assert owner['semantic_type'] == 'repeat-instance'
                    assert owner['id'] in document['publication']['open']
                    assert record['target'] == parent['id'] and parent['id'] in nodes
                    assert len(seq['samples']) == 1 and not seq['unclassified']
                    assert seq['samples'][0]['instance'] == owner['id']
                    sample = record['sequence_sample']
                    assert sample['index'] == owner['repeat_index']
                    assert sample['module_identity'] == original[owner['id']]['module_identity']
                    assert sample['parameter_sharing'] == contract['parameter_sharing']
                    groups = contract['structure']['groups']
                    assert len(groups) == 1 and groups[0]['status'] == 'proved'
                    assert sample['source_positions'] == groups[0]['indices']
                    suffixes = [planned[r['node']] for r in seq['remainders']]
                    assert suffixes and all(s['id'] in nodes and s['id'] not in document['publication']['open'] for s in suffixes)
                    positions = [sample['index']] + [i for s in suffixes for i in s['sequence_remainder']['indices']]
                    assert sorted(positions) == list(range(contract['count']))
                    members = closure(owner['id'])
                    assert not any(original[id]['kind'] == 'opaque' or original[id].get('mutable') for id in members)
                    assert not any(e['kind'] == 'state-write' and (e['source'] in members or e['target'] in members) for e in canonical.values())
                    caption = ''.join(''.join(e.itertext()) for e in nodes[parent['id']] if e.tag.endswith('text'))
                    assert f'Detail: source call {sample["index"] + 1}' in caption
                else:
                    assert record['kind'] == 'source-owner'
                    assert owner['semantic_type'] in ['source-module', 'source-function']
        if ('--roles' in sys.argv or '--expressions' in sys.argv) and row.get('role_frontier'):
            frontier = row['role_frontier']
            assert frontier == document['publication']['role_frontier']
            certificates = {c['id']: c for c in document['ir'].get('semantic_contracts', [])}
            for role in frontier['roles']:
                cert = certificates[role['certificate']]
                value = cert['roles']
                for key in role['role'].split('.'):
                    value = value[int(key)] if isinstance(value, list) else value[key]
                assert value == role['node']
                assert role['scope'] == cert['scope']
                if role['status'] in ['exposed', 'boundary']:
                    assert role['frontier_node'] == role['visible_node'] and role['visible_node'] in nodes
                    if role['location'] == 'internal':
                        assert role['role'] in ''.join(nodes[role['visible_node']].find('{http://www.w3.org/2000/svg}title').itertext())
                        assert role['certificate'] in ''.join(nodes[role['visible_node']].find('{http://www.w3.org/2000/svg}title').itertext())
                if role['status'] == 'exposed':
                    assert role['node'] == role['frontier_node']
            if '--roles' in sys.argv:
                assert not row['quality']['line_geometry']['unrelated_contacts'], 'ambiguous contacts remain in a role view'
        if '--expressions' in sys.argv and row.get('local_expressions'):
            expressions = document['publication']['local_expressions']
            assert expressions == row['local_expressions']
            relations = {r['id']: r for r in document['architecture']['relation_graph']['relations']}
            routes = document['layout']['edges']
            coverage = {c['goal']: c for c in document['expression_coverage']}
            for request in expressions['requests']:
                relation = relations[request['relation']]
                assert request['type'] == relation['type']
                assert request['not_asserted'] == relation['not_asserted']
                assert request['condition_scope'] == relation['condition_scope']
                assert request['evidence_scope'] == relation['evidence_scope']
                assert len(request['bindings']) == len(relation['bindings'])
                for target in request['targets']:
                    if target['status'] == 'exposed':
                        assert target['node'] in nodes and target['visible_node'] == target['node']
                for binding, original_binding in zip(request['bindings'], relation['bindings']):
                    assert all(binding[k] == v for k, v in original_binding.items())
                    actual = {e['id'] for e in routes if any(binding['edge'] in {m['id'], *m.get('originals', [])} for m in e.get('bundle_members', [e]))}
                    assert actual == set(binding['visible_edges'])
                    assert actual <= paths.keys()
                if request['status'] == 'fulfilled':
                    assert coverage['goal:' + relation['id']]['status'] == 'fulfilled'
                    assert all(t['node'] in nodes for t in request['targets'] if t['location'] == 'internal')
                    assert not request['unplaced_role_labels']
                    for binding in request['bindings']:
                        assert binding['visible_edges'] and all(paths[e].get('data-route-valid') == 'true' for e in binding['visible_edges'])
                else:
                    assert request['status'] == 'deferred' and request['reason']
        assert len(nodes) == row['nodes']
        assert len(paths) == row['edges']
        measured = {p['id']: p for p in document['layout']['nodes']}
        edge_layout = {e['id']: e for e in document['layout']['edges']}
        if 'atlas_manifest' in row:
            audit_atlas_coverage(row['atlas_manifest'], row['atlas_panel'], document, nodes, paths)
        representative = row.get('representative')
        if representative and representative.get('structural_group'):
            group = representative['structural_group']
            element = nodes[representative['instance']]
            text = ''.join(''.join(e.itertext()) for e in element if e.tag.endswith('text'))
            compact = re.sub(r'\s', '', text)
            assert 'sourcepositions' + ','.join(str(i + 1) for i in group['indices']) in compact
            assert 'structureonly' in compact
            assert f'Instance{representative["index"] + 1}of{representative["count"]}' in compact
            source_sequence = next(n for n in document['ir']['nodes'] if n['id'] == representative['sequence'])
            actual_group = source_sequence['repeat_contract']['structure']['groups'][group['group']]
            assert group['representative'] == actual_group['representative'] == representative['instance']
            assert group['indices'] == actual_group['indices']
        for identity in row.get('identities', []):
            element = nodes[identity['node']]
            actual = json.loads(element.attrib['data-identity'])
            assert actual == {k: v for k, v in identity.items() if k != 'node'}
            # Metadata alone is insufficient: require the label in visible text.
            text = ' '.join(''.join(e.itertext()) for e in element if e.tag.endswith('text'))
            compact = re.sub(r'\s', '', text)
            if actual['kind'] == 'same-object-calls':
                assert re.sub(r'\s', '', actual['label']) in compact
                assert f'sourcecall{actual["invocation"]}/{actual["count"]}' in compact
            else:
                assert all(re.sub(r'\s', '', alias) in compact for alias in actual['aliases'])
        for decision in document['architecture'].get('publication', {}).get('boundary_plans', []):
            for proposal in decision['proposals']:
                inside = set(proposal['canonical_members'])
                actual = {e['id'] for e in canonical.values() if (e['source'] in inside) != (e['target'] in inside)}
                assert actual == set(proposal['boundary_edges']), 'region lost a canonical cut'
                assert inside <= {n['id'] for n in document['ir']['nodes']}
        for edge_id, element in paths.items():
            edge = edge_layout[edge_id]
            points = [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', element.attrib['d'])]
            assert len(points) >= 2
            assert all(a[0] == b[0] or a[1] == b[1] for a, b in zip(points, points[1:]))
            assert points == [(p['x'], p['y']) for p in edge['route']['points']]
            assert edge['source'] in nodes and edge['target'] in nodes
            for endpoint, at in [('source', points[0]), ('target', points[-1])]:
                p = measured[edge[endpoint]]
                if not p['expanded']:
                    x, y = at
                    if p.get('symbol'):
                        assert abs(((x-p['x']-p['w']/2)**2+(y-p['y']-p['h']/2)**2)**.5-p['w']/2) < 1e-6
                    else:
                        assert p['x']-1e-6 <= x <= p['x']+p['w']+1e-6
                        assert p['y']-1e-6 <= y <= p['y']+p['h']+1e-6
                        assert min(abs(x-p['x']), abs(x-p['x']-p['w']), abs(y-p['y']), abs(y-p['y']-p['h'])) < 1e-6
            if 'data-bundle-members' in element.attrib:
                members = json.loads(element.attrib['data-bundle-members'])
                endpoints = json.loads(element.attrib['data-bundle-endpoints'])
                assert members == [m['id'] for m in edge['bundle_members']]
                for m, bound in zip(edge['bundle_members'], endpoints):
                    assert bound['source'] == canonical[m['id']]['source']
                    assert bound['target'] == canonical[m['id']]['target']
                    assert m['target_port'] == canonical[m['id']]['target_port']
                if edge.get('sequence_output'):
                    assert edge['bundle_values'] == 1
                    assert all(m['source_port'] == '0' for m in edge['bundle_members'])
            if edge_id in canonical and 'data-source-port' in element.attrib:
                # The source slot may compose explicit tuple aliases, while
                # the actual canonical consumer operand must stay exact.
                assert element.attrib['data-target-port'] == canonical[edge_id]['target_port']
                assert element.attrib['data-canonical-target'] == canonical[edge_id]['target']
                bindings = json.loads(element.attrib['data-semantic-bindings'])
                assert all(b['edge'] in canonical for b in bindings)
            if element.attrib.get('data-design-route') in {'state-interface', 'bypass', 'iteration-feedback'}:
                owner = measured[edge['design_route']['owner']]
                lane = any(owner['x'] < x < owner['x'] + owner['design_gutter'] for x, _ in points)
                receipt = [c for c in document['layout'].get('constraint_receipts', []) if c['status'] == 'applied' and c.get('route_verified')]
                if any(c['evidence'].get('relation') == edge['design_route']['certificate'] or c['evidence'].get('certificate') == edge['design_route']['certificate'] for c in receipt):
                    assert lane, 'claimed lane is absent from actual SVG path'
        if '--context' in sys.argv:
            assert row['context_lanes'] == document['layout'].get('context_lanes', [])
            planned = {n['id']: n for n in document['architecture']['nodes']}
            attached = {r['node'] for r in document['layout'].get('frame_ownership', [])}
            parents = {n: value.get('parent') for n, value in planned.items()}
            for node, parent in list(parents.items()):
                while parent in attached:
                    parent = parents[parent]
                parents[node] = parent

            def ancestors(node):
                result = set()
                while node:
                    result.add(node)
                    node = parents.get(node)
                return result
            assert row.get('branch_columns', []) == document['layout'].get('branch_columns', [])
            actual_boxes = {}
            for node, element in nodes.items():
                transform = re.fullmatch(r'translate\((-?[\d.eE+]+),(-?[\d.eE+]+)\)', element.get('transform'))
                assert transform
                x, y = map(float, transform.groups())
                p = measured[node]
                assert (x, y) == (p['x'], p['y'])
                rect = element.find('{http://www.w3.org/2000/svg}rect')
                if rect is not None:
                    assert (float(rect.get('width')), float(rect.get('height'))) == (p['w'], p['h'])
                actual_boxes[node] = (x, y, p['w'], p['h'])
            if '--flows' in sys.argv:
                assert row['compound_alignments'] == document['layout'].get('compound_alignments', [])
                for record in row['compound_alignments']:
                    if record.get('mode') != 'entries':
                        continue
                    geometry = bool(record['accepted'] and record['entry_bindings'])
                    valid_routes = True
                    kids = {node for node in nodes if parents.get(node) == record['parent']}
                    def owner(node):
                        while node is not None and node not in kids:
                            node = parents.get(node)
                        return node
                    adjacent = {node: set() for node in kids}
                    for edge in edge_layout.values():
                        a, b = owner(edge['source']), owner(edge['target'])
                        if a and b and a != b and edge.get('design_route', {}).get('kind') != 'iteration-feedback':
                            adjacent[a].add(b)
                        if edge.get('layout_after'):
                            a = owner(edge['layout_after'])
                            if a and b and a != b:
                                adjacent[a].add(b)
                    for binding in record['entry_bindings']:
                        edge, independent = [edge_layout[binding[key]] for key in ['edge', 'independent_entry']]
                        a, b = binding['source_frame'], binding['target_frame']
                        assert (edge['source'], edge['target']) == (binding['source'], binding['target'])
                        assert owner(edge['source']) == a and owner(edge['target']) == b and edge['target'] != b
                        assert measured[a]['expanded'] and measured[b]['expanded']
                        assert owner(independent['target']) == b
                        entry_owner = owner(independent['source'])
                        assert entry_owner is not None and entry_owner not in [a, b]
                        reached, todo = set(), [a]
                        for node in todo:
                            if node in reached:
                                continue
                            reached.add(node)
                            todo.extend(adjacent[node])
                        assert entry_owner not in reached, 'entry source depends on context-producing region'
                        assert actual_boxes[independent['target']][1] <= actual_boxes[edge['target']][1] + 60
                        for e in [edge, independent]:
                            assert all(m['kind'] in ['data', 'alias', 'interface-binding'] and not m.get('condition') for m in e.get('bundle_members', [e]))
                        assert not edge.get('design_route')
                        for node in [a, b, edge['source'], edge['target']]:
                            n = planned[node]
                            assert n['kind'] not in ['opaque', 'control'] and not any(n.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls'])
                        ax, ay, aw, ah = actual_boxes[a]
                        bx, by, bw, bh = actual_boxes[b]
                        geometry &= (ax + aw <= bx or bx + bw <= ax) and ay < by + bh and by < ay + ah
                        valid_routes &= all(e['route']['ok'] and paths[e['id']].get('data-route-valid') == 'true' for e in [edge, independent])
                    assert record['geometry_verified'] == bool(geometry)
                    assert record['routes_verified'] == bool(valid_routes)
                    assert (record['status'] == 'realized') == bool(geometry and valid_routes)
                    if 'input_band' in record:
                        band = record['input_band']
                        inputs, regions = set(band['inputs']), set(band['regions'])
                        assert len(inputs) == len(band['inputs']) >= 2 and not inputs & regions
                        docked = set(band.get('docked_inputs', []))
                        assert not docked & (inputs | regions) and len(docked) == len(band.get('docked_inputs', []))
                        assert docked == {d['node'] for d in document['layout'].get('input_docks', []) if d['parent'] == record['parent']}
                        assert inputs | regions | docked == kids
                        for node in inputs | docked:
                            assert planned[node]['kind'] == 'interface' and planned[node]['role'] == 'input'
                            assert not any(node in targets for targets in adjacent.values())
                        floor = max(actual_boxes[node][1] + actual_boxes[node][3] for node in inputs) + band['gap_y']
                        fits = geometry and all(actual_boxes[node][1] >= floor for node in regions)
                        assert record['input_band_verified'] == bool(fits)
                        for a in inputs:
                            for b in inputs - {a}:
                                ax, ay, aw, ah = actual_boxes[a]
                                bx, by, bw, bh = actual_boxes[b]
                                assert ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay
            for group in row.get('branch_columns', []):
                chains, sink = group['chains'], group['sink']
                assert 2 <= len(chains) <= 6 and len(chains[0]['nodes']) >= 2
                ids = [node for chain in chains for node in chain['nodes']]
                assert len(ids) == len(set(ids))
                assert all(parents[node] == group['parent'] for node in [sink, *ids])
                geometry = True
                previous_right = None
                for chain in chains:
                    assert len(chain['nodes']) == len(chains[0]['nodes'])
                    boxes = [actual_boxes[node] for node in chain['nodes']]
                    for i, (x, y, w, h) in enumerate(boxes):
                        element = nodes[chain['nodes'][i]]
                        if element.find('{http://www.w3.org/2000/svg}rect') is None:
                            circle = element.find('{http://www.w3.org/2000/svg}circle')
                            assert circle is not None, 'unmeasured path-column node shape'
                            assert (float(circle.get('cx')), float(circle.get('cy')), float(circle.get('r'))) == (w / 2, h / 2, min(w, h) / 2 - 1)
                        first = boxes[0]
                        geometry &= abs(x + w / 2 - first[0] - first[2] / 2) < 1e-6
                        counterpart = actual_boxes[chains[0]['nodes'][i]]
                        geometry &= abs(y - counterpart[1]) < 1e-6
                        if i:
                            geometry &= y >= boxes[i - 1][1] + boxes[i - 1][3]
                    if previous_right is not None:
                        geometry &= min(b[0] for b in boxes) >= previous_right
                    previous_right = max(b[0] + b[2] for b in boxes)
                    geometry &= actual_boxes[sink][1] >= boxes[-1][1] + boxes[-1][3]
                    for i, node in enumerate(chain['nodes']):
                        next_node = chain['nodes'][i + 1] if i + 1 < len(boxes) else sink
                        uses = [edge for edge in edge_layout.values() if edge['source'] == node and edge['target'] == next_node]
                        assert uses and all(edge['id'] in chain['edges'] for edge in uses)
                        assert all(not e.get('design_route') and not e.get('layout_after') and all(m['kind'] in ['data', 'alias', 'interface-binding'] and not m.get('condition') for m in e.get('bundle_members', [e])) for e in uses)
                        assert {edge['target'] for edge in edge_layout.values() if edge['source'] == node} == {next_node}
                        n = planned[node]
                        assert n['kind'] in ['compute', 'composite'] and not any(n.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls'])
                    for binding in chain['ports']:
                        edge = edge_layout[binding['edge']]
                        assert edge['source'] == chain['nodes'][-1] and edge['target'] == sink
                        assert binding['port'] == edge['target_port']
                valid_routes = all(edge_layout[e]['route']['ok'] and paths[e].get('data-route-valid') == 'true' for chain in chains for e in chain['edges'])
                assert group['geometry_verified'] == bool(geometry)
                assert group['routes_verified'] == valid_routes
                assert (group['status'] == 'realized') == bool(geometry and valid_routes)
            for receipt in document['layout'].get('constraint_receipts', []):
                if receipt.get('consumption') == 'branch-columns' and receipt['status'] == 'applied':
                    assert receipt['route_verified']
                    group = receipt['path_columns']
                    realized = next(g for g in row['branch_columns'] if g['sink'] == group['sink'] and g['parent'] == group['parent'])
                    assert realized['status'] == 'realized'
                    assert len({next(i for i, c in enumerate(group['chains']) if node in c['nodes']) for node in receipt['members']}) == len(receipt['members'])
            for entry in row['context_lanes']:
                edge = edge_layout[entry['edge']]
                element = paths[entry['edge']]
                if entry.get('selected') is False:
                    assert entry['status'] == 'deferred' and not edge.get('context_lane')
                    assert element.get('data-context-owner') is None
                    continue
                assert element.get('data-context-owner') == entry['owner']
                assert element.get('data-context-side') == entry['side'] == edge['route']['target_side']
                assert entry['internal_inputs'] and not edge.get('design_route')
                assert parents[edge['target']] == entry['owner']
                assert entry['owner'] not in ancestors(edge['source'])
                assert edge['source'] not in ancestors(edge['target'])
                for internal_id in entry['internal_inputs']:
                    other = edge_layout[internal_id]
                    assert other['target'] == edge['target'] and other['source'] != edge['source']
                    assert entry['owner'] in ancestors(other['source']) and other['source'] != entry['owner']
                for member in edge.get('bundle_members', [edge]):
                    assert member['kind'] in ['data', 'alias', 'interface-binding'] and not member.get('condition')
                owner = measured[entry['owner']]
                low = owner['x'] + owner.get('design_gutter', 0) if entry['side'] == 'left' else owner['x'] + owner['w'] - owner['context_gutter']
                high = low + owner['context_gutter']
                points = [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', element.attrib['d'])]
                realized = edge['route']['ok'] and any(a[0] == b[0] and a[1] != b[1] and low < a[0] < high for a, b in zip(points, points[1:]))
                if entry.get('method') == 'direct-docked-entry':
                    assert '--input-docks' in sys.argv
                    realized = edge['route']['ok'] and len(points) == 2 and points[0][1] == points[1][1]
                assert (entry['status'] == 'realized') == realized
        measured_crossings = 0
        if '--context' in sys.argv:
            polylines = [[(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', element.attrib['d'])] for element in paths.values()]
            segments = [list(zip(points, points[1:])) for points in polylines]
            for i, first in enumerate(segments):
                for second in segments[i + 1:]:
                    for a, b in first:
                        for c, d in second:
                            av, cv = a[0] == b[0], c[0] == d[0]
                            if av == cv:
                                continue
                            v, w, h, k = (a, b, c, d) if av else (c, d, a, b)
                            if min(h[0], k[0]) < v[0] < max(h[0], k[0]) and min(v[1], w[1]) < h[1] < max(v[1], w[1]):
                                measured_crossings += 1
            assert measured_crossings == row['quality']['line_geometry']['crossings']
        results.append({'name': row['name'], 'nodes': len(nodes), 'paths': len(paths), 'passed': True,
                        **({'crossings': measured_crossings} if '--context' in sys.argv else {})})
    output = {'schema': 'local-svg-audit/1', 'render_report_sha256': hashlib.sha256((OUT / report_file).read_bytes()).hexdigest(), 'results': results,
              'scope': 'XML counts, orthogonal paths, physical terminals, canonical operands and bundle members, exact region cuts, relation references and claimed reserved channels.'}
    (OUT / ('representative-atlas-svg-report.json' if '--atlases' in sys.argv else 'repeat-svg-report.json' if '--repeats' in sys.argv else 'identity-svg-report.json' if '--identities' in sys.argv else 'iteration-svg-report.json' if '--iterations' in sys.argv else 'holdout-svg-report.json' if '--holdout' in sys.argv else 'svg-report.json')).write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

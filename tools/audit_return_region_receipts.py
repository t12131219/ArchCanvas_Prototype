"""Verify source return bindings and the final presentation boundary independently."""
import re


def verify(doc, svg):
    raw = {n['id']: n for n in doc['ir']['nodes']}
    planned = {n['id']: n for n in doc['architecture']['nodes']}
    visible = {n['id']: n for n in doc['layout']['nodes']}
    elements = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
    edges = doc['ir']['edges']
    by_edge = {e['id']: e for e in edges}
    protected = ['mutable', 'identity_display', 'observed_calls', 'runtime_evidence', 'repeat_contract', 'iteration', 'semantic_contracts', 'contract_roles']
    rows = doc['publication'].get('return_regions', {}).get('rows', [])
    for row in rows:
        group = planned[row['group']]
        assert group['presentation_only'] and group['semantic_type'] == 'conditional-collection'
        assert group['return_region'] == {k: v for k, v in row.items() if k != 'status'}
        todo = [group['id']]
        for at in todo:
            todo.extend(n['id'] for n in planned.values() if n.get('parent') == at)
        members = set(todo).intersection(raw)
        assert len(row['canonical_members']) == len(members)
        assert members == set(row['canonical_members']) == set(group['canonical_members'])
        for id in members:
            for n in [raw[id], planned[id]]:
                assert n['kind'] not in ['opaque', 'state', 'buffer', 'parameter']
                assert n.get('evidence_status') != 'runtime-only'
                assert not any(n.get(k) is not None and n.get(k) is not False and n.get(k) != [] for k in protected)
        control = raw[row['control']]
        assert control['kind'] == 'control' and control['operator'] == 'if'
        assert row['predicate'] == (control.get('label') or 'if')
        assert [n for n in members if raw[n]['kind'] == 'control'] == [control['id']]
        aggregate = raw[row['aggregate']]
        assert aggregate['kind'] == 'interface' and aggregate['role'] == 'output'
        assert not aggregate.get('condition') and aggregate['parent'] == control['parent']
        assert planned[aggregate['id']]['parent'] == group['id']
        incoming = [e for e in edges if e['target'] == aggregate['id']]
        assert 2 <= len(incoming) <= 8
        assert [e['id'] for e in incoming] == [s['edge'] for s in row['return_sites']]
        assert len({e.get('target_port', 'in') for e in incoming}) == len(incoming)
        assert any(e['source'] == aggregate['id'] for e in edges), 'external output terminals must remain exposed'
        for site in row['return_sites']:
            edge, node = by_edge[site['edge']], raw[site['node']]
            assert node['kind'] == 'interface' and node['role'] == 'output' and not node.get('condition')
            assert edge['kind'] == 'interface-binding' and not edge.get('condition')
            assert (edge['source'], edge['target']) == (node['id'], aggregate['id'])
            assert (site['source_port'], site['aggregate_slot']) == (edge.get('source_port', 'out'), edge.get('target_port', 'in'))
            assert [e['id'] for e in edges if e['source'] == node['id']] == [edge['id']]
            inputs = [e for e in edges if e['target'] == node['id']]
            assert len(inputs) == 1 and inputs[0]['kind'] in ['data', 'alias', 'interface-binding'] and not inputs[0].get('condition')
            at, conditions = node.get('parent'), []
            while at and at != control['parent']:
                if raw[at].get('condition'):
                    conditions.append(raw[at]['condition'])
                at = raw[at].get('parent')
            assert at == control['parent'], 'foreign source scope'
            assert site['source_conditions'] == conditions, 'must not invent a false condition for fallthrough'
        cuts = [e for e in edges if (e['source'] in members) != (e['target'] in members)]
        assert row['cuts'] == group['boundary_ports'] == cuts
        selection = group['boundary_selection']
        assert set(selection['canonical_members']) == members
        assert selection['boundary_edges'] == [e['id'] for e in cuts]
        assert selection['input_edges'] == [e['id'] for e in cuts if e['target'] in members]
        assert selection['output_edges'] == [e['id'] for e in cuts if e['source'] in members]
        assert selection['internal_edges'] == sum(e['source'] in members and e['target'] in members for e in edges)
        finding = next(f for f in doc['architecture']['findings'] if f['id'] == group['id'])
        assert finding['roles']['boundary_selection'] == selection
        assert finding['members'] == selection['members']
        for predicate in doc['publication'].get('condition_predicates', {}).get('rows', []):
            if predicate['group'] == group['id']:
                assert set(predicate['canonical_members']) == members and predicate['cuts'] == cuts
        status = 'expanded' if visible.get(group['id'], {}).get('expanded') else 'summary' if group['id'] in visible else 'folded'
        assert row['status'] == status
        if status != 'folded':
            texts = ' '.join(''.join(e.itertext()) for e in elements[group['id']] if e.tag.endswith('text'))
            text = re.sub(r'\s+', '', texts)
            assert 'Returnalternatives' in text
            if status == 'summary':
                assert re.sub(r'\s+', '', 'If ' + row['predicate']) in text
                assert str(len(incoming)) + 'sourcereturns' in text
                assert not members.intersection(visible)
                assert not any(c['status'] == 'fulfilled' and c['goal'] in {'goal:node:' + id for id in members} for c in doc['expression_coverage'])
        # Original entry output terminals cannot disappear into a local return group.
        for id, n in raw.items():
            if n.get('role') == 'output' and n.get('parent') == doc['ir']['nodes'][0]['id'] and not any(e['source'] == id for e in edges):
                assert id not in members
    return len(rows)

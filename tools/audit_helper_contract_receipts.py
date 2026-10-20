"""Audit source chains from original parents/operands, independently of recognizer."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from audit_role_source_frame_receipts import verify as verify_frames

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/helper-contracts/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())


def check_chain(ir, cert):
    by = {n['id']: n for n in ir['nodes']}
    def parent(i):
        n = by.get(i, {})
        return n.get('source_parent', n.get('parent'))
    def ancestors(i):
        result = []
        while i is not None:
            assert i not in result
            result.append(i); i = parent(i)
        return result
    def closure(i):
        return {n['id'] for n in ir['nodes'] if i in ancestors(n['id'])}
    flow = lambda i: [e for e in ir['edges'] if e['target'] == i and e['kind'] in ['data', 'alias', 'interface-binding']]
    def resolve(identity, slot='out'):
        seen = set()
        while by[identity]['kind'] in ['interface', 'value-alias'] and not by[identity].get('operator') and identity != witness['input']['node']:
            assert (identity, slot) not in seen; seen.add((identity, slot))
            edges = flow(identity); assert len(edges) == 1 and not edges[0].get('condition')
            edge = edges[0]; outer = str(edge.get('source_port', 'out'))
            slot = outer if slot == 'out' else slot if outer == 'out' else outer + '.' + slot
            identity = edge['source']
        return identity, slot
    witness = cert['source_chain']; owner = cert['node']; members = closure(owner)
    assert witness['rule_version'] == 'source-local-chain/1' and set(cert['members']) == members
    operations = witness['operations']
    assert len(operations) == len(set(operations))
    assert set(operations) == {i for i in members if by[i]['kind'] == 'compute'}
    assert [by[operations[i]]['operator'] for i in [0, -1]] == ['linear', 'linear']
    assert sum(by[i]['operator'] == 'linear' for i in operations) == 2
    assert all(by[i]['operator'] in ['linear', 'activation', 'dropout', 'identity'] for i in operations)
    assert cert['roles'] == {'input_projection': operations[0], 'activation': next(i for i in operations if by[i]['operator'] == 'activation'), 'output_projection': operations[-1], 'output': operations[-1]}
    expected = (witness['input']['node'], witness['input']['slot'])
    assert expected[1] == 'out' and by[expected[0]]['role'] == 'input' and parent(expected[0]) == owner
    for identity in operations:
        edges = flow(identity); assert len(edges) == 1 and edges[0]['target_port'] == 'arg:0'
        assert resolve(edges[0]['source'], edges[0].get('source_port', 'out')) == expected
        expected = identity, 'out'
    assert resolve(witness['output']) == expected
    direct_outputs = [i for i in members if parent(i) == owner and by[i]['kind'] == 'interface' and by[i].get('role') == 'output']
    assert direct_outputs == [witness['output']]
    nearest = next(i for i in ancestors(operations[0])[1:] if all(i in ancestors(o)[1:] for o in operations))
    assert nearest == owner
    for identity in members:
        n = by[identity]
        assert n['kind'] not in ['opaque', 'state', 'buffer', 'control'] and n.get('evidence_status') != 'runtime-only'
        assert not any(n.get(k) for k in ['mutable', 'condition', 'iteration', 'iteration_contract', 'repeat_contract', 'return_selection'])
    for edge in ir['edges']:
        if edge['source'] in members or edge['target'] in members:
            assert not edge.get('condition') and edge['kind'] in ['data', 'alias', 'interface-binding', 'parameter-read']
    expected_helpers = {i for i in members if i != owner and by[i]['kind'] == 'composite' and closure(i) & set(operations)}
    assert {h['node'] for h in witness['helpers']} == expected_helpers
    for helper in witness['helpers']:
        inside = closure(helper['node'])
        assert set(helper['members']) == inside and helper['source_parent'] == parent(helper['node'])
        assert helper['cuts'] == [e['id'] for e in ir['edges'] if (e['source'] in inside) != (e['target'] in inside)]
    assert cert['edges'] == [e['id'] for e in ir['edges'] if e['source'] in members or e['target'] in members]
    return len(witness['helpers'])


def main():
    report = read(OUT / 'render-report.json'); extraction = read(OUT / 'extraction.json')
    extraction_results = []
    for row in extraction['rows']:
        before, current = [read(ROOT / row[s]['input']) for s in ['before', 'current']]
        facts = lambda ir: {k: v for k, v in ir.items() if k not in ['semantic_contracts', 'semantic_contract_basis', 'ir_digest']}
        assert facts(before) == facts(current) and sha(ROOT / row['source']) == row['source_sha256']
        certificates = [c for c in current.get('semantic_contracts', []) if 'source_chain' in c]
        helpers = sum(check_chain(current, c) for c in certificates)
        extraction_results.append({'entry': row['entry'], 'source_chains': len(certificates), 'helpers': helpers, 'same_source_facts': True, 'passed': True})
    results = []
    for row in report['rows']:
        doc = read(OUT / row['document']); tree = ET.parse(OUT / row['svg'])
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        assert doc['ir'] == read(ROOT / row['input'])
        if doc['publication'].get('role_frontier'):
            verify_frames(doc, tree)
        for key, objects in [('node_accounting', doc['ir']['nodes']), ('edge_accounting', doc['ir']['edges'])]:
            identities = sum(doc['layout'][key].values(), [])
            assert len(identities) == len(set(identities)) and set(identities) == {o['id'] for o in objects}
        if row['name'].endswith('-current') and not row['name'].startswith('transformer-'):
            visible = {e.get('data-node-id') for e in tree.iter() if e.get('data-node-id')}
            for c in doc['ir'].get('semantic_contracts', []):
                if c.get('source_chain'):
                    assert {c['roles'][k] for k in ['input_projection', 'activation', 'output_projection']} <= visible
        if row.get('provenance'):
            p = row['provenance']; assert sha(ROOT / p['report']) == p['report_sha256']
            original = next(r for r in read(ROOT / p['report'])['rows'] if r['name'] == p['row'])
            assert original['svg_sha256'] == row['svg_sha256']
        results.append({'name': row['name'], 'passed': True})
    for pair in report['comparisons']:
        if pair['name'] in ['UnknownChain', 'ConditionalChain', 'MutableChain', 'EscapingChain', 'DisconnectedChain']:
            assert pair['svg_unchanged']
        if pair['name'].startswith('transformer-'):
            a, b = [read(OUT / (pair['name'] + '-' + suffix + '.layout.json')) for suffix in ['before', 'current']]
            for key in ['nodes', 'edges', 'labels', 'node_accounting', 'edge_accounting', 'representatives']:
                assert a['layout'][key] == b['layout'][key]
            assert pair['geometry_unchanged']
    (OUT / 'receipt-report.json').write_text(json.dumps({'schema': 'helper-contract-receipts/1', 'render_report_sha256': sha(OUT / 'render-report.json'), 'extraction': extraction_results, 'rows': results}, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'sources': len(extraction_results), 'passed': True}))


if __name__ == '__main__':
    main()

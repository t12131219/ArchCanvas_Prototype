"""Independently check helper ownership against canonical ancestry and real SVGs."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-source-frames/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def read(file):
    return json.loads(file.read_text())


def verify(document, svg):
    ir = document['ir']
    source = {n['id']: n for n in ir['nodes']}
    contracts = {c['id']: c for c in document['architecture']['semantic_contracts']}
    nodes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
    paths = {e.get('data-edge-id'): e for e in svg.iter() if e.get('data-edge-id')}
    for field, objects in [('node_accounting', ir['nodes']), ('edge_accounting', ir['edges'])]:
        ids = sum(document['layout'][field].values(), [])
        assert len(ids) == len(set(ids)) and set(ids) == {o['id'] for o in objects}
    roles = document['publication']['role_frontier']['roles']
    attached = document['layout']['node_accounting'].get('attached', [])
    annotations = [r for r in document['layout'].get('frame_ownership', []) if r['kind'] == 'role-source']
    assert document['publication'].get('frame_ownership', []) == document['layout'].get('frame_ownership', [])
    for annotation in annotations:
        identity, target = annotation['node'], annotation['target']
        original = source[identity]
        assert original['kind'] == 'composite' and original['semantic_type'] in ['source-function', 'source-module']
        assert identity not in nodes and identity in attached and target in nodes
        assert not any(e['source'] == identity or e['target'] == identity for e in ir['edges'])
        for key in ['label', 'semantic_type', 'module_identity', 'source']:
            assert annotation[key] == original.get(key, [] if key == 'source' else None)
        assert annotation['source_parent'] == original.get('source_parent', original.get('parent'))
        # Compute descendants by following each original node's parent chain;
        # do not use the selector's membership, presentation parent, or cuts.
        members = set()
        for n in ir['nodes']:
            cursor, visited = n['id'], set()
            while cursor is not None:
                assert cursor not in visited
                visited.add(cursor)
                if cursor == identity:
                    members.add(n['id']); break
                cursor = source.get(cursor, {}).get('parent')
        assert set(annotation['canonical_members']) == members
        assert len(annotation['canonical_members']) == len(members)
        assert not any(c['node'] in members for c in contracts.values()), 'independent certificate hidden in helper'
        assert annotation['cuts'] == [e for e in ir['edges'] if (e['source'] in members) != (e['target'] in members)]
        for n in [source[i] for i in members]:
            assert n['kind'] not in ['opaque', 'control', 'state', 'buffer']
            assert n.get('evidence_status') != 'runtime-only'
            for key in ['mutable', 'condition', 'identity_display', 'observed_calls', 'runtime_evidence', 'iteration', 'repeat_contract', 'contract_stage', 'semantic_contracts', 'contract_roles']:
                assert not n.get(key), (identity, key)
        for edge in ir['edges']:
            if edge['source'] in members or edge['target'] in members:
                assert edge['kind'] in ['data', 'alias', 'interface-binding', 'parameter-read'] and not edge.get('condition')
        assert annotation['role_sources']
        for proof in annotation['role_sources']:
            cert = contracts[proof['certificate']]
            assert cert['node'] == target
            # Records use a formatted role name; confirm the certificate by
            # matching the exact compiler record including the local endpoint.
            assert any(r['owner'] == target and r['certificate'] == proof['certificate'] and r['role'] == proof['role'] and
                       r['node'] == proof['node'] == r['frontier_node'] and r['location'] == 'internal' for r in roles)
            def endpoints(value):
                if isinstance(value, dict):
                    return sum((endpoints(v) for v in value.values()), [])
                if isinstance(value, list):
                    return sum((endpoints(v) for v in value), [])
                return [value]
            assert proof['node'] in endpoints(cert['roles']) and proof['node'] in members & nodes.keys()
        title = ''.join(e.text or '' for e in nodes[target] if e.tag.endswith('title'))
        assert f"Source ownership: {annotation['label']} [{identity}]" in title and 'role-source' in title
    # Selected role endpoints must retain their original incoming operands in
    # actual physical paths, including bundles and their original identities.
    physical = {}
    for edge in document['layout']['edges']:
        assert edge['id'] in paths
        for member in edge.get('bundle_members', [edge]):
            for identity in {member['id'], *member.get('originals', [])}:
                physical.setdefault(identity, []).append(edge)
    for request in document['publication']['role_frontier'].get('path_requests', []):
        incoming = [e['id'] for e in ir['edges'] if e['target'] == request['target'] and e['kind'] in ['data', 'alias', 'interface-binding']]
        missing = [i for i in incoming if i not in physical]
        failed = [i for i in incoming if any(not e['route']['ok'] for e in physical.get(i, []))]
        check = request['operand_check']
        assert check['edges'] == incoming and check['missing_edges'] == missing and check['route_failures'] == failed
        if check['status'] == 'fulfilled':
            assert request['status'] == 'exposed' and request['target'] in nodes and incoming and not missing and not failed
            assert all(paths[e['id']].get('data-route-valid') == 'true' for i in incoming for e in physical[i])
    return len(annotations)


def main():
    report = read(OUT / 'render-report.json')
    documents, results = {}, []
    for row in report['rows']:
        for field in ['svg', 'document']:
            assert sha(OUT / row[field]) == row[field + '_sha256']
        document = read(OUT / row['document'])
        assert document['ir'] == read(ROOT / row['input'])
        count = verify(document, ET.parse(OUT / row['svg']))
        documents[row['name']] = document
        results.append({'name': row['name'], 'role_source_annotations': count, 'passed': True})
    comparisons = []
    for pair in report['comparisons']:
        a, b = [documents[pair['name'] + '-' + suffix] for suffix in ['before', 'current']]
        qa, qb = [d['diagnostics']['publication'] for d in [a, b]]
        removed = {r['node'] for r in b['layout'].get('frame_ownership', []) if r['kind'] == 'role-source'}
        by_a, by_b = [{n['id']: n for n in d['layout']['nodes']} for d in [a, b]]
        assert by_a.keys() - removed == by_b.keys()
        assert all(by_a[i]['expanded'] for i in removed)
        fields = ['id', 'source', 'target', 'source_port', 'target_port', 'originals', 'bundle_members', 'kind', 'condition']
        edges = lambda d: [{k: e[k] for k in fields if k in e} for e in d['layout']['edges']]
        assert edges(a) == edges(b) and a['ir'] == b['ir']
        assert a['publication']['open'] == b['publication']['open'] and a['publication']['boundary'] == b['publication']['boundary']
        assert a['publication']['role_frontier'] == b['publication']['role_frontier']
        assert a['layout']['edge_accounting'] == b['layout']['edge_accounting']
        strip = lambda d: {k: [i for i in ids if i not in removed] for k, ids in d['layout']['node_accounting'].items()}
        assert strip(a) == strip(b)
        if removed:
            assert qb['native_width_px'] <= qa['native_width_px'] and qb['native_height_px'] <= qa['native_height_px']
            assert qb['native_width_px'] * qb['native_height_px'] < .98 * qa['native_width_px'] * qa['native_height_px']
            assert qb['wire_length'] <= qa['wire_length']
            for metric in ['crossings']:
                assert qb['line_geometry'][metric] <= qa['line_geometry'][metric]
            assert len(qb['line_geometry']['unrelated_contacts']) <= len(qa['line_geometry']['unrelated_contacts'])
            receipt = b['diagnostics']['routing']['role_source_frame_refinement']
            assert receipt == pair['refinement'] and receipt['accepted'] and receipt['facts_preserved']
            for key, q in [('before', qa), ('candidate', qb)]:
                assert receipt[key]['width'] == q['native_width_px'] and receipt[key]['height'] == q['native_height_px']
                assert receipt[key]['crossings'] == q['line_geometry']['crossings'] and receipt[key]['wire_length'] == q['wire_length']
        else:
            assert pair['svg_unchanged']
        comparisons.append({'name': pair['name'], 'removed_frames': sorted(removed), 'same_operations_and_bindings': True, 'passed': True})
    result = {'schema': 'role-source-frame-receipts/1', 'render_report_sha256': sha(OUT / 'render-report.json'), 'rows': results, 'comparisons': comparisons}
    (OUT / 'receipt-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'comparisons': len(comparisons), 'passed': True}))


if __name__ == '__main__':
    main()

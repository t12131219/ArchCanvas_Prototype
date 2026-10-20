"""Recheck exact role references and actual incoming SVG paths independently."""
import hashlib
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / (sys.argv[1] if len(sys.argv) > 1 else 'verification/role-paths/current')
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
r = json.loads((OUT / 'render-report.json').read_text())
for file, digest in r['implementation_sha256'].items():
    assert sha(ROOT / file) == digest, file
results = []
for row in r['rows']:
    doc = json.loads((OUT / row['document']).read_text())
    assert sha(OUT / row['document']) == row['document_sha256']
    assert sha(OUT / row['svg']) == row['svg_sha256']
    assert doc['ir'] == json.loads((ROOT / row['input']).read_text())
    for field, objects in [('node_accounting', doc['ir']['nodes']), ('edge_accounting', doc['ir']['edges'])]:
        ids = sum(doc['layout'][field].values(), [])
        assert len(ids) == len(set(ids)) and set(ids) == {o['id'] for o in objects}
    tree = ET.fromstring((OUT / row['svg']).read_text())
    nodes = {e.get('data-node-id') for e in tree.iter() if e.get('data-node-id')}
    paths = {e.get('data-edge-id'): e for e in tree.iter() if e.get('data-edge-id')}
    contracts = {c['id']: c for c in doc['architecture']['semantic_contracts']}
    frontier = doc['publication'].get('role_frontier', {})
    def resolve(cert, keys):
        value = cert['roles'] if cert else None
        for key in keys:
            value = value.get(key) if isinstance(value, dict) else value[int(key)] if isinstance(value, list) and key.isdigit() and int(key) < len(value) else None
        return value
    exact_roles = 0
    if frontier.get('rule_version') == 'role-frontier/3':
        identities = set()
        for role in frontier['roles']:
            keys = role['role_keys']
            assert isinstance(keys, list) and all(isinstance(key, str) for key in keys)
            cert = contracts[role['certificate']]
            assert cert['node'] == role['owner'] and resolve(cert, keys) == role['node']
            assert role['role'] == '.'.join(keys)
            identity = json.dumps([role['owner'], role['certificate'], keys], ensure_ascii=False)
            assert identity not in identities
            identities.add(identity); exact_roles += 1
    physical = {}
    for edge in doc['layout']['edges']:
        assert edge['id'] in paths
        for member in edge.get('bundle_members', [edge]):
            for identity in {member['id'], *member.get('originals', [])}:
                physical.setdefault(identity, []).append(edge)
    for req in doc['publication'].get('role_frontier', {}).get('path_requests', []):
        cert = contracts.get(req['certificate'])
        value = resolve(cert, req['role'])
        if req['selection'] == 'selected':
            assert cert['node'] == req['node'] and value == req['target']
        incoming = [e['id'] for e in doc['ir']['edges'] if e['target'] == req['target'] and e['kind'] in ['data', 'alias', 'interface-binding']]
        missing = [e for e in incoming if e not in physical]
        failed = [e for e in incoming if any(not edge['route']['ok'] for edge in physical.get(e, []))]
        check = req['operand_check']
        assert check['edges'] == incoming and check['missing_edges'] == missing and check['route_failures'] == failed
        ok = req['status'] == 'exposed' and bool(incoming) and not missing and not failed
        assert (check['status'] == 'fulfilled') == ok
        if ok:
            assert req['target'] in nodes
            for identity in incoming:
                for edge in physical[identity]:
                    assert paths[edge['id']].get('data-route-valid') == 'true'
        # Source/control ownership still comes from canonical IR. A selected
        # path cannot relabel an unknown/effect node or delete any source fact.
    results.append({'name': row['name'], 'requests': len(frontier.get('path_requests', [])), 'exact_role_identities': exact_roles, 'passed': True})
(OUT / 'receipt-report.json').write_text(json.dumps({'schema': 'role-path-receipts/1', 'render_report_sha256': sha(OUT / 'render-report.json'), 'rows': results}, indent=2) + '\n')
print(json.dumps({'panels': len(results), 'passed': True}))

"""Independently verify local refinement ownership and actual SVG exposure."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-details/current'


def main():
    global OUT
    if '--adaptive' in sys.argv:
        OUT = ROOT / 'verification/adaptive-frontier/current'
    if '--trees' in sys.argv:
        OUT = ROOT / 'verification/dependency-trees/current'
    if '--reservations' in sys.argv:
        OUT = ROOT / 'verification/frontier-reservations/current'
    if '--dags' in sys.argv:
        OUT = ROOT / 'verification/dependency-dags/current'
    if '--summary-coverage' in sys.argv:
        OUT = ROOT / 'verification/summary-coverage/current'
    report = json.loads((OUT / 'render-report.json').read_text())
    results = []
    for row in report['rows']:
        doc = json.loads((OUT / row['document']).read_text())
        planned = {n['id']: n for n in doc['architecture']['nodes']}
        certs = {c['id']: c for c in doc['ir'].get('semantic_contracts', [])}
        layout = {n['id']: n for n in doc['layout']['nodes']}
        svg = ET.parse(OUT / row['svg'])
        nodes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
        receipt = doc['publication']['role_frontier']
        assert receipt == row['role_frontier']
        owners = {m['node'] for m in receipt['modules']}
        requested = doc['publication'].get('adaptive_frontier', {}).get('selected_role_details', row['state'].get('paperRoleDetails', []))
        assert {r['node'] for r in receipt['detail_requests']} == set(requested)

        def guarded(n):
            return (any(n.get(k) for k in ['contract_stage', 'condition', 'mutable', 'identity_display', 'observed_calls', 'runtime_evidence'])
                    or n.get('kind') in ['opaque', 'control'] or n.get('evidence_status') == 'runtime-only'
                    or n.get('semantic_type') in ['conditional-region', 'conditional-collection', 'loop-template', 'iteration-region',
                                                  'observed-variant', 'serial-repeat', 'repeat-instance', 'serial-remainder'])

        for request in receipt['detail_requests']:
            node = request['node']
            assert request['reason']
            expanded = layout.get(node, {}).get('expanded', False)
            assert (request['status'] == 'expanded') == (request['selection'] == 'selected' and expanded)
            if request['selection'] != 'selected':
                continue
            assert node in owners and not guarded(planned[node])
            assert any(c['node'] == node for c in certs.values())
            at = planned[node].get('parent')
            while at and at not in owners:
                assert not guarded(planned[at])
                assert not any(c['node'] == at for c in certs.values()), 'skipped unselected certificate'
                at = planned[at].get('parent')
            if at:
                assert not guarded(planned[at])
        for role in receipt['roles']:
            cert = certs[role['certificate']]
            assert cert['node'] == role['owner'] and role['owner'] in owners
            value = cert['roles']
            for k in role['role'].split('.'):
                value = value[int(k)] if isinstance(value, list) else value[k]
            assert value == role['node'] and cert['scope'] == role['scope']
            if role['status'] == 'exposed':
                assert role['node'] in nodes
        results.append({'name': row['name'], 'ownership_preserved': True, 'requests': len(receipt['detail_requests'])})
    result = {'schema': 'role-detail-receipts/1', 'render_report_sha256': hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest(),
              'results': results, 'passed': True}
    (OUT / 'receipt-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

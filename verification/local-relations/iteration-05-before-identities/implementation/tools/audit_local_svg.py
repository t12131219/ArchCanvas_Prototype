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


def main():
    report_file = 'iteration-report.json' if '--iterations' in sys.argv else 'holdout-report.json' if '--holdout' in sys.argv else 'render-report.json'
    report = json.loads((OUT / report_file).read_text())
    results = []
    for row in report['rows']:
        source = OUT / row['svg']
        assert hashlib.sha256(source.read_bytes()).hexdigest() == row['svg_sha256']
        document = json.loads((OUT / row['document']).read_text())
        canonical = {e['id']: e for e in document['ir']['edges']}
        tree = ET.parse(source)
        nodes = {e.attrib['data-node-id']: e for e in tree.iter() if 'data-node-id' in e.attrib}
        paths = {e.attrib['data-edge-id']: e for e in tree.iter() if 'data-edge-id' in e.attrib}
        assert len(nodes) == row['nodes']
        assert len(paths) == row['edges']
        measured = {p['id']: p for p in document['layout']['nodes']}
        edge_layout = {e['id']: e for e in document['layout']['edges']}
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
        results.append({'name': row['name'], 'nodes': len(nodes), 'paths': len(paths), 'passed': True})
    output = {'schema': 'local-svg-audit/1', 'render_report_sha256': hashlib.sha256((OUT / report_file).read_bytes()).hexdigest(), 'results': results,
              'scope': 'XML counts, orthogonal paths, physical terminals, canonical operands and bundle members, exact region cuts, relation references and claimed reserved channels.'}
    (OUT / ('iteration-svg-report.json' if '--iterations' in sys.argv else 'holdout-svg-report.json' if '--holdout' in sys.argv else 'svg-report.json')).write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

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


def main():
    global OUT
    if '--symbolic' in sys.argv:
        OUT = ROOT / 'verification/symbolic-values/current'
    if '--canvas' in sys.argv:
        OUT = ROOT / 'verification/canvas-medium/current'
    if '--inline' in sys.argv:
        OUT = ROOT / 'verification/inline-sequences/current'
    report_file = 'representative-atlas-report.json' if '--atlases' in sys.argv else 'repeat-report.json' if '--repeats' in sys.argv else 'identity-report.json' if '--identities' in sys.argv else 'iteration-report.json' if '--iterations' in sys.argv else 'holdout-report.json' if '--holdout' in sys.argv else 'render-report.json'
    report = json.loads((OUT / report_file).read_text())
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
        canonical = {e['id']: e for e in document['ir']['edges']}
        tree = ET.parse(source)
        if '--canvas' in sys.argv or '--inline' in sys.argv:
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
        results.append({'name': row['name'], 'nodes': len(nodes), 'paths': len(paths), 'passed': True})
    output = {'schema': 'local-svg-audit/1', 'render_report_sha256': hashlib.sha256((OUT / report_file).read_bytes()).hexdigest(), 'results': results,
              'scope': 'XML counts, orthogonal paths, physical terminals, canonical operands and bundle members, exact region cuts, relation references and claimed reserved channels.'}
    (OUT / ('representative-atlas-svg-report.json' if '--atlases' in sys.argv else 'repeat-svg-report.json' if '--repeats' in sys.argv else 'identity-svg-report.json' if '--identities' in sys.argv else 'iteration-svg-report.json' if '--iterations' in sys.argv else 'holdout-svg-report.json' if '--holdout' in sys.argv else 'svg-report.json')).write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

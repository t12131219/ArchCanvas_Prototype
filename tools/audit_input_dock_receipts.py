"""Check dock receipts against actual SVG transforms, paths and exact uses."""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/input-docks/current'


def verify(document, tree):
    nodes = {n['id']: n for n in document['layout']['nodes']}
    planned = {n['id']: n for n in document['architecture']['nodes']}
    edges = {e['id']: e for e in document['layout']['edges']}
    drawn = {}
    for e in tree.iter():
        if 'data-node-id' in e.attrib:
            drawn.setdefault(e.attrib['data-node-id'], []).append(e)
    paths = {e.attrib['data-edge-id']: e for e in tree.iter() if e.tag.endswith('path') and 'data-edge-id' in e.attrib}
    docks = document['layout'].get('input_docks', [])
    for dock in docks:
        node, parent = nodes[dock['node']], nodes[dock['parent']]
        source = planned[dock['node']]
        assert source['kind'] == 'interface' and source['role'] == 'input'
        assert source['parent'] == dock['parent']
        assert len(drawn[dock['node']]) == 1
        transform = re.fullmatch(r'translate\(([-\d.eE+]+),([-\d.eE+]+)\)', drawn[dock['node']][0].attrib['transform'])
        assert transform
        xy = list(map(float, transform.groups()))
        assert xy == [node['x'], node['y']]
        assert node['x'] >= parent['x'] and node['y'] >= parent['y'] + parent['header']
        assert node['x'] + node['w'] <= parent['x'] + parent['w']
        assert node['y'] + node['h'] <= parent['y'] + parent['h']
        assert dock['estimated_after'] <= dock['estimated_before'] * .85
        uses = [e for e in edges.values() if e['source'] == dock['node']]
        assert dock['edges'] == [{k: e[k] for k in ['target', 'source_port', 'target_port']} | {'edge': e['id']} for e in uses]
        assert len(uses) >= 2 and not any(e['target'] == dock['node'] for e in edges.values())
        for e in uses:
            assert e['id'] in paths and e['route']['ok'] and not e.get('design_route') and not e.get('layout_after')
            for member in e.get('bundle_members', [e]):
                assert member['kind'] in ['data', 'alias', 'interface-binding'] and not member.get('condition') and not member.get('iteration')
        for region in dock['regions']:
            other = nodes[region]
            assert node['x'] + node['w'] <= other['x'] if dock['side'] == 'left' else node['x'] >= other['x'] + other['w']
        for id, other in nodes.items():
            if id == dock['node'] or planned[id].get('parent') != dock['parent']:
                continue
            assert node['x'] + node['w'] <= other['x'] or other['x'] + other['w'] <= node['x'] or node['y'] + node['h'] <= other['y'] or other['y'] + other['h'] <= node['y']
        assert dock['geometry_verified'] and dock['routes_verified']
    for entry in document['layout'].get('context_lanes', []):
        if entry.get('method') != 'direct-docked-entry':
            continue
        edge = edges[entry['edge']]
        points = [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', paths[edge['id']].attrib['d'])]
        assert len(points) == 2 and points[0][1] == points[1][1]
        assert entry['status'] == 'realized' and edge['route']['target_side'] == entry['side']
        assert any(d['node'] == edge['source'] and any(u['edge'] == edge['id'] for u in d['edges']) for d in docks)
    return len(docks)


if __name__ == '__main__':
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = []
    for row in report['rows']:
        document = json.loads((OUT / row['document']).read_text())
        rows.append({'name': row['name'], 'docks': verify(document, ET.parse(OUT / row['svg']))})
    result = {'schema': 'input-dock-receipts/1', 'render_report_sha256': hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest(), 'rows': rows}
    (OUT / 'receipt-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'svg_panels': len(rows), 'docks': sum(r['docks'] for r in rows)}))

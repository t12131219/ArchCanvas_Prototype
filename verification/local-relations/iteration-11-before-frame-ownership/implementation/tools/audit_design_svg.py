#!/usr/bin/env python3
"""Inspect actual exported SVG, independently of the JavaScript router.

Checks serialized paths/endpoints, frame paint order, title intersections and
canonical edge references. Browser text metrics and visual review are separate.
"""
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/semantic-design/current'
NS = {'s': 'http://www.w3.org/2000/svg'}
NUM = r'-?\d+(?:\.\d+)?(?:e[+-]?\d+)?'


def points(text):
    assert not re.sub(NUM + r'|[ML,\s]', '', text, flags=re.I), 'unsupported SVG path command'
    values = list(map(float, re.findall(NUM, text, re.I)))
    assert len(values) % 2 == 0
    return list(zip(values[::2], values[1::2]))


def segment_box(a, b, box):
    x, y, w, h = box
    eps = 1e-6
    if abs(a[0] - b[0]) < eps:
        return x+eps < a[0] < x+w-eps and max(a[1], b[1]) > y+eps and min(a[1], b[1]) < y+h-eps
    assert abs(a[1] - b[1]) < eps, 'nonorthogonal data path'
    return y+eps < a[1] < y+h-eps and max(a[0], b[0]) > x+eps and min(a[0], b[0]) < x+w-eps


def endpoint(point, group, position):
    x, y = position['x'], position['y']
    circle = group.find('s:circle', NS)
    if circle is not None:
        cx, cy, radius = (float(circle.get(k)) for k in ('cx', 'cy', 'r'))
        # Shape radius is 23 whereas layout terminals use its 24-unit envelope.
        return abs(math.hypot(point[0]-x-cx, point[1]-y-cy) - radius) <= 1.01
    w, h = position['w'], position['h']
    eps = 1e-5
    return ((abs(point[0]-x) < eps or abs(point[0]-x-w) < eps) and y-eps <= point[1] <= y+h+eps or
            (abs(point[1]-y) < eps or abs(point[1]-y-h) < eps) and x-eps <= point[0] <= x+w+eps or
            position.get('expanded') and abs(point[1]-y-position.get('header', 0)+10) < eps)


def inspect(svg_file, document):
    tree = ET.parse(svg_file).getroot()
    positions = {n['id']: n for n in document['layout']['nodes']}
    planned = {e['id']: e for e in document['layout']['edges']}
    groups = {g.get('data-node-id'): g for g in tree.findall('.//s:g[@data-node-id]', NS)}
    assert groups.keys() == positions.keys(), 'actual SVG node set differs'
    paint_order = {identity: index for index, identity in enumerate(groups)}
    semantic_nodes = {n['id']: n for n in document['architecture']['nodes']}
    for identity, group in groups.items():
        position = positions[identity]
        translation = re.fullmatch(r'translate\((' + NUM + '),(' + NUM + r')\)', group.get('transform', ''), re.I)
        assert translation and tuple(map(float, translation.groups())) == (position['x'], position['y'])
        parent = semantic_nodes[identity].get('parent')
        if parent in positions:
            assert paint_order[parent] < paint_order[identity], 'parent paint covers child: ' + identity
    actual_edges = tree.findall('.//s:path[@data-edge-id]', NS)
    assert {p.get('data-edge-id') for p in actual_edges} == planned.keys()
    title_collisions = []
    for path in actual_edges:
        identity = path.get('data-edge-id'); edge = planned[identity]
        ps = points(path.get('d'))
        assert ps == [(p['x'], p['y']) for p in edge['route']['points']], 'serialized path differs'
        assert endpoint(ps[0], groups[edge['source']], positions[edge['source']]), 'source endpoint is not on its node'
        assert endpoint(ps[-1], groups[edge['target']], positions[edge['target']]), 'target endpoint is not on its node'
        if edge.get('bundle_members'):
            members = edge['bundle_members']
            assert json.loads(path.get('data-bundle-members')) == [m['id'] for m in members]
            assert json.loads(path.get('data-bundle-endpoints')) == [
                {'id': m['id'], 'source': m['canonical_source'], 'target': m['canonical_target']}
                for m in members]
            assert path.get('data-canonical-source') is None and path.get('data-canonical-target') is None
        else:
            assert path.get('data-canonical-source') == edge['canonical_source']
            assert path.get('data-canonical-target') == edge['canonical_target']
        for group_id, group in groups.items():
            p = positions[group_id]
            if not p.get('expanded'):
                continue
            # Actual baseline positions/font sizes, not router's obstacle list.
            # Include the full line ascent/descent and a four-unit margin.
            for text in group.findall('s:text', NS):
                base_y = float(text.get('y')); current = base_y
                font = float(text.get('font-size', 13))
                for span in text.findall('s:tspan', NS):
                    current += float(span.get('dy', 0))
                    band = (p['x'], p['y']+current-font-2, p['w'], font+6)
                    if any(segment_box(a, b, band) for a, b in zip(ps, ps[1:])):
                        title_collisions.append({'edge': identity, 'node': group_id, 'text': span.text})
    return {'svg': str(svg_file.relative_to(OUT)), 'nodes': len(groups), 'edges': len(actual_edges), 'title_collisions': title_collisions}


def main():
    render = json.loads((OUT / 'render-report.json').read_text())
    results, errors = [], []
    for row in render['results']:
        if row['name'].endswith('-before'):
            continue
        try:
            document = json.loads((OUT / row['document']).read_text())
            results.append(inspect(OUT / row['svg'], document))
        except Exception as error:
            errors.append({'name': row['name'], 'error': str(error)})
    report = {'schema': 'semantic-design-svg-audit/1', 'panels': len(results), 'errors': errors,
              'title_collisions': sum(len(r['title_collisions']) for r in results), 'results': results,
              'scope': 'actual SVG serialization, transforms, frame order, canonical endpoints and title baselines; not browser text-width measurement'}
    (OUT / 'svg-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ('panels', 'title_collisions', 'errors')}))
    if errors or report['title_collisions']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()

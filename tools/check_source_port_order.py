"""Verify actual XML terminal permutations and unchanged canonical use bindings."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import check_transform_configurations as content
from check_shared_fanouts import points

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/source-port-order/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def inspect_controlled(capture, name):
    """Geometry fixtures have no semantic-goal producer; do not claim coverage."""
    for key in ['svg', 'document']:
        assert sha(OUT / capture[key]) == capture[key + '_sha256']
    doc = read(OUT / capture['document'])
    assert 'expression_goals' not in doc and 'expression_coverage' not in doc
    svg = ET.parse(OUT / capture['svg']).getroot()
    shapes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
    assert shapes.keys() == {p['id'] for p in doc['layout']['nodes']}
    assert list(map(float, svg.get('viewBox').split())) == [doc['layout']['bounds'][k] for k in ['x', 'y', 'w', 'h']]
    for p in doc['layout']['nodes']:
        shape = next(e for e in shapes[p['id']] if e.tag.endswith('rect'))
        assert float(shape.get('width')) == p['w'] and float(shape.get('height')) == p['h']
        assert shapes[p['id']].get('transform') == f"translate({p['x']},{p['y']})"
    _, intrusions = content.passages(doc, svg)
    assert not intrusions, (name, intrusions)
    # Reuse only the independent path geometry calculation. Its empty goal
    # loop is explicit here and does not write or alter the captured document.
    geometry = content.geometry
    geometry.OUT = OUT
    original_read = geometry.read
    try:
        geometry.read = lambda _: {**doc, 'expression_goals': {'goals': []}, 'expression_coverage': []}
        geometry.inspect({**capture, 'name': name})
    finally:
        geometry.read = original_read
    for key, canonical in [('node_accounting', doc['ir']['nodes']), ('edge_accounting', doc['ir']['edges'])]:
        ids = [id for group in doc['layout'][key].values() for id in group]
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in canonical}
    return doc, set(), 0


def compare(a, b, sa, sb):
    for key in ['ir', 'architecture', 'publication', 'expression_goals', 'expression_coverage', 'summary_goals', 'summary_coverage']:
        assert a.get(key) == b.get(key), ('semantic state changed', key)
    for key in ['nodes', 'bounds', 'node_accounting', 'edge_accounting', 'representatives', 'frame_ownership', 'labels', 'shared_fanouts']:
        assert a['layout'].get(key) == b['layout'].get(key), ('geometry/accounting changed', key)
    old = {e['id']: e for e in a['layout']['edges']}
    new = {e['id']: e for e in b['layout']['edges']}
    actual = {e.get('data-edge-id'): e for e in sb.iter() if e.get('data-edge-id')}
    pa, pb = points(sa), points(sb)
    assert pa.keys() == pb.keys() == old.keys() == new.keys()
    for paths, edges in [(pa, old), (pb, new)]:
        for id, ps in paths.items():
            assert ps == [(p['x'], p['y']) for p in edges[id]['route']['points']], ('SVG route differs', id)
            assert all(a[0] == b[0] or a[1] == b[1] for a, b in zip(ps, ps[1:])), ('nonorthogonal route', id)
    selected = b['diagnostics']['routing'].get('source_port_order', {}).get('selected', [])
    touched = set()
    for row in selected:
        ids = row['edges']; assert len(ids) == 2 and not touched.intersection(ids)
        touched.update(ids)
        assert all(new[id]['source'] == row['source'] for id in ids)
        starts = [pa[id][0] for id in ids]
        assert [pb[id][0] for id in ids] == starts[::-1]
        assert starts == [(p['x'], p['y']) for p in row['before']]
        assert [pb[id][0] for id in ids] == [(p['x'], p['y']) for p in row['after']]
        for id in ids:
            e = new[id]
            assert e['route']['source_side'] == row['side']
            assert pa[id][2:] == pb[id][2:], ('later bend changed', id)
            # Verify the endpoint still lies on the actual source's boundary.
            p = next(p for p in b['layout']['nodes'] if p['id'] == row['source'])
            x, y = pb[id][0]
            assert not p.get('symbol') and not p.get('expanded')
            if row['side'] in ['top', 'bottom']:
                assert p['x'] <= x <= p['x'] + p['w'] and y == p['y'] + (p['h'] if row['side'] == 'bottom' else 0)
            else:
                assert p['y'] <= y <= p['y'] + p['h'] and x == p['x'] + (p['w'] if row['side'] == 'right' else 0)
    for id, e in new.items():
        attrs = [('data-source-port',e.get('source_port') or ''),('data-target-port',e.get('target_port') or '')]
        if e.get('bundle_members') is None:
            attrs += [('data-canonical-source',e.get('canonical_source') or ''),('data-canonical-target',e.get('canonical_target') or '')]
        else:
            assert json.loads(actual[id].get('data-bundle-members')) == [m['id'] for m in e['bundle_members']]
            assert json.loads(actual[id].get('data-bundle-endpoints')) == [dict(id=m['id'],source=m['canonical_source'],target=m['canonical_target'])for m in e['bundle_members']]
        for attr, value in attrs:
            assert actual[id].get(attr) == value, ('SVG binding',id,attr)
        assert json.loads(actual[id].get('data-semantic-bindings')) == e.get('semantic_bindings',[])
        assert {k: v for k, v in e.items() if k != 'route'} == {k: v for k, v in old[id].items() if k != 'route'}, ('canonical edge changed', id)
        assert e['route']['source_side'] == old[id]['route']['source_side'] and e['route']['target_side'] == old[id]['route']['target_side']
        assert pa[id][-1] == pb[id][-1]
        if id not in touched:
            assert pa[id] == pb[id], ('distant path changed', id)
    texts = lambda svg: {e.get('data-node-id'): [ET.tostring(t, encoding='unicode') for t in e if t.tag.endswith('text')] for e in svg.iter() if e.get('data-node-id')}
    assert texts(sa) == texts(sb)
    applied = {r['id'] for r in a['layout']['constraint_receipts'] if r['status'] == 'applied'}
    assert applied <= {r['id'] for r in b['layout']['constraint_receipts'] if r['status'] == 'applied'}
    return len(selected)


if __name__ == '__main__':
    reports = [read(OUT / 'small-report.json')] + [read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    hashes = reports[0]['implementation_sha256']
    for file, digest in hashes.items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    content.OUT = OUT
    rows = []
    for report in reports:
        assert report['implementation_sha256'] == hashes
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            inspect = inspect_controlled if row.get('kind') == 'controlled-geometry' else content.inspect
            captures = [inspect(r, row['name'] + '-' + r['suffix']) for r in row['results']]
            (a, ga, ca), (b, gb, cb) = captures
            for source in b['ir'].get('sources', []):
                assert sha(Path(source['physical'])) == source['sha256'], ('stale source',source['physical'])
            count = compare(a, b, ET.parse(OUT / row['results'][0]['svg']).getroot(), ET.parse(OUT / row['results'][1]['svg']).getroot())
            assert ga == gb and ca == cb
            qa, qb = [r['quality'] for r in row['results']]
            assert qb['line_geometry']['crossings'] <= qa['line_geometry']['crossings']
            assert qb['wire_length'] <= qa['wire_length']
            assert [qb[k] for k in ['native_width_px', 'native_height_px']] == [qa[k] for k in ['native_width_px', 'native_height_px']]
            if not count:
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'],kind=row['kind'] if 'kind' in row else 'source',selected_pairs=count,
                             crossings_before=qa['line_geometry']['crossings'],crossings_current=qb['line_geometry']['crossings'],
                             wire_before=qa['wire_length'],wire_current=qb['wire_length'],direct_goals=len(gb)))
    result = dict(passed=True,svg_count=len(rows)*2,implementation_sha256=hashes,rows=rows,goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result['rows'],indent=2))

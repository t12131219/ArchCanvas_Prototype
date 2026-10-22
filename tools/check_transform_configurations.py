"""Independently read source AST, real SVG text/paths and canonical bindings."""
import ast
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/transform-configurations/current'
sys.path.insert(0, str(ROOT / 'tools'))
from audit_diagram_assignments import assignments
from check_title_passages import passages
import audit_adaptive_frontier as geometry
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
trees = {}


def check_literal(ir, row):
    nodes = {n['id']: n for n in ir['nodes']}
    n = nodes[row['node']]
    source = n['source'][0]
    path = source['file']
    unit, = [s for s in ir['sources'] if s['path'] == path]
    assert sha(Path(unit['physical'])) == unit['sha256']
    if path not in trees:
        trees[path] = list(ast.walk(ast.parse(Path(path).read_text())))
    call, = [a for a in trees[path] if isinstance(a, ast.Call) and
             (a.lineno, a.col_offset, a.end_lineno, a.end_col_offset) ==
             (source['line'], source['column'], source['end_line'], source['end_column'])]
    assert isinstance(call.func, ast.Attribute) and call.func.attr == row['method']
    edges = [e for e in ir['edges'] if e['target'] == n['id']]
    edge, = edges
    assert edge['id'] == row['receiver_edge'] and edge['kind'] in ['data', 'alias', 'interface-binding']
    assert not edge.get('condition') and not edge.get('iteration')
    offset = 0 if edge['target_port'] == 'receiver' else 1
    assert edge['target_port'] in ['receiver', 'arg:0']
    expected = [('arg:' + str(i), a) for i, a in enumerate(call.args) if i >= offset]
    expected += [('kw:' + k.arg, k.value) for k in call.keywords]
    assert len(expected) == len(row['slots'])
    values = []
    for (port, syntax), slot in zip(expected, row['slots']):
        value = ast.literal_eval(syntax)
        assert type(value) is int or isinstance(value, (tuple, list)) and all(type(v) is int for v in value)
        value = list(value) if isinstance(value, tuple) else value
        assert port == slot['port'] and value == slot['value']
        actual = n['arguments']['args'][int(port[4:])] if port.startswith('arg:') else n['arguments']['kwargs'][port[3:]]
        assert value == actual
        values.append((port, value))
    fmt = lambda v: '[' + ', '.join(map(str, v)) + ']' if isinstance(v, list) else str(v)
    text = call.func.attr + '(' + ', '.join((p[3:] + '=' if p.startswith('kw:') else '') + fmt(v) for p, v in values) + ')'
    assert text == row['text']
    while n:
        assert n['evidence_status'] == 'static-only' and n['kind'] not in ['opaque', 'control']
        assert not any(n.get(k) for k in ['mutable', 'condition', 'runtime_evidence', 'identity_display', 'observed_calls'])
        n = nodes.get(n.get('parent'))


def inspect(capture, name, operation_checker=check_literal, *, require_quality=True):
    for key in ['svg', 'document']:
        assert sha(OUT / capture[key]) == capture[key + '_sha256']
    doc = read(OUT / capture['document'])
    svg = ET.parse(OUT / capture['svg']).getroot()
    shapes = {n.get('data-node-id'): n for n in svg.iter() if n.get('data-node-id')}
    assert shapes.keys() == {n['id'] for n in doc['layout']['nodes']}
    assert list(map(float, svg.get('viewBox').split())) == [doc['layout']['bounds'][k] for k in ['x', 'y', 'w', 'h']]
    for p in doc['layout']['nodes']:
        node = shapes[p['id']]
        assert list(map(float, re.findall(r'-?[\d.eE+]+', node.get('transform').removeprefix('translate')))) == [p['x'], p['y']]
        shape = next(c for c in node if c.tag.endswith(('rect', 'circle', 'path')))
        if shape.tag.endswith('rect'):
            assert float(shape.get('width')) == p['w'] and float(shape.get('height')) == p['h']
    _, intrusions = passages(doc, svg)
    assert not intrusions, (name, intrusions)
    geometry.OUT = OUT
    geometry.inspect({**capture, 'name': name})
    goals = doc['expression_goals']['goals']
    exact = {g['id'] for g, ok in zip(goals, assignments(doc['ir'], goals, {**doc, 'quality': capture['quality']}, svg, require_quality=require_quality)) if ok}
    assert exact == {r['goal'] for r in doc['expression_coverage'] if r['status'] == 'fulfilled'}
    normalized = lambda s: re.sub(r'\s', '', s)
    count = 0
    for row in doc['publication'].get('transform_configurations', {}).get('rows', []):
        node = shapes[row['node']]
        printed = normalized(''.join(''.join(c.itertext()) for c in node if c.tag.endswith('text')))
        owner = next(n for n in doc['architecture']['nodes'] if n['id'] == row['node'])
        assert owner['transform_configurations'] == row['operations']
        for operation in row['operations']:
            operation_checker(doc['ir'], operation)
            assert normalized(operation['display_text']) in printed
            count += 1
    for key, canonical in [('node_accounting', doc['ir']['nodes']), ('edge_accounting', doc['ir']['edges'])]:
        ids = [id for group in doc['layout'][key].values() for id in group]
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in canonical}
    return doc, exact, count


if __name__ == '__main__':
    files = ['small-report.json'] + [f'Transformer-panel-{i}-report.json' for i in range(3)]
    reports = [read(OUT / f) for f in files]
    hashes = reports[0]['implementation_sha256']
    for f, h in hashes.items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    rows = []
    for report in reports:
        assert report['implementation_sha256'] == hashes
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            captures = [inspect(r, row['name'] + '-' + r['suffix']) for r in row['results']]
            (a, old, _), (b, new, count) = captures
            assert a['ir'] == b['ir'] and old <= new
            strip = lambda ns: [{k: v for k, v in n.items() if k not in ['paper', 'transform_configurations']} for n in ns]
            assert strip(a['architecture']['nodes']) == strip(b['architecture']['nodes'])
            for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
                assert a['layout'].get(key) == b['layout'].get(key)
            assert a['summary_coverage'] == b['summary_coverage'] and a['expression_goals'] == b['expression_goals']
            descriptor = lambda d: [{k: v for k, v in e.items() if k != 'route'} for e in d['layout']['edges']]
            assert descriptor(a) == descriptor(b)
            applied = {r['id'] for r in a['layout']['constraint_receipts'] if r['status'] == 'applied'}
            assert applied <= {r['id'] for r in b['layout']['constraint_receipts'] if r['status'] == 'applied'}
            qa, qb = [r['quality'] for r in row['results']]
            assert not qb['route_failures'] and not qb['unplaced_port_labels']
            assert not (set(qb['issues']) - set(qa['issues']))
            if not count:
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'],annotations=count,direct_before=len(old),direct_current=len(new),
                dimensions_before=[qa['native_width_px'],qa['native_height_px']],dimensions_current=[qb['native_width_px'],qb['native_height_px']],
                wire_before=qa['wire_length'],wire_current=qb['wire_length'],crossings_before=qa['line_geometry']['crossings'],crossings_current=qb['line_geometry']['crossings']))
    result = dict(passed=True,svg_count=2*len(rows),implementation_sha256=hashes,rows=rows,goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result['rows'],indent=2))

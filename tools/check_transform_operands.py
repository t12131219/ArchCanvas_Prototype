"""Verify source argument expressions against actual Python AST and SVG bytes."""
import ast
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import check_transform_configurations as content

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/transform-operands/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
trees = {}


def syntax_for(ir, n):
    source, = n['source']
    unit, = [s for s in ir['sources'] if s['path'] == source['file']]
    path = Path(unit['physical'])
    assert sha(path) == unit['sha256']
    if str(path) not in trees:
        trees[str(path)] = list(ast.walk(ast.parse(path.read_text())))
    matches = [a for a in trees[str(path)] if hasattr(a, 'lineno') and
        (a.lineno, a.col_offset, a.end_lineno, a.end_col_offset) ==
        (source['line'], source['column'], source['end_line'], source['end_column'])]
    actual, = matches
    return actual


def exact(e):
    return e['kind'] in ['data', 'alias', 'interface-binding'] and not any(e.get(k) for k in
        ['condition', 'iteration', 'design_route']) and e['evidence'] in ['source-dependency', 'static-source']


def safe(by, n):
    seen = set()
    while n:
        assert n['id'] not in seen
        seen.add(n['id'])
        assert n['evidence_status'] == 'static-only' and n['kind'] not in ['opaque', 'control']
        assert not any(n.get(k) for k in ['mutable', 'condition', 'runtime_evidence', 'observed_calls', 'identity_display'])
        assert not n.get('parent') or n['parent'] in by
        n = by.get(n.get('parent'))


def check_expression(ir, expr, expected, seen=None):
    by = {n['id']: n for n in ir['nodes']}
    seen = set() if seen is None else seen
    assert expr['node'] not in seen and len(seen) < 24
    n = by[expr['node']]
    safe(by, n)
    incoming = [e for e in ir['edges'] if e['target'] == n['id']]
    assert expr['port'] == 'out' and expr['dependencies'] == incoming and all(exact(e) for e in incoming)
    actual = syntax_for(ir, n)
    spelling = actual.arg if isinstance(actual, ast.arg) else ast.unparse(actual)
    assert ast.dump(ast.parse(expr['text'], mode='eval').body) == ast.dump(ast.parse(spelling, mode='eval').body)
    assert ast.dump(ast.parse(expr['text'], mode='eval').body) == ast.dump(ast.parse(ast.unparse(expected), mode='eval').body)
    if expr['kind'] == 'source-reference':
        assert isinstance(actual, (ast.arg, ast.Name, ast.Attribute))
        if n['kind'] == 'state':
            assert n['operator'] == 'attribute' and isinstance(actual, ast.Attribute) and actual.attr == n['attribute_name'] and not incoming
        else:
            assert n['kind'] in ['interface', 'value-alias'] and not n.get('operator') and len(incoming) <= 1
        for e in incoming:
            safe(by, by[e['source']])
    elif expr['kind'] == 'source-arithmetic':
        assert isinstance(actual, ast.BinOp)
        assert type(actual.op).__name__ in ['Add', 'Sub', 'Mult', 'FloorDiv', 'Mod']
        assert expr['operator'] == n['operator'] == dict(Add='add', Sub='sub', Mult='mult', FloorDiv='floordiv', Mod='mod')[type(actual.op).__name__]
        for child, source, port in zip(expr['operands'], [actual.left, actual.right], ['0', '2']):
            edges = [e for e in incoming if e['target_port'] == port]
            if child['kind'] == 'literal':
                assert not edges and type(ast.literal_eval(source)) is int and ast.literal_eval(source) == child['value']
            else:
                e, = edges
                assert e['source'] == child['node'] and e['source_port'] == child['port']
                check_expression(ir, child, source, seen | {n['id']})
    elif expr['kind'] == 'source-subscript':
        assert n['operator'] == 'getitem' and isinstance(actual, ast.Subscript) and type(ast.literal_eval(actual.slice)) is int
        assert ast.literal_eval(actual.slice) == expr['index']
        e, = incoming
        assert e['source'] == expr['base']['node'] and e['source_port'] == expr['base']['port'] and e['target_port'] == 'value'
        check_expression(ir, expr['base'], actual.value, seen | {n['id']})
    elif expr['kind'] == 'source-attribute':
        assert isinstance(actual, ast.Attribute) and n['operator'] == 'attribute' and actual.attr == expr['attribute'] == n['attribute_name']
        e, = incoming
        assert e['source'] == expr['base']['node'] and e['source_port'] == expr['base']['port'] and e['target_port'] == 'in'
        check_expression(ir, expr['base'], actual.value, seen | {n['id']})
    else:
        raise AssertionError(('unexpected expression', expr['kind']))


def check_operation(ir, row):
    if row['rule_version'] != 'transform-operands/1':
        content.check_literal(ir, row)
        return
    by = {n['id']: n for n in ir['nodes']}
    n = by[row['node']]
    safe(by, n)
    call = syntax_for(ir, n)
    assert isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and call.func.attr == row['method']
    incoming = [e for e in ir['edges'] if e['target'] == n['id']]
    assert all(exact(e) for e in incoming)
    receiver, = [e for e in incoming if e['id'] == row['receiver_edge']]
    assert receiver['target_port'] in ['receiver', 'arg:0']
    offset = 0 if receiver['target_port'] == 'receiver' else 1
    expected = [('arg:' + str(i), a) for i, a in enumerate(call.args) if i >= offset]
    expected += [('kw:' + k.arg, k.value) for k in call.keywords]
    assert len(expected) == len(row['slots'])
    assert len(incoming) == 1 + sum('binding' in s for s in row['slots'])
    printed = []
    for (port, source), slot in zip(expected, row['slots']):
        assert port == slot['port']
        if 'binding' in slot:
            e, = [e for e in incoming if e['id'] == slot['binding']['id']]
            assert e == slot['binding'] and e['target_port'] == port and e['source'] == slot['expression']['node']
            assert e['source_port'] == slot['expression']['port']
            check_expression(ir, slot['expression'], source)
            text = slot['expression']['text']
        else:
            value = ast.literal_eval(source)
            assert type(value) is int or isinstance(value, (tuple, list)) and all(type(v) is int for v in value)
            value = list(value) if isinstance(value, tuple) else value
            assert value == slot['value']
            recorded = n['arguments']['args'][int(port[4:])] if port.startswith('arg:') else n['arguments']['kwargs'][port[3:]]
            assert value == recorded
            text = '[' + ', '.join(map(str, value)) + ']' if isinstance(value, list) else str(value)
        printed.append((port[3:] + '=' if port.startswith('kw:') else '') + text)
    assert row['text'] == row['method'] + '(' + ', '.join(printed) + ')'


def check_svg_bindings(capture, doc):
    svg = ET.parse(OUT / capture['svg']).getroot()
    paths = {e.get('data-edge-id'):e for e in svg.iter() if e.get('data-edge-id')}
    assert paths.keys() == {e['id'] for e in doc['layout']['edges']}
    for edge in doc['layout']['edges']:
        path = paths[edge['id']]
        points = [tuple(map(float,p)) for p in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)',path.get('d'))]
        assert points == [(p['x'],p['y']) for p in edge['route']['points']]
        assert all(a[0]==b[0] or a[1]==b[1] for a,b in zip(points,points[1:]))
        for attr in ['source_port','target_port']:
            assert path.get('data-'+attr.replace('_','-')) == (edge.get(attr) or '')
        if edge.get('bundle_members') is None:
            for attr in ['canonical_source','canonical_target']:
                assert path.get('data-'+attr.replace('_','-')) == (edge.get(attr) or '')
        else:
            assert json.loads(path.get('data-bundle-members')) == [m['id'] for m in edge['bundle_members']]
            assert json.loads(path.get('data-bundle-endpoints')) == [dict(id=m['id'],source=m['canonical_source'],target=m['canonical_target']) for m in edge['bundle_members']]
        assert json.loads(path.get('data-semantic-bindings')) == edge.get('semantic_bindings',[])
        lane = edge.get('context_lane')
        assert path.get('data-context-owner') == (lane['owner'] if lane else None)
        assert path.get('data-context-side') == (lane['side'] if lane else None)


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
            captures = [content.inspect(r, row['name'] + '-' + r['suffix'], check_operation) for r in row['results']]
            (a, ga, _), (b, gb, _) = captures
            for capture, (doc, _, _) in zip(row['results'], captures):
                check_svg_bindings(capture, doc)
            assert a['ir'] == b['ir'] and ga <= gb
            for key in ['node_accounting', 'edge_accounting']:
                assert {k: sorted(v) for k,v in a['layout'][key].items()} == {k: sorted(v) for k,v in b['layout'][key].items()}, (row['name'], key)
            assert a['layout'].get('representatives') == b['layout'].get('representatives')
            assert {r['node']:r for r in a['layout'].get('frame_ownership', [])} == {r['node']:r for r in b['layout'].get('frame_ownership', [])}
            # A context lane is an optional drawing route, not a dependency or
            # semantic role. Compare all bindings exactly and report changes
            # to that route separately (its actual SVG attributes checked above).
            descriptor = lambda d: [{k: v for k, v in e.items() if k not in ['route', 'context_lane']} for e in d['layout']['edges']]
            assert descriptor(a) == descriptor(b)
            lane_changes = [dict(edge=x['id'], before=x.get('context_lane'), current=y.get('context_lane'))
                            for x,y in zip(a['layout']['edges'], b['layout']['edges'])
                            if x.get('context_lane') != y.get('context_lane')]
            assert a['expression_goals'] == b['expression_goals'] and a['summary_coverage'] == b['summary_coverage']
            applied = {r['id']: r for r in a['layout']['constraint_receipts'] if r['status'] == 'applied'}
            current_receipts = {r['id']: r for r in b['layout']['constraint_receipts']}
            width_deferrals = []
            for key, prior in applied.items():
                current = current_receipts[key]
                if current['status'] == 'applied':
                    continue
                # Captions can widen just one consumer. Record this actual soft
                # preference regression; do not describe it as preserved, or
                # permit any lost row, endpoint, mapping or hard constraint.
                assert prior['type'] == 'source-group' and prior['strength'] == 'soft'
                assert prior['consumption'] == 'source-alignment' and current['status'] == 'deferred'
                assert prior['mapping'] == current['mapping']
                assert prior['endpoint_preservation'] == current['endpoint_preservation']
                assert all(m['status'] == 'drawn' for m in current['mapping'])
                ids = {m['visible_target'] for m in current['mapping']}
                consumers = [n for n in b['layout']['nodes'] if n['id'] in ids]
                assert len(consumers) == len(ids) > 1
                assert len({n['y'] for n in consumers}) == 1 and len({n['w'] for n in consumers}) > 1
                notes = {n['id'] for n in b['architecture']['nodes'] if any(
                    op['rule_version'] == 'transform-operands/1' for op in n.get('transform_configurations', []))}
                assert ids & notes
                width_deferrals.append(dict(id=key, same_row=True, endpoints_preserved=True,
                                            widths={n['id']: n['w'] for n in consumers}))
            strip = lambda ns: [{k: v for k, v in n.items() if k not in ['paper', 'transform_configurations']} for n in ns]
            assert strip(a['architecture']['nodes']) == strip(b['architecture']['nodes'])
            bound = [op for r in b['publication']['transform_configurations']['rows'] for op in r['operations'] if op['rule_version'] == 'transform-operands/1']
            qa, qb = [r['quality'] for r in row['results']]
            assert not qb['route_failures'] and not qb['unplaced_port_labels']
            assert not (set(qb['issues']) - set(qa['issues']))
            refinement = b['diagnostics']['routing'].get('normal_return_refinement')
            if refinement:
                before, after = refinement['before'], refinement['candidate']
                cost = after['area']/max(1,before['area']) * max(1,after['wire_length'])/max(1,before['wire_length']) * (after['crossings']+4)/(before['crossings']+4)
                preference = refinement['preference']
                assert abs(cost-preference['cost_ratio']) < 1e-10
                bounded = after['width'] <= before['width']*1.05 and after['height'] <= before['height']*1.05 and after['area'] <= before['area']*1.05
                assert bounded == preference['footprint_preserved'] and (cost < 1-1e-9) == preference['benefit']
                if refinement['accepted']:
                    assert bounded and cost < 1-1e-9 and after['wire_length'] <= before['wire_length'] and after['crossings'] <= before['crossings']
                    assert all(refinement[k] for k in ['facts_preserved','direct_goals_preserved','applied_relations_preserved','geometry_preserved'])
                    assert qb['native_width_px'] == after['width'] and qb['native_height_px'] == after['height']
                    assert qb['wire_length'] == after['wire_length'] and qb['line_geometry']['crossings'] == after['crossings']
            if not bound:
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'], source_argument_notes=len(bound),
                dimensions_before=[qa['native_width_px'], qa['native_height_px']], dimensions_current=[qb['native_width_px'], qb['native_height_px']],
                wire_before=qa['wire_length'], wire_current=qb['wire_length'], crossings_before=qa['line_geometry']['crossings'], crossings_current=qb['line_geometry']['crossings'],
                direct_before=len(ga), direct_current=len(gb), equal_width_preferences_deferred=width_deferrals,
                context_route_changes=lane_changes))
    result = dict(passed=True, svg_count=len(rows)*2, implementation_sha256=hashes, rows=rows, goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

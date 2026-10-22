"""Independent physical-source AST, binding and SVG geometry audit."""
import ast
import hashlib
import json
from pathlib import Path
import sys
import check_transform_configurations as content
import check_transform_operands as operands

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/transform-sequences/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
original_expression = operands.check_expression


def check_expression(ir, expr, expected, seen=None):
    if expr['kind'] != 'source-sequence':
        return original_expression(ir, expr, expected, seen)
    seen = set() if seen is None else seen
    assert expr['node'] not in seen and len(seen) < 24
    by = {n['id']: n for n in ir['nodes']}
    n = by[expr['node']]
    operands.safe(by, n)
    actual = operands.syntax_for(ir, n)
    assert type(actual) in (ast.Tuple, ast.List) and type(actual) is type(expected)
    assert n['operator'] == 'structure' and n['structure_kind'] == expr['sequence_kind'] == type(actual).__name__.lower()
    assert expr['port'] == 'out' and len(actual.elts) == len(expr['elements']) <= 16
    assert ast.dump(ast.parse(expr['text'], mode='eval').body) == ast.dump(actual) == ast.dump(expected)
    incoming = [e for e in ir['edges'] if e['target'] == n['id']]
    assert all(operands.exact(e) for e in incoming)
    assert sorted(expr['dependencies'], key=lambda e: e['id']) == sorted(incoming, key=lambda e: e['id'])
    used = []
    for index, (element, source) in enumerate(zip(expr['elements'], actual.elts)):
        edges = [e for e in incoming if e['target_port'] == str(index)]
        if element['kind'] == 'literal':
            assert not edges and type(ast.literal_eval(source)) is int
            assert element['value'] == ast.literal_eval(source) and element['text'] == str(element['value'])
        else:
            edge, = edges
            assert edge['source'] == element['node'] and edge['source_port'] == element['port']
            used.append(edge)
            check_expression(ir, element, source, seen | {n['id']})
    assert len(incoming) == len(used)


operands.check_expression = check_expression


def expression_size(expr):
    children = expr.get('elements', expr.get('operands', []))
    if 'base' in expr:
        children = children + [expr['base']]
    return 1 + sum(expression_size(c) for c in children)


def check_operation(ir, row):
    operands.check_operation(ir, row)
    for slot in row['slots']:
        if 'expression' in slot:
            assert expression_size(slot['expression']) <= 64


if __name__ == '__main__':
    reports = [read(OUT / 'small-report.json')]
    if '--small' not in sys.argv:
        reports += [read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    hashes = reports[0]['implementation_sha256']
    for file, digest in hashes.items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    content.OUT = OUT
    operands.OUT = OUT
    rows = []
    for report in reports:
        assert report['implementation_sha256'] == hashes
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            captures = [content.inspect(r, row['name'] + '-' + r['suffix'], check_operation) for r in row['results']]
            (a, ga, _), (b, gb, _) = captures
            for capture, (doc, _, _) in zip(row['results'], captures):
                operands.check_svg_bindings(capture, doc)
            assert a['ir'] == b['ir'] and ga <= gb
            strip = lambda ns: [{k: v for k, v in n.items() if k not in ['paper', 'transform_configurations']} for n in ns]
            assert strip(a['architecture']['nodes']) == strip(b['architecture']['nodes'])
            for key in ['node_accounting', 'edge_accounting', 'representatives']:
                assert a['layout'][key] == b['layout'][key], (row['name'], key)
            assert {r['node']: r for r in a['layout'].get('frame_ownership', [])} == {r['node']: r for r in b['layout'].get('frame_ownership', [])}
            assert a['summary_coverage'] == b['summary_coverage'] and a['expression_goals'] == b['expression_goals']
            descriptor = lambda d: [{k: v for k, v in e.items() if k not in ['route', 'context_lane']} for e in d['layout']['edges']]
            assert descriptor(a) == descriptor(b), row['name']
            applied = {r['id'] for r in a['layout']['constraint_receipts'] if r['status'] == 'applied'}
            assert applied <= {r['id'] for r in b['layout']['constraint_receipts'] if r['status'] == 'applied'}, row['name']
            sequence_rows = [op for r in b['publication']['transform_configurations']['rows'] for op in r['operations']
                             if any(s.get('expression', {}).get('kind') == 'source-sequence' for s in op['slots'])]
            qa, qb = [r['quality'] for r in row['results']]
            assert not qb['route_failures'] and not qb['unplaced_port_labels']
            assert not (set(qb['issues']) - set(qa['issues']))
            if not sequence_rows:
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256'], row['name']
            rows.append(dict(name=row['name'], sequence_notes=len(sequence_rows), direct_before=len(ga), direct_current=len(gb),
                dimensions_before=[qa['native_width_px'], qa['native_height_px']], dimensions_current=[qb['native_width_px'], qb['native_height_px']],
                crossings_before=qa['line_geometry']['crossings'], crossings_current=qb['line_geometry']['crossings'],
                wire_before=qa['wire_length'], wire_current=qb['wire_length'],
                context_route_changes=[dict(edge=x['id'], before=x.get('context_lane'), current=y.get('context_lane'))
                    for x, y in zip(a['layout']['edges'], b['layout']['edges']) if x.get('context_lane') != y.get('context_lane')]))
    result = dict(passed=True, svg_count=len(rows)*2, implementation_sha256=hashes, rows=rows, goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

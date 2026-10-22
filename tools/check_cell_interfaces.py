"""Check physical call AST, exact state slots and actual rendered SVGs."""
import ast
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cell-interfaces/current'
read, sha = content.read, content.sha


def check_relation(ir, relation):
    by = {n['id']: n for n in ir['nodes']}
    n = by[relation['node']]
    loc = n['source'][0]
    source = Path(loc['file'])
    record, = [s for s in ir['sources'] if s['path'] == str(source)]
    assert sha(source) == record['sha256']
    tree = ast.parse(source.read_text())
    owner, = [c for c in tree.body if isinstance(c, ast.ClassDef) and c.name == ir['entry']['class']]
    call, = [a for a in ast.walk(tree) if isinstance(a, ast.Call) and
             (a.lineno, a.col_offset, a.end_lineno, a.end_col_offset) ==
             (loc['line'], loc['column'], loc['end_line'], loc['end_column'])]
    assert isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name) and call.func.value.id == 'self'
    init, = [m for m in owner.body if isinstance(m, ast.FunctionDef) and m.name == '__init__']
    assignment, = [s for s in init.body if isinstance(s, ast.Assign) and any(ast.unparse(t) == ast.unparse(call.func) for t in s.targets)]
    ctor = assignment.value
    assert isinstance(ctor, ast.Call) and isinstance(ctor.func, ast.Attribute) and ctor.func.value.id == 'nn'
    assert any(isinstance(i, ast.ImportFrom) and i.module == 'torch' and any(a.name == 'nn' and a.asname is None for a in i.names) for i in tree.body)
    framework = 'torch.nn.' + ctor.func.attr
    pair = ctor.func.attr == 'LSTMCell'
    assert framework == n['framework_type'] == n['source_framework_module'] == relation['properties']['framework_type']
    assert framework in ['torch.nn.RNNCell', 'torch.nn.GRUCell', 'torch.nn.LSTMCell']
    assert relation['members'] == [n['id']]
    assert not any(isinstance(a, ast.Starred) for a in call.args) and all(k.arg is not None for k in call.keywords)
    supplied = {('input' if i == 0 else 'hx'): ('arg:' + str(i), a) for i, a in enumerate(call.args)}
    for k in call.keywords:
        assert k.arg not in supplied and k.arg in ['input', 'hx']
        supplied[k.arg] = ('kw:' + k.arg, k.value)
    assert len(call.args) <= 2 and 'input' in supplied
    dynamic = {port for port, value in supplied.values() if not isinstance(value, ast.Constant)}
    incoming = [e for e in ir['edges'] if e['target'] == n['id']]
    assert len(incoming) == len(dynamic) and {e['target_port'] for e in incoming} == dynamic
    for e in incoming:
        assert e['kind'] in ['data', 'alias', 'interface-binding'] and e['evidence'] == 'source-dependency'
        assert not e.get('condition') and not e.get('iteration')
    hx = supplied.get('hx')
    mode = 'framework-default' if not hx else 'explicit-none' if isinstance(hx[1], ast.Constant) and hx[1].value is None else 'explicit'
    assert relation['properties']['initial_state'] == mode
    assert relation['properties']['input_port'] == supplied['input'][0]
    assert relation['properties']['state_input_port'] == (hx[0] if mode == 'explicit' else None)
    assert relation['properties']['state_return_slot'] == 'out'
    assert relation['properties']['state_components'] == ({'0': 'hidden', '1': 'cell'} if pair else {'out': 'hidden'})
    edges = {e['id']: e for e in ir['edges']}
    for b in relation['bindings']:
        e = edges[b['edge']]
        assert all(b[k] == e[k] for k in ['source', 'source_port', 'target', 'target_port'])
        expected = ('step-input' if e['target_port'] == supplied['input'][0] else 'initial-state') if e['target'] == n['id'] else (
            'final-state-pair' if pair and e['source_port'] == 'out' else 'final-state' if e['source_port'] in (['0', '1'] if pair else ['out']) else 'result')
        assert b['role'] == expected
    assert 'time recurrence' in relation['not_asserted'] and 'internal gates' in relation['not_asserted']
    return n


if __name__ == '__main__':
    reports = [read(OUT / 'small-report.json')]
    if '--small' not in sys.argv:
        reports += [read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    hashes = reports[0]['implementation_sha256']
    for f, h in hashes.items():
        assert sha(ROOT / f) == h, ('stale implementation', f)
    content.OUT = operands.OUT = OUT
    rows = []
    for report in reports:
        assert hashes == report['implementation_sha256']
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            captures = [content.inspect(c, row['name'] + '-' + c['suffix'], sequences.check_operation, require_quality=False) for c in row['results']]
            (a, old, _), (b, new, _) = captures
            assert a['ir'] == b['ir']
            qualified = []
            for capture, (doc, raw, _) in zip(row['results'], captures):
                goals = doc['expression_goals']['goals']
                tree = ET.parse(OUT / capture['svg']).getroot()
                expressed = {g['id'] for g, ok in zip(goals, content.assignments(
                    doc['ir'], goals, {**doc, 'quality': capture['quality']}, tree)) if ok}
                assert expressed <= raw
                qualified.append(sorted(expressed))
            for capture, (doc, _, _) in zip(row['results'], captures):
                assert capture['quality'] == doc['diagnostics']['publication'], ('capture changed after render', row['name'])
                operands.check_svg_bindings(capture, doc)
            cells = [r for r in b['architecture']['relation_graph']['relations'] if r['type'] == 'state-interface' and r['properties'].get('interface_kind') == 'single-step']
            for r in cells:
                check_relation(b['ir'], r)
            replaced = {'goal:node:' + r['node']: 'goal:' + r['id'] for r in cells}
            # A new state goal requires more exact bindings than the previous
            # generic computation. Do not count replacing its ID as extra work.
            lost = old - new - replaced.keys()
            assert not lost, (row['name'], 'lost prior direct goals', lost)
            svg = ET.parse(OUT / row['results'][1]['svg']).getroot()
            labels = [(e.get('data-label-edge'), ''.join(e.itertext())) for e in svg.iter() if e.get('class') == 'paper-label']
            state_goals = []
            for r in cells:
                status = next(g['status'] for g in b['expression_coverage'] if g['goal'] == 'goal:' + r['id'])
                state_goals.append(dict(node=r['node'], status=status))
                if row['name'].endswith('-detail'):
                    assert status == 'fulfilled', row['name']
                    receipt, = [c for c in b['layout']['constraint_receipts'] if c['evidence'].get('relation') == r['id']]
                    assert receipt['status'] == 'applied' and receipt['route_verified']
                    for binding in r['bindings']:
                        if binding['role'] == 'step-input':
                            text = 'input'
                        elif binding['role'] == 'initial-state':
                            text = '(h, c) in' if r['properties']['framework_type'].endswith('LSTMCell') else 'h in'
                        elif binding['role'] == 'final-state-pair':
                            text = '(h, c) out'
                        else:
                            text = 'c out' if r['properties']['framework_type'].endswith('LSTMCell') and binding['source_port'] == '1' else 'h out'
                        routed = [e for e in b['layout']['edges'] if any(s['edge'] == binding['edge'] and s['role'] == binding['role'] for s in e.get('semantic_bindings', []))]
                        assert routed and any((e['id'], text) in labels for e in routed), (row['name'], binding, text)
                for pipeline in b['publication'].get('local_pipelines', {}).get('rows', []):
                    assert r['node'] not in pipeline['canonical_members']
            qa, qb = [c['quality'] for c in row['results']]
            assert not qb['issues']
            assert not qb['route_failures'] and not qb['unplaced_port_labels']
            if row['name'].startswith('Transformer-'):
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
                assert a == b and old == new
            rows.append(dict(name=row['name'], state_interfaces=state_goals,
                direct_before=len(old), direct_current=len(new), replaced_computation_goals=list(old & replaced.keys()),
                qualified_goals_before=qualified[0], qualified_goals_current=qualified[1],
                quality_before=qa['issues'], quality_current=qb['issues'],
                dimensions_before=[qa['native_width_px'], qa['native_height_px']], dimensions_current=[qb['native_width_px'], qb['native_height_px']],
                crossings_before=qa['line_geometry']['crossings'], crossings_current=qb['line_geometry']['crossings'],
                wire_before=qa['wire_length'], wire_current=qb['wire_length']))
    result = dict(passed=True, svg_count=2*len(rows), implementation_sha256=hashes, rows=rows, goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

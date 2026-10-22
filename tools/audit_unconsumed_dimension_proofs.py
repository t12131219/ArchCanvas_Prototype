"""Independent dimension proof audit from source AST and canonical bindings."""
import ast
import json
import re
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.symbolic_values import derive as symbolic_reads
from semantic_adapter.structure import syntax as source_syntax



# Hash-checked physical source nodes are resolved by complete source ranges.
import hashlib
source_cache = {}

def source_tree(ir, file):
    source, = [s for s in ir['sources'] if s['path'] == file]
    path = Path(source['physical'])
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == source['sha256']
    key = file, digest
    if key not in source_cache:
        source_cache[key] = ast.parse(path.read_text())
    return source_cache[key]

def physical(ir, node):
    s = node['source'][0]
    rows = [n for n in ast.walk(source_tree(ir, s['file'])) if hasattr(n, 'end_lineno') and
            (n.lineno, n.col_offset, n.end_lineno, n.end_col_offset) ==
            (s['line'], s['column'], s['end_line'], s['end_column'])]
    result, = rows
    return result


def audit(document, row, visible, *, enabled=True):
    ir = document['ir']
    by = {n['id']: n for n in ir['nodes']}
    incoming, uses = {}, {}
    for e in ir['edges']:
        incoming.setdefault(e['target'], []).append(e)
        uses.setdefault(e['source'], []).append(e)
    for n in ir['nodes']:
        if n.get('source_tensor_annotation') == 'torch.Tensor':
            arg = physical(ir, n)
            assert isinstance(arg, ast.arg)
            annotation = ast.unparse(arg.annotation)
            tree = source_tree(ir, n['source'][0]['file'])
            imports = {a.asname or a.name: a.name for item in tree.body if isinstance(item, ast.ImportFrom) and item.module == 'torch' for a in item.names}
            modules = {a.asname or a.name for item in tree.body if isinstance(item, ast.Import) for a in item.names if a.name == 'torch'}
            assert imports.get(annotation) == 'Tensor' or any(annotation == m + '.Tensor' for m in modules)
    symbolic = symbolic_reads(ir['nodes'], ir['edges'])
    rows = [r for r in document['publication']['configuration_arithmetic'] if r.get('rule_version') == 'dimension-paths/1']
    assert rows == row.get('configuration_paths', [])
    facts, active = {}, set()

    def safe(at):
        seen = set()
        while at is not None:
            if at not in by or at in seen:
                return False
            seen.add(at)
            n = by[at]
            if n.get('evidence_status') != 'static-only' or n['kind'] in {'opaque', 'control'} or any(n.get(k) for k in ['mutable', 'condition', 'identity_display', 'observed_calls', 'runtime_evidence', 'semantic_contracts']):
                return False
            at = n.get('parent')
        return True

    def exact(e):
        return e['kind'] in {'data', 'alias', 'interface-binding'} and not any(e.get(k) for k in ['condition', 'design_route', 'iteration']) and e.get('evidence') in {'source-dependency', 'static-source'}

    def read(at, slot='out', depth=0):
        key = at, slot
        if key in facts:
            return facts[key]
        if key in active or depth > 64 or not safe(at):
            return None
        active.add(key)
        n, es, result = by[at], incoming.get(at, []), None
        fact = symbolic.get(at, {})
        if all(exact(e) for e in es):
            if fact.get('kind') == 'tensor-attribute' and fact['attribute'] in {'shape', 'ndim'} and len(es) == 1 and es[0]['id'] == fact['edge']:
                scalar = slot == 'out' if fact['attribute'] == 'ndim' else re.fullmatch(r'-?\d+', slot) is not None
                if slot == 'out' or scalar:
                    result = ('dimension-read', scalar, [{'node': at, 'slot': slot, 'fact': fact}])
            elif n['kind'] in {'interface', 'value-alias'} and not n.get('operator') and len(es) == 1:
                e = es[0]
                outer = n.get('slot') if n['kind'] == 'value-alias' and n.get('slot') is not None else e.get('source_port', 'out')
                if n['kind'] != 'value-alias' or n.get('slot') is None or str(n['slot']) == e.get('source_port', 'out'):
                    next_slot = slot if outer == 'out' else outer if slot == 'out' else outer + '.' + slot
                    v = read(e['source'], next_slot, depth + 1)
                    if v:
                        result = ('dimension-binding', v[1], v[2])
            elif n['kind'] == 'compute' and slot == 'out':
                try:
                    expression = ast.parse(n['source'][0]['expression'], mode='eval').body
                except (SyntaxError, KeyError, IndexError):
                    expression = None
                operators = {ast.Add: 'add', ast.Sub: 'sub', ast.Mult: 'mult', ast.FloorDiv: 'floordiv', ast.Mod: 'mod'}
                if isinstance(expression, ast.BinOp) and type(expression.op) in operators and n.get('operator') == operators[type(expression.op)] and source_syntax(expression) == n.get('syntax'):
                    bound, roots, valid = [], [], True
                    for expr, port in [(expression.left, '0'), (expression.right, '2')]:
                        eslot = [e for e in es if e.get('target_port') == port]
                        if isinstance(expr, ast.Constant) and type(expr.value) is int and not eslot:
                            continue
                        if len(eslot) != 1:
                            valid = False
                            continue
                        e = eslot[0]
                        v = read(e['source'], e.get('source_port', 'out'), depth + 1)
                        bound.append(e)
                        if not v or not v[1]:
                            valid = False
                        else:
                            roots.extend(v[2])
                    if valid and len(bound) == len(es):
                        result = ('dimension-arithmetic', True, roots)
        active.remove(key)
        facts[key] = result
        return result

    def configuration(e):
        n = by[e['target']]
        if n['kind'] != 'compute' or not safe(n['id']):
            return False
        name, port = n.get('function_target', '').split('.')[-1], e.get('target_port', '')
        return (port in {'kw:dim', 'kw:keepdim', 'kw:keepdims', 'kw:size', 'kw:device', 'kw:dtype', 'kw:p', 'kw:negative_slope', 'kw:eps', 'kw:training', 'kw:align_corners'}
                or name in {'view', 'expand', 'transpose', 'permute', 'squeeze', 'unsqueeze', 'zeros', 'ones', 'rand', 'randn'} and port.startswith('arg:')
                or name == 'reshape' and (port not in {'receiver', 'arg:0'} or enabled and port == 'arg:0' and any(x.get('target_port') == 'receiver' for x in incoming.get(n['id'], []))))

    derived = {at: v for at in by if (v := read(at))}
    selected, changed = set(), True
    while changed:
        changed = False
        for at in derived:
            es = uses.get(at, [])
            if at not in selected and es and all(exact(e) and (configuration(e) or e['target'] in selected) for e in es):
                selected.add(at)
                changed = True
    unused_by_shape = {}
    if enabled:
        for at, fact in derived.items():
            n, es = by[at], uses.get(at, [])
            if fact[0] != 'dimension-read' or fact[1] or n.get('attribute_name') != 'shape' or not any(e['target'] in selected for e in es):
                continue
            unused, valid = [], True
            for e in es:
                if not exact(e):
                    valid = False
                    break
                if e['target'] in selected:
                    continue
                alias = by[e['target']]
                v = derived.get(alias['id'])
                if not (safe(alias['id']) and alias['kind'] == 'value-alias' and not alias.get('operator')
                        and alias.get('parent') == n.get('parent') and re.fullmatch(r'\d+', str(alias.get('slot', '')))
                        and alias['slot'] == e.get('source_port') == e.get('target_port') and e['kind'] == 'alias'
                        and incoming[alias['id']] == [e] and not uses.get(alias['id'])
                        and sum(x['kind'] == 'alias' and x.get('source_port') == e['source_port'] for x in es) == 1
                        and v and v[0] == 'dimension-binding' and v[1] and len(v[2]) == 1
                        and v[2][0]['node'] == at and v[2][0]['slot'] == alias['slot']):
                    valid = False
                    break
                # Physical Python source: this name is the exact flat unpack slot
                # of this shape read, not a stored label or hypothetical output.
                attribute = physical(ir, n)
                name = physical(ir, alias)
                assert isinstance(attribute, ast.Attribute) and attribute.attr == 'shape' and isinstance(name, ast.Name)
                tree = source_tree(ir, n['source'][0]['file'])
                assignments = [a for a in ast.walk(tree) if isinstance(a, ast.Assign) and a.value is attribute]
                assignment, = assignments
                target, = assignment.targets
                assert isinstance(target, (ast.Tuple, ast.List)) and target.elts[int(alias['slot'])] is name
                assert all(isinstance(x, ast.Name) for x in target.elts)
                unused.append(alias['id'])
            if valid and unused:
                unused_by_shape[at] = unused
        selected.update(x for aliases in unused_by_shape.values() for x in aliases)
        changed = True
        while changed:
            changed = False
            for at in derived:
                es = uses.get(at, [])
                if at not in selected and es and all(exact(e) and (configuration(e) or e['target'] in selected) for e in es):
                    selected.add(at)
                    changed = True
    for r in rows:
        at = r['node']
        expected = derived[at]
        if at in unused_by_shape:
            assert [u['node'] for u in r['unconsumed_bindings']] == unused_by_shape[at]
            for u in r['unconsumed_bindings']:
                assert u['slot'] == by[u['node']]['slot'] and u['source'] == by[u['node']]['source']
                assert u['dependency'] == incoming[u['node']][0] and u['uses'] == []
                assert 'not dead-code elimination' in u['scope'] and 'validity and execution are unproved' in u['scope']
        else:
            assert not r.get('unconsumed_bindings')
        owner = next((s for s, us in unused_by_shape.items() if at in us), None)
        assert r.get('unconsumed_binding_of') == owner
        assert (r['kind'], r['roots']) == (expected[0], expected[2])
        assert r['dependencies'] == incoming.get(at, []) and r['uses'] == uses.get(at, [])
        assert r['configuration_only'] == (at in selected)
        assert r['value_evaluation'] == 'not-performed'
        assert r['basis'] == 'source-tensor-dimensions-and-exact-integer-operands'
        assert r['expression'] == by[at].get('source', [{}])[0].get('expression', by[at]['label'])
        if r['configuration_only']:
            assert at not in visible, ('configuration was still rendered as feature work', at)
            assert all(g['status'] != 'fulfilled' for g in document['expression_coverage'] if g['goal'] == 'goal:node:' + at)
    return len(rows)

"""Conservative AST lowering, with explicit interfaces and unresolved boundaries.

A source dependency is never advertised as a measured tensor edge. Construction
order alone does not create edges. Local definitions can be inspected recursively;
unsupported Python remains source-backed opaque rather than a fabricated template.
"""
from __future__ import annotations
import ast
from pathlib import Path
from .schema import SCHEMA, COVERAGE_CONTRACT, GLYPHS, seal
from .sources import units

MODULES = {
    'Linear': 'linear', 'Conv1d': 'convolution', 'Conv2d': 'convolution', 'Conv3d': 'convolution',
    'ConvTranspose2d': 'convolution', 'Embedding': 'embedding', 'LayerNorm': 'normalization',
    'BatchNorm1d': 'normalization', 'BatchNorm2d': 'normalization', 'GroupNorm': 'normalization',
    'ReLU': 'activation', 'GELU': 'activation', 'Sigmoid': 'activation', 'Tanh': 'activation',
    'Softmax': 'softmax', 'LogSoftmax': 'softmax', 'Dropout': 'dropout',
    'MaxPool2d': 'pooling', 'AvgPool2d': 'pooling', 'AdaptiveAvgPool2d': 'pooling',
    'Flatten': 'reshape', 'Identity': 'identity', 'LSTM': 'lstm', 'GRU': 'gru', 'RNN': 'rnn',
    'MultiheadAttention': 'multihead-attention', 'Transformer': 'transformer',
    'TransformerEncoder': 'encoder', 'TransformerEncoderLayer': 'encoder-layer',
    'TransformerDecoder': 'decoder', 'TransformerDecoderLayer': 'decoder-layer',
}
FUNCTIONS = {
    'relu': 'activation', 'gelu': 'activation', 'sigmoid': 'activation', 'tanh': 'activation',
    'softmax': 'softmax', 'log_softmax': 'softmax', 'matmul': 'matmul', 'bmm': 'matmul',
    'mm': 'matmul', 'einsum': 'einsum', 'linear': 'linear', 'conv2d': 'convolution',
    'max_pool2d': 'pooling', 'avg_pool2d': 'pooling', 'adaptive_avg_pool2d': 'pooling',
    'dropout': 'dropout', 'layer_norm': 'normalization', 'batch_norm': 'normalization',
    'scaled_dot_product_attention': 'scaled-dot-product-attention', 'cat': 'concat', 'stack': 'stack',
    'reshape': 'reshape', 'view': 'reshape', 'flatten': 'reshape', 'transpose': 'transpose',
    'permute': 'transpose', 'contiguous': 'copy', 'clone': 'copy', 'detach': 'detach',
    'squeeze': 'reshape', 'unsqueeze': 'reshape', 'size': 'shape', 'dim': 'shape',
    'masked_fill': 'mask', 'masked_fill_': 'mask', 'to': 'device-cast', 'float': 'dtype-cast',
    'bool': 'dtype-cast', 'long': 'dtype-cast', 'nan_to_num': 'nan-guard',
    'zeros': 'create', 'ones': 'create', 'randn': 'random', 'rand': 'random', 'randn_like': 'random',
    'zeros_like': 'create', 'ones_like': 'create', 'sqrt': 'sqrt', 'exp': 'exp', 'sum': 'reduce',
    'mean': 'reduce', 'norm': 'reduce', 'chunk': 'split', 'split': 'split', 'unbind': 'split',
    'pack_padded_sequence': 'pack-sequence', 'pad_packed_sequence': 'unpack-sequence',
    'len': 'shape', 'range': 'range', 'enumerate': 'enumerate',
    'topk': 'top-k', 'gather': 'gather', 'scatter': 'scatter', 'scatter_add': 'scatter-add',
    'where': 'select', 'index_select': 'index-select',
}


def text(n):
    return ast.unparse(n) if n is not None else ''


def literal(n, values):
    """Resolve bounded constructor constants without Python eval/import."""
    if n is None:
        return None
    if isinstance(n, ast.Name) and n.id in values:
        return values[n.id]
    if isinstance(n, ast.Attribute) and text(n) in values:
        return values[text(n)]
    if isinstance(n, ast.BinOp):
        a, b = literal(n.left, values), literal(n.right, values)
        if type(a) in (int, float) and type(b) in (int, float):
            if isinstance(n.op, ast.Add): return a + b
            if isinstance(n.op, ast.Sub): return a - b
            if isinstance(n.op, ast.Mult): return a * b
            if isinstance(n.op, ast.FloorDiv) and b: return a // b
    try:
        return ast.literal_eval(n)
    except (ValueError, TypeError):
        return {'unresolved': text(n)}


class Analyzer:
    def __init__(self, source, entry, constructor=None, cell=None, max_nodes=1600, max_depth=12):
        self.path = Path(source).resolve()
        self.units, self.diagnostics = units(self.path)
        self.constructor = constructor or {}
        self.entry, self.cell = entry.split(':')[-1], cell
        self.max_nodes, self.max_depth = max_nodes, max_depth
        self.nodes, self.edges, self.branches, self.counts = [], [], [], {}
        self.coverage_blockers = []
        self.definitions, self.node_by = {}, {}
        for u in self.units:
            for n in u['tree'].body:
                if isinstance(n, (ast.ClassDef, ast.FunctionDef)):
                    self.definitions.setdefault(n.name, []).append((u, n))
        self.imports = {}
        for u in self.units:
            for n in u['tree'].body:
                if isinstance(n, ast.Import):
                    for alias in n.names: self.imports[alias.asname or alias.name] = alias.name
                elif isinstance(n, ast.ImportFrom):
                    for alias in n.names: self.imports[alias.asname or alias.name] = (n.module or '') + '.' + alias.name
        # Notebook setup globals are evidence only; resolve literal assignments,
        # never run dataset/download/optimizer cells.
        self.globals = {}
        for u in self.units:
            for n in u['tree'].body:
                if isinstance(n, ast.Assign) and len(n.targets) == 1 and isinstance(n.targets[0], ast.Name):
                    value = literal(n.value, self.globals)
                    if not isinstance(value, dict): self.globals[n.targets[0].id] = value

    def evidence(self, u, n, symbol):
        return [{'file': u['path'], 'line': n.lineno, 'end_line': n.end_lineno,
                 'column': n.col_offset, 'end_column': n.end_col_offset, 'symbol': symbol,
                 'expression': text(n)[:360]}]

    def add(self, kind, label, parent, u, n, symbol, **extra):
        if len(self.nodes) >= self.max_nodes:
            raise ValueError(f'analysis node budget exceeded ({self.max_nodes}); choose a smaller entry')
        loc = f'{parent or "model"}/{n.lineno}:{n.col_offset}:{kind}'
        self.counts[loc] = self.counts.get(loc, 0) + 1
        identity = loc + ':' + str(self.counts[loc])
        node = {'id': identity, 'kind': kind, 'label': label, 'parent': parent, 'source_parent': parent,
                'source': self.evidence(u, n, symbol), 'evidence_status': 'opaque' if kind == 'opaque' else 'static-only',
                'granularity': 'composite' if kind == 'composite' else 'atomic',
                'glyph': GLYPHS[kind], 'runtime_evidence': [], **extra}
        self.nodes.append(node)
        self.node_by[identity] = node
        return identity

    def edge(self, source, target, kind='data', target_port='in', evidence='source-dependency', **extra):
        if not source or not target or source == target: return
        value = {'source': source, 'target': target, 'kind': kind, 'source_port': 'out',
                 'target_port': target_port, 'evidence': evidence, **extra}
        if any(all(e.get(k) == v for k, v in value.items()) for e in self.edges): return
        value['id'] = f'e{len(self.edges):05d}'
        self.edges.append(value)

    def definition(self, name, cell=None):
        candidates = self.definitions.get(name, [])
        if cell is not None: candidates = [(u, n) for u, n in candidates if u['cell'] == cell]
        return candidates[0] if len(candidates) == 1 else None

    def resolve(self, name):
        head, *tail = name.split('.')
        return '.'.join([self.imports.get(head, head), *tail])

    def module_map(self, cls, values):
        result = {}
        init = next((n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '__init__'), None)
        if not init: return result
        # Conditional constructors remain annotated, never arbitrarily select a path.
        for n in ast.walk(init):
            if isinstance(n, ast.Assign):
                for target in n.targets:
                    name = text(target)
                    if isinstance(target, ast.Attribute) and name.startswith('self.'):
                        if name in result: result[name] = None
                        else: result[name] = n.value
                        value = literal(n.value, values)
                        if not isinstance(value, dict): values[name] = value
        for key in result:
            seen = {key}
            while isinstance(result[key], ast.Attribute) and text(result[key]) in result and text(result[key]) not in seen:
                target = text(result[key]); seen.add(target); result[key] = result[target]
        return result

    def call(self, cls_pair, parent, label, actuals, keywords, ctor, depth, module_path='', owner=None):
        u, cls = cls_pair
        symbol = cls.name + '.forward' if isinstance(cls, ast.ClassDef) else cls.name
        if depth > self.max_depth:
            return self.add('opaque', label + ' (depth limit)', parent, u, cls, symbol, reason='analysis-depth-limit')
        is_class = isinstance(cls, ast.ClassDef)
        fn = next((n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'forward'), None) if is_class else cls
        if fn:
            self.coverage_blockers.extend({'file': u['path'], 'line': n.lineno, 'kind': type(n).__name__} for n in ast.walk(fn) if isinstance(n, (ast.BoolOp, ast.Try, ast.Assert, ast.While, ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)) and hasattr(n, 'lineno'))
        if not fn:
            return self.add('opaque', label, parent, u, cls, symbol, reason='no local forward definition')
        composite = self.add('composite', label, parent, u, fn, symbol,
                             semantic_type='source-module' if is_class else 'source-function', module_path=module_path,
                             constructor=ctor)
        values = dict(self.globals)
        values.update(ctor)
        owner = cls if is_class else owner
        modules = self.module_map(owner, values) if owner is not None else {}
        env = {}
        args = [a for a in fn.args.args if a.arg != 'self'] + fn.args.kwonlyargs
        for index, arg in enumerate(args):
            node = self.add('interface', arg.arg, composite, u, arg, symbol, role='input', slot=arg.arg)
            env[arg.arg] = node
            binding = keywords.get(arg.arg) or (actuals[index] if index < len(actuals) else None)
            self.edge(binding, node, 'interface-binding', arg.arg)
        returned = []

        def expr(n, scope, bindings):
            if n is None or isinstance(n, ast.Constant): return None
            if isinstance(n, ast.Name):
                if n.id in bindings: return bindings[n.id]
                key = 'global:' + n.id
                if key not in bindings:
                    bindings[key] = self.add('state' if n.id not in self.globals else 'buffer', n.id, scope, u, n, symbol,
                                             role='external-value', value=self.globals.get(n.id, {'unresolved': n.id}))
                return bindings[key]
            if isinstance(n, (ast.Tuple, ast.List, ast.Dict)):
                children = n.values if isinstance(n, ast.Dict) else n.elts
                node = self.add('compute', 'structured value', scope, u, n, symbol, operator='structure')
                for i, child in enumerate(children): self.edge(expr(child, scope, bindings), node, target_port=str(i))
                return node
            if isinstance(n, ast.Attribute):
                key = text(n)
                if key in bindings: return bindings[key]
                kind = 'state' if key.startswith('self.') else 'compute'
                node = self.add(kind, key, scope, u, n, symbol, operator='attribute', value=values.get(key, {'unresolved': key}))
                if not key.startswith('self.'): self.edge(expr(n.value, scope, bindings), node)
                bindings[key] = node
                return node
            if isinstance(n, ast.Call):
                target = text(n.func)
                raw_module = modules.get(target)
                receiver = None
                # Receiver first, then positional and keyword expressions: preserve
                # dependencies (not an invented edge between adjacent statements).
                if isinstance(n.func, ast.Attribute) and not target.startswith(('self.', 'torch.', 'nn.', 'F.', 'math.')) and (target.split('.')[0] in bindings or isinstance(n.func.value, (ast.Call, ast.Subscript))):
                    receiver = expr(n.func.value, scope, bindings)
                actuals = [expr(a, scope, bindings) for a in n.args]
                kw = {k.arg: expr(k.value, scope, bindings) for k in n.keywords if k.arg}
                helper = None
                if owner is not None and target.startswith('self.') and target not in modules:
                    name = target[5:]
                    helper_fn = next((m for m in owner.body if isinstance(m, ast.FunctionDef) and m.name == name), None)
                    if helper_fn: helper = (u, helper_fn)
                elif self.definition(target) and isinstance(self.definition(target)[1], ast.FunctionDef):
                    helper = self.definition(target)
                if helper:
                    return self.call(helper, scope, target, actuals, kw, ctor, depth + 1, module_path, owner)
                if isinstance(raw_module, ast.Call):
                    constructor_name = text(raw_module.func)
                    short = constructor_name.split('.')[-1]
                    local = self.definition(constructor_name)
                    if local and isinstance(local[1], ast.ClassDef):
                        init = next((m for m in local[1].body if isinstance(m, ast.FunctionDef) and m.name == '__init__'), None)
                        params = [a.arg for a in init.args.args if a.arg != 'self'] if init else []
                        v = {p: literal(a, values) for p, a in zip(params, raw_module.args)}
                        v.update({k.arg: literal(k.value, values) for k in raw_module.keywords if k.arg})
                        return self.call(local, scope, target[5:], actuals, kw, v, depth + 1,
                                         (module_path + '.' + target[5:]).strip('.'))
                    if short == 'Sequential' and self.resolve(constructor_name).startswith('torch.nn.'):
                        frame = self.add('composite', target[5:], scope, u, n, symbol, semantic_type='sequential', module_path=(module_path + '.' + target[5:]).strip('.'))
                        previous = actuals[0] if actuals else None
                        for i, child in enumerate(raw_module.args):
                            if isinstance(child, ast.Call):
                                child_type = self.resolve(text(child.func))
                                child_short = child_type.split('.')[-1]
                                known = child_type.startswith('torch.nn.') and child_short in MODULES
                                sub = self.add('compute' if known else 'opaque', f'{i}: {child_short}', frame, u, child, symbol,
                                               operator=MODULES.get(child_short, child_type) if known else child_type,
                                               module_path=(module_path + '.' + target[5:] + '.' + str(i)).strip('.'))
                                self.edge(previous, sub, evidence='framework-contract')
                                previous = sub
                            else:
                                sub = self.add('opaque', text(child)[:60], frame, u, child, symbol, reason='unresolved sequential child')
                                self.edge(previous, sub, evidence='framework-contract'); previous = sub
                        output = self.add('interface', 'out', frame, u, n, symbol, role='output')
                        self.edge(previous, output, 'interface-binding', evidence='framework-contract')
                        return output
                    qualified = self.resolve(constructor_name)
                    known = qualified.startswith('torch.nn.') and short in MODULES
                    operator = MODULES[short] if known else qualified
                    kind = 'compute' if known else 'opaque'
                    node = self.add(kind, f'{target[5:]} · {short}', scope, u, n, symbol, operator=operator,
                                    module_path=(module_path + '.' + target[5:]).strip('.'),
                                    framework_type=qualified, constructor={k.arg: literal(k.value, values) for k in raw_module.keywords if k.arg})
                    # Parameter resources are separate from the compute call, and
                    # shapes/sharing remain unknown until a runtime observation.
                    if known and short in {'Linear', 'Conv1d', 'Conv2d', 'Conv3d', 'Embedding', 'LayerNorm', 'BatchNorm1d', 'BatchNorm2d'}:
                        resource = self.add('parameter', target[5:] + '.parameters', scope, u, raw_module, symbol,
                                            parameter_scope=self.node_by[node]['module_path'], identity_status='declared-scope; sharing-unresolved')
                        self.edge(resource, node, 'parameter-read', evidence='framework-contract')
                else:
                    qualified = self.resolve(target)
                    short = target.split('.')[-1]
                    tensor_method = receiver is not None and short in FUNCTIONS
                    known = (qualified.startswith(('torch.', 'math.')) or tensor_method or target in {'len', 'range', 'enumerate'}) and short in FUNCTIONS
                    node = self.add('compute' if known else 'opaque', short, scope, u, n, symbol,
                                    operator=FUNCTIONS.get(short, qualified) if known else qualified, function_target=qualified,
                                    reason=None if known else 'unresolved-call-target')
                self.edge(receiver, node, target_port='receiver')
                for i, value in enumerate(actuals): self.edge(value, node, target_port=f'arg:{i}')
                for key, value in kw.items(): self.edge(value, node, target_port='kw:' + key)
                return node
            if isinstance(n, ast.IfExp):
                control = self.add('control', text(n.test)[:70], scope, u, n.test, symbol, operator='if-expression')
                self.edge(expr(n.test, scope, bindings), control, 'control')
                self.branches.append({'id': control, 'file': u['path'], 'line': n.lineno, 'column': n.col_offset, 'outcomes': ['true', 'false'], 'kind': 'if-expression'})
                node = self.add('compute', 'conditional join', scope, u, n, symbol, operator='phi')
                self.edge(expr(n.body, scope, dict(bindings)), node, target_port='true', condition={'branch': control, 'outcome': 'true'})
                self.edge(expr(n.orelse, scope, dict(bindings)), node, target_port='false', condition={'branch': control, 'outcome': 'false'})
                self.edge(control, node, 'control')
                return node
            operators = {ast.BinOp: type(getattr(n, 'op', None)).__name__.lower(), ast.UnaryOp: 'unary', ast.Compare: 'compare', ast.BoolOp: 'boolean', ast.Subscript: 'getitem'}
            op = next((v for k, v in operators.items() if isinstance(n, k)), None)
            node = self.add('compute' if op else 'opaque', op or type(n).__name__, scope, u, n, symbol,
                            operator=op or 'unresolved-expression')
            for i, child in enumerate(ast.iter_child_nodes(n)):
                if isinstance(child, ast.expr): self.edge(expr(child, scope, bindings), node, target_port=str(i))
            return node

        def assign(target, producer, scope, bindings, slot=None):
            if isinstance(target, (ast.Tuple, ast.List)):
                for i, child in enumerate(target.elts): assign(child, producer, scope, bindings, f'{slot + "." if slot else ""}{i}')
                return
            name = text(target)
            alias = self.add('state' if isinstance(target, ast.Attribute) else 'value-alias', name, scope, u, target, symbol, slot=slot)
            self.edge(producer, alias, 'state-write' if isinstance(target, ast.Attribute) else 'alias', target_port=slot or 'value')
            bindings[name] = alias

        def statements(body, scope, bindings):
            for statement in body:
                if isinstance(statement, ast.Assign):
                    value = expr(statement.value, scope, bindings)
                    for target in statement.targets: assign(target, value, scope, bindings)
                elif isinstance(statement, ast.AnnAssign):
                    assign(statement.target, expr(statement.value, scope, bindings), scope, bindings)
                elif isinstance(statement, ast.AugAssign):
                    value = expr(ast.copy_location(ast.BinOp(left=statement.target, op=statement.op, right=statement.value), statement), scope, bindings)
                    assign(statement.target, value, scope, bindings)
                elif isinstance(statement, ast.Return):
                    value = expr(statement.value, scope, bindings)
                    output = self.add('interface', 'return', scope, u, statement, symbol, role='output')
                    self.edge(value, output, 'interface-binding')
                    returned.append(output)
                    break
                elif isinstance(statement, ast.If):
                    control = self.add('control', text(statement.test)[:70], scope, u, statement.test, symbol, operator='if')
                    self.edge(expr(statement.test, scope, bindings), control, 'control')
                    self.branches.append({'id': control, 'file': u['path'], 'line': statement.lineno, 'column': statement.col_offset,
                                          'outcomes': ['true', 'false'], 'kind': 'if'})
                    alternatives = []
                    for outcome, block in [('true', statement.body), ('false', statement.orelse)]:
                        frame = self.add('composite', outcome, scope, u, statement, symbol, semantic_type='conditional-region', condition={'branch': control, 'outcome': outcome})
                        self.edge(control, frame, 'control', outcome)
                        branch_env = dict(bindings)
                        statements(block, frame, branch_env)
                        alternatives.append(branch_env)
                    for name in set(alternatives[0]) | set(alternatives[1]):
                        a, b = alternatives[0].get(name), alternatives[1].get(name)
                        if a == b: continue
                        phi = self.add('value-alias', name + ' · branch join', scope, u, statement, symbol, operator='phi')
                        self.edge(a, phi, target_port='true', condition={'branch': control, 'outcome': 'true'})
                        self.edge(b, phi, target_port='false', condition={'branch': control, 'outcome': 'false'})
                        bindings[name] = phi
                elif isinstance(statement, (ast.For, ast.While)):
                    control = self.add('control', ('for ' + text(statement.target) + ' in ' + text(statement.iter))[:90] if isinstance(statement, ast.For) else 'while ' + text(statement.test)[:80], scope, u, statement, symbol,
                                       operator='loop', loop_semantics='source-body-template; repetition-and-carried-state-unresolved')
                    self.branches.append({'id': control, 'file': u['path'], 'line': statement.lineno, 'kind': 'loop', 'outcomes': ['zero', 'nonzero'], 'path_coverage': 'unresolved'})
                    self.edge(expr(statement.iter if isinstance(statement, ast.For) else statement.test, scope, bindings), control, 'control')
                    frame = self.add('composite', 'loop body (source template)', scope, u, statement, symbol, semantic_type='loop-template')
                    self.edge(control, frame, 'control')
                    loop_env = dict(bindings)
                    if isinstance(statement, ast.For): assign(statement.target, control, frame, loop_env)
                    statements(statement.body, frame, loop_env)
                    for name in set(loop_env) - set(bindings) | {k for k in bindings if loop_env.get(k) != bindings[k]}:
                        join = self.add('opaque', name + ' · loop-carried value', scope, u, statement, symbol, reason='iteration-binding-unresolved')
                        self.edge(bindings.get(name), join, target_port='initial')
                        self.edge(loop_env.get(name), join, target_port='body')
                        bindings[name] = join
                elif isinstance(statement, ast.Expr): expr(statement.value, scope, bindings)
                elif isinstance(statement, (ast.Pass, ast.Import, ast.ImportFrom)): continue
                else:
                    self.add('opaque', type(statement).__name__, scope, u, statement, symbol, reason='unsupported-statement')
        statements(fn.body, composite, env)
        if len(returned) == 1: return returned[0]
        output = self.add('interface', 'outputs / conditional returns', composite, u, fn, symbol, role='output')
        for i, value in enumerate(returned): self.edge(value, output, 'interface-binding', str(i))
        return output

    def run(self):
        pair = self.definition(self.entry, self.cell)
        if pair is None:
            raise ValueError('entry missing or ambiguous; provide --cell for notebook redefinitions: ' + self.entry)
        self.call(pair, None, self.entry, [], {}, self.constructor, 0)
        source_meta = [{k: u[k] for k in ('path', 'physical', 'cell', 'sha256', 'unit_sha256')} for u in self.units]
        ir = {'schema': SCHEMA, 'title': self.entry, 'entry': {'file': str(self.path), 'class': self.entry, 'cell': self.cell, 'constructor': self.constructor},
              'coverage_contract': COVERAGE_CONTRACT, 'sources': source_meta, 'nodes': self.nodes, 'edges': self.edges,
              'branches': self.branches, 'motifs': [], 'diagnostics': self.diagnostics,
              'runtime': {'status': 'not-requested', 'model_executed': False},
              'coverage_blockers': self.coverage_blockers,
              'coverage': {'status': 'not-verified', 'scope': 'static-source', 'complete': False,
                           'reason': 'static dependencies are not execution proof'},
              'limitations': ['Static edges express source dependencies, not observed tensor bindings.',
                              'Unresolved calls/loops/external definitions remain explicit opaque boundaries.',
                              'Notebook cells are parsed as data; notebook setup/training cells are never executed.']}
        from .motifs import recognize
        recognize(ir)
        return seal(ir)


def analyze(source, entry, constructor=None, cell=None, **limits):
    return Analyzer(source, entry, constructor, cell, **limits).run()

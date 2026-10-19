"""Bounded module construction evidence. This never imports or executes a model.

Only straight assignments and single-return collection factories are interpreted.
Object bindings are separate from JSON constructor constants and from tensor SSA.
"""
import ast
from dataclasses import dataclass, replace


@dataclass
class Module:
    call: ast.Call
    constants: dict
    objects: dict
    identity: str
    evidence: list
    allocation: str = 'constructor-object; parameter-sharing-unresolved'


@dataclass
class Collection:
    elements: list
    evidence: list
    expression: str


class Construction:
    LIMIT = 16

    def __init__(self, analyzer, unit, owner, constants, objects, path):
        self.a, self.u, self.path, self.owner = analyzer, unit, path, owner
        self.constants, self.objects = dict(constants), dict(objects or {})
        self.blocked = set()
        if owner is None:
            return
        init = next((n for n in owner.body if isinstance(n, ast.FunctionDef) and n.name == '__init__'), None)
        if init is None:
            return
        if init.decorator_list:
            return
        from .analyzer import literal, text
        # Any non-straight assignment to an attribute invalidates that binding.
        direct = {id(n) for n in init.body if isinstance(n, (ast.Assign, ast.AnnAssign))}
        for n in self.walk_helpers(init):
            if isinstance(n, (ast.Assign, ast.AnnAssign, ast.AugAssign)) and id(n) not in direct:
                for t in n.targets if isinstance(n, ast.Assign) else [n.target]:
                    if isinstance(t, ast.Attribute):
                        self.blocked.add(text(t))
        for n in init.body:
            if not isinstance(n, (ast.Assign, ast.AnnAssign)) or n.value is None:
                continue
            targets = n.targets if isinstance(n, ast.Assign) else [n.target]
            if len(targets) != 1 or not isinstance(targets[0], (ast.Name, ast.Attribute)):
                continue
            key = text(targets[0])
            if key in self.blocked:
                self.objects.pop(key, None)
                continue
            obj = self.read(n.value, self.constants, self.objects, self.identity(key))
            self.objects.pop(key, None)
            if obj is not None:
                self.objects[key] = obj
            value = literal(n.value, self.constants)
            if not isinstance(value, dict):
                self.constants[key] = value
        # Mutating methods or indexed writes can change a collection after creation.
        invalid = set()
        for n in self.walk_helpers(init):
            target = None
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr in {'append', 'extend', 'insert', 'pop', 'clear', 'remove', '__setitem__', '__delitem__'}:
                target = text(n.func.value)
            if isinstance(n, ast.Subscript) and isinstance(n.ctx, (ast.Store, ast.Del)):
                target = text(n.value)
            if target:
                obj = self.objects.get(target)
                if obj is not None:
                    invalid.add(id(obj))
            if isinstance(n, ast.Attribute) and isinstance(n.ctx, ast.Del):
                obj = self.objects.get(text(n))
                if obj is not None:
                    invalid.add(id(obj))
            if isinstance(n, ast.Call):
                for arg in [*n.args, *(k.value for k in n.keywords)]:
                    obj = self.objects.get(text(arg))
                    if isinstance(obj, Collection):
                        invalid.add(id(obj))
                    # An escaping owner can mutate any of its collections.
                    if text(arg) == 'self':
                        invalid.update(id(o) for o in self.objects.values() if isinstance(o, Collection))
        self.objects = {key: obj for key, obj in self.objects.items() if id(obj) not in invalid}

    def walk_helpers(self, fn):
        """Include reachable local owner helpers when checking writes/escapes."""
        methods = {n.name: n for n in self.owner.body if isinstance(n, ast.FunctionDef)} if self.owner else {}
        pending, seen = [fn], set()
        for function in pending:
            if id(function) in seen:
                continue
            seen.add(id(function))
            for node in ast.walk(function):
                yield node
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name) and node.func.value.id == 'self' and node.func.attr in methods:
                    pending.append(methods[node.func.attr])

    def identity(self, name):
        return '.'.join(filter(None, [self.path, name.removeprefix('self.')]))

    def get(self, name):
        return self.objects.get(name)

    def bind(self, fn, call, constants, objects):
        """Exact Python argument binding for our restricted factory subset."""
        from .analyzer import literal
        if fn.args.vararg or fn.args.kwarg or fn.args.kwonlyargs or fn.args.posonlyargs or fn.decorator_list:
            return None
        params = [p.arg for p in fn.args.args if p.arg != 'self']
        if len(call.args) > len(params) or any(isinstance(n, ast.Starred) for n in call.args):
            return None
        args = dict(zip(params[-len(fn.args.defaults):], fn.args.defaults)) if fn.args.defaults else {}
        args.update(zip(params, call.args))
        for kw in call.keywords:
            if kw.arg not in params or kw.arg in params[:len(call.args)]:
                return None
            args[kw.arg] = kw.value
        if any(p not in args for p in params):
            return None
        scalar, refs = {}, {}
        for key, expr in args.items():
            scalar[key] = literal(expr, constants)
            obj = self.read(expr, constants, objects, self.identity('argument:' + key))
            if obj is not None:
                refs[key] = obj
        return scalar, refs

    def arguments(self, module, cls):
        init = next((n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '__init__'), None)
        return self.bind(init, module.call, module.constants, module.objects) if init else ({}, {})

    def read(self, n, constants, objects, identity, depth=0):
        from .analyzer import literal, text, MODULES
        if depth > 8:
            return None
        if isinstance(n, (ast.Name, ast.Attribute)):
            return objects.get(text(n))
        if not isinstance(n, ast.Call):
            return None
        target = self.a.resolve(text(n.func))
        evidence = self.a.evidence(self.u, n, 'constructor')
        if target == 'copy.deepcopy' and len(n.args) == 1 and not n.keywords:
            obj = self.read(n.args[0], constants, objects, identity, depth + 1)
            if isinstance(obj, Module):
                # Internal argument references require a graph copy, beyond this subset.
                if obj.objects:
                    return None
                pair = self.a.definition(text(obj.call.func), self.u['cell']) or self.a.definition(text(obj.call.func))
                if pair:
                    cls = pair[1]
                    if not isinstance(cls, ast.ClassDef) or [self.a.resolve(text(b)) for b in cls.bases] != ['torch.nn.Module']:
                        return None
                    hooks = {'__deepcopy__', '__copy__', '__reduce__', '__reduce_ex__', '__getstate__', '__setstate__'}
                    if any(isinstance(m, ast.FunctionDef) and m.name in hooks for entries in self.a.definitions.values() for _, c in entries if isinstance(c, ast.ClassDef) for m in c.body):
                        return None
                return replace(obj, identity=identity, evidence=obj.evidence + evidence, allocation='default-deepcopy')
            return None
        if target == 'torch.nn.ModuleList' and len(n.args) == 1 and not n.keywords:
            expr = n.args[0]
            items = []
            if isinstance(expr, (ast.List, ast.Tuple)):
                items = [self.read(e, constants, objects, identity + '.' + str(i), depth + 1) for i, e in enumerate(expr.elts)]
            elif isinstance(expr, ast.ListComp) and len(expr.generators) == 1:
                gen = expr.generators[0]
                if gen.ifs or gen.is_async or not isinstance(gen.target, ast.Name) or not isinstance(gen.iter, ast.Call) or text(gen.iter.func) != 'range' or self.a.definition('range') or 'range' in objects or len(gen.iter.args) != 1 or gen.iter.keywords:
                    return None
                count = literal(gen.iter.args[0], constants)
                if type(count) is not int or not 0 <= count <= self.LIMIT:
                    return None
                items = [self.read(expr.elt, dict(constants, **{gen.target.id: i}), objects, identity + '.' + str(i), depth + 1) for i in range(count)]
            else:
                return None
            if len(items) > self.LIMIT or any(not isinstance(e, Module) for e in items):
                return None
            return Collection(items, evidence + [s for e in items for s in e.evidence], text(n))
        pair = self.a.definition(text(n.func), self.u['cell']) or self.a.definition(text(n.func))
        if pair and isinstance(pair[1], ast.FunctionDef):
            unit, fn = pair
            body = [s for s in fn.body if not (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) and isinstance(s.value.value, str))]
            if len(body) != 1 or not isinstance(body[0], ast.Return):
                return None
            bound = self.bind(fn, n, constants, objects)
            if bound is None:
                return None
            obj = self.read(body[0].value, *bound, identity, depth + 1)
            if isinstance(obj, Collection):
                obj.evidence += self.a.evidence(unit, body[0], fn.name)
            return obj
        known = target.startswith('torch.nn.') and target.split('.')[-1] in MODULES
        if known or pair and isinstance(pair[1], ast.ClassDef):
            # Retain only module references actually used as constructor arguments.
            refs = {text(a): objects[text(a)] for a in [*n.args, *(k.value for k in n.keywords)] if text(a) in objects and isinstance(objects[text(a)], (Module, Collection))}
            return Module(n, dict(constants), refs, identity, evidence,
                          'fresh-framework-construction' if known else 'constructor-object; parameter-sharing-unresolved')
        return None

    def serial_loop(self, statement, fn):
        """Certify only `for m in collection: x = m(x, invariant_inputs...)`."""
        from .analyzer import text
        if not isinstance(statement, ast.For) or statement.orelse or not isinstance(statement.target, ast.Name) or len(statement.body) != 1:
            return None
        body = statement.body[0]
        if not isinstance(body, ast.Assign) or len(body.targets) != 1 or not isinstance(body.targets[0], ast.Name) or not isinstance(body.value, ast.Call):
            return None
        state, iterator, call = body.targets[0].id, statement.target.id, body.value
        if state == iterator or text(call.func) != iterator:
            return None
        args = [*call.args, *(k.value for k in call.keywords)]
        if any(not isinstance(a, (ast.Name, ast.Constant)) for a in args) or any(k.arg is None for k in call.keywords):
            return None
        if sum(isinstance(a, ast.Name) and a.id == state for a in args) != 1 or any(isinstance(a, ast.Name) and a.id == iterator for a in args):
            return None
        name = text(statement.iter)
        obj = self.get(name)
        if not isinstance(obj, Collection):
            return None
        aliases = {key for key, value in self.objects.items() if value is obj}
        tree = list(self.walk_helpers(fn))
        changed = True
        while changed:
            changed = False
            for n in tree:
                if isinstance(n, ast.Assign) and text(n.value) in aliases:
                    for target in n.targets:
                        if isinstance(target, (ast.Name, ast.Attribute)) and text(target) not in aliases:
                            aliases.add(text(target)); changed = True
        for n in tree:
            if isinstance(n, (ast.Attribute, ast.Subscript)) and isinstance(n.ctx, (ast.Store, ast.Del)) and any(text(n) == alias or text(n).startswith(alias + '.') or text(n).startswith(alias + '[') for alias in aliases):
                return None
            if isinstance(n, ast.Call):
                target = text(n.func)
                if any(target.startswith(alias + '.') for alias in aliases) or any(text(a) in aliases or text(a) == 'self' for a in [*n.args, *(k.value for k in n.keywords)]):
                    return None
        return obj, state, iterator

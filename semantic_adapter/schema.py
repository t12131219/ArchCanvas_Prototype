"""Independent facts, evidence states and presentation contracts (no torch import)."""
import hashlib
import json

SCHEMA = 'archcanvas-source-semantic/2'
COVERAGE_CONTRACT = (
    '在明确限定的模型、输入范围和运行模式内，完整覆盖并验证所有分支。'
    '任何任意 PyTorch 模型均无 opaque 无法保证：未知自定义算子、外部依赖或动态 Python 行为可能无法从现有证据中还原。'
)
KINDS = {'composite', 'compute', 'parameter', 'buffer', 'state', 'value-alias', 'control', 'interface', 'opaque'}
EVIDENCE = {'static-only', 'runtime-only', 'source-runtime-associated', 'static-runtime-consistent', 'unobserved-branch', 'conflict', 'opaque'}
GLYPHS = {
    'composite': {'shape': 'frame', 'fill': '#edf2ff'},
    'compute': {'shape': 'rounded-rect', 'fill': '#dceffc'},
    'parameter': {'shape': 'resource', 'fill': '#f3dff1'},
    'buffer': {'shape': 'resource', 'fill': '#f5e6d6'},
    'state': {'shape': 'resource', 'fill': '#fbe8d3'},
    'value-alias': {'shape': 'value', 'fill': '#e8f6ef'},
    'control': {'shape': 'diamond', 'fill': '#fff0c1'},
    'interface': {'shape': 'port', 'fill': '#e7edf4'},
    'opaque': {'shape': 'dashed-rect', 'fill': '#fbe4e4'},
}

def digest(value):
    raw = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    return hashlib.sha256(raw).hexdigest()


def seal(ir):
    ir.pop('ir_digest', None)
    ir['ir_digest'] = digest(ir)
    return ir


def validate_ir(ir):
    errors = []
    if ir.get('schema') != SCHEMA:
        errors.append('unsupported schema')
    nodes = ir.get('nodes', [])
    by = {n['id']: n for n in nodes}
    if len(by) != len(nodes):
        errors.append('duplicate node IDs')
    for n in nodes:
        if n.get('kind') not in KINDS or n.get('evidence_status') not in EVIDENCE:
            errors.append('invalid kind/evidence: ' + n['id'])
        if n.get('parent') and n['parent'] not in by:
            errors.append('missing parent: ' + n['id'])
        seen, current = set(), n
        while current and current.get('parent'):
            if current['id'] in seen:
                errors.append('cyclic hierarchy: ' + n['id'])
                break
            seen.add(current['id'])
            current = by.get(current['parent'])
        if not n.get('source') and not n.get('runtime_evidence'):
            errors.append('node without evidence: ' + n['id'])
        for source in n.get('source', []):
            if source['file'] not in {s['path'] for s in ir['sources']} or source['line'] < 1:
                errors.append('invalid source: ' + n['id'])
    edge_ids = set()
    for e in ir.get('edges', []):
        if e['id'] in edge_ids or e['source'] not in by or e['target'] not in by:
            errors.append('invalid edge: ' + e['id'])
        edge_ids.add(e['id'])
        if e.get('evidence') not in {'source-dependency', 'runtime-tensor', 'framework-contract', 'runtime-state'}:
            errors.append('invalid edge evidence: ' + e['id'])
    for motif in ir.get('motifs', []):
        if not set(motif['members']) <= by.keys() or not motif.get('evidence'):
            errors.append('invalid motif: ' + motif['id'])
    if ir.get('ir_digest') != digest({k: v for k, v in ir.items() if k != 'ir_digest'}):
        errors.append('IR digest mismatch')
    return {'ok': not errors, 'errors': errors}

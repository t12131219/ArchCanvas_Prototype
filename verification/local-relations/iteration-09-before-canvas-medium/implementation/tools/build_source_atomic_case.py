#!/usr/bin/env python3
"""Build the source-atomic Transformer editor payload from the checked-in detailed case.

The payload keeps the audited routes and visual identities, then attaches a
source-atomic receipt to every node. The receipt is derived from semantic_ir,
never by importing or executing model code.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE_CASE = ROOT / 'data/cases/01093cc06a87b35a-detailed.json'
IR_PATH = ROOT / 'snapshots/transformer_programmatic_guide/generated/semantic_ir.json'
EVIDENCE_PATH = ROOT / 'snapshots/transformer_programmatic_guide/generated/source_evidence.json'
OUT_JSON = ROOT / 'data/cases/01093cc06a87b35b-source-atomic.json'
OUT_JS = ROOT / 'data/cases/01093cc06a87b35b-source-atomic.js'

STANDARD = {
    'name': 'source-atomic-v1',
    'description': '源码中的最小可解释单位：算子/表达式、参数或 buffer、控制量、以及明确的张量值别名。界面标签和说明框不计为原子算子。',
    'unit_rules': [
        'source-expression: 一个源码函数调用或表达式对应一个 operator 节点',
        'parameter: 一个可训练参数或持久 buffer 对应一个 resource 节点',
        'control: mask、causal 条件和循环控制对应 control 节点',
        'value-alias: 明确的张量中间值对应 value-alias 节点',
        'interface-binding: 只表示端口关系，不额外制造计算节点',
    ],
}

def atomic_kind(node):
    sem = node.get('semantic') or {}
    kind = sem.get('kind') or node.get('kind') or ''
    if kind in {'input', 'control'} or 'mask' in kind or kind in {'conditional'}:
        return 'control'
    if node.get('param_identity') or sem.get('param_identity') or sem.get('buffer_identity'):
        return 'parameter'
    if kind.endswith('value') or kind == 'value_alias' or node.get('value_alias'):
        return 'value-alias'
    if kind in {'label', 'explanatory_softmax'}:
        return 'presentation'
    return 'source-expression'

def main():
    graph = json.loads(SOURCE_CASE.read_text(encoding='utf-8'))
    ir = json.loads(IR_PATH.read_text(encoding='utf-8'))
    evidence_data = json.loads(EVIDENCE_PATH.read_text(encoding='utf-8'))
    symbols = evidence_data.get('symbols', {})
    ir_by_id = {n['id']: n for n in ir['nodes']}
    graph['caseId'] = '01093cc06a87b35b'
    graph['viewKey'] = 'source-atomic'
    graph['view'] = 'source-atomic'
    graph['sourceAtomicStandard'] = STANDARD
    graph['sourceAtomic'] = True
    graph['sourceAtomicIr'] = str(IR_PATH.relative_to(ROOT))
    graph_nodes = graph.get('nodes', [])
    for node in graph_nodes:
        sem = node.get('semantic') or {}
        ir_node = ir_by_id.get(node['id'], {})
        source_names = list(dict.fromkeys((ir_node.get('source_evidence') or sem.get('source_evidence') or [])))
        node['source_evidence'] = source_names
        node['atomicity'] = 'presentation' if not source_names and not (node.get('param_identity') or sem.get('param_identity')) else atomic_kind(node)
        node['semantic_kind'] = ir_node.get('kind') or sem.get('kind') or node.get('kind')
        contract = ir_node.get('semantic_contract') or sem.get('semantic_contract') or {}
        fallback = next((symbols[s] for s in source_names if s in symbols), None)
        node['source_expression'] = contract.get('source_expression') or (fallback.get('snippet', '').splitlines()[0].strip() if fallback else None)
        node['source_line'] = contract.get('source_line') or (fallback.get('start') if fallback else None)
        node['source_binding'] = {
            'evidence': source_names,
            'param_identity': ir_node.get('param_identity') or sem.get('param_identity'),
            'buffer_identity': ir_node.get('buffer_identity') or sem.get('buffer_identity'),
        }
    graph['sourceAtomicCounts'] = {
        'nodes': len(graph.get('nodes', [])),
        'edges': len(graph.get('edges', [])),
        'atomicNodes': sum(1 for n in graph.get('nodes', []) if n.get('atomicity') != 'presentation'),
        'presentationNodes': sum(1 for n in graph.get('nodes', []) if n.get('atomicity') == 'presentation'),
        'sourceIrNodes': len(ir.get('nodes', [])),
        'sourceIrEdges': len(ir.get('edges', [])),
        'foldedSourceUnits': len(set(n['id'] for n in ir['nodes']) - set(n['id'] for n in graph_nodes)),
    }
    OUT_JSON.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    OUT_JS.write_text('window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData["01093cc06a87b35b:source-atomic"]=' + json.dumps(graph, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(json.dumps(graph['sourceAtomicCounts'], ensure_ascii=False))

if __name__ == '__main__':
    main()

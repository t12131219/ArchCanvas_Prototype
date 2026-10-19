#!/usr/bin/env python3
"""Create an independent editor copy from the recorded CPU run, never execute source.

ATen events are the compute authority. Module hooks supply invocation nesting;
source symbols supply helper groups. Tensor IDs and output slots supply wires.
"""
import copy
import hashlib
import html
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASE = '01093cc06a87b35c'
ORIGINAL = '01093cc06a87b35b'
RECEIPT = ROOT / 'data/semantic/transformer-runtime.json'


def write(view, graph):
    stem = ROOT / f'data/cases/{CASE}-{view}'
    stem.with_suffix('.json').write_text(json.dumps(graph, ensure_ascii=False, indent=2) + '\n')
    stem.with_suffix('.js').write_text('window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData[' + json.dumps(CASE + ':' + view) + ']=' + json.dumps(graph, ensure_ascii=False, separators=(',', ':')) + ';\n')


def build():
    original_path = ROOT / f'data/cases/{ORIGINAL}-source-atomic.json'
    original = json.loads(original_path.read_text())
    evidence = json.loads(RECEIPT.read_text())
    runtime = evidence['runtime']
    receipt_body = {k: v for k, v in runtime.items() if k != 'trace_digest'}
    actual_digest = hashlib.sha256(json.dumps(receipt_body, ensure_ascii=False, sort_keys=True,
                                             separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    if actual_digest != runtime['trace_digest']:
        raise ValueError('CPU receipt digest mismatch')
    source_root = Path(runtime['binding']['source_root'])
    for name, expected in runtime['binding']['source_generation'].items():
        if hashlib.sha256((source_root / name).read_bytes()).hexdigest() != expected:
            raise ValueError('CPU receipt is stale for source: ' + name)
    run = next(r for r in runtime['runs'] if r['case'] == 'with-masks' and r['mode'] == 'eval')
    assert run['status'] == 'passed' and not run['truncated'] and runtime['source_unchanged']
    nodes, edges, by = [], [], {}
    order, children = {}, defaultdict(list)
    calls = {e['id']: e for e in run['module_events'] if e['event'] == 'enter'}
    exits, stack = {}, []
    for e in run['module_events']:
        if e['event'] == 'enter':
            stack.append(e['id'])
        else:
            call = stack.pop()
            assert calls[call]['path'] == e['path']
            exits[call] = e
    events = {e['id']: e for e in run['events']}

    def add(id, label, parent, kind, rank, **metadata):
        n = dict(id=id, label=label, parent=parent, atomicity=kind, semantic_kind=kind,
                 semantic=dict(id=id, kind=kind, parent=parent, **metadata))
        nodes.append(n); by[id] = n; order[id] = rank
        if parent:
            children[parent].append(id)
        return id

    module_ops = defaultdict(list)
    for e in run['events']:
        c = e['module_call']
        while c:
            module_ops[c].append(int(e['id'][2:])); c = calls[c]['parent_call']
    root = 'runtime:call0'
    for c, e in calls.items():
        descendants = module_ops[c]
        rank = min(descendants) if descendants else -1
        # Empty module calls are observed identities. Position them immediately
        # after their returned producer without manufacturing tensor bindings.
        if not descendants:
            rank = max((int(v['producer'][2:]) for v in exits[c].get('outputs', []) if v['producer'].startswith('op')), default=0) + .25
        label = 'Transformer · CPU trace' if not e['path'] else e['path'].split('.')[-1]
        if e['path'] == 'encoder.layers.0': label = 'EncoderLayer [0]'
        if e['path'] == 'decoder.layers.0': label = 'DecoderLayer [0]'
        if e['path'] == 'encoder': label = 'Encoder'
        if e['path'] == 'decoder': label = 'Decoder'
        if e['path'] == 'position': label = 'Position · ' + ('src' if rank < 65 else 'tgt')
        add('runtime:' + c, label, 'runtime:' + e['parent_call'] if e['parent_call'] else None,
            'module-call' if descendants else 'observed-identity-call', rank,
            module_path=e['path'], module_type=e['module_type'], call_id=c,
            runtime_inputs=e.get('inputs', []), runtime_outputs=exits[c].get('outputs', []),
            aten_events=len(descendants), executed=True,
            note=None if descendants else 'Observed module invocation; eval/dropout=0: no ATen compute. Hooks do not distinguish alias paths.')
    # Helper boundaries are source-evidenced, not guessed pattern matches.
    group = None; last_key = None; serial = defaultdict(int)
    for e in run['events']:
        source = e.get('source') or {}
        symbol = source.get('symbol', '')
        call = e['module_call']; key = (call, symbol)
        parent = 'runtime:' + call
        if symbol.endswith(('_split_heads', '_combine_heads')) or symbol == 'scaled_dot_product_attention':
            if key != last_key:
                serial[key] += 1
                group = f'helper:{call}:{symbol}:{serial[key]}'
                label = ('Split heads ' + str(serial[key]) if symbol.endswith('_split_heads') else
                         'Combine heads' if symbol.endswith('_combine_heads') else 'Scaled dot-product attention')
                if symbol.endswith('_split_heads'):
                    producer = events.get(e['inputs'][0]['producer'], {})
                    projection = producer.get('module_path', '').split('.')[-1]
                    if projection in ('w_q', 'w_k', 'w_v'):
                        label = 'Split ' + projection[-1].upper() + ' heads'
                add(group, label, parent, 'source-helper', int(e['id'][2:]), source_evidence=[symbol], source=source)
            parent = group
        last_key = key
        shapes = [v['shape'] for v in e['outputs']]
        label = e['operator'].removeprefix('aten.')
        add(e['id'], label, parent, 'runtime-operator', int(e['id'][2:]),
            operator=e['operator'], source=source, source_evidence=[symbol] if symbol else [],
            module_path=e['module_path'], call_id=call, runtime_event=e,
            output_shapes=shapes, mutable=e['mutable'])
        by[e['id']]['source_evidence'] = [symbol] if symbol else []
        by[e['id']]['source_line'] = source.get('line')
    # One node per actual parameter/buffer identity, never per use.
    resources = {}
    for kind in ('parameters', 'buffers'):
        for resource in run[kind]:
            prefix = 'parameter' if kind == 'parameters' else 'buffer'
            name = resource['name']; candidates = [c for c, e in calls.items() if name.rpartition('.')[0] == e['path']]
            owner = 'runtime:' + candidates[0] if len(candidates) == 1 else root
            used = [int(e['id'][2:]) for e in run['events'] if any(v['producer'] == prefix + ':' + name for v in e['inputs'])]
            id = prefix + ':' + name
            resources[id] = add(id, name.split('.')[-1] if owner != root else name, owner, prefix,
                                 min(used, default=0) - .5, resource=resource,
                                 param_identity=name if prefix == 'parameter' else None,
                                 buffer_identity=name if prefix == 'buffer' else None)
    selected_input = next(c for c in runtime['input_spec']['cases'] if c['id'] == run['case'])
    for i, (name, spec) in enumerate(selected_input['inputs'].items()):
        add('input:' + name, name, root, 'control' if 'mask' in name else 'input', -10 + i,
            runtime_spec=spec, source_evidence=['Transformer.forward'])
    memory = add('runtime:memory', 'Memory M · [1, 3, 8]', root, 'value-alias', 64.5,
                 producer='op64', output_slot=0, tensor_id=events['op64']['outputs'][0]['id'],
                 note='Identity binding of Encoder output; K/V read this same tensor, not a computation.')
    add('runtime:logits', 'Logits · [1, 2, 16]', root, 'output', 186,
        runtime_outputs=run['outputs'], note='Transformer.forward returns logits. No final probability Softmax executed.')
    def wire(source, target, value, operand, role='tensor'):
        id = f'trace-edge-{len(edges):04d}'
        edges.append(dict(id=id, source=source, target=target, arrow='target', style='orthogonal', role=role,
                          width=1.6 if role == 'resource' else 2.2, dashed=role == 'resource', draft=False, waypoints=[],
                          binding=dict(id=id, src=f"{source}:{value['slot']}", dst=f'{target}:operand:{operand}',
                                       canonical_src=f"{source}:{value['slot']}", canonical_dst=f'{target}:operand:{operand}',
                                       wire_identity=[value['id'], value['producer'], value['slot']],
                                       semantic_edges=[id], semantic_kind='interface-binding' if 'runtime:' in source else role,
                                       runtime=dict(case=run['case'], tensor=copy.deepcopy(value), consumer=target, operand=operand))))
    for e in run['events']:
        for i, value in enumerate(e['inputs']):
            source = value['producer']
            if source == 'op64' and e['module_path'].startswith('decoder'):
                source = memory
            assert source in by, source
            wire(source, e['id'], value, i, 'resource' if source.startswith(('parameter:', 'buffer:')) else 'tensor')
    wire('op64', memory, events['op64']['outputs'][0], 0)
    for i, value in enumerate(run['outputs']): wire(value['producer'], 'runtime:logits', value, i)
    # Horizontal execution timeline. Every nested region has its own lower
    # routing corridor; ancestor crossings are explicit named frame gates.
    incoming, outgoing = defaultdict(list), defaultdict(list)
    for e in edges:
        incoming[e['target']].append(e)
        outgoing[e['source']].append(e)
    def ancestors(id):
        result=[]
        while id:
            result.append(id); id=by[id]['parent']
        return result
    lca_edges = defaultdict(list)
    for e in edges:
        target_chain=ancestors(e['target'])
        lca=next(id for id in ancestors(e['source']) if id in target_chain)
        lca_edges[lca].append(e)
    # Allocate lanes by distinct tensor identity at each least common ancestor.
    lanes={}
    for owner, es in lca_edges.items():
        keys=list(dict.fromkeys(json.dumps(e['binding']['wire_identity']) for e in es))
        lanes[owner]={k: i for i,k in enumerate(keys)}
    def layout(id, x, y):
        n=by[id]; n.update(x=x,y=y,base=[x,y],expanded=bool(children[id]),routingObstacle=not bool(children[id]))
        if children[id]:
            cursor=x+40; high=y+120
            for child in sorted(children[id], key=lambda c:(order[c], c)):
                layout(child,cursor,y+100); cn=by[child]
                cursor+=cn['w']+64; high=max(high,cn['y']+cn['h'])
            n['w']=max(350,cursor-x-24)
            n['h']=high-y+80+len(lanes.get(id,{}))*16
            n['runtimeRoutingPadding']=80+len(lanes.get(id,{}))*16
            n['fill']='#f1f7fb' if 'helper:' not in id else '#f1f8ef'
        else:
            n['w']=310; n['h']=100
            n['fill']='#fff1cf' if n['atomicity'] in ('parameter','buffer') else '#e2f1fb' if n['atomicity']=='runtime-operator' else '#e4f5e8'
        sub=(n['semantic'].get('module_type','').split('.')[-1] if children[id] else
             'eval identity · no ATen' if n['atomicity']=='observed-identity-call' else
             str(n['semantic'].get('output_shapes',n['semantic'].get('resource',{}).get('shape',''))))
        if len(sub)>44: sub=sub[:41]+'…'
        label=n['label']
        # Long source names stay available in node details, not clipped SVG text.
        if len(label)>36: label=label[:33]+'…'
        n['html']=(f'<rect x="{x}" y="{y}" width="{n["w"]}" height="{n["h"]}" rx="10" fill="{n["fill"]}" stroke="#345168" stroke-width="2"/>'
                   f'<text x="{x+14}" y="{y+30}" font-size="16" fill="#172d40">{html.escape(label)}</text>'
                   f'<text x="{x+14}" y="{y+54}" font-size="11" fill="#546879">{html.escape(sub)}</text>')
        n['labelObstacles']=[dict(x=12,y=12,w=290,h=48)]
    layout(root,60,60)
    for id,n in by.items():
        n['runtimeOrder']=order[id]
    for id,n in by.items():
        slots=[]
        for e in outgoing[id]:
            key='out:'+json.dumps(e['binding']['wire_identity'])
            if key not in slots: slots.append(key)
        for e in incoming[id]: slots.append('in:'+e['id'])
        for e in outgoing[id]+incoming[id]:
            side='source' if e['source']==id else 'target'
            key='out:'+json.dumps(e['binding']['wire_identity']) if side=='source' else 'in:'+e['id']
            fraction=(slots.index(key)+1)/(len(slots)+1)
            e['fixed'+side.title()]=dict(side='bottom',fraction=fraction,offset=dict(x=n['w']*fraction,y=n['h']),inward=False)
    for e in edges:
        s,t=by[e['source']],by[e['target']]
        owner=next(id for id in ancestors(s['id']) if id in ancestors(t['id']))
        parent=by[owner]; i=lanes[owner][json.dumps(e['binding']['wire_identity'])]
        y=parent['y']+parent['h']-40-i*16
        a=dict(x=s['x']+e['fixedSource']['offset']['x'],y=s['y']+s['h'])
        b=dict(x=t['x']+e['fixedTarget']['offset']['x'],y=t['y']+t['h'])
        e['route']=[a,dict(x=a['x'],y=y),dict(x=b['x'],y=y),b]
    graph={k:copy.deepcopy(v) for k,v in original.items() if k in ('definitions','source','sourceDocs')}
    graph['extras']=''
    digest=hashlib.sha256(json.dumps(dict(trace=runtime['trace_digest'],run=run['case'],nodes=[n['semantic'] for n in nodes],edges=[e['binding'] for e in edges]),sort_keys=True).encode()).hexdigest()
    graph.update(caseId=CASE,viewKey='source-atomic',view='source-atomic',nodes=nodes,edges=edges,
                 canvas=[by[root]['x']+by[root]['w']+60,by[root]['y']+by[root]['h']+60],
                 attachments=[],junctionMarkers=[],routeLabels=[],sourceAtomic=True,fitFrontier=True,
                 irSource='data/semantic/transformer-runtime.json',irSha256=digest,
                 sourceProfile=runtime['input_spec']['constructor'],
                 sourceFacts=['独立副本：'+ORIGINAL+' → '+CASE,
                              'CPU 实际执行：with-masks / eval；186 个 ATen 事件，52 次模块调用。',
                              'src=[1,3]，tgt=[1,2]，D=8，H=2，Encoder/Decoder 各1层。',
                              '三个布尔掩码均为全 False；不代表遮挡位置或因果掩码已验证。',
                              '记录只覆盖本次路径；不表示任意输入、训练模式或所有分支均已覆盖。',
                              '轨迹端口记录张量操作数；Python 标量实参、未使用的返回槽位不会虚构额外计算节点。',
                              '按实测调用重排副本布局；算子节点保留源码行、输入输出张量与端口槽位。',
                              '橙色节点、虚线连接：参数 / buffer；蓝色：ATen 计算；绿色：输入、输出或显式身份别名。',
                              'Dropout 在此次 eval/dropout=0 记录中为身份调用，仅作为调用证据展示；不猜测其别名路径。'],
                 runtimeExpansion=dict(schema='runtime-editor-copy/1',copiedFrom=ORIGINAL,
                                       originalSha256=hashlib.sha256(original_path.read_bytes()).hexdigest(),
                                       traceDigest=runtime['trace_digest'],run=run['case'],mode=run['mode'],
                                       receipt=str(RECEIPT.relative_to(ROOT)),coverage='observed-run',
                                       counts=dict(operators=len(events),moduleCalls=len(calls),parameters=len(run['parameters']),buffers=len(run['buffers']),nodes=len(nodes),edges=len(edges))),
                 sourceAtomicStandard=dict(name='cpu-runtime-atomic-v1',unit_rules=[
                     'runtime-operator: 一个实际 ATen 事件；保留每个输出槽位和张量 ID。',
                     'module-call / source-helper: 调用或源码函数层级，内部可继续展开。',
                     'parameter / buffer: 按资源身份去重；复用资源仅画一个节点。',
                     'value-alias: 明确的同一张量别名，不增加计算。',
                     'observed-identity-call: 实际进入但未产生 ATen 计算的调用。']),
                 sourceAtomicCounts=dict(nodes=len(nodes),edges=len(edges),atomicNodes=len(events)+len(resources)+5,
                                         presentationNodes=0,sourceIrNodes=len(evidence['nodes']),foldedSourceUnits=0))
    write('source-atomic',graph)
    compact=copy.deepcopy(graph);compact['edges']=[];compact['nodes']=[]
    for n in nodes:
        if children[n['id']]:
            v=copy.deepcopy(n);v.update(w=330,h=84,expanded=False,routingObstacle=True,labelObstacles=[])
            x,y=v['base'];v['html']=f'<rect x="{x}" y="{y}" width="330" height="84" rx="10" fill="{v["fill"]}" stroke="#345168" stroke-width="2"/><text x="{x+14}" y="{y+30}" font-size="16" fill="#172d40">{html.escape(v["label"])}</text><text x="{x+14}" y="{y+56}" font-size="11" fill="#546879">{html.escape(v["semantic"].get("module_type",v["semantic"].get("kind","")))}</text>'
            compact['nodes'].append(v)
    write('compact-templates',compact)
    print(json.dumps(graph['runtimeExpansion'],ensure_ascii=False))

if __name__=='__main__':build()

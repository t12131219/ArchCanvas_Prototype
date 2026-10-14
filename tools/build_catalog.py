#!/usr/bin/env python3
"""Copy the eight authorized examples and adapt recorded diagrams, without executing models."""
from pathlib import Path
import copy
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PROTOTYPE = ROOT.parent
INPUTS = ['arrow_semantic_audit', 'migration_audit_evidence', 'model_zoo_programmatic_guide',
          'module_programmatic_guide', 'pytorch_transformer_original', 'timeseries_programmatic_guide',
          'transformer_programmatic_guide', 'yworks_edge_router_lab']
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
FIGURES = {'layout_overview.json': ('overview', '概览', 'figure1_overview.svg'),
           'layout_modules.json': ('modules', '内部模块', 'figure2_modules.svg'),
           'layout_detailed.json': ('detailed', '算子详细', 'figure3_detailed.svg'),
           'mini_residual_layout.json': ('residual', '残差小例', 'mini_residual.svg')}

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def dump(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def semantic_baseline(graph):
    """Preserve imported source identities separately from editable geometry.

    This is an integrity guard, not a source compiler. Native source/IR/SVG
    validators remain authoritative and are run by audit_source_semantics.py.
    """
    graph.setdefault('irSha256',None)
    return {'schema':'imported-source-baseline/1', 'irSha256':graph.get('irSha256'),
            'nodes':{n['id']:{'parent':n.get('parent'),'semantic':n.get('semantic',{}),
                             'visualBinding':n.get('visualBinding'),
                             **({'glyphPresentation':copy.deepcopy(n['glyphPresentation']),
                                 'glyphMarkupHash':markup_hash(n['html']),
                                 'labelObstacles':copy.deepcopy(n['labelObstacles'])} if n.get('glyphPresentation') else {})} for n in graph['nodes']},
            'attachments':{a['id']:{'owner':a['owner'],'kind':a['kind'],
                                   'value_owner':a.get('value_owner'),'source_owner':a.get('source_owner')} for a in graph.get('attachments',[])},
            'routeLabels':{a['id']:{k:copy.deepcopy(v) for k,v in a.items() if k!='anchor'} for a in graph.get('routeLabels',[])},
            'junctionMarkers':copy.deepcopy(graph.get('junctionMarkers',[])),
            'edges':{e['id']:{'source':e['source'],'target':e['target'],'binding':e.get('binding',{}),
                             'fixedSource':e.get('fixedSource'),'fixedTarget':e.get('fixedTarget'),
                             'portPolicy':e.get('portPolicy')}
                     for e in graph['edges']}}

def markup_hash(value):
    # FNV-1a over UTF-16 code units, also available synchronously in the worker.
    h=2166136261
    data=value.encode('utf-16-le')
    for i in range(0,len(data),2):h=((h^(data[i]+256*data[i+1]))*16777619)&0xffffffff
    return f'{h:08x}'

def route_markers(graph):
    """Bind dots to source-authorized forks, independent of SVG element order.

    A branch needs the same source tensor and at least three incident rays.
    Spatial crossings alone never authorize a marker or a tensor merge.
    """
    def wire(e):
        b=e.get('binding',{});c=b.get('endpoint_binding',{}).get('canonical',{})
        return b.get('wire_identity') or b.get('canonical_src') or ([c['src'],c.get('src_port','out')] if c.get('src') else None) or ([b['semantic_src'],b.get('semantic_src_port','out')] if b.get('semantic_src') else None) or b.get('src') or e['id']
    def on(p,a,b):
        return (abs(a['x']-b['x'])<1e-5 and abs(p['x']-a['x'])<1e-5 and min(a['y'],b['y'])-1e-5<=p['y']<=max(a['y'],b['y'])+1e-5) or (abs(a['y']-b['y'])<1e-5 and abs(p['y']-a['y'])<1e-5 and min(a['x'],b['x'])-1e-5<=p['x']<=max(a['x'],b['x'])+1e-5)
    def branch(p,edges):
        rays=set()
        for e in edges:
            for a,b in zip(e['route'],e['route'][1:]):
                if on(p,a,b):
                    for q in [a,b]:
                        if abs(q['x']-p['x'])+abs(q['y']-p['y'])>1e-5:rays.add(('x' if abs(q['x']-p['x'])>1e-5 else 'y',1 if q['x']+q['y']>p['x']+p['y'] else -1))
        return len(rays)>=3
    groups={}
    for e in graph['edges']:groups.setdefault(json.dumps(wire(e),sort_keys=True),[]).append(e)
    markers=[];at={}
    # Source vertices identify fork topology. Do not add dots at a bare cross.
    for es in groups.values():
        if len(es)<2:continue
        for p in [p for e in es for p in e['route']]:
            refs=[e for e in es if any(on(p,a,b) for a,b in zip(e['route'],e['route'][1:]))]
            key=(round(p['x'],5),round(p['y'],5),json.dumps(wire(es[0]),sort_keys=True))
            if key in at or len(refs)<2 or not branch(p,refs):continue
            marker={'id':'tensor-junction-'+str(len(markers)+1),'original':[p['x'],p['y']],
                    'edges':[e['id'] for e in refs],'wire':wire(es[0]),'owner':refs[0]['source'],
                    'authority':'recorded source tensor and route fork; geometry follows shared routes',
                    'radius':2.5,'fill':'#263348','fragments':[]}
            markers.append(marker);at[key]=marker
    for owner,field in [(n,'html') for n in graph['nodes']]+[(graph,'extras')]:
        document=ET.fromstring('<svg xmlns="'+SVG+'">'+owner.get(field,'')+'</svg>')
        changed=False
        for parent in document.iter():
            for e in list(parent):
                if tag(e)!='circle' or e.get('data-node-id'):continue
                try:cx,cy,r=float(e.get('cx')),float(e.get('cy')),float(e.get('r'))
                except (TypeError,ValueError):continue
                matches=[m for m in markers if abs(m['original'][0]-cx)<1e-5 and abs(m['original'][1]-cy)<1e-5]
                if r>6 or len(matches)!=1:continue
                m=matches[0];m['radius']=r;m['fill']=e.get('fill','#263348')
                fragment=markup(e);legacy=copy.deepcopy(e)
                for name in list(legacy.attrib):
                    if name.startswith('data-junction'):del legacy.attrib[name]
                m['fragments'].append({'owner':owner.get('id'),'html':fragment,'legacyHtml':markup(legacy)})
                parent.remove(e);changed=True
        if changed:owner[field]=''.join(ET.tostring(e,encoding='unicode') for e in document)
    # Unmarked crossings between separate ports/aliases are not source forks.
    # Render an inferred dot only for a fan-out from one physical output slot.
    graph['junctionMarkers']=[m for m in markers if m['fragments'] or
        len({(e['source'],json.dumps(e['fixedSource'],sort_keys=True)) for e in graph['edges'] if e['id'] in m['edges']})==1]
    return graph

def routing_policies(graph):
    """Register visual freedom from source identities before freezing the baseline.

    A physical side is not a model field. Keep alias trunks, branch junctions,
    folded slots and shared producers fixed; container interfaces can slide on
    their recorded side, while ordinary glyphs can use another free side.
    """
    nodes={n['id']:n for n in graph['nodes']}
    def wire(e):
        b=e.get('binding',{});c=b.get('endpoint_binding',{}).get('canonical',{})
        return b.get('wire_identity') or b.get('canonical_src') or ([c['src'],c.get('src_port','out')] if c.get('src') else None) or ([b['semantic_src'],b.get('semantic_src_port','out')] if b.get('semantic_src') else None) or b.get('src') or e['id']
    def overlap(a,b,c):
        if a['x']==b['x']==c['x']:
            return max(0,min(max(a['y'],b['y']),max(a['y'],c['y']))-max(min(a['y'],b['y']),min(a['y'],c['y'])))
        if a['y']==b['y']==c['y']:
            return max(0,min(max(a['x'],b['x']),max(a['x'],c['x']))-max(min(a['x'],b['x']),min(a['x'],c['x'])))
        return 0
    for e in graph['edges']:
        policies={}
        for side in ['source','target']:
            n=nodes[e[side]];f=e['fixed'+side.title()]
            shape=n.get('glyphPresentation',{}).get('silhouette') or ('circle' if re.search(r'<(?:\w+:)?(?:circle|ellipse)\b',n.get('html','')) else 'rectangle')
            refs=[(v,s) for v in graph['edges'] for s in ['source','target'] if v is not e and v[s]==n['id']]
            crowded=any(v['fixed'+s.title()]['side']==f['side'] and
                        abs(v['fixed'+s.title()]['fraction']-f['fraction'])*(n['h'] if f['side'] in ['left','right'] else n['w'])<12.001 for v,s in refs)
            normal_distance=abs(f['offset']['x']-(0 if f['side']=='left' else n['w'])) if f['side'] in ['left','right'] else abs(f['offset']['y']-(0 if f['side']=='top' else n['h']))
            protected=n.get('junction') or n.get('visualBinding') or crowded or normal_distance>1e-5 or any(k.startswith('recordedFixed') for k in e) or 'branch' in e.get('binding',{}).get('representation','') or 'bus' in e.get('binding',{}).get('representation','')
            mode='fixed' if protected else 'side' if n.get('expanded') else 'perimeter'
            gates=[]
            # Only a source-recorded straight terminal through an ancestor
            # may carry that interface along with its owner. Other gates stay
            # fixed: geometric proximity never creates a new model interface.
            a=e['route'][0 if side=='source' else -1];b=e['route'][1 if side=='source' else -2]
            frames={}
            for endpoint in ['source','target']:
                parent=e[endpoint];seen=set()
                while parent and parent not in seen:
                    seen.add(parent);frame=nodes[parent];parent=frame.get('parent')
                    if frame.get('expanded'):frames[frame['id']]=frame
            for frame in frames.values():
                for gate_side in ['top','bottom'] if abs(a['x']-b['x'])<1e-5 else ['left','right']:
                    vertical=gate_side in ['top','bottom'];axis='y' if vertical else 'x';along='x' if vertical else 'y'
                    coordinate=frame[axis]+(frame['h' if vertical else 'w'] if gate_side in ['bottom','right'] else 0)
                    lo=frame[along];size=frame['w' if vertical else 'h']
                    if abs(a[along]-b[along])<1e-5 and min(a[axis],b[axis])-1e-5<=coordinate<=max(a[axis],b[axis])+1e-5 and lo<=a[along]<=lo+size:
                        step=(1 if b[axis]>a[axis] else -1)*(1 if side=='source' else -1)
                        after={axis:coordinate+step*.02,along:a[along]}
                        entering=frame['x']<after['x']<frame['x']+frame['w'] and frame['y']<after['y']<frame['y']+frame['h']
                        gates.append({'frame':frame['id'],'side':gate_side,'anchor':side,'fraction':(a[along]-lo)/size,'direction':'enter' if entering else 'exit',
                                      'authority':'recorded straight terminal crosses source ancestor'})
            shared=None
            if side=='source':
                a,b=e['route'][:2];length=max([overlap(a,b,v['route'][1]) for v in graph['edges'] if v is not e and v['source']==e['source'] and wire(v)==wire(e) and v['route'][0]==a]+[0])
                if length>1e-5:
                    axis='y' if a['x']==b['x'] else 'x'
                    shared={'side':f['side'],'length':length,'axis':axis,'coordinate':a[axis]+(1 if b[axis]>a[axis] else -1)*length,'wire':wire(e),
                            'owner':n.get('parent')}
            policies[side]={'mode':mode,'shape':shape,'spacing':12,'gates':gates,'sharedStem':shared,
                            'authority':'canonical binding retained; SVG port is presentation evidence',
                            'reason':'alias, shared stem, branch or reserved slot' if protected else 'recorded container side' if mode=='side' else 'free glyph perimeter'}
        e['portPolicy']=policies
    return graph

def copy_inputs():
    entries = []
    for name in INPUTS:
        src, dst = PROTOTYPE / name, ROOT / 'snapshots' / name
        if not src.is_dir():
            raise RuntimeError(f'Missing input {src}')
        for p in sorted(src.rglob('*')):
            if not p.is_file() or p.is_symlink() or any(x in p.parts for x in ['__pycache__', '.git']):
                continue
            # Runtime process logs are not portable examples.
            if p.name in ['server.log', 'server.pid']:
                continue
            out = dst / p.relative_to(src)
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, out)
            entries.append({'source': str(p.relative_to(PROTOTYPE)),
                            'snapshot': str(out.relative_to(ROOT)), 'bytes': p.stat().st_size,
                            'sha256': digest(out)})
    for name in ['source_glyphs.py','source_glyph_validation.py']:
        src=PROTOTYPE/name;out=ROOT/'snapshots'/name
        if src.is_file():
            shutil.copy2(src,out)
            entries.append({'source':name,'snapshot':str(out.relative_to(ROOT)),'bytes':src.stat().st_size,'sha256':digest(out)})
    dump(ROOT / 'verification' / 'input-manifest.json', entries)
    return entries

def tag(e):
    return e.tag.rsplit('}', 1)[-1]

def markup(e):
    c = copy.deepcopy(e)
    for item in c.iter():
        for key in list(item.attrib):
            if key.startswith('on') or key in ['marker-end', 'marker-start', 'data-node-id']:
                del item.attrib[key]
    return ET.tostring(c, encoding='unicode')

def points_from_d(d):
    # Our recorded diagrams use absolute M/L/H/V. Unsupported commands stay opaque.
    tokens = re.findall(r'[A-Za-z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?', d or '', re.I)
    out, x, y, command, i = [], 0., 0., None, 0
    while i < len(tokens):
        if tokens[i].isalpha():
            command = tokens[i]; i += 1
        if command not in ['M', 'L', 'H', 'V']:
            return []
        try:
            if command in ['M', 'L']:
                x, y = float(tokens[i]), float(tokens[i + 1]); i += 2
            elif command == 'H':
                x = float(tokens[i]); i += 1
            else:
                y = float(tokens[i]); i += 1
        except (IndexError, ValueError):
            return []
        out.append([x, y])
        if command == 'M':
            command = 'L'
    return out

def endpoint(ref, xy, nodes, junctions):
    ids = {n['id']: n for n in nodes}
    name = (ref or '').rsplit(':', 1)[0]
    if name in ids:
        return ids[name]
    # Prefer the recorded producer/consumer; geometric inference is explicitly labelled.
    if ref:
        scored = []
        for n in nodes:
            x, y, w, h = n['x'], n['y'], n['w'], n['h']
            if x - 10 <= xy[0] <= x + w + 10 and y - 10 <= xy[1] <= y + h + 10:
                score = min(abs(xy[0] - x), abs(xy[0] - x - w), abs(xy[1] - y), abs(xy[1] - y - h))
                scored.append((score, w * h, n['id'], n))
        if scored and min(scored)[0] <= 10:
            return min(scored)[-1]
    key = f'{xy[0]:.4f},{xy[1]:.4f}'
    if key not in junctions:
        n = {'id': 'junction-' + str(len(junctions) + 1), 'label': '分支连接点',
             'x': xy[0], 'y': xy[1], 'w': 0, 'h': 0, 'base': [xy[0], xy[1]],
             'expanded': False, 'junction': True, 'routingObstacle': False, 'parent': None,
             'html': '', 'semantic': {'kind': 'recorded visual junction', 'original_ref': ref}}
        nodes.append(n); junctions[key] = n
    return junctions[key]

def fixed_port(n, p, other):
    x, y, w, h = n['x'], n['y'], n['w'], n['h']
    sides = [('left', abs(p[0] - x), (p[1] - y) / h if h else .5),
             ('right', abs(p[0] - x - w), (p[1] - y) / h if h else .5),
             ('top', abs(p[1] - y), (p[0] - x) / w if w else .5),
             ('bottom', abs(p[1] - y - h), (p[0] - x) / w if w else .5)]
    if n.get('junction'):
        dx, dy = other[0] - p[0], other[1] - p[1]
        side = ('right' if dx >= 0 else 'left') if abs(dx) > abs(dy) else ('bottom' if dy >= 0 else 'top')
        fraction = .5
    else:
        side, _, fraction = min(sides, key=lambda v: v[1])
    normal = {'left': (-1, 0), 'right': (1, 0), 'top': (0, -1), 'bottom': (0, 1)}[side]
    inward = n['expanded'] and (other[0] - p[0]) * normal[0] + (other[1] - p[1]) * normal[1] < 0
    return {'side': side, 'fraction': max(0., min(1., fraction)),
            'offset': {'x': p[0] - x, 'y': p[1] - y}, 'inward': bool(inward)}

def allocate_semantic_ports(nodes, edges):
    """A folded module can project several distinct fields to one SVG slot.
    Separate physical slots while retaining each exact canonical field/trace.
    This is a visual edit; the recorded binding and source geometry stay intact.
    """
    index={n['id']:n for n in nodes}; groups={}; changes=[]
    for e in edges:
        b=e['binding']
        if b.get('representation') in ['fork_bus','collection_bus','fork_branch','collection_branch']:continue
        for side in ['source','target']:
            n=index[e[side]];f=e['fixed'+side.title()]
            if n.get('junction'):continue
            which='src' if side=='source' else 'dst';canonical=b.get('endpoint_binding',{}).get('canonical',{})
            field=b.get('canonical_'+which) or (f"{canonical[which]}:{canonical.get(which+'_port','out' if side=='source' else 'in')}" if which in canonical else None)
            field=field or (f"{b['semantic_'+which]}:{b.get('semantic_'+which+'_port','out' if side=='source' else 'in')}" if b.get('semantic_'+which) else b.get(which))
            # A visible value alias names one tensor. Its shared input is not
            # split into WK/WV slots merely because downstream consumers differ.
            # Preserve both canonical traces while keeping one physical trunk.
            if n.get('visualBinding'):field=n['visualBinding']['canonical']
            if not field:continue
            p=e['route'][0 if side=='source' else -1]
            key=(n['id'],f['side'],round(p['x'],5),round(p['y'],5))
            # A folded list input can expose the same physical field name for
            # several producers (for example TimeMixer's ``side:scale``).
            # Those are separate tuple/list members, not one scalar port. Use
            # the recorded trace as a stable slot discriminator while keeping
            # repeated renderings of the same trace on the same slot.
            trace = json.dumps(b.get('semantic_trace', []), ensure_ascii=False, sort_keys=True)
            slot = field + '|' + trace if side == 'target' and b.get('representation') == 'typed_auxiliary' and b.get('semantic_trace') else field
            groups.setdefault(key,{}).setdefault(slot,{'field':field,'refs':[]})['refs'].append((e,side))
    for (node_id,port_side,px,py),fields in groups.items():
        if len(fields)<2:continue
        n=index[node_id];vertical=port_side in ['left','right'];size=n['h'] if vertical else n['w'];origin=n['y'] if vertical else n['x'];old=py if vertical else px
        spacing=min(12,(size-8)/max(1,len(fields)-1));span=spacing*(len(fields)-1)
        first=max(origin+4,min(origin+size-4-span,old-span/2))
        for slot,(slot_key,entry) in enumerate(sorted(fields.items())):
            field, refs = entry['field'], entry['refs']
            along=first+slot*spacing
            for e,side in refs:
                key='fixed'+side.title();fixed=e[key];e['recorded'+key[0].upper()+key[1:]]=copy.deepcopy(fixed)
                p=e['route'][0 if side=='source' else -1];p['y' if vertical else 'x']=along
                fixed['offset']['y' if vertical else 'x']=along-origin;fixed['fraction']=(along-origin)/size
                # Keep the terminal tangent orthogonal as it moves along the side.
                neighbor=e['route'][1 if side=='source' else -2]
                if len(e['route'])>2:neighbor['y' if vertical else 'x']=along
                changes.append({'edge':e['id'],'endpoint':side,'node':node_id,'field':field,'slot':slot_key,'side':port_side,
                                'original':[px,py],'physical':[p['x'],p['y']], 'reason':'distinct canonical fields in one folded SVG slot'})
    return changes

def adapt(layout_path, svg_path):
    layout = json.loads(layout_path.read_text())
    ir_path = layout_path.parent / 'semantic_ir.json'
    if not ir_path.exists() and 'expanded_views' in layout_path.parts:
        ir_path=ROOT/'snapshots/timeseries_programmatic_guide/generated'/layout_path.parent.name/'semantic_ir.json'
    ir = json.loads(ir_path.read_text()) if ir_path.exists() else {}
    ir_nodes = {n['id']: n for n in ir.get('nodes', [])}
    boxes = layout['boxes']
    if isinstance(boxes, dict):
        boxes = [{'id': k, 'bbox': v} for k, v in boxes.items()]
    ids = {b['id'] for b in boxes}
    nodes = []
    for b in boxes:
        x, y, w, h = b['bbox']
        semantic = ir_nodes.get(b['id'], {})
        expanded = b.get('expanded', any(c.get('parent') == b['id'] for c in boxes))
        nodes.append({'id': b['id'], 'label': semantic.get('label', b['id']),
                      'x': x, 'y': y, 'w': w, 'h': h, 'base': [x, y],
                      'parent': b.get('parent'), 'expanded': expanded,
                      'routingObstacle': not expanded, 'html': '', 'semantic': semantic,
                      'fill': b.get('style', {}).get('fill', '#e7f5fe')})
        if b.get('presentation'):nodes[-1]['glyphPresentation']=copy.deepcopy(b['presentation'])
    node_map = {n['id']: n for n in nodes}
    # Transformer tensor grids have their own visual IDs and explicit canonical
    # owners, while their recorded layout parent is null. They belong to the
    # visible enclosing scope of that owner, not the top-level canvas.
    for b in boxes:
        if b.get('glyph') != 'tensor_value_alias' or not b.get('canonical'): continue
        n=node_map[b['id']]; owner=b['canonical'].rsplit(':',1)[0]; cursor=owner; scope=None
        while cursor:
            candidate=node_map.get(cursor)
            if candidate and candidate['expanded'] and candidate['x']<=n['x'] and candidate['y']<=n['y'] and candidate['x']+candidate['w']>=n['x']+n['w'] and candidate['y']+candidate['h']>=n['y']+n['h']:
                scope=cursor;break
            cursor=ir_nodes.get(cursor,{}).get('parent')
        n['layoutParent']=n['parent'];n['parent']=scope
        n['visualBinding']={'canonical':b['canonical'],'owner':owner,'scope':scope,
                            'evidence':'recorded tensor_value_alias canonical owner + semantic IR hierarchy'}
    document = ET.parse(svg_path).getroot()
    fragments = {k: [] for k in ids}; extras = []; definitions = []; active = None
    attachment_specs = {a['id']:a for a in layout.get('attachments',[])}
    attachments = []
    edge_label_specs={a['id']:a for a in layout.get('edge_labels',[])}
    edge_labels=[]
    has_node_ids = any(e.get('data-node-id') in ids for e in document)
    routes = layout.get('routes', [])
    signatures = {tuple(tuple(v) for v in r.get('points', [])) for r in routes}
    for e in document:
        t = tag(e)
        if t == 'defs':
            definitions.append(markup(e)); continue
        if t in ['metadata', 'title', 'desc']:
            continue
        if t == 'rect' and (e.get('width') == '100%' or (not e.get('x') and not e.get('y'))):
            continue
        edge_label_id=e.get('data-edge-label-id')
        if edge_label_id:
            spec=edge_label_specs.get(edge_label_id)
            if not spec or e.get('data-follow-edge')!=spec['route']:raise ValueError('unregistered edge caption '+edge_label_id)
            edge_labels.append({**spec,'kind':'edge-label','html':markup(e)})
            continue
        follow_id = e.get('data-follow-id')
        if follow_id:
            spec = attachment_specs.get(follow_id)
            if not spec or spec['owner'] not in node_map or e.get('data-follow-owner') != spec['owner']:
                raise ValueError('unregistered presentation attachment '+follow_id)
            if e.get('data-follow-kind') != spec['kind']:
                raise ValueError('presentation kind differs '+follow_id)
            attachments.append({**spec, 'html':markup(e)})
            continue
        # Remove every old connection. Node glyphs, labels and publication annotations stay.
        if t == 'path' and (e.get('marker-end') or e.get('marker-start') or e.get('data-route-id') or e.get('data-edge-id') or
                            tuple(tuple(v) for v in points_from_d(e.get('d'))) in signatures or e.get('class') == 'edge'):
            continue
        node_id = e.get('data-node-id')
        if node_id in ids:
            active = node_id
            fragments[active].append(markup(e)); continue
        if node_id:
            active = None
        # Labels are emitted beside their owning node, not nested inside its original <g>.
        if active:
            n = node_map[active]
            try:
                ex, ey = float(e.get('x', 'nan')), float(e.get('y', 'nan'))
                belongs = n['x'] - 8 <= ex <= n['x'] + n['w'] + 8 and n['y'] - 8 <= ey <= n['y'] + n['h'] + 8
            except ValueError:
                belongs = False
            if belongs or t in ['circle', 'ellipse']:
                fragments[active].append(markup(e)); continue
        # Historical figures lacking data-node-id are assigned by recorded coordinates.
        if not has_node_ids and t in ['rect', 'text', 'circle', 'g']:
            try:
                ex, ey = float(e.get('x', e.get('cx', 'nan'))), float(e.get('y', e.get('cy', 'nan')))
                candidates = [n for n in nodes if n['x'] <= ex <= n['x'] + n['w'] and n['y'] <= ey <= n['y'] + n['h']]
                if candidates:
                    own = min(candidates, key=lambda n: n['w'] * n['h'])
                    fragments[own['id']].append(markup(e)); continue
            except ValueError:
                pass
        extras.append(markup(e))
    if set(attachment_specs) != {a['id'] for a in attachments} or len(attachments) != len(attachment_specs):
        raise ValueError('presentation attachment coverage differs '+str(svg_path))
    if set(edge_label_specs)!={a['id'] for a in edge_labels} or len(edge_label_specs)!=len(edge_labels):
        raise ValueError('edge caption coverage differs '+str(svg_path))
    edge_labels.extend(a for a in attachments if a['kind']=='edge-label')
    attachments=[a for a in attachments if a['kind']!='edge-label']
    for n in nodes:
        n['html'] = ''.join(fragments[n['id']])
        if not n['html']:
            # A source figure may record a port box with no separate glyph.
            n['html'] = f'<rect x="{n["x"]}" y="{n["y"]}" width="{n["w"]}" height="{n["h"]}" rx="8" fill="{n["fill"]}" stroke="#647a85"/>'
    # Frame titles and field labels also occupy space. Leaf labels are already
    # protected by their node bodies; frame labels need separate obstacles.
    for n in nodes:
        n['labelObstacles'] = []
        if not n['expanded'] and not n.get('glyphPresentation'): continue
        if n.get('glyphPresentation'):
            n['labelObstacles']=[{'x':x-n['x']-2,'y':y-n['y']-2,'w':w+4,'h':h+4}
                for label in n['glyphPresentation']['label_boxes'] for x,y,w,h in [label['bbox']]]
            continue
        labels = ''.join(a['html'] for a in attachments if a['owner']==n['id'] and a['kind']=='label')
        fragment = ET.fromstring('<svg xmlns="'+SVG+'">'+n['html']+labels+'</svg>')
        for text in fragment.iter():
            if tag(text) != 'text': continue
            if text.get('data-glyph-symbol'):continue
            try:
                tx,ty,size=float(text.get('x')),float(text.get('y')),float(text.get('font-size','16'))
            except (TypeError,ValueError): continue
            lines=[v for v in text if tag(v)=='tspan'] or [text]
            width=max(len(''.join(v.itertext())) for v in lines)*size*.53
            left=tx-(width/2 if text.get('text-anchor')=='middle' else width if text.get('text-anchor')=='end' else 0)
            n['labelObstacles'].append({'x':left-n['x']-1,'y':ty-n['y']-size,'w':width+2,'h':size*1.18*len(lines)})
    edges, junctions, seen = [], {}, set()
    for i, r in enumerate(routes):
        pts = r.get('points', [])
        if len(pts) < 2:
            continue
        # Repeated fork buses have the same route identity and geometry, not a second tensor.
        signature = (r.get('id'), tuple(tuple(v) for v in pts), r.get('src'), r.get('dst'))
        if signature in seen:
            continue
        seen.add(signature)
        s, t = endpoint(r.get('src'), pts[0], nodes, junctions), endpoint(r.get('dst'), pts[-1], nodes, junctions)
        edges.append({'id': f'{r.get("id", "edge")}-{i}', 'source': s['id'], 'target': t['id'],
                      'arrow': 'target' if r.get('arrow', True) else 'none', 'style': 'orthogonal',
                      'route': [{'x': v[0], 'y': v[1]} for v in pts], 'waypoints': [],
                      'fixedSource': fixed_port(s, pts[0], pts[1]), 'fixedTarget': fixed_port(t, pts[-1], pts[-2]),
                      'role': r.get('role', r.get('semantic_kind', 'tensor')), 'width':r.get('width',2.2),
                      'dashed': r.get('dashed', r.get('representation') == 'typed_auxiliary'),
                      'binding': r, 'draft': False})
    # A bus line must be split at its branch junctions before it becomes an
    # editable graph. A crossing without a recorded trace is never a junction.
    buses=[e for e in edges if e['binding'].get('representation') in ['fork_bus','collection_bus']]
    replacements={}
    for bus in buses:
        if len(bus['route']) != 2: continue
        a,b=bus['route']; dx,dy=b['x']-a['x'],b['y']-a['y']; length=dx*dx+dy*dy
        if not length: continue
        candidates=[];trace=set(bus['binding'].get('semantic_trace',[]))
        for other in edges:
            if other is bus or not trace.intersection(other['binding'].get('semantic_trace',[])):continue
            for p in [other['route'][0],other['route'][-1]]:
                t=((p['x']-a['x'])*dx+(p['y']-a['y'])*dy)/length
                if 1e-6<t<1-1e-6 and abs((p['x']-a['x'])*dy-(p['y']-a['y'])*dx)<1e-5:
                    candidates.append((t,p))
        cuts=[a]+[p for t,p in sorted({(round(t,9),p['x'],p['y']):(t,p) for t,p in candidates}.values(),key=lambda v:v[0])]+[b]
        if len(cuts)==2:continue
        parts=[]
        for k,(p,q) in enumerate(zip(cuts,cuts[1:])):
            e=copy.deepcopy(bus); s=endpoint(None,[p['x'],p['y']],nodes,junctions) if k else next(n for n in nodes if n['id']==bus['source'])
            t=endpoint(None,[q['x'],q['y']],nodes,junctions) if k<len(cuts)-2 else next(n for n in nodes if n['id']==bus['target'])
            e.update(id=bus['id']+f'.part{k+1}',source=s['id'],target=t['id'],route=[p,q],
                     fixedSource=fixed_port(s,[p['x'],p['y']],[q['x'],q['y']]),fixedTarget=fixed_port(t,[q['x'],q['y']],[p['x'],p['y']]))
            parts.append(e)
        replacements[bus['id']]=parts
    edges=[part for e in edges for part in replacements.get(e['id'],[e])]
    for a in edge_labels:
        refs=[e for e in edges if e['binding']['id']==a['route']]
        if len(refs)!=1:raise ValueError('ambiguous edge caption route '+a['id'])
        a['edge']=refs[0]['id']
        points=refs[0]['binding']['points'];x,y,w,h=a['bbox'];cx,cy=x+w/2,y+h/2
        a['scope']=[n['id'] for n in nodes if n['expanded'] and n['x']<=x and n['y']<=y and n['x']+n['w']>=x+w and n['y']+n['h']>=y+h]
        total=sum(((q[0]-p[0])**2+(q[1]-p[1])**2)**.5 for p,q in zip(points,points[1:]))
        best=None;along=0
        for p,q in zip(points,points[1:]):
            dx,dy=q[0]-p[0],q[1]-p[1];length=(dx*dx+dy*dy)**.5
            if not length:continue
            t=max(0,min(1,((cx-p[0])*dx+(cy-p[1])*dy)/length**2));px,py=p[0]+t*dx,p[1]+t*dy
            candidate=((cx-px)**2+(cy-py)**2,along+t*length,px,py)
            if best is None or candidate[0]<best[0]:best=candidate
            along+=length
        if best:
            _,distance,px,py=best
            a['anchor']=dict(mode=a.get('near','ratio'),ratio=.5 if a.get('edge_spec') and a.get('near')=='ratio' else distance/total,distance=total-distance if a.get('near')=='target' else distance,gap=7,side=dict(x=cx-px,y=cy-py))
    port_allocations=allocate_semantic_ports(nodes,edges)
    docs = {name: str((layout_path.parent / name).relative_to(ROOT))
            for name in ['source_map.md', 'source_evidence.json', 'README.md']
            if (layout_path.parent / name).is_file()}
    return {'nodes': nodes, 'edges': edges, 'canvas': layout['canvas'], 'definitions': ''.join(definitions),
            'extras': ''.join(extras), 'attachments':attachments, 'routeLabels':edge_labels, 'source': str(svg_path.relative_to(ROOT)),
            'layoutSource': str(layout_path.relative_to(ROOT)), 'irSource': str(ir_path.relative_to(ROOT)) if ir_path.exists() else None,
            'irSha256': digest(ir_path) if ir_path.exists() else None, 'view': layout.get('view'),
            'sourceProfile': ir.get('profile', {}), 'sourceFacts': ir.get('facts', []),
            'portAllocations':port_allocations,
            'sourceInterfaces': {k:layout[k] for k in ['port_fields','endpoint_projections','semantic_projection','suppressed_edges','presentation_overrides','folded_inline_nodes'] if k in layout},
            'sourceDocs': docs,
            'sourceSemantics': 'recorded graph projection; imported SVG glyphs; source model not executed'}

def visual_svg(p):
    """Adapt legacy residual SVGs without a layout/IR; geometry is visual evidence only."""
    document = ET.parse(p).getroot()
    nodes, edges, extras, definitions = [], [], [], []
    for e in document:
        if tag(e) == 'rect' and e.get('x') is not None:
            x, y, w, h = [float(e.get(k)) for k in ['x', 'y', 'width', 'height']]
            nodes.append({'id': f'visual-{len(nodes)+1}', 'label': '历史图元', 'x': x, 'y': y,
                          'w': w, 'h': h, 'base': [x,y], 'html': markup(e), 'semantic': {
                              'kind': 'legacy SVG visual geometry; no recorded tensor interface'}})
    for n in nodes:
        containers = [v for v in nodes if v is not n and v['x'] <= n['x'] and v['y'] <= n['y']
                      and v['x']+v['w'] >= n['x']+n['w'] and v['y']+v['h'] >= n['y']+n['h']]
        n['parent'] = min(containers,key=lambda v:v['w']*v['h'])['id'] if containers else None
        n['expanded'] = any(v.get('parent') == n['id'] for v in nodes)
    for n in nodes:
        n['expanded'] = any(v['parent'] == n['id'] for v in nodes)
        n['routingObstacle'] = not n['expanded']
    junctions = {}
    for e in document:
        t = tag(e)
        if t == 'defs': definitions.append(markup(e)); continue
        if t == 'rect': continue
        if t == 'text':
            x,y = float(e.get('x')),float(e.get('y'))
            candidates = [n for n in nodes if n['x'] <= x <= n['x']+n['w'] and n['y'] <= y <= n['y']+n['h']]
            if candidates:
                n = min(candidates,key=lambda v:v['w']*v['h']); n['html'] += markup(e)
                if n['label'] == '历史图元': n['label'] = ''.join(e.itertext())
                continue
        if t in ['polyline','path'] and e.get('marker-end'):
            ps = [[float(v) for v in pair.split(',')] for pair in e.get('points').split()] if t == 'polyline' else points_from_d(e.get('d'))
            s = endpoint('visual-inference:out',ps[0],nodes,junctions)
            dst = endpoint('visual-inference:in',ps[-1],nodes,junctions)
            edges.append({'id':f'visual-edge-{len(edges)+1}', 'source':s['id'],'target':dst['id'],
                          'arrow':'target','style':'orthogonal','route':[{'x':x,'y':y} for x,y in ps],
                          'waypoints':[], 'fixedSource':fixed_port(s,ps[0],ps[1]),
                          'fixedTarget':fixed_port(dst,ps[-1],ps[-2]),'draft':False,
                          'binding':{'evidence':'legacy SVG geometry; endpoint inference, no tensor execution trace'}})
            continue
        if t not in ['title','desc','metadata']: extras.append(markup(e))
    canvas = [float(v) for v in document.get('viewBox').split()][2:]
    return {'nodes':nodes,'edges':edges,'canvas':canvas,'definitions':''.join(definitions),'extras':''.join(extras),
            'source':str(p.relative_to(ROOT)), 'irSource':None, 'sourceFacts':[], 'sourceProfile':{},
            'sourceSemantics':'legacy SVG visual adaptation; no new model facts inferred'}

def original_transformer():
    p = ROOT / 'snapshots/pytorch_transformer_original/transformer_architecture.svg'
    document = ET.parse(p).getroot(); nodes = []; defs = []; extras = []; current = None; raw_edges = []
    names = ['src_tokens', 'src_embed', 'src_pe', 'enc', 'enc.self', 'enc.norm', 'enc.ffn',
             'tgt_tokens', 'tgt_embed', 'dec', 'dec.self', 'dec.cross', 'dec.ffn', 'generator', 'logits']
    for e in document:
        t = tag(e)
        if t == 'defs': defs.append(markup(e)); continue
        if e.get('class') == 'box':
            index = len(nodes); x,y,w,h = [float(e.get(k)) for k in ['x','y','width','height']]
            current = {'id': names[index], 'label': names[index], 'x':x,'y':y,'w':w,'h':h,'base':[x,y],
                       'parent':None,'expanded':index in [3,9],'routingObstacle':index not in [3,9],
                       'html':markup(e),'semantic':{'kind':'original SVG depiction; visual endpoints'}}
            nodes.append(current); continue
        if e.get('class') == 'edge': raw_edges.append(e); continue
        if t == 'text' and current:
            ex,ey=float(e.get('x')),float(e.get('y'))
            if current['x'] <= ex <= current['x']+current['w'] and current['y']<=ey<=current['y']+current['h']:
                current['html']+=markup(e)
                if current['label']==current['id']:current['label']=''.join(e.itertext())
                continue
        if t not in ['title','desc']:extras.append(markup(e))
    for n in nodes:
        containers=[p for p in nodes if p['expanded'] and p is not n and p['x']<=n['x'] and p['y']<=n['y'] and p['x']+p['w']>=n['x']+n['w'] and p['y']+p['h']>=n['y']+n['h']]
        if containers:n['parent']=min(containers,key=lambda p:p['w']*p['h'])['id']
    edges=[]
    for i,e in enumerate(raw_edges):
        pts=points_from_d(e.get('d'));ends=[]
        for xy in [pts[0],pts[-1]]:
            def score(n):
                cx=max(n['x'],min(xy[0],n['x']+n['w']));cy=max(n['y'],min(xy[1],n['y']+n['h']))
                return ((xy[0]-cx)**2+(xy[1]-cy)**2,n['w']*n['h'])
            ends.append(min(nodes,key=score))
        s,t=ends
        # Original SVG leaves a small arrow gap. Restore a physical node port.
        fs,ft=fixed_port(s,pts[0],pts[1]),fixed_port(t,pts[-1],pts[-2])
        def physical(n,f):
            return [n['x'] if f['side']=='left' else n['x']+n['w'] if f['side']=='right' else n['x']+n['w']*f['fraction'],
                    n['y'] if f['side']=='top' else n['y']+n['h'] if f['side']=='bottom' else n['y']+n['h']*f['fraction']]
        pts[0],pts[-1]=physical(s,fs),physical(t,ft)
        edges.append({'id':f'original-{i+1}','source':s['id'],'target':t['id'],'route':[{'x':x,'y':y} for x,y in pts],
                      'style':'orthogonal','arrow':'target','waypoints':[], 'fixedSource':fixed_port(s,pts[0],pts[1]),
                      'fixedTarget':fixed_port(t,pts[-1],pts[-2]),'binding':{'evidence':'original SVG geometry, not a tensor execution trace'},'draft':False})
    return {'nodes':nodes,'edges':edges,'canvas':[1600,980],'definitions':''.join(defs),'extras':''.join(extras),
            'source':str(p.relative_to(ROOT)),'irSource':None,'sourceFacts':[], 'sourceProfile':{},
            'sourceSemantics':'original SVG visual adaptation; no new model facts inferred'}

def main():
    entries = copy_inputs()
    catalog=[]; groups={}; errors=[]
    for name in INPUTS:
        for p in sorted((ROOT/'snapshots'/name).rglob('*.json')):
            if p.name not in FIGURES or any(x in p.parts for x in ['sources','upstream']):continue
            view,label,figure=FIGURES[p.name];svg=p.parent/figure
            if not svg.exists():errors.append({'layout':str(p),'error':'missing SVG'});continue
            rel=p.parent.relative_to(ROOT/'snapshots').as_posix()
            history=any(x in p.parts for x in ['before','snapshots']) and 'snapshots' in p.relative_to(ROOT/'snapshots').parts
            history=history or 'before' in p.relative_to(ROOT/'snapshots').parts
            if rel not in groups:
                ident=hashlib.sha256(rel.encode()).hexdigest()[:16]
                title=p.parent.name if p.parent.name!='generated' else ('Transformer · compact' if 'variants' in p.parts else 'Transformer')
                group={'id':ident,'title':title.replace('_',' '),'collection':name,'historical':history,'origin':rel,'views':[]}
                groups[rel]=group;catalog.append(group)
            group=groups[rel]
            data=adapt(p,svg);data['caseId']=group['id'];data['viewKey']=view
            # Record junction containment before the runtime can mutate it.
            for n in data['nodes']:
                if n.get('junction') and not n.get('parent'):
                    owners=[v for v in data['nodes'] if v['expanded'] and v['x']<n['x']<v['x']+v['w'] and v['y']<n['y']<v['y']+v['h']]
                    if owners:n['parent']=min(owners,key=lambda v:v['w']*v['h'])['id']
            route_markers(data);routing_policies(data)
            data['semanticBaseline']=semantic_baseline(data)
            asset=f'data/cases/{group["id"]}-{view}'
            dump(ROOT/(asset+'.json'),data)
            (ROOT/(asset+'.js')).write_text('window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+
                  json.dumps(group['id']+':'+view)+']='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
            group['views'].append({'key':view,'label':label,'asset':asset+'.js','json':asset+'.json','nodes':len(data['nodes']),
                                   'edges':len(data['edges']),'svg':data['source'],'ir':data['irSource']})
    used = {v['svg'] for c in catalog for v in c['views']}
    for p in sorted((ROOT/'snapshots').rglob('mini_residual.svg')):
        if str(p.relative_to(ROOT)) in used: continue
        rel = p.parent.relative_to(ROOT/'snapshots').as_posix()
        ident = hashlib.sha256((rel+':legacy-residual').encode()).hexdigest()[:16]
        data = visual_svg(p); data.update(caseId=ident,viewKey='residual')
        route_markers(data);routing_policies(data);data['semanticBaseline']=semantic_baseline(data)
        asset = f'data/cases/{ident}-residual'; dump(ROOT/(asset+'.json'),data)
        (ROOT/(asset+'.js')).write_text('window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData['+
            json.dumps(ident+':residual')+']='+json.dumps(data,ensure_ascii=False)+';\n')
        catalog.append({'id':ident,'title':'残差小例 · 历史 SVG','collection':rel.split('/')[0],
            'historical':True,'origin':rel,'views':[{'key':'residual','label':'残差小例','asset':asset+'.js',
            'json':asset+'.json','nodes':len(data['nodes']),'edges':len(data['edges']),'svg':data['source'],'ir':None}]})
    original=original_transformer(); ident='pytorch-original'; original.update(caseId=ident,viewKey='overview')
    route_markers(original);routing_policies(original);original['semanticBaseline']=semantic_baseline(original)
    asset='data/cases/'+ident+'-overview';dump(ROOT/(asset+'.json'),original)
    (ROOT/(asset+'.js')).write_text('window.SummaryCaseData=window.SummaryCaseData||{};window.SummaryCaseData["pytorch-original:overview"]='+json.dumps(original,ensure_ascii=False)+';\n')
    catalog.append({'id':ident,'title':'PyTorch Transformer · 原始图','collection':'pytorch_transformer_original','historical':False,
                    'origin':'pytorch_transformer_original','views':[{'key':'overview','label':'原始架构','asset':asset+'.js','json':asset+'.json',
                    'nodes':len(original['nodes']),'edges':len(original['edges']),'svg':original['source'],'ir':None}]})
    # The routing sandbox is a first-class example alongside all imported diagrams.
    catalog.insert(0,{'id':'routing-lab','title':'Edge Router · 避障实验','collection':'yworks_edge_router_lab','historical':False,
                      'origin':'yworks_edge_router_lab','views':[{'key':'overview','label':'路由实验','builtin':True}]})
    order = {'overview':0,'modules':1,'detailed':2,'residual':3}
    for c in catalog:
        c['views'].sort(key=lambda v:order[v['key']])
        directory = ROOT/'snapshots'/c['origin']
        while directory != ROOT/'snapshots':
            if (directory/'index.html').exists():
                c['sourceIndex'] = (directory/'index.html').relative_to(ROOT).as_posix(); break
            directory = directory.parent
    evidence=[{'path':e['snapshot'],'title':e['source'],'bytes':e['bytes']} for e in entries if
              e['source'].startswith(('migration_audit_evidence/','arrow_semantic_audit/')) and
              '/before/' not in e['source'] and Path(e['source']).suffix in ['.md','.json','.png'] and
              '/expanded_views/' not in e['source']]
    counts={'cases':len(catalog),'active':sum(not c['historical'] for c in catalog),'historical':sum(c['historical'] for c in catalog),
            'views':sum(len(c['views']) for c in catalog),'snapshotFiles':len(entries)}
    result={'schema':'summary-merge/1','cases':catalog,'evidence':evidence,'counts':counts,'inputs':INPUTS,'errors':errors}
    dump(ROOT/'data/catalog.json',result)
    (ROOT/'data/catalog.js').write_text('window.SummaryCatalog='+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n')
    dump(ROOT/'verification/import-report.json',{'counts':counts,'errors':errors,'coverage':'every recorded layout with its SVG in the eight inputs'})
    if errors:raise RuntimeError(errors)
    print(json.dumps(counts,ensure_ascii=False))

if __name__=='__main__':main()

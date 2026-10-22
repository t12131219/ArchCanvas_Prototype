"""Independent source membership, role/path bindings and actual SVG checks."""
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-path-stages/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
from semantic_adapter.analyzer import analyze
from audit_diagram_assignments import assignments
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
FLOW = {'data', 'alias', 'interface-binding'}
PROTECTED = ['mutable', 'condition', 'identity_display', 'observed_calls', 'runtime_evidence',
             'semantic_contracts', 'contract_roles', 'repeat_contract', 'iteration', 'contract_stage', 'role_operation_stage']


def check(row, *, compare_expression=True, require_quality=True, allow_label_notes=False,
          allow_attached_return_uses=False):
    doc = read(OUT / row['document'])
    assert sha(OUT / row['document']) == row['document_sha256'] and sha(OUT / row['svg']) == row['svg_sha256']
    assert doc['ir'] == read(ROOT / row['input']) and sha(ROOT / row['input']) == row['input_sha256']
    ns = {n['id']: n for n in doc['ir']['nodes']}
    planned = {n['id']: n for n in doc['architecture']['nodes']}
    positions = {n['id']: n for n in doc['layout']['nodes']}
    edges = doc['ir']['edges']
    ins = {id: [e for e in edges if e['target'] == id] for id in ns}
    outs = {id: [e for e in edges if e['source'] == id] for id in ns}

    def closure(id, nodes):
        ids = {id}
        while True:
            added = {n['id'] for n in nodes.values() if n.get('parent') in ids} - ids
            if not added:
                return ids
            ids |= added

    def resolve(id, slot='out'):
        seen = set()
        while id not in seen:
            seen.add(id)
            n, es = ns[id], ins[id]
            if n['kind'] not in ['interface', 'value-alias'] or n.get('operator') or len(es) != 1 or es[0]['kind'] not in FLOW or es[0].get('condition'):
                break
            e = es[0]
            outer = n.get('slot') if n['kind'] == 'value-alias' and n.get('slot') is not None else e.get('source_port', 'out')
            slot = slot if outer == 'out' else outer if slot == 'out' else outer + '.' + slot
            id = e['source']
        return id, slot

    tree = ET.parse(OUT / row['svg'])
    visible = {n.get('data-node-id'): n for n in tree.iter() if n.get('data-node-id')}
    paths = {n.get('data-edge-id'): n for n in tree.iter() if n.get('data-edge-id')}
    assert set(visible) == set(positions) and len(visible) == row['nodes']
    assert set(paths) == {e['id'] for e in doc['layout']['edges']} and len(paths) == row['edges']
    for key, source in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
        all_ids = [v for bucket in doc['layout'][key].values() for v in bucket]
        assert len(all_ids) == len(set(all_ids)) and set(all_ids) == {v['id'] for v in doc['ir'][source]}
    certs = {c['id']: c for c in doc['ir'].get('semantic_contracts', [])}
    coverage = {c['goal']: c for c in doc['expression_coverage']}
    receipt = doc['publication'].get('role_path_stages', {'rows': []})
    assert receipt == (row.get('role_path_stages') or {'rows': []})
    for r in receipt['rows']:
        anchor, helper = r['anchor'], r['helper']
        helper_ids = closure(helper, ns)
        prefix = r.get('direction') == 'helper-before-role'
        bridge = r.get('bridge_aliases', [])
        assert prefix or not bridge
        assert len(bridge) == len(set(bridge)) and not (set(bridge) & ({anchor} | helper_ids))
        members = {anchor} | helper_ids | set(bridge)
        assert len(r['canonical_members']) == len(members) and set(r['canonical_members']) == members
        assert closure(r['node'], planned) & ns.keys() == members
        assert planned[anchor]['parent'] == planned[helper]['parent'] == r['node']
        assert planned[r['node']]['parent'] == ns[anchor]['parent'] == ns[helper]['parent']
        assert planned[r['node']]['presentation_only'] and planned[r['node']]['semantic_type'] == 'role-path-stage'
        assert r['display_members'] == ([helper, anchor] if prefix else [anchor, helper])
        for id in bridge:
            assert planned[id]['parent'] == r['node'] and ns[id]['parent'] == ns[anchor]['parent']
            for n in [ns[id], planned[id]]:
                assert n['kind'] == 'value-alias' and not n.get('operator') and n.get('slot') is None
            assert len(ins[id]) == len(outs[id]) == 1
        for role in r['roles']:
            cert = certs[role['certificate']]
            assert cert in doc['architecture']['semantic_contracts'] and members <= set(cert['members'])
            value = cert['roles']
            for key in role['role_keys']:
                value = value[key]
            assert value == role['node'] == role['frontier_node'] == anchor
            assert cert['node'] == role['owner'] and role['location'] == 'internal'
        for id in members:
            for n in [ns[id], planned[id]]:
                assert n['kind'] not in ['opaque', 'control'] and n['evidence_status'] == 'static-only'
                assert not any(n.get(k) for k in PROTECTED)
            if id != anchor:
                assert not planned[id].get('role_annotations')
        at = planned[r['node']]['parent']
        while at is not None:
            n = planned[at]
            assert n['kind'] != 'control' and n.get('evidence_status') != 'runtime-only'
            assert not any(n.get(k) for k in ['mutable', 'condition', 'identity_display', 'observed_calls', 'runtime_evidence'])
            at = n.get('parent')
        incident = [e for e in edges if e['source'] in members or e['target'] in members]
        cuts = [e for e in edges if (e['source'] in members) != (e['target'] in members)]
        assert cuts == r['cuts'] == planned[r['node']]['boundary_ports']
        assert [e['id'] for e in incident if e['source'] in members and e['target'] in members] == r['internal_edges']
        assert all(not any(e.get(k) for k in ['condition', 'iteration', 'design_route']) and
                   (e['kind'] in FLOW or e['kind'] == 'parameter-read' and ns[e['source']]['kind'] == 'parameter') for e in incident)
        helper_cuts = [e for e in edges if (e['source'] in helper_ids) != (e['target'] in helper_ids)]
        incoming = [e for e in helper_cuts if e['target'] in helper_ids]
        if prefix:
            assert not any(planned[e['source']].get('role_annotations') for e in incoming)
            outgoing = [e for e in helper_cuts if e['source'] in helper_ids]
            assert len(outgoing) == 1 and incoming
            e = outgoing[0]
            assert ns[e['source']]['kind'] == 'interface' and ns[e['source']]['role'] == 'output'
            for id in [*bridge, anchor]:
                assert e['target'] == id and e.get('source_port', 'out') == 'out'
                ordinary = [edge for edge in ins[id] if edge['kind'] != 'parameter-read']
                assert ordinary == [e]
                if id != anchor:
                    e = outs[id][0]
            assert all(edge['target'] in helper_ids or edge['target'] == anchor and edge['kind'] == 'parameter-read'
                       for edge in cuts if edge['target'] in members)
            assert all(edge['source'] == anchor and edge.get('source_port', 'out') == 'out' for edge in cuts if edge['source'] in members)
        else:
            assert len(outs[anchor]) == len(incoming) == 1 and outs[anchor] == incoming
            assert incoming[0].get('source_port', 'out') == 'out' and ns[incoming[0]['target']]['kind'] == 'interface'
            assert all(e['target'] == anchor for e in cuts if e['target'] in members)
            assert all(e['source'] in helper_ids for e in cuts if e['source'] in members)
        p = r['helper_path']
        assert p == planned[helper]['local_pipeline'] and p['form'] == 'dependency-path-summary'
        assert set(p['canonical_members']) == helper_ids and len(p['canonical_members']) == len(helper_ids)
        assert p['cuts'] == helper_cuts
        ordered = [o['node'] for o in p['operations']]
        assert 2 <= len(ordered) <= 6 and len(set(ordered)) == len(ordered)
        active = set(ordered)
        bindings = []
        for e in edges:
            if e['target'] in active:
                producer, slot = resolve(e['source'], e.get('source_port', 'out'))
                bindings.append((e['id'], producer, slot, e['target'], e['target_port']))
        assert sorted(bindings) == sorted((b['edge'], b['producer'], b['source_port'], b['target'], b['target_port']) for b in p['bindings'])
        internal = [b for b in bindings if b[1] in active]
        assert len(internal) == len(ordered) - 1
        assert all(len([b for b in internal if b[3] == id and b[1] == ordered[i]]) == 1 for i, id in enumerate(ordered[1:]))
        assert all(resolve(e['source'], e.get('source_port', 'out')) == (ordered[-1], 'out') for e in helper_cuts if e['source'] in helper_ids)
        for boundary in p['source_boundaries']:
            ids = closure(boundary['node'], ns)
            assert boundary['parent'] == ns[boundary['node']]['parent']
            assert boundary['source'] == ns[boundary['node']].get('source', [])
            assert boundary['cuts'] == [e for e in edges if (e['source'] in ids) != (e['target'] in ids)]
        ops = []
        for id in ([*ordered, anchor] if prefix else [anchor, *ordered]):
            n = ns[id]
            label = (n.get('framework_type') or '').split('.')[-1] or ((n.get('function_target') or '').split('.')[-1] if n.get('source_framework_function') == n.get('function_target') else '') or n['operator']
            ops.append(dict(node=id, label=label, operator=n['operator'], framework_type=n.get('framework_type'), configuration=n.get('constructor')))
        assert ops == r['operations']
        text = re.sub(r'\s', '', ''.join(''.join(t.itertext()) for t in visible[r['node']] if t.tag.endswith('text')))
        assert re.sub(r'\s', '', ' → '.join(o['label'] for o in ops)) in text
        assert positions[r['node']]['expanded'] == (r['status'] == 'expanded')
        assert r['stage_children_exposed'] == {anchor, helper}.issubset(visible)
        assert r['detailed_operations_exposed'] == {o['node'] for o in ops}.issubset(visible)
        if r['status'] == 'summary':
            assert not members.intersection(visible)
            for o in ops:
                goals = [g for g in doc['expression_goals']['goals'] if o['node'] in g['core']]
                assert goals and all(coverage[g['id']]['status'] == 'unfulfilled' and o['node'] in coverage[g['id']]['missing_nodes'] for g in goals)
        else:
            assert {anchor, helper}.issubset(visible)
        for e in cuts:
            if e['kind'] == 'parameter-read':
                assert ns[e['source']]['kind'] == 'parameter'
                assert e['id'] in doc['layout']['edge_accounting']['attached']
                continue
            carriers = [(physical, v) for physical in doc['layout']['edges'] for v in physical.get('bundle_members', [physical])
                        if e['id'] in v.get('originals', [v['id']])]
            # A cut into an ordinary contracted alias can have several later
            # consumers. Reconstruct every terminal use, rather than requiring
            # one wire or accepting any one of several surviving consumers.
            todo, expected, seen_edges = [e], set(), set()
            contracted = set(doc['layout']['node_accounting']['contracted'])
            while todo:
                at = todo.pop()
                if at['id'] in seen_edges:
                    continue
                seen_edges.add(at['id'])
                n = ns[at['target']]
                if n['id'] in contracted and n['kind'] in ['interface', 'value-alias'] and not n.get('operator'):
                    todo.extend(outs[n['id']])
                else:
                    expected.add(at['id'])
            if allow_attached_return_uses:
                # A folded conditional return can attach a tuple operand to
                # its explicit source-return boundary instead of drawing a
                # second physical wire. Never accept an arbitrary attachment.
                attached = expected & set(doc['layout']['edge_accounting']['attached'])
                for edge_id in attached:
                    original = next(edge for edge in edges if edge['id'] == edge_id)
                    regions = [n for id, n in planned.items() if id in visible
                        and n.get('semantic_type') == 'conditional-collection'
                        and original in n.get('boundary_ports', [])
                        and original in n.get('normal_return', {}).get('alternative_inputs', [])
                        and original['target'] in n.get('canonical_members', [])]
                    assert len(regions) == 1 and original['kind'] in FLOW
                    assert original in regions[0]['boundary_ports']
                    assert not any(edge_id in v.get('originals', [v['id']]) for _, v in carriers)
                expected -= attached
            assert carriers and len(carriers) == len(expected) and {v['id'] for _, v in carriers} == expected
            for physical, v in carriers:
                final = next(edge for edge in edges if edge['id'] == v['id'])
                assert [v.get(k) for k in ['canonical_source', 'canonical_target', 'target_port', 'kind', 'condition', 'evidence']] == [final.get(k) for k in ['source', 'target', 'target_port', 'kind', 'condition', 'evidence']]
                # A contracted alias can select a result slot. The physical
                # source port belongs to resolved_source, not the raw alias.
                value = resolve(v.get('resolved_source', v['canonical_source']), v.get('source_port', 'out'))
                assert resolve(final['source'], final.get('source_port', 'out')) == value
                assert resolve(e['source'], e.get('source_port', 'out')) == value
                todo, seen = [e['target']], set()
                while todo:
                    at = todo.pop()
                    if at in seen:
                        continue
                    seen.add(at)
                    if ns[at]['kind'] in ['interface', 'value-alias'] and not ns[at].get('operator'):
                        todo.extend(edge['target'] for edge in outs[at] if edge['kind'] in FLOW and not edge.get('condition'))
                assert v['canonical_target'] in seen
                assert physical['route']['ok']
    segments, length = [], 0
    for e in doc['layout']['edges']:
        pts = [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', paths[e['id']].get('d'))]
        assert pts == [(p['x'], p['y']) for p in e['route']['points']]
        assert e['route']['ok'] and paths[e['id']].get('data-route-valid') == 'true'
        parts = list(zip(pts, pts[1:]))
        assert all(a[0] == b[0] or a[1] == b[1] for a, b in parts)
        length += sum(abs(a[0] - b[0]) + abs(a[1] - b[1]) for a, b in parts)
        segments.append(parts)
    crossings = 0
    for i, first in enumerate(segments):
        for second in segments[i + 1:]:
            for a, b in first:
                for c, d in second:
                    if (a[0] == b[0]) == (c[0] == d[0]):
                        continue
                    v, w, h, k = (a, b, c, d) if a[0] == b[0] else (c, d, a, b)
                    crossings += min(h[0], k[0]) < v[0] < max(h[0], k[0]) and min(v[1], w[1]) < h[1] < max(v[1], w[1])
    q = doc['diagnostics']['publication']
    assert q == row['quality'] and not q['route_failures']
    if q['unplaced_port_labels']:
        # Rejected or historical figures may have explicit footer notes.
        # Audit them as unresolved labels, never as clean figure quality.
        assert allow_label_notes and not require_quality and 'port-label-requires-note' in q['issues']
        footer = re.sub(r'\s', '', ''.join(''.join(e.itertext()) for e in tree.getroot() if e.tag.endswith('text')))
        for label in q['unplaced_port_labels']:
            edge = next(e for e in doc['layout']['edges'] if e['id'] == label['edge'])
            text = planned[edge['source']]['label'] + ' → ' + planned[edge['target']]['label'] + ': ' + label['text']
            assert re.sub(r'\s', '', text) in footer
    if require_quality:
        assert not q['issues']
        assert not q['line_geometry']['unrelated_contacts']
    assert round(length, 1) == q['wire_length'] and crossings == q['line_geometry']['crossings']
    assert list(map(float, tree.getroot().get('viewBox').split()))[2:] == [q['native_width_px'], q['native_height_px']]
    docks(doc, tree)
    returns(doc, tree, allow_normal_returns=allow_attached_return_uses)
    actual = assignments(doc['ir'], doc['expression_goals']['goals'], {**doc, 'quality': q}, tree.getroot())
    reported = {r['goal']: r['status'] == 'fulfilled' for r in doc['expression_coverage']}
    if compare_expression:
        assert actual == [reported[g['id']] for g in doc['expression_goals']['goals']]
    return dict(nodes=len(visible), edges=len(paths), width=q['native_width_px'], height=q['native_height_px'], crossings=crossings,
                wire_length=round(length, 1), stages=len(receipt['rows']), direct_goals=sum(actual), expression_goals=len(actual))


def main():
    small, large = [read(OUT / (f + '-render-report.json')) for f in ['small', 'large']]
    assert small['implementation_sha256'] == large['implementation_sha256']
    for f, h in small['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        assert analyze(ROOT / extraction['source'], row['name']) == read(ROOT / row['input'])
    rows = small['rows'] + large['rows']
    metrics = {r['name']: check(r) for r in rows}
    for name in ['SharedPath', 'UnknownPath']:
        assert (OUT / (name + '-before.svg')).read_bytes() == (OUT / (name + '-grouped.svg')).read_bytes()
    ui = read(OUT / 'ui-report.json')
    assert ui['passed'] and ui['auditor_sha256'] == sha(ROOT / 'tools/audit_role_path_stage_ui.cjs')
    for f, h in ui['files_sha256'].items():
        assert sha(OUT / f) == h
    ui_metrics = {r['name']: check(r) for r in ui['rows']}
    raw = read(OUT / 'ui-raw-projection.json')
    ir = read(OUT / 'ui-PrismPath-raw.json')['ir']
    tree = ET.parse(OUT / 'ui-PrismPath-raw.svg')
    raw_nodes = {n.get('data-id'): n for n in tree.iter() if n.get('data-id')}
    raw_edges = {n.get('data-edge-id'): n for n in tree.iter() if n.get('data-edge-id')}
    assert set(raw_nodes) == {n['id'] for n in ir['nodes']}
    assert set(raw_edges) == {e['id'] for e in ir['edges']}
    for n in raw['nodes']:
        xy = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', raw_nodes[n['id']].get('transform'))))
        assert xy == [n['x'], n['y']]
    for e in raw['edges']:
        pts = [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', raw_edges[e['id']].get('d'))]
        assert pts == [(p['x'], p['y']) for p in e['route']['points']]
        assert e['route']['ok'] and raw_edges[e['id']].get('data-route-valid') == 'true'
    result = dict(schema='role-path-stages-independent/1', auditor_sha256=sha(Path(__file__)), passed=True, goal_complete=False,
                  panels=len(rows), fixtures_reextracted=len(extraction['rows']), metrics=metrics, ui_metrics=ui_metrics,
                  raw_ui_all_ids_and_routes_verified=True, ui_report_sha256=sha(OUT / 'ui-report.json'),
                  scope='Canonical source and display membership, certificate authority, exclusive helper use, exact resolved operands, operation configurations, source cuts, actual routed SVG geometry and direct expression goals.')
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(panels=len(rows), passed=True)))


if __name__ == '__main__':
    main()

"""Check stage facts and real SVGs independently of the presentation compiler."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-operation-stages/current'
sys.path[:0] = [str(ROOT), str(ROOT / 'tools')]
import audit_local_svg as geometry
from audit_input_dock_receipts import verify as docks
from audit_return_region_receipts import verify as returns
from audit_diagram_assignments import assignments

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
FLOW = {'data', 'alias', 'interface-binding'}


def stages(document, row, visible, paths):
    receipt = document['publication'].get('role_operation_stages')
    assert receipt == row.get('role_operation_stages')
    if not receipt:
        return 0
    assert receipt['rule_version'] == 'role-operation-stages/1'
    canonical = {n['id']: n for n in document['ir']['nodes']}
    planned = {n['id']: n for n in document['architecture']['nodes']}
    certs = {c['id']: c for c in document['ir'].get('semantic_contracts', [])}
    edges = document['ir']['edges']
    positions = {n['id']: n for n in document['layout']['nodes']}
    coverage = {r['goal']: r for r in document['expression_coverage']}
    protected = ['mutable', 'condition', 'identity_display', 'observed_calls', 'runtime_evidence']
    for r in receipt['rows']:
        ordered = [r['anchor'], *r['tail']]
        core = set(ordered)
        assert 2 <= len(ordered) <= 4 and len(core) == len(ordered)
        assert ordered == r['canonical_members'] == planned[r['node']]['canonical_members']
        assert {n['id'] for n in planned.values() if n.get('parent') == r['node']} == core
        assert planned[r['node']]['presentation_only']
        assert planned[r['node']]['semantic_type'] == 'role-operation-stage'
        assert not planned[r['node']].get('semantic_contracts')
        assert {canonical[n]['parent'] for n in ordered} == {canonical[r['anchor']]['parent']}
        assert planned[r['node']]['parent'] in document['publication']['open']
        for role in r['roles']:
            c = certs[role['certificate']]
            assert c['node'] == role['owner'] and core <= set(c['members'])
            value = c['roles']
            for key in role['role_keys']:
                value = value[key]
            assert value == role['node'] == role['frontier_node'] == r['anchor']
            assert role['location'] == 'internal'
        assert r['roles'] == planned[r['anchor']]['role_annotations']
        at = planned[r['node']].get('parent')
        while at is not None:
            n = planned[at]
            assert n['kind'] != 'control' and n.get('evidence_status') != 'runtime-only'
            assert not any(n.get(k) for k in protected)
            at = n.get('parent')
        links = []
        for i, node in enumerate(ordered):
            n = canonical[node]
            assert n['kind'] == 'compute' and n['evidence_status'] == 'static-only'
            assert not any(n.get(k) for k in protected)
            assert not any(n.get(k) for k in ['semantic_contracts', 'contract_roles', 'repeat_contract', 'iteration'])
            incident = [e for e in edges if node in [e['source'], e['target']]]
            for e in incident:
                assert not any(e.get(k) for k in ['condition', 'iteration', 'design_route'])
                assert e['kind'] in FLOW or (e['kind'] == 'parameter-read' and canonical[e['source']]['kind'] == 'parameter')
            if i:
                assert not planned[node].get('role_annotations')
                uses = [e for e in edges if e['source'] == ordered[i - 1]]
                assert len(uses) == 1 and uses[0]['target'] == node
                e = uses[0]
                assert e['kind'] in FLOW and e.get('source_port', 'out') == 'out'
                assert [v for v in edges if v['target'] == node and v['kind'] in FLOW] == [e]
                links.append(e['id'])
        assert links == r['internal_edges']
        cuts = [e for e in edges if (e['source'] in core) != (e['target'] in core)]
        assert cuts == r['cuts'] == planned[r['node']]['boundary_ports']
        assert all(e['source'] == ordered[-1] for e in cuts if e['source'] in core)
        operations = []
        for node in ordered:
            n = canonical[node]
            label = n.get('framework_type', '').split('.')[-1] or (n.get('function_target', '').split('.')[-1]
                if n.get('source_framework_function') == n.get('function_target') else '') or n['operator']
            operations.append(dict(node=node, label=label, operator=n['operator'], framework_type=n.get('framework_type'), configuration=n.get('constructor')))
        assert r['operations'] == operations
        assert r['node'] in visible
        text = re.sub(r'\s', '', ''.join(''.join(e.itertext()) for e in visible[r['node']] if e.tag.endswith('text')))
        assert re.sub(r'\s', '', ' → '.join(o['label'] for o in operations)) in text
        assert positions[r['node']]['expanded'] == (r['status'] == 'expanded')
        assert r['detailed_operations_exposed'] == core.issubset(visible)
        if r['status'] == 'summary':
            assert not core.intersection(visible)
            assert all(coverage['goal:node:' + node]['status'] == 'unfulfilled' and
                       node in coverage['goal:node:' + node]['missing_nodes'] for node in ordered)
        else:
            assert r['status'] == 'expanded' and core.issubset(visible)
        for e in cuts:
            carriers = [v for v in document['layout']['edges'] if e['id'] in v.get('originals', [v['id']])]
            assert len(carriers) == 1
            v = carriers[0]
            assert v['canonical_source'] == e['source'] and v['canonical_target'] == e['target']
            assert [v.get(k, 'out' if k == 'source_port' else None) for k in ['source_port', 'target_port']] == [e.get(k, 'out' if k == 'source_port' else None) for k in ['source_port', 'target_port']]
            assert v['route']['ok'] and v['id'] in paths and paths[v['id']].get('data-route-valid') == 'true'
    return len(receipt['rows'])


def audit(row):
    doc = read(OUT / row['document'])
    assert sha(OUT / row['document']) == row['document_sha256']
    assert sha(OUT / row['svg']) == row['svg_sha256']
    assert sha(ROOT / row['input']) == row['input_sha256']
    assert doc['ir'] == read(ROOT / row['input'])
    tree = ET.parse(OUT / row['svg'])
    svg = tree.getroot()
    nodes = {n.get('data-node-id'): n for n in tree.iter() if n.get('data-node-id')}
    paths = {n.get('data-edge-id'): n for n in tree.iter() if n.get('data-edge-id')}
    assert set(nodes) == {n['id'] for n in doc['layout']['nodes']} and len(nodes) == row['nodes']
    assert set(paths) == {e['id'] for e in doc['layout']['edges']} and len(paths) == row['edges']
    for bucket, key in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
        ids = [v for group in doc['layout'][bucket].values() for v in group]
        assert len(ids) == len(set(ids)) and set(ids) == {v['id'] for v in doc['ir'][key]}
    segments = []
    length = 0
    for e in doc['layout']['edges']:
        path = paths[e['id']]
        points = [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', path.get('d'))]
        assert points == [(p['x'], p['y']) for p in e['route']['points']]
        assert e['route']['ok'] and path.get('data-route-valid') == 'true'
        parts = list(zip(points, points[1:]))
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
    assert row['quality'] == q and not q['issues']
    assert not q['route_failures'] and not q['unplaced_port_labels'] and q['min_canvas_font_px'] >= 12
    assert not q['line_geometry']['unrelated_contacts']
    assert round(length, 1) == q['wire_length'] and crossings == q['line_geometry']['crossings']
    box = list(map(float, svg.get('viewBox').split()))
    assert box[2:] == [q['native_width_px'], q['native_height_px']]
    assert float(svg.get('width').removesuffix('px')) == box[2] and float(svg.get('height').removesuffix('px')) == box[3]
    docks(doc, tree)
    returns(doc, tree)
    geometry.audit_pipeline_summaries(doc, row, nodes)
    geometry.audit_contract_stages(doc, row, nodes)
    count = stages(doc, row, nodes, paths)
    actual = assignments(doc['ir'], doc['expression_goals']['goals'], {**doc, 'quality': q}, svg)
    reported = {g['goal']: g['status'] == 'fulfilled' for g in doc['expression_coverage']}
    assert actual == [reported[g['id']] for g in doc['expression_goals']['goals']]
    return dict(nodes=len(nodes), edges=len(paths), width=box[2], height=box[3], area=box[2] * box[3], crossings=crossings, wire_length=round(length, 1), stages=count,
                direct_goals=sum(actual), expression_goals=len(actual), reported_goals=sum(g['status'] == 'fulfilled' for g in doc['expression_coverage']))


def main():
    small, large = [read(OUT / (s + '-render-report.json')) for s in ['small', 'large']]
    assert small['implementation_sha256'] == large['implementation_sha256'] and small['baseline'] == large['baseline']
    report = {**small, **{k: small[k] + large[k] for k in ['rows', 'comparisons']}}
    for f, h in report['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    for f, h in report['baseline']['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', report['baseline']['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    # This existing-stage receipt was omitted by the render producer. Derive it
    # only from the hash-verified document; the independent geometry audit then
    # rechecks its canonical facts. Never modify the original producer reports.
    for row in report['rows']:
        assert sha(OUT / row['document']) == row['document_sha256']
        row['contract_stages'] = read(OUT / row['document'])['publication'].get('contract_stages')
    report['derived_receipts'] = {'contract_stages': 'hash-verified layout document; independently checked against canonical IR'}
    (OUT / 'render-report.json').write_text(json.dumps(report, indent=2) + '\n')
    extraction = read(OUT / 'fixture-extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    from semantic_adapter.analyzer import analyze
    for item in extraction['rows']:
        assert sha(ROOT / item['input']) == item['input_sha256']
        assert analyze(ROOT / extraction['source'], item['name']) == read(ROOT / item['input'])
    rows = {r['name']: r for r in report['rows']}
    metrics = {r['name']: audit(r) for r in report['rows']}
    for entry in report['comparisons']:
        before, default, grouped = [rows[entry[k]] for k in ['before', 'default', 'current']]
        assert (OUT / before['svg']).read_bytes() == (OUT / default['svg']).read_bytes()
        if entry['name'] in ['EscapingPath', 'InterruptedPath']:
            assert (OUT / default['svg']).read_bytes() == (OUT / grouped['svg']).read_bytes()
        if entry['opened']:
            closed = read(OUT / grouped['document'])['publication']['role_operation_stages']['rows']
            opened = read(OUT / rows[entry['opened']]['document'])['publication']['role_operation_stages']['rows']
            assert closed[0]['status'] == 'summary' and opened[0]['status'] == 'expanded'
            assert opened[0]['canonical_members'] == closed[0]['canonical_members']
    geometry.OUT = OUT
    saved = sys.argv
    sys.argv = [saved[0]]
    try:
        geometry.main()
    finally:
        sys.argv = saved
    ui = read(OUT / 'ui-report.json')
    assert ui['passed'] and ui['auditor_sha256'] == sha(ROOT / 'tools/audit_role_operation_ui.cjs')
    for f, h in ui['files_sha256'].items():
        assert sha(OUT / f) == h, ('stale UI evidence', f)
    ui_metrics = {r['name']: audit(r) for r in ui['rows']}
    raw = read(OUT / 'ui-raw-projection.json')
    ir = read(OUT / 'ui-QuartzPath-raw.json')['ir']
    tree = ET.parse(OUT / 'ui-QuartzPath-raw.svg')
    raw_nodes = {n.get('data-id'): n for n in tree.iter() if n.get('data-id')}
    raw_paths = {n.get('data-edge-id'): n for n in tree.iter() if n.get('data-edge-id')}
    assert set(raw_nodes) == {n['id'] for n in ir['nodes']}
    assert set(raw_paths) == {e['id'] for e in ir['edges']}
    for p in raw['nodes']:
        xy = list(map(float, re.findall(r'-?\d+(?:\.\d+)?', raw_nodes[p['id']].get('transform'))))
        assert xy == [p['x'], p['y']]
    for e in raw['edges']:
        points = [(float(x), float(y)) for x, y in re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', raw_paths[e['id']].get('d'))]
        assert points == [(p['x'], p['y']) for p in e['route']['points']]
        assert e['route']['ok'] and raw_paths[e['id']].get('data-route-valid') == 'true'
    result = dict(schema='role-operation-stages-independent/1', auditor_sha256=sha(Path(__file__)), render_report_sha256=sha(OUT / 'render-report.json'),
                  panels=len(rows), fixtures_reextracted=len(extraction['rows']), metrics=metrics, ui_metrics=ui_metrics,
                  ui_report_sha256=sha(OUT / 'ui-report.json'), raw_ui_all_ids_and_paths_verified=True, passed=True, goal_complete=False,
                  scope='Ordered canonical operations, exact role certificates, exclusive edges, preserved cuts/slots, deferred atomic goals, actual SVG routes and geometry. Full objective unfinished.')
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(panels=len(rows), fixtures_reextracted=len(extraction['rows']), passed=True)))


if __name__ == '__main__':
    main()

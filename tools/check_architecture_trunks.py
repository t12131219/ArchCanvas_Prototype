"""Independently read routed SVG ink, exact terminals and marked junctions."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
import sys

import check_shared_fanouts as shared
import check_stream_alignment as common
from check_composition_suite import drawing_document

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/architecture-trunks/current'
read, sha = common.read, common.sha


def compare(before, after, sa, sb):
    for k in ['ir', 'architecture', 'publication', 'expression_goals', 'expression_coverage', 'summary_goals', 'summary_coverage']:
        assert before.get(k) == after.get(k), ('facts or visible goals changed', k)
    for k in ['nodes', 'bounds', 'labels', 'node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
        assert before['layout'].get(k) == after['layout'].get(k), ('layout changed', k)
    pa, pb = shared.points(sa), shared.points(sb)
    assert pa.keys() == pb.keys()
    old = {e['id']: e for e in before['layout']['edges']}
    new = {e['id']: e for e in after['layout']['edges']}
    selected = after['layout'].get('shared_fanouts', [])
    dots = [e for e in sb.iter() if e.get('class') == 'paper-fanout-junction']
    assert len(dots) == sum(len(r['junctions']) for r in selected)
    touched, saved, added = set(), 0, 0
    for row in selected:
        ids = row['edges']; uses = [new[id] for id in ids]; touched.update(ids)
        assert 2 <= len(ids) <= 6
        assert {(e['source'], e['resolved_source'], e['source_port']) for e in uses} == {(row['source'], row['resolved_source'], row['source_port'])}
        assert all(e['kind'] in ['data', 'alias', 'interface-binding'] and not any(e.get(k) for k in ['condition', 'iteration', 'design_route', 'context_lane', 'layout_after', 'bundle_members', 'paper_labels']) for e in uses)
        js = shared.junctions([pb[id] for id in ids])
        assert js == [(p['x'], p['y']) for p in row['junctions']]
        markers = [d for d in dots if json.loads(d.get('data-fanout-edges')) == ids]
        assert [(float(d.get('cx')), float(d.get('cy'))) for d in markers] == js
        assert all(d.get('data-fanout-source') == row['resolved_source'] and d.get('data-source-port') == row['source_port'] for d in markers)
        for x, y in js:
            assert all(not shared.intersects(ps, dict(x=x-4, y=y-4, w=8, h=8)) for id, ps in pb.items() if id not in ids), ('false visual junction', ids)
        prior, current = shared.ink([pa[id] for id in ids]), shared.ink([pb[id] for id in ids])
        assert abs(current-row['ink_candidate']) < 1e-6
        if any(pa[id] != pb[id] for id in ids):
            assert abs(prior-row['ink_before']) < 1e-6
            assert current < prior
            assert current <= prior*.8 or after['diagnostics']['publication']['line_geometry']['crossings'] < before['diagnostics']['publication']['line_geometry']['crossings']
            tangent = 1 if row.get('side') in ['left', 'right'] else 0
            budget = 2*sum(abs(pa[id][0][tangent]-row['hub']) for id in ids)
            assert abs(budget-row['terminal_detour_budget']) < 1e-6
            length = lambda ps: sum(abs(a[0]-b[0])+abs(a[1]-b[1]) for a, b in zip(ps, ps[1:]))
            assert sum(length(pb[id])-length(pa[id]) for id in ids) <= budget+1e-6
            saved += prior-current; added += 1
    for id, e in new.items():
        was = old[id]
        assert {k: v for k, v in e.items() if k != 'route'} == {k: v for k, v in was.items() if k != 'route'}
        assert [pa[id][0], pa[id][-1]] == [pb[id][0], pb[id][-1]], ('terminal moved', id)
        assert all(e['route'][k] == was['route'][k] for k in ['source_side', 'target_side'])
        if id not in touched:
            assert pa[id] == pb[id], ('unrelated path moved', id)
    for key, items in [('node_accounting', after['ir']['nodes']), ('edge_accounting', after['ir']['edges'])]:
        ids = [id for group in after['layout'][key].values() for id in group]
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in items}
    return dict(new_groups=added, ink_saved=saved,
        visible_ink_before=shared.ink(pa.values()), visible_ink_after=shared.ink(pb.values()))


def main():
    suite = read(OUT / 'suite-report.json')
    for f, h in suite['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    assert not suite['runtime_executed'] and sha(ROOT / suite['source']) == suite['source_sha256']
    from semantic_adapter.analyzer import analyze
    assert json.loads(json.dumps(analyze(ROOT / suite['source'], 'ContextWeaver'))) == read(OUT / 'ContextWeaver.json')
    common.geometry.OUT = common.stages.OUT = common.operands.OUT = OUT
    results = []
    for row in suite['rows']:
        for name, key in [('svg', 'svg_sha256'), ('document', 'document_sha256'), ('before_svg', 'before_sha256'), ('before_document', 'before_document_sha256')]:
            assert sha(OUT / row[name]) == row[key]
        assert sha(ROOT / row['input']) == row['input_sha256']
        doc, before = read(OUT / row['document']), read(OUT / row['before_document'])
        assert doc['ir'] == read(ROOT / row['input'])
        svg, old_svg = ET.parse(OUT / row['svg']).getroot(), ET.parse(OUT / row['before_svg']).getroot()
        measured = compare(before, doc, old_svg, svg)
        common.stages.check({**row, 'role_path_stages': doc['publication'].get('role_path_stages')}, compare_expression=False,
            require_quality=False, allow_label_notes=True, allow_attached_return_uses=True)
        common.geometry.inspect(row); common.operands.check_svg_bindings(row, doc); common.normal_returns(doc)
        nodes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
        common.summaries.audit_pipeline_summaries(doc, {'local_pipelines': doc['publication'].get('local_pipelines')}, nodes, allow_role_path_parents=True)
        common.summaries.audit_contract_stages(doc, {'contract_stages': doc['publication'].get('contract_stages')}, nodes)
        titles, bodies = common.passages.passages(drawing_document(doc), svg)
        assert not bodies, ('body intrusion', row['name'], bodies)
        q, b = row['quality'], row['before_quality']
        assert not q['issues'] and q['line_geometry']['crossings'] <= b['line_geometry']['crossings']
        assert q['native_width_px'] == b['native_width_px'] and q['native_height_px'] == b['native_height_px']
        results.append(dict(name=row['name'], **measured, title_passages=len(titles), wire_before=b['wire_length'], wire_after=q['wire_length'], crossings_before=b['line_geometry']['crossings'], crossings_after=q['line_geometry']['crossings']))
    assert (OUT / 'Transformer-F0.svg').read_bytes() == (OUT / 'Transformer-returned.svg').read_bytes()
    report = dict(schema='architecture-trunks-independent/1', passed=True, goal_complete=False, panels=len(results), rows=results,
        suite_sha256=sha(OUT / 'suite-report.json'), auditor_sha256=sha(Path(__file__)), ui_verified=False)
    if '--geometry-only' not in sys.argv:
        native = read(OUT / 'native-text-report.json'); assert len(native) == len(results)
        native_html = (OUT / 'native-audit.html').read_text()
        for r, m in zip(suite['rows'], native):
            assert r['name'] == m['name'] and r['nodes'] == m['nodes'] and not m['issues'] and m['texts']
            assert m['minWidth'] > 0 and m['minTextHeight'] > 0
            assert (OUT / r['svg']).read_text() in native_html
        for name, panel in [('coarse', 'Transformer-F0'), ('detail', 'Transformer-F1'), ('finer', 'Transformer-finer'),
                            ('reopened', 'Transformer-finer'), ('returned', 'Transformer-F0'), ('generic', 'ContextWeaver-up')]:
            assert (OUT / ('ui-'+name+'.svg')).read_bytes() == (OUT / (panel+'.svg')).read_bytes(), ('actual UI differs', name)
        assert read(OUT / 'ui-finer.json')['ir'] == read(ROOT / suite['rows'][0]['input'])
        report.update(ui_verified=True, native_sha256=sha(OUT / 'native-text-report.json'), native_html_sha256=sha(OUT / 'native-audit.html'),
            ui_svg_sha256={name: sha(OUT / ('ui-'+name+'.svg')) for name in ['coarse','detail','finer','reopened','returned','generic']},
            ui_document_sha256=sha(OUT / 'ui-finer.json'))
    (OUT / ('geometry-report.json' if '--geometry-only' in sys.argv else 'independent-report.json')).write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(dict(panels=len(results), changed=sum(r['new_groups'] > 0 for r in results), ink_saved=sum(r['ink_saved'] for r in results), ui_verified=report['ui_verified'])))


if __name__ == '__main__':
    main()

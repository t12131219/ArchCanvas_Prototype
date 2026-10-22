"""Independent source, XML, canonical-use and final outlet-geometry checks."""
import ast
import json
import xml.etree.ElementTree as ET
from check_stage_sample_frames import ROOT, read, sha
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
import audit_local_svg as summaries

OUT = ROOT / 'verification/stage-exit-paths/current'


def reports():
    return [read(OUT / f) for f in ['small-report.json', 'Transformer-F0-report.json',
        *[f'Transformer-F1-{i}-report.json' for i in range(3)]]]


def fulfilled(doc, key):
    return {r['goal'] for r in doc[key] if r['status'] == 'fulfilled'}


if __name__ == '__main__':
    captures = reports()
    hashes = captures[0]['implementation_sha256']
    for f, h in hashes.items():
        assert sha(ROOT / f) == h, ('stale implementation', f)
    content.OUT = operands.OUT = OUT
    extraction = read(OUT / 'extraction.json')
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    assert extraction['runtime_executed'] is False
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
    rows = []
    for report in captures:
        assert hashes == report['implementation_sha256']
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            checked = []
            for capture in row['results']:
                doc, direct, _ = content.inspect(capture, row['name'] + '-' + capture['suffix'],
                                               sequences.check_operation, require_quality=False)
                assert doc['ir'] == read(ROOT / row['input'])
                assert capture['quality'] == doc['diagnostics']['publication']
                operands.check_svg_bindings(capture, doc)
                svg = ET.parse(OUT / capture['svg']).getroot()
                nodes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
                for method, key in [(summaries.audit_pipeline_summaries, 'local_pipelines'),
                                    (summaries.audit_contract_stages, 'contract_stages')]:
                    method(doc, {key: doc['publication'].get(key)}, nodes)
                qualified = {g['id'] for g, ok in zip(doc['expression_goals']['goals'],
                    content.assignments(doc['ir'], doc['expression_goals']['goals'],
                        {**doc, 'quality': capture['quality']}, svg)) if ok}
                assert qualified <= direct
                quality = capture['quality']
                assert not quality['issues'] and not quality['route_failures'] and not quality['unplaced_port_labels']
                checked.append((doc, direct, qualified))
            (a, ga, qa), (b, gb, qb) = checked
            if row['comparison'] == 'coarse-vs-region-detail':
                assert len(b['layout']['nodes']) > len(a['layout']['nodes'])
            else:
                for key in ['architecture', 'publication', 'expression_goals', 'summary_goals']:
                    assert a[key] == b[key], (row['name'], key)
                assert ga <= gb and qa <= qb
                assert fulfilled(a, 'summary_coverage') <= fulfilled(b, 'summary_coverage')
                for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
                    assert a['layout'].get(key) == b['layout'].get(key)
                assert {n['id'] for n in a['layout']['nodes']} == {n['id'] for n in b['layout']['nodes']}
                descriptor = lambda d: [{k:v for k,v in e.items() if k!='route'} for e in d['layout']['edges']]
                assert descriptor(a) == descriptor(b)
                applied = lambda d: {r['id'] for r in d['layout']['constraint_receipts'] if r['status']=='applied'}
                assert applied(a) <= applied(b)
                old, new = [c['quality'] for c in row['results']]
                for key in ['native_height_px', 'native_width_px', 'wire_length']:
                    assert new[key] <= old[key]
                assert new['line_geometry']['crossings'] <= old['line_geometry']['crossings']
                assert len(new['line_geometry']['unrelated_contacts']) <= len(old['line_geometry']['unrelated_contacts'])
                assert new['min_canvas_font_px'] >= old['min_canvas_font_px']
            before, after = [c['quality'] for c in row['results']]
            decision = b['diagnostics']['routing'].get('stage_exit_refinement')
            if decision and decision['accepted']:
                assert all(decision[k] for k in ['facts_preserved', 'goals_preserved', 'applied_relations_preserved', 'geometry_preserved', 'local_accepted'])
                assert decision['max_trials'] == 1
                assert decision['candidate']['wire_length'] < decision['before']['wire_length']
                positions = {p['id']:p for p in b['layout']['nodes']}
                edges = {e['id']:e for e in b['layout']['edges']}
                irnodes = {n['id']:n for n in b['ir']['nodes']}
                for record in decision['records']:
                    assert record['before']['y'] == record['after']['y']
                    target = positions[record['node']]
                    for use in record['inputs']:
                        edge = edges[use['edge']]
                        assert all(edge[k] == use[k] for k in ['source','target','source_port','target_port'])
                        source = positions[use['source']]
                        assert target['x']+target['w']/2 == source['x']+source['w']/2
                        assert edge['route']['ok'] and not edge.get('condition')
                    n = irnodes.get(record['node'])
                    if n and n['kind'] in ['compute', 'opaque']:
                        actual = operands.syntax_for(b['ir'], n)
                        assert isinstance(actual, ast.Call)
                        assert len(actual.args) == 1 and isinstance(actual.args[0], ast.Name)
                        assert actual.args[0].id in ['value', 'decoder_out']
            if row['name'] == 'ConditionalOutlet':
                assert decision and not decision['accepted'] and not decision['geometry_preserved']
                assert decision['before'] == decision['candidate']
            if row['name'] in ['JoinedOutlets', 'StatefulOutlet', 'SharedOutlets', 'MutableOutlet', 'ConditionalOutlet', 'OutletWorkshop-legacy'] or row['name'].startswith('Transformer-F1-'):
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'], comparison=row['comparison'], accepted=decision['accepted'] if decision else None,
                nodes_before=len(a['layout']['nodes']), nodes_current=len(b['layout']['nodes']),
                direct_before=len(ga), direct_current=len(gb), qualified_before=len(qa), qualified_current=len(qb),
                summaries_before=len(fulfilled(a,'summary_coverage')), summaries_current=len(fulfilled(b,'summary_coverage')),
                dimensions_before=[before['native_width_px'],before['native_height_px']], dimensions_current=[after['native_width_px'],after['native_height_px']],
                crossings_before=before['line_geometry']['crossings'], crossings_current=after['line_geometry']['crossings'],
                wire_before=before['wire_length'], wire_current=after['wire_length']))
    assert len(rows) == 13
    result = dict(passed=True, svg_count=26, implementation_sha256=hashes, rows=rows, goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

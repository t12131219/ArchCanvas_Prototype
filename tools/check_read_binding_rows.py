"""Audit physical SVG use rows independently of the JavaScript display producer."""
import ast
import json
import xml.etree.ElementTree as ET
from check_stage_sample_frames import ROOT, read, sha
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
import audit_local_svg as summaries

OUT = ROOT / 'verification/read-binding-rows/current'


def reports():
    return [read(OUT / f) for f in ['small-report.json', 'Transformer-F0-report.json',
        *[f'Transformer-F1-{i}-report.json' for i in range(3)]]]


def fulfilled(doc, key):
    return {r['goal'] for r in doc[key] if r['status'] == 'fulfilled'}


def strip_nodes(nodes):
    return [{k: v for k, v in n.items() if k not in ['paper', 'local_pipeline_binding_rows']} for n in nodes]


def strip_goals(value):
    return {**value, 'goals': [{k: v for k, v in g.items() if k != 'binding_rows'} for g in value['goals']]}


if __name__ == '__main__':
    captures = reports()
    hashes = captures[0]['implementation_sha256']
    for f, h in hashes.items():
        assert sha(ROOT / f) == h, ('stale implementation', f)
    content.OUT = operands.OUT = OUT
    extraction = read(OUT / 'extraction.json')
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
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
                for pipeline in doc['publication'].get('local_pipelines', {}).get('rows', []):
                    for resource in pipeline.get('source_reads', []):
                        n = next(n for n in doc['ir']['nodes'] if n['id'] == resource['node'])
                        actual = operands.syntax_for(doc['ir'], n)
                        assert isinstance(actual, ast.Attribute) and isinstance(actual.value, ast.Name)
                        assert actual.value.id == 'self' and actual.attr == resource['attribute']
                        assert ast.unparse(actual) == resource['expression']
                q = capture['quality']
                assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
                checked.append((doc, direct, qualified))
            (a, ga, qa), (b, gb, qb) = checked
            if row['comparison'] == 'coarse-vs-helper-detail':
                assert a['ir'] == b['ir']
                assert len(b['layout']['nodes']) > len(a['layout']['nodes'])
                visible = {n['id'] for n in b['layout']['nodes']}
                helpers = [p for p in a['publication']['local_pipelines']['rows'] if p['status'] == 'summary']
                assert helpers
                assert all(o['node'] in visible for p in helpers for o in p['operations'])
                assert all(not r['detailed_relationships_fulfilled'] for r in a['summary_coverage'])
                assert all(r['status'] == 'fulfilled' and r['form'] == 'operation-paths' and
                           not any(r[k] for k in ['missing_operation_nodes', 'missing_operation_labels', 'missing_internal_paths'])
                           for r in b['summary_coverage'])
            else:
                assert a['ir'] == b['ir'] and a['publication'] == b['publication']
                assert strip_nodes(a['architecture']['nodes']) == strip_nodes(b['architecture']['nodes'])
                assert {k:v for k,v in a['architecture'].items() if k!='nodes'} == {k:v for k,v in b['architecture'].items() if k!='nodes'}
                assert a['expression_goals'] == b['expression_goals']
                assert strip_goals(a['summary_goals']) == strip_goals(b['summary_goals'])
                assert ga <= gb and qa <= qb
                assert fulfilled(a, 'summary_coverage') <= fulfilled(b, 'summary_coverage')
                for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
                    assert a['layout'].get(key) == b['layout'].get(key)
                assert {n['id'] for n in a['layout']['nodes']} == {n['id'] for n in b['layout']['nodes']}
                descriptor = lambda d: [{k:v for k,v in e.items() if k!='route'} for e in d['layout']['edges']]
                assert descriptor(a) == descriptor(b)
                applied = {r['id'] for r in a['layout']['constraint_receipts'] if r['status']=='applied'}
                assert applied <= {r['id'] for r in b['layout']['constraint_receipts'] if r['status']=='applied'}
                if row['comparison'] == 'same-state-regression' or row['name'].startswith('Transformer-F1-'):
                    assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
                if row['comparison'] == 'same-frontier-comparison':
                    old, new = [c['quality'] for c in row['results']]
                    for key in ['native_height_px', 'native_width_px', 'wire_length']:
                        assert new[key] <= old[key]
                    assert new['line_geometry']['crossings'] <= old['line_geometry']['crossings']
                    assert len(new['line_geometry']['unrelated_contacts']) <= len(old['line_geometry']['unrelated_contacts'])
                    assert new['min_canvas_font_px'] >= old['min_canvas_font_px']
                if row['comparison'] == 'rejected-printing-candidate':
                    decision = a['diagnostics']['routing']['read_binding_rows']
                    assert not decision['accepted'] and not decision['geometry_preserved']
                    assert b['diagnostics']['publication']['native_height_px'] > a['diagnostics']['publication']['native_height_px']
            before, after = [c['quality'] for c in row['results']]
            alt = [n for n in b['layout']['nodes'] if n.get('read_binding_rows')]
            decision = b['diagnostics']['routing'].get('read_binding_rows')
            if decision and decision['accepted']:
                assert alt and all(decision[k] for k in ['facts_preserved', 'direct_goals_preserved', 'summary_goals_preserved', 'applied_relations_preserved', 'geometry_preserved'])
                assert after['native_width_px']*after['native_height_px'] < before['native_width_px']*before['native_height_px']
            if row['name'] == 'WideLabelWorkshop':
                assert not decision['accepted'] and row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            if row['name'] == 'SharedNeighbor':
                identities = [p['owner_identity'] for p in b['publication']['local_pipelines']['rows']]
                assert [p['invocation'] for p in identities] == [1, 2] and identities[0]['reference'] == identities[1]['reference']
            rows.append(dict(name=row['name'], comparison=row['comparison'], alternate_cards=len(alt),
                accepted=decision['accepted'] if decision else None,
                direct_before=len(ga), direct_current=len(gb), qualified_before=len(qa), qualified_current=len(qb),
                summaries_before=len(fulfilled(a, 'summary_coverage')), summaries_current=len(fulfilled(b, 'summary_coverage')),
                nodes_before=len(a['layout']['nodes']), nodes_current=len(b['layout']['nodes']),
                dimensions_before=[before['native_width_px'], before['native_height_px']],
                dimensions_current=[after['native_width_px'], after['native_height_px']],
                crossings_before=before['line_geometry']['crossings'], crossings_current=after['line_geometry']['crossings'],
                wire_before=before['wire_length'], wire_current=after['wire_length']))
    result = dict(passed=True, svg_count=2*len(rows), implementation_sha256=hashes, rows=rows, goal_complete=False)
    assert result['svg_count'] == 38
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

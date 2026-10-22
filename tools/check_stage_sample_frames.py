"""Independent canonical binding, summary, source and real SVG audit."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
import audit_local_svg as summaries
import ast
import check_final_sample_frames as frames

OUT = ROOT / 'verification/stage-sample-frames/current'
read, sha = content.read, content.sha


def reports():
    return [read(OUT / f) for f in ['small-report.json', 'Transformer-F0-report.json',
        *[f'Transformer-F1-{i}-report.json' for i in range(3)]]]


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
                doc, raw, _ = content.inspect(capture, row['name'] + '-' + capture['suffix'],
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
                assert qualified <= raw
                for pipeline in doc['publication'].get('local_pipelines', {}).get('rows', []):
                    for resource in pipeline.get('source_reads', []):
                        n = next(n for n in doc['ir']['nodes'] if n['id'] == resource['node'])
                        actual = operands.syntax_for(doc['ir'], n)
                        assert isinstance(actual, ast.Attribute) and isinstance(actual.value, ast.Name)
                        assert actual.value.id == 'self' and actual.attr == resource['attribute']
                        assert ast.unparse(actual) == resource['expression']
                    if pipeline.get('owner_identity'):
                        d = pipeline['owner_identity']
                        owner = next(n for n in doc['ir']['nodes'] if n['id'] == pipeline['node'])
                        assert owner['module_binding']['reference'] == d['reference']
                        relation, = [r for r in doc['architecture']['relation_graph']['relations'] if r['id'] == d['relation']]
                        assert relation['type'] == 'same-object-calls' and owner['id'] in relation['members']
                        assert relation['properties']['reference'] == d['reference']
                q = capture['quality']
                assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
                checked.append((doc, raw, qualified))
            (a, ga, qa), (b, gb, qb) = checked
            if row['comparison'] == 'same-state-regression':
                assert a == b and ga == gb and qa == qb
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            elif row['comparison'] == 'coarse-vs-suffix-detail':
                assert len(b['layout']['nodes']) > len(a['layout']['nodes'])
                seqs = a['publication']['inline_sequences']['sequences']
                suffixes = [r for s in seqs for r in s['remainders']]
                assert suffixes
                visible = {n['id']: n for n in b['layout']['nodes']}
                assert all(visible[r['node']]['expanded'] and all(id in visible for id in r['instances']) for r in suffixes)
            elif row['comparison'] == 'no-proved-suffix':
                assert not any(s['remainders'] for s in a['publication']['inline_sequences']['sequences'])
                assert a['layout'] == b['layout'] and ga == gb and qa == qb
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            else:
                assert a['ir'] == b['ir'] and a['architecture'] == b['architecture']
                assert a['state'] == b['state'] and a['publication'] == b['publication']
                assert a['expression_goals'] == b['expression_goals'] and a['summary_goals'] == b['summary_goals']
                assert ga <= gb and qa <= qb
                old_summaries = {r['goal'] for r in a['summary_coverage'] if r['status'] == 'fulfilled'}
                new_summaries = {r['goal'] for r in b['summary_coverage'] if r['status'] == 'fulfilled'}
                assert old_summaries <= new_summaries
                oldnodes = {p['id']: p for p in a['layout']['nodes']}
                newnodes = {p['id']: p for p in b['layout']['nodes']}
                removed = oldnodes.keys() - newnodes.keys()
                assert not newnodes.keys() - oldnodes.keys()
                planned = {n['id']: n for n in b['architecture']['nodes']}
                owners = {r['node']: r for r in b['layout'].get('frame_ownership', [])}
                for id in removed:
                    frame = owners[id]
                    n, parent = planned[id], planned[frame['target']]
                    assert frame['kind'] == 'sequence-sample' and n['semantic_type'] == 'repeat-instance'
                    assert parent['semantic_type'] == 'serial-repeat' and oldnodes[id]['expanded']
                    assert frame['sequence_sample']['module_identity'] == n.get('module_identity')
                    assert frame['sequence_sample']['source_positions'] == n['structure_representative']['indices']
                    assert frame['source'] == n['source'] and frame['source_parent'] == n.get('source_parent', n['parent'])
                    seq = parent['sequence_frontier']
                    assert len(seq['samples']) == 1 and seq['samples'][0]['instance'] == id and not seq['unclassified']
                    suffixes = [r for r in seq['remainders']]
                    assert suffixes and all(not newnodes[r['node']]['expanded'] for r in suffixes)
                    assert sorted([n['repeat_index']] + [i for r in suffixes for i in r['indices']]) == list(range(parent['repeat_contract']['count']))
                    members = {id}
                    while True:
                        extra = {p['id'] for p in planned.values() if p.get('parent') in members} - members
                        if not extra: break
                        members |= extra
                    assert all(planned[k]['kind'] != 'opaque' and not any(planned[k].get(v) for v in ['mutable', 'identity_display', 'observed_calls']) for k in members)
                    printed = ''.join(newnodes[parent['id']]['captions']).replace(' ', '')
                    assert 'Detail:sourcecall' + str(n['repeat_index'] + 1) in printed
                # All surviving exact edge properties remain; drawing ownership
                # is the only permitted descriptor change, never a value alias.
                assert len(a['layout']['edges']) == len(b['layout']['edges'])
                for e, f in zip(a['layout']['edges'], b['layout']['edges']):
                    assert e.keys() == f.keys()
                    for k in e:
                        if k == 'route': continue
                        if k == 'design_route':
                            assert f[k] == {**e[k], 'owner': owners[e[k]['owner']]['target'] if e[k]['owner'] in removed else e[k]['owner']}
                        else: assert e[k] == f[k], (row['name'], e['id'], k)
                for bucket, ids in a['layout']['node_accounting'].items():
                    expected = set(ids) - removed if bucket == 'visible' else set(ids) | removed if bucket == 'attached' else set(ids)
                    assert set(b['layout']['node_accounting'][bucket]) == expected
                assert a['layout']['edge_accounting'] == b['layout']['edge_accounting']
                oldq, newq = [c['quality'] for c in row['results']]
                assert newq['native_height_px'] <= oldq['native_height_px'] and newq['native_width_px'] <= oldq['native_width_px']
                assert newq['wire_length'] <= oldq['wire_length'] and newq['line_geometry']['crossings'] <= oldq['line_geometry']['crossings']
                if row['comparison'] == 'isolated-frame-map':
                    assert frames.transformation(a, b)
            stages = [r for r in b['publication'].get('contract_stages', {}).get('rows', []) if r['status'] == 'summary']
            pipelines = [r for r in b['publication'].get('local_pipelines', {}).get('rows', []) if r['status'] == 'summary']
            if row['name'] == 'Transformer-F0':
                assert len(stages) == 5
                visible = {n['id']: n for n in b['layout']['nodes']}
                certified = [n for n in b['architecture']['nodes'] if n['id'] in visible and n['kind'] == 'composite' and n.get('semantic_contracts')]
                assert len(certified) == 5 and all(not visible[n['id']]['expanded'] for n in certified)
            before, after = [c['quality'] for c in row['results']]
            rows.append(dict(name=row['name'], comparison=row['comparison'],
                direct_before=len(ga), direct_current=len(gb), qualified_before=len(qa), qualified_current=len(qb),
                summary_stages=len(stages), summary_helpers=len(pipelines),
                nodes_before=len(a['layout']['nodes']), nodes_current=len(b['layout']['nodes']),
                removed_frames=sorted({p['id'] for p in a['layout']['nodes']} - {p['id'] for p in b['layout']['nodes']}),
                summaries_before=sum(r['status'] == 'fulfilled' for r in a['summary_coverage']),
                summaries_current=sum(r['status'] == 'fulfilled' for r in b['summary_coverage']),
                dimensions_before=[before['native_width_px'], before['native_height_px']],
                dimensions_current=[after['native_width_px'], after['native_height_px']],
                crossings_before=before['line_geometry']['crossings'], crossings_current=after['line_geometry']['crossings'],
                wire_before=before['wire_length'], wire_current=after['wire_length']))
    result = dict(passed=True, svg_count=2*len(rows), implementation_sha256=hashes, rows=rows, goal_complete=False)
    assert result['svg_count'] == 40
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

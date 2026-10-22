"""Bind frozen captures, independent XML checks, real UI exports and tests."""
import json
import xml.etree.ElementTree as ET
from check_stage_exit_paths import ROOT, OUT, read, sha, reports


if __name__ == '__main__':
    checks = read(OUT / 'independent-checks.json')
    assert checks['passed'] and checks['svg_count'] == 26
    testpath = ROOT / 'verification/local-relations/current/test-report.json'
    tests = read(testpath)
    assert len(tests['counts']) == 91 and sum(tests['counts'].values()) == 1007
    assert tests['counts']['stage-exit-paths'] == 11 and all(c['exit_code'] == 0 for c in tests['commands'])
    for report in [tests, checks]:
        for f, h in report['implementation_sha256'].items():
            assert sha(ROOT / f) == h, ('stale implementation', f)
    captures = {c['svg']:c for report in reports() for row in report['rows'] for c in row['results']}
    browser = read(OUT / 'browser-report.json')
    assert len(captures) == len(browser['rows']) == 26
    assert {r['file'] for r in browser['rows']} == captures.keys()
    xml = lambda f: ET.parse(OUT / f).getroot()
    for row in browser['rows']:
        assert not row['overflows']
        svg = xml(row['file'])
        assert row['paths'] == [dict(id=e.get('data-edge-id'), d=e.get('d')) for e in svg.iter() if e.get('data-edge-id')]
        texts = [dict(id=e.get('data-node-id'), texts=[''.join(t.itertext()) for t in e if t.tag.endswith('}text')])
                 for e in svg.iter() if e.get('data-node-id')]
        assert row['texts'] == texts and row['nodes'] == len(texts)
        assert row['node_texts'] == sum(len(t['texts']) for t in texts)
        dots = [dict(source=e.get('data-fanout-source'), port=e.get('data-source-port'),
                     edges=json.loads(e.get('data-fanout-edges')), x=e.get('cx'), y=e.get('cy'))
                for e in svg.iter() if e.get('class') == 'paper-fanout-junction']
        assert row['junctions'] == dots
        assert sha(OUT / row['file']) == captures[row['file']]['svg_sha256']
    ir = read(OUT / 'OutletWorkshop.json')
    coarse, detail = [read(OUT / f) for f in ['ui-OutletWorkshop-current-input.json', 'ui-OutletWorkshop-open.json']]
    assert coarse['ir'] == detail['ir'] == ir
    assert coarse['state']['paperGranularity'] == detail['state']['paperGranularity'] == 'stages'
    assert coarse['state'].get('paperAuto', True) and not detail['state']['paperAuto']
    for a,b in [('ui-OutletWorkshop-coarse.svg','OutletWorkshop-current.svg'),
                ('ui-OutletWorkshop-open.svg','OutletWorkshop-open-current.svg'),
                ('ui-OutletWorkshop-open.svg','ui-OutletWorkshop-reopened.svg'),
                ('ui-OutletWorkshop-coarse.svg','ui-OutletWorkshop-returned.svg')]:
        assert sha(OUT / a) == sha(OUT / b), ('UI mismatch', a, b)
    ids = lambda f: {e.get('data-node-id') for e in xml(f).iter() if e.get('data-node-id')}
    assert len(ids('ui-OutletWorkshop-coarse.svg')) == 20 and len(ids('ui-OutletWorkshop-open.svg')) == 30
    raw = xml('ui-OutletWorkshop-source.svg')
    assert {e.get('data-id') for e in raw.iter() if e.get('data-id')} == {n['id'] for n in ir['nodes']}
    assert {e.get('data-edge-id') for e in raw.iter() if e.get('data-edge-id')} == {e['id'] for e in ir['edges']}
    assert (len(ir['nodes']),len(ir['edges'])) == (54,52)
    source = read(OUT / 'source-expandability.json')
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert (source['visible_nodes'],source['visible_edges']) == (3371,3663)
    assert sha(ROOT / source['input']) == source['input_sha256']
    ui = read(OUT / 'ui-transformer-observations.json')
    assert [(r['granularity'],len(r['nodes'])) for r in ui['observations']] == [('stages',28),('roles',65),('stages',28)]
    for input in ['ui-Transformer-F0-current-input.json','ui-Transformer-F1-input.json']:
        assert read(OUT / input)['ir'] == read(ROOT / source['input'])
    for observed,name in zip(ui['observations'],['Transformer-F0-current','Transformer-F1-0-current','Transformer-F0-current']):
        doc = read(OUT / (name+'.layout.json'))
        assert {n['id'] for n in observed['nodes']} == {n['id'] for n in doc['layout']['nodes']}
        expected = {e.get('data-node-id'):[''.join(t.itertext()) for t in e if t.tag.endswith('}text')]
                    for e in xml(name+'.svg').iter() if e.get('data-node-id')}
        for node in observed['nodes']:
            labels = expected[node['id']]
            assert node['texts'][:len(labels)] == labels
            assert all(t in ['+','−'] for t in node['texts'][len(labels):])
    for a,b in [('ui-Transformer-coarse.svg','Transformer-F0-current.svg'),
                ('ui-Transformer-F1.svg','Transformer-F1-0-current.svg'),
                ('ui-Transformer-returned.svg','Transformer-F0-current.svg')]:
        assert sha(OUT / a) == sha(OUT / b)
    f0 = next(r for r in checks['rows'] if r['name']=='Transformer-F0')
    assert f0['nodes_before'] == f0['nodes_current'] == 28
    assert f0['dimensions_before'] == [848,1700] and f0['dimensions_current'] == [848,1676]
    assert f0['crossings_before'] == f0['crossings_current'] == 9
    assert f0['wire_before'] == 15578.3 and f0['wire_current'] == 15059.3
    for key in ['direct','qualified','summaries']:
        assert f0[key+'_before'] == f0[key+'_current']
    for row in [r for report in reports() for r in report['rows'] if r['name'].startswith('Transformer-F1-')]:
        assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
    producers = ['tools/extract_stage_exit_paths.py','tools/audit_stage_exit_paths.cjs',
                 'tools/check_stage_exit_paths.py','tools/build_stage_exit_paths_review.py',
                 'tools/finalize_stage_exit_paths.py','tools/audit_source_expandability.cjs',
                 'tools/check_transform_configurations.py','tools/check_transform_operands.py',
                 'tools/check_transform_sequences.py','tools/audit_local_svg.py',
                 'tools/audit_diagram_assignments.py','tools/check_title_passages.py',
                 'tests/stage-exit-paths.test.cjs','tests/semantic_fixtures/stage_exit_paths.py',
                 'docs/stage-exit-paths.md','docs/semantic-frontier-targets.md']
    artifacts = [f for f in OUT.iterdir() if f.is_file() and not f.name.endswith('.layout.json') and f.name!='completion-report.json']
    result = dict(schema='stage-exit-paths-completion/1',baseline='bb45fd8',passed=True,goal_complete=False,
        tests=dict(count=1007,groups=91,report=str(testpath.relative_to(ROOT)),sha256=sha(testpath),
                   logs_sha256={c['log']:sha(testpath.parent/c['log']) for c in tests['commands']}),
        svg_count=26,browser=dict(svg_count=26,nodes=sum(r['nodes'] for r in browser['rows']),
                                 node_texts=sum(r['node_texts'] for r in browser['rows']),
                                 port_labels=sum(r['port_labels'] for r in browser['rows']),overflows=0),
        ui=dict(small_expand_save_reopen_source_return=True,reopened_and_returned_svg_identical=True,
                transformer_fixed_F0_F1_F0_document_import=True,transformer_ui_exports_match_formal_svg=True,
                transformer_dropdown_frontier_switch_verified=False),
        producer_sha256={f:sha(ROOT/f) for f in producers},artifact_sha256={f.name:sha(f) for f in artifacts},
        limitations=['F0/F1 visual and semantic convergence remains incomplete.',
                     'Coarse graph still has dense external inputs, context lines and source metadata.',
                     'A candidate can add one complete render for canvas stages with at most 128 visible edges; performance improvement is not claimed.',
                     'State, conditions, mutation and distinct shared invocations retain their existing boundaries.',
                     'Rejected no-benefit candidate keeps the baseline SVG.',
                     'Fixed F0/F1/F0 imports are verified; dropdown frontier switching is not.',
                     'Raw source projection is complete; thousands-node SVG routing and browser performance remain unverified.',
                     'Native text bounds pass; viewport fitting still makes tall full graphs difficult to read.'])
    (OUT/'completion-report.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if not k.endswith('sha256')},indent=2))

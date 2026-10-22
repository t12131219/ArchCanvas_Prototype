"""Bind regression, independent XML, browser DOM and actual UI exports."""
import json
import xml.etree.ElementTree as ET
from check_stage_sample_frames import ROOT, OUT, read, sha, reports


if __name__ == '__main__':
    checks = read(OUT / 'independent-checks.json')
    assert checks['passed'] and checks['svg_count'] == 40
    testpath = ROOT / 'verification/local-relations/current/test-report.json'
    tests = read(testpath)
    assert len(tests['counts']) == 89 and sum(tests['counts'].values()) == 984
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for report in [tests, checks]:
        for f, h in report['implementation_sha256'].items():
            assert sha(ROOT / f) == h, ('stale implementation', f)
    captures = {c['svg']: c for r in reports() for row in r['rows'] for c in row['results']}
    browser = read(OUT / 'browser-report.json')
    assert len(captures) == len(browser['rows']) == 40
    assert {r['file'] for r in browser['rows']} == captures.keys()
    for row in browser['rows']:
        assert not row['overflows']
        svg = ET.parse(OUT / row['file']).getroot()
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
    ir = read(OUT / 'SignalStack.json')
    coarse, detail = [read(OUT / ('ui-SignalStack-' + s + '.json')) for s in ['coarse', 'open']]
    assert coarse['ir'] == detail['ir'] == ir
    assert coarse['state']['paperGranularity'] == detail['state']['paperGranularity'] == 'stages'
    assert coarse['state']['paperAuto'] and not detail['state']['paperAuto']
    assert sha(OUT / 'ui-SignalStack-open.svg') == sha(OUT / 'ui-SignalStack-reopened.svg')
    assert sha(OUT / 'ui-SignalStack-coarse.svg') == sha(OUT / 'ui-SignalStack-returned.svg')
    xml = lambda f: ET.parse(OUT / f).getroot()
    ids = lambda f: {e.get('data-node-id') for e in xml(f).iter() if e.get('data-node-id')}
    a, b = ids('ui-SignalStack-coarse.svg'), ids('ui-SignalStack-open.svg')
    assert len(a) == 10 and len(b) == 13
    raw = xml('ui-SignalStack-source.svg')
    assert {e.get('data-id') for e in raw.iter() if e.get('data-id')} == {n['id'] for n in ir['nodes']}
    assert {e.get('data-edge-id') for e in raw.iter() if e.get('data-edge-id')} == {e['id'] for e in ir['edges']}
    source = read(OUT / 'source-expandability.json')
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert (source['visible_nodes'], source['visible_edges']) == (3371, 3663)
    assert sha(ROOT / source['input']) == source['input_sha256']
    ui = read(OUT / 'ui-transformer-observations.json')
    request = read(OUT / ui['input'])
    assert request['ir'] == read(ROOT / source['input'])
    observed = ui['observations'][0]
    assert observed['granularity'] == 'stages' and len(observed['nodes']) == 28
    formal = read(OUT / 'Transformer-F0-current.layout.json')
    assert {n['id'] for n in observed['nodes']} == {n['id'] for n in formal['layout']['nodes']}
    for pipeline in formal['publication']['local_pipelines']['rows']:
        if pipeline['status'] == 'summary' and pipeline.get('source_reads'):
            n = next(n for n in observed['nodes'] if n['id'] == pipeline['node'])
            visible = ''.join(n['texts']).replace(' ', '')
            assert all(('Reads' + r['expression']).replace(' ', '') in visible for r in pipeline['source_reads'])
            assert ('sourcecall' + str(pipeline['owner_identity']['invocation']) + '/2') in visible
    f0 = next(r for r in checks['rows'] if r['name'] == 'Transformer-F0')
    assert (f0['nodes_before'], f0['nodes_current']) == (30, 28)
    assert (f0['crossings_before'], f0['crossings_current']) == (9, 9)
    # Actual UI round trip uses fixed graph documents, not a dropdown preset.
    assert [(r['granularity'], len(r['nodes'])) for r in ui['observations']] == [('stages', 28), ('roles', 65), ('stages', 28)]
    detail_input = read(OUT / ui['detail_input'])
    assert detail_input['ir'] == request['ir']
    for observed, name in zip(ui['observations'], ['Transformer-F0-current', 'Transformer-F1-0-current', 'Transformer-F0-current']):
        doc = read(OUT / (name + '.layout.json'))
        assert {n['id'] for n in observed['nodes']} == {n['id'] for n in doc['layout']['nodes']}
        expected = {e.get('data-node-id'): [''.join(t.itertext()) for t in e if t.tag.endswith('}text')]
                    for e in xml(name + '.svg').iter() if e.get('data-node-id')}
        for n in observed['nodes']:
            labels = expected[n['id']]
            assert n['texts'][:len(labels)] == labels
            assert all(t in ['+', '−'] for t in n['texts'][len(labels):]), 'unexpected UI-only label'
    assert sha(OUT / 'ui-Transformer-returned.svg') == sha(OUT / 'Transformer-F0-current.svg')
    assert sha(OUT / 'ui-Transformer-F1.svg') == sha(OUT / 'Transformer-F1-0-current.svg')
    samples = [n for n in formal['layout']['nodes'] if any('Detail: source call 1' in c for c in n.get('captions', []))]
    assert len(samples) == 2
    assert (f0['qualified_before'], f0['qualified_current']) == (8, 8)
    assert (f0['summaries_before'], f0['summaries_current']) == (4, 4)
    assert f0['dimensions_current'] == [848, 1732] and f0['wire_current'] < f0['wire_before']
    for row in checks['rows']:
        if row['comparison'] == 'same-frontier-comparison':
            assert row['qualified_before'] <= row['qualified_current']
            assert row['summaries_before'] <= row['summaries_current']
        if row['name'].startswith('Transformer-F1-'):
            capture = next(r for report in reports() for r in report['rows'] if r['name'] == row['name'])
            assert capture['results'][0]['svg_sha256'] == capture['results'][1]['svg_sha256']
    assert (len(ir['nodes']), len(ir['edges'])) == (64, 55)
    seqs = read(OUT / 'SignalStack-current.layout.json')['publication']['inline_sequences']['sequences']
    suffixes = [r for s in seqs for r in s['remainders']]
    assert suffixes
    assert all(s['samples'][0]['instance'] not in a and s['samples'][0]['instance'] in b for s in seqs)
    assert all(set(r['instances']) <= b and r['node'] in detail['state']['open'] for r in suffixes)
    producers = ['tools/extract_stage_sample_frames.py', 'tools/audit_stage_sample_frames.cjs',
                 'tools/check_stage_sample_frames.py', 'tools/build_stage_sample_frames_review.py',
                 'tools/finalize_stage_sample_frames.py', 'tools/audit_source_expandability.cjs',
                 'tools/check_final_sample_frames.py', 'tools/check_transform_configurations.py',
                 'tools/check_transform_operands.py', 'tools/check_transform_sequences.py', 'tools/audit_local_svg.py',
                 'tools/audit_diagram_assignments.py', 'tools/check_title_passages.py',
                 'tests/stage-sample-frames.test.cjs', 'tests/semantic_fixtures/stage_sample_frames.py',
                 'docs/stage-sample-frames.md', 'docs/semantic-frontier-targets.md']
    artifacts = [f for f in OUT.iterdir() if f.is_file() and not f.name.endswith('.layout.json') and f.name != 'completion-report.json']
    result = dict(schema='stage-sample-frames-completion/1', baseline='53ac2a7', passed=True, goal_complete=False,
        tests=dict(count=984, groups=89, report=str(testpath.relative_to(ROOT)), sha256=sha(testpath),
                   logs_sha256={c['log']: sha(testpath.parent / c['log']) for c in tests['commands']}),
        svg_count=40, browser=dict(svg_count=40, nodes=sum(r['nodes'] for r in browser['rows']),
                                 node_texts=sum(r['node_texts'] for r in browser['rows']), port_labels=sum(r['port_labels'] for r in browser['rows']), overflows=0),
        ui=dict(small_summary_detail_save_reopen_source_return=True, reopened_and_returned_svg_identical=True,
                transformer_fixed_F0_F1_F0_document_import=True, transformer_ui_exports_match_formal_svg=True,
                transformer_dropdown_frontier_switch_verified=False),
        producer_sha256={f: sha(ROOT / f) for f in producers},
        artifact_sha256={f.name: sha(f) for f in artifacts},
        limitations=['F0/F1 visual and semantic convergence remains incomplete.',
                     'Only evidence-supported concrete sample frames can share their repeat frame; subsequent calls remain separate.',
                     'Conditional example has no proved suffix; shared or mutable mixed sequences retain their boundaries.',
                     'Baseline route receipts are audited before comparison; pre-existing conflicts are not reported as fulfilled.',
                     'Transformer three prior F1 SVGs and three small legacy states are unchanged; diagnostic documents may differ.',
                     'Transformer full-source projection is complete; thousands-node SVG performance is unverified.',
                     'Fixed F0/F1/F0 imports are verified; dropdown selection of the intended dual frontier remains unverified.',
                     'Native SVG font size passes; fitting a tall full graph into the viewport still makes text small.'])
    (OUT / 'completion-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k:v for k,v in result.items() if not k.endswith('sha256')}, indent=2))

"""Bind regression, independent XML, browser DOM and actual UI exports."""
import json
import xml.etree.ElementTree as ET
from check_source_read_paths import ROOT, OUT, read, sha, reports


if __name__ == '__main__':
    checks = read(OUT / 'independent-checks.json')
    assert checks['passed'] and checks['svg_count'] == 42
    testpath = ROOT / 'verification/local-relations/current/test-report.json'
    tests = read(testpath)
    assert len(tests['counts']) == 88 and sum(tests['counts'].values()) == 974
    assert all(c['exit_code'] == 0 for c in tests['commands'])
    for report in [tests, checks]:
        for f, h in report['implementation_sha256'].items():
            assert sha(ROOT / f) == h, ('stale implementation', f)
    captures = {c['svg']: c for r in reports() for row in r['rows'] for c in row['results']}
    browser = read(OUT / 'browser-report.json')
    assert len(captures) == len(browser['rows']) == 42
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
    ir = read(OUT / 'ReadWorkshop.json')
    coarse, detail = [read(OUT / ('ui-ReadWorkshop-' + s + '.json')) for s in ['coarse', 'open']]
    assert coarse['ir'] == detail['ir'] == ir
    assert coarse['state']['paperGranularity'] == detail['state']['paperGranularity'] == 'stages'
    assert coarse['state']['paperAuto'] and not detail['state']['paperAuto']
    assert sha(OUT / 'ui-ReadWorkshop-open.svg') == sha(OUT / 'ui-ReadWorkshop-reopened.svg')
    assert sha(OUT / 'ui-ReadWorkshop-coarse.svg') == sha(OUT / 'ui-ReadWorkshop-returned.svg')
    xml = lambda f: ET.parse(OUT / f).getroot()
    ids = lambda f: {e.get('data-node-id') for e in xml(f).iter() if e.get('data-node-id')}
    a, b = ids('ui-ReadWorkshop-coarse.svg'), ids('ui-ReadWorkshop-open.svg')
    assert len(a) == 9 and len(b) == 16 and a <= b
    raw = xml('ui-ReadWorkshop-source.svg')
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
    assert observed['granularity'] == 'stages' and len(observed['nodes']) == 30
    formal = read(OUT / 'Transformer-F0-current.layout.json')
    assert {n['id'] for n in observed['nodes']} == {n['id'] for n in formal['layout']['nodes']}
    for pipeline in formal['publication']['local_pipelines']['rows']:
        if pipeline['status'] == 'summary' and pipeline.get('source_reads'):
            n = next(n for n in observed['nodes'] if n['id'] == pipeline['node'])
            visible = ''.join(n['texts']).replace(' ', '')
            assert all(('Reads' + r['expression']).replace(' ', '') in visible for r in pipeline['source_reads'])
            assert ('sourcecall' + str(pipeline['owner_identity']['invocation']) + '/2') in visible
    f0 = next(r for r in checks['rows'] if r['name'] == 'Transformer-F0')
    assert (f0['nodes_before'], f0['nodes_current']) == (40, 30)
    assert (f0['crossings_before'], f0['crossings_current']) == (7, 9)
    producers = ['tools/extract_source_read_paths.py', 'tools/audit_source_read_paths.cjs',
                 'tools/check_source_read_paths.py', 'tools/build_source_read_paths_review.py',
                 'tools/finalize_source_read_paths.py', 'tools/audit_source_expandability.cjs',
                 'tools/check_transform_configurations.py', 'tools/check_transform_operands.py',
                 'tools/check_transform_sequences.py', 'tools/audit_local_svg.py',
                 'tools/audit_diagram_assignments.py', 'tools/check_title_passages.py',
                 'tests/source-read-paths.test.cjs', 'tests/semantic_fixtures/source_read_paths.py',
                 'docs/source-read-paths.md', 'docs/semantic-frontier-targets.md']
    artifacts = [f for f in OUT.iterdir() if f.is_file() and not f.name.endswith('.layout.json') and f.name != 'completion-report.json']
    result = dict(schema='source-read-paths-completion/1', baseline='30358f8', passed=True, goal_complete=False,
        tests=dict(count=974, groups=88, report=str(testpath.relative_to(ROOT)), sha256=sha(testpath),
                   logs_sha256={c['log']: sha(testpath.parent / c['log']) for c in tests['commands']}),
        svg_count=42, browser=dict(svg_count=42, nodes=sum(r['nodes'] for r in browser['rows']),
                                 node_texts=sum(r['node_texts'] for r in browser['rows']), port_labels=sum(r['port_labels'] for r in browser['rows']), overflows=0),
        ui=dict(small_summary_detail_save_reopen_source_return=True, reopened_and_returned_svg_identical=True,
                transformer_fixed_stage_document_import=True, transformer_interactive_frontier_switch_verified=False),
        producer_sha256={f: sha(ROOT / f) for f in producers},
        artifact_sha256={f.name: sha(f) for f in artifacts},
        limitations=['F0/F1 visual and semantic convergence remains incomplete.',
                     'New source-read forms currently apply to canvas stages only; no immutability, alias identity or purity is asserted.',
                     'Same-preset source-read folding reduces atomic direct goals; this is reported separately from summary goals.',
                     'Atomic direct goals decrease when intentionally folded; summaries do not earn atomic detail credit.',
                     'Transformer F1 three prior states and three small legacy states are unchanged.',
                     'Transformer full-source projection is complete; thousands-node SVG performance is unverified.',
                     'Only Transformer fixed stage import is confirmed this round; F0/F1 interactive switching is not jointly verified.',
                     'Transformer F0 crossings increase from 7 to 9; full visual convergence remains incomplete.'])
    (OUT / 'completion-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k:v for k,v in result.items() if not k.endswith('sha256')}, indent=2))

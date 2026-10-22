"""Bind physical-source, XML, browser, UI export and full regression evidence."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cell-interfaces/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
SVG_TEXT = '{http://www.w3.org/2000/svg}text'


if __name__ == '__main__':
    checks = read(OUT / 'independent-checks.json')
    assert checks['passed'] and checks['svg_count'] == 54
    testpath = ROOT / 'verification/local-relations/current/test-report.json'
    tests = read(testpath)
    assert len(tests['counts']) == 86 and sum(tests['counts'].values()) == 957
    assert all(r['exit_code'] == 0 for r in tests['commands'])
    for report in [tests, checks]:
        for file, digest in report['implementation_sha256'].items():
            assert sha(ROOT / file) == digest, ('stale implementation', file)
    reports = [read(OUT / 'small-report.json')] + [read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    captures = {c['svg']: c for report in reports for row in report['rows'] for c in row['results']}
    assert len(captures) == 54
    browser = read(OUT / 'browser-report.json')
    assert browser['url'].endswith('/verification/cell-interfaces/current/all-review.html')
    assert len(browser['rows']) == 54 and {r['file'] for r in browser['rows']} == captures.keys()
    for row in browser['rows']:
        assert not row['overflows'], (row['file'], row['overflows'])
        svg = ET.parse(OUT / row['file']).getroot()
        paths = [dict(id=e.get('data-edge-id'), d=e.get('d')) for e in svg.iter() if e.get('data-edge-id')]
        assert row['paths'] == paths, ('browser paths', row['file'])
        dots = [dict(source=e.get('data-fanout-source'), port=e.get('data-source-port'),
                     edges=json.loads(e.get('data-fanout-edges')), x=e.get('cx'), y=e.get('cy'))
                for e in svg.iter() if e.get('class') == 'paper-fanout-junction']
        assert row['junctions'] == dots, ('browser junctions', row['file'])
        texts = [dict(id=e.get('data-node-id'), texts=[''.join(t.itertext()) for t in e if t.tag == SVG_TEXT])
                 for e in svg.iter() if e.get('data-node-id')]
        assert row['texts'] == texts and row['nodes'] == len(texts)
        assert row['node_texts'] == sum(len(t['texts']) for t in texts)
        assert sha(OUT / row['file']) == captures[row['file']]['svg_sha256']
    extraction = read(OUT / 'extraction.json')
    audit = read(OUT / 'extraction-audit.json')
    assert audit['passed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    assert sha(ROOT / 'semantic_adapter/analyzer.py') == audit['analyzer_sha256']
    assert len(audit['rows']) == len(extraction['rows']) == 9
    for row in audit['rows']:
        for key in ['before', 'current']:
            assert sha(ROOT / row[key]) == row[key + '_sha256']
        assert row['all_source_locations_and_operand_edges_preserved']
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
    source = read(OUT / 'source-expandability.json')
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert source['visible_nodes'] == 3371 and source['visible_edges'] == 3663
    assert sha(ROOT / source['input']) == source['input_sha256']
    ui = read(OUT / 'ui-StepPair.json')
    assert ui['ir'] == read(OUT / 'StepPair.json')
    assert sha(OUT / 'ui-StepPair.svg') == sha(OUT / 'ui-StepPair-reopened.svg')
    raw = ET.parse(OUT / 'ui-StepPair-source.svg').getroot()
    assert {e.get('data-id') for e in raw.iter() if e.get('data-id')} == {n['id'] for n in ui['ir']['nodes']}
    routes = [e for e in raw.iter() if e.get('data-edge-id')]
    assert {e.get('data-edge-id') for e in routes} == {e['id'] for e in ui['ir']['edges']}
    assert all(e.get('data-route-valid') == 'true' for e in routes)
    producers = ['tools/extract_cell_interfaces.py', 'tools/audit_cell_extraction.py', 'tools/audit_cell_interfaces.cjs',
                 'tools/check_cell_interfaces.py', 'tools/check_transform_configurations.py', 'tools/check_transform_operands.py',
                 'tools/check_transform_sequences.py', 'tools/check_title_passages.py', 'tools/audit_diagram_assignments.py',
                 'tools/build_cell_interfaces_review.py', 'tools/finalize_cell_interfaces.py', 'docs/cell-interfaces.md']
    artifacts = ['small-report.json', *[f'Transformer-panel-{i}-report.json' for i in range(3)],
                 'independent-checks.json', 'browser-report.json', 'source-expandability.json', 'extraction.json', 'extraction-audit.json',
                 'review.html', 'mixed-review.html', 'all-review.html', 'review.png', 'mixed-review.png', 'ui-source.png',
                 'ui-StepPair.json', 'ui-StepPair.svg', 'ui-StepPair-reopened.svg', 'ui-StepPair-source.svg',
                 *captures.keys(), *[r['entry'] + '.json' for r in extraction['rows']],
                 *[r['entry'] + '-source-before.json' for r in extraction['rows']]]
    result = dict(schema='cell-interfaces-completion/1', baseline='e098d10', passed=True, goal_complete=False,
                  tests=dict(groups=86, count=957, report=str(testpath.relative_to(ROOT)), sha256=sha(testpath),
                             logs_sha256={r['log']: sha(testpath.parent / r['log']) for r in tests['commands']}),
                  independent_svg_count=54,
                  browser=dict(svg_count=54, nodes=sum(r['nodes'] for r in browser['rows']),
                               node_texts=sum(r['node_texts'] for r in browser['rows']),
                               port_labels=sum(r['port_labels'] for r in browser['rows']), overflows=0),
                  ui=dict(imported=True, saved_document_reopened=True, reopened_svg_identical=True,
                          source_nodes=len(ui['ir']['nodes']), source_edges=len(routes)),
                  producer_sha256={f: sha(ROOT / f) for f in producers}, artifact_sha256={f: sha(OUT / f) for f in artifacts},
                  limitations=['Architecture convergence remains incomplete.',
                               'Registered single-step interfaces do not prove time recurrence or internal gates.',
                               'State channels cost width/wire; StepPair crossings 0 to 2 and StateWorkshop 4 to 5.',
                               'Transformer three panels are byte-identical; no Transformer-specialized improvement is claimed.',
                               'Raw bindings and quality-qualified assignments are reported separately.',
                               'Source projection preserves 3371 nodes/3663 edges; full-source SVG routing/performance unverified.',
                               'Real UI exercise covers default overview, save/reopen and source expansion; not the disabled role selector.'])
    (OUT / 'completion-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if not k.endswith('sha256')}, indent=2))

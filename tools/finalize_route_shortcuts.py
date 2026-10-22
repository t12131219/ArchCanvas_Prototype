"""Bind independent XML checks, actual browser DOM and regression evidence."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/route-shortcuts/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
SVG_TEXT = '{http://www.w3.org/2000/svg}text'


if __name__ == '__main__':
    checks = read(OUT / 'independent-checks.json')
    assert checks['passed'] and checks['svg_count'] == 120
    testpath = ROOT / 'verification/local-relations/current/test-report.json'
    tests = read(testpath)
    assert len(tests['counts']) == 85 and sum(tests['counts'].values()) == 945
    assert all(r['exit_code'] == 0 for r in tests['commands'])
    for report in [tests, checks]:
        for file, digest in report['implementation_sha256'].items():
            assert sha(ROOT / file) == digest, ('stale producer', file)
    reports = [read(OUT / 'small-report.json')] + [
        read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    captures = {r['svg']: r for report in reports for row in report['rows'] for r in row['results']}
    assert len(captures) == 120
    before, current = reports[1]['rows'][0]['results']
    assert before['svg_sha256'] == current['svg_sha256']
    browser = read(OUT / 'browser-report.json')
    assert browser['url'].endswith('/verification/route-shortcuts/current/all-review.html')
    assert len(browser['rows']) == 120
    assert {r['file'] for r in browser['rows']} == captures.keys()
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
        assert row['texts'] == texts, ('browser node text', row['file'])
        assert row['nodes'] == len(texts)
        assert row['node_texts'] == sum(len(t['texts']) for t in texts)
        assert sha(OUT / row['file']) == captures[row['file']]['svg_sha256']
    source = read(OUT / 'source-expandability.json')
    assert source['all_canonical_ids_visible'] and source['canonical_ir_unchanged']
    assert source['visible_nodes'] == 3371 and source['visible_edges'] == 3663
    assert sha(ROOT / source['input']) == source['input_sha256']
    extraction = read(OUT / 'extraction.json')
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
    producers = ['tools/extract_route_shortcuts.py', 'tools/audit_route_shortcuts.cjs', 'tools/check_route_shortcuts.py', 'tools/audit_unconsumed_dimension_proofs.py',
                 'tools/check_transform_sequences.py',
                 'tools/check_transform_configurations.py', 'tools/check_transform_operands.py', 'tools/check_title_passages.py',
                 'tools/audit_adaptive_frontier.py',
                 'tools/audit_diagram_assignments.py', 'tools/build_route_shortcuts_review.py',
                 'tools/audit_source_expandability.cjs', 'tools/finalize_route_shortcuts.py',
                 'docs/route-shortcuts.md']
    artifacts = ['small-report.json', *[f'Transformer-panel-{i}-report.json' for i in range(3)],
                 'independent-checks.json', 'browser-report.json', 'source-expandability.json',
                 'review.html', 'transformer-review.html', 'all-review.html', 'review.png',
                 'transformer-review.png', 'dedicated-reference.svg', *captures.keys(),
                 'extraction.json', *[r['entry']+'.json' for r in extraction['rows']]]
    logs = {r['log']: sha(testpath.parent / r['log']) for r in tests['commands']}
    result = dict(schema='route-shortcuts-completion/1', baseline='b3eb8b1', passed=True, goal_complete=False,
                  tests=dict(groups=len(tests['counts']), count=sum(tests['counts'].values()),
                             report=str(testpath.relative_to(ROOT)), sha256=sha(testpath), logs_sha256=logs),
                  independent_svg_count=120,
                  browser=dict(svg_count=120, nodes=sum(r['nodes'] for r in browser['rows']),
                               node_texts=sum(r['node_texts'] for r in browser['rows']),
                               port_labels=sum(r['port_labels'] for r in browser['rows']), overflows=0,
                               tolerance_native_svg_px=1, measurement=browser['measurement']),
                  producer_sha256={f: sha(ROOT / f) for f in producers},
                  artifact_sha256={f: sha(OUT / f) for f in artifacts},
                  limitations=['Architecture convergence is incomplete; these are bounded local geometry improvements.',
                               'Transformer main panel is byte-identical to baseline; detail panels improve only 14 to 13 and 12 to 11 crossings.',
                               'No node, folding, port-side, physical-terminal, semantic identity, direct coverage, label or shared-junction change is permitted.',
                               'Input paths longer than 24 points and graphs over 128 edges are excluded. At most 12 crossed edges, 8192 generation attempts and 64 retained candidates per edge.',
                               'Four complete candidates per edge may be measured. Shortcuts must strictly reduce crossings and wire length without adding overlaps or contacts.',
                               'State/feedback/control paths, explicit channels and bundle paths retain their policies; unknown boundary identity and conditions remain intact.',
                               'Source projection preserves 3371 nodes/3663 edges; full-source SVG routing/performance unverified.',
                               'No new editor UI import/export exercise; saved rendering and expansion are covered by tests.'])
    (OUT / 'completion-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if not k.endswith('sha256') and k != 'tests'}, indent=2))

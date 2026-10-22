"""Bind independent XML checks, actual browser DOM and regression evidence."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/transform-operands/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
SVG_TEXT = '{http://www.w3.org/2000/svg}text'


if __name__ == '__main__':
    checks = read(OUT / 'independent-checks.json')
    assert checks['passed'] and checks['svg_count'] == 50
    testpath = ROOT / 'verification/local-relations/current/test-report.json'
    tests = read(testpath)
    assert len(tests['counts']) == 81 and sum(tests['counts'].values()) == 906
    assert all(r['exit_code'] == 0 for r in tests['commands'])
    for report in [tests, checks]:
        for file, digest in report['implementation_sha256'].items():
            assert sha(ROOT / file) == digest, ('stale producer', file)
    reports = [read(OUT / 'small-report.json')] + [
        read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    captures = {r['svg']: r for report in reports for row in report['rows'] for r in row['results']}
    assert len(captures) == 50
    browser = read(OUT / 'browser-report.json')
    assert browser['url'].endswith('/verification/transform-operands/current/all-review.html')
    assert len(browser['rows']) == 50
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
    producers = ['tools/extract_transform_operands.py', 'tools/audit_transform_operands.cjs', 'tools/check_transform_operands.py',
                 'tools/check_transform_configurations.py', 'tools/check_title_passages.py',
                 'tools/audit_adaptive_frontier.py', 'tools/check_shared_fanouts.py',
                 'tools/audit_diagram_assignments.py', 'tools/build_transform_operands_review.py',
                 'tools/audit_source_expandability.cjs', 'tools/finalize_transform_operands.py',
                 'docs/transform-operands.md']
    artifacts = ['small-report.json', *[f'Transformer-panel-{i}-report.json' for i in range(3)],
                 'independent-checks.json', 'browser-report.json', 'source-expandability.json',
                 'review.html', 'transformer-review.html', 'all-review.html', 'review.png',
                 'transformer-review.png', 'dedicated-reference.svg', *captures.keys(),
                 'extraction.json', *[r['entry']+'.json' for r in extraction['rows']]]
    logs = {r['log']: sha(testpath.parent / r['log']) for r in tests['commands']}
    result = dict(schema='transform-operands-completion/1', baseline='68d4a32', passed=True, goal_complete=False,
                  tests=dict(groups=len(tests['counts']), count=sum(tests['counts'].values()),
                             report=str(testpath.relative_to(ROOT)), sha256=sha(testpath), logs_sha256=logs),
                  independent_svg_count=50,
                  browser=dict(svg_count=50, nodes=sum(r['nodes'] for r in browser['rows']),
                               node_texts=sum(r['node_texts'] for r in browser['rows']),
                               port_labels=sum(r['port_labels'] for r in browser['rows']), overflows=0,
                               tolerance_native_svg_px=1, measurement=browser['measurement']),
                  producer_sha256={f: sha(ROOT / f) for f in producers},
                  artifact_sha256={f: sha(OUT / f) for f in artifacts},
                  limitations=['Architecture convergence is incomplete.',
                               'Argument notes preserve source spellings and exact bindings, not evaluated dimensions, rank or valid shape.',
                               'Only supported reference, attribute, integer-selector and bounded arithmetic expressions are annotated.',
                               'Some figures grow; one detail retains an additional crossing. See independent checks for measured costs.',
                               'Ten equal-width soft preferences are deferred while common rows and exact endpoints survive; one detail switches an optional side lane to an ordinary top entry.',
                               'Source projection preserves 3371 nodes/3663 edges; full-source SVG routing/performance unverified.',
                               'No new editor UI import/export exercise; saved rendering and folding are covered by tests.'])
    (OUT / 'completion-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if not k.endswith('sha256') and k != 'tests'}, indent=2))

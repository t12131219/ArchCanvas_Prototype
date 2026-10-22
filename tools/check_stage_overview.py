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

OUT = ROOT / 'verification/stage-overview/current'
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
                q = capture['quality']
                assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
                checked.append((doc, raw, qualified))
            (a, ga, qa), (b, gb, qb) = checked
            if row['comparison'] == 'same-state-regression':
                assert a == b and ga == gb and qa == qb
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            elif row['comparison'] == 'coarse-vs-manual-detail':
                assert len(b['layout']['nodes']) > len(a['layout']['nodes'])
                assert ga <= gb
                opened = {r['node'] for r in a['publication']['contract_stages']['rows'] if r['status'] == 'summary'}
                assert opened and all(r['detailed_operations_exposed'] for r in b['publication']['contract_stages']['rows'] if r['node'] in opened)
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
                dimensions_before=[before['native_width_px'], before['native_height_px']],
                dimensions_current=[after['native_width_px'], after['native_height_px']],
                crossings_before=before['line_geometry']['crossings'], crossings_current=after['line_geometry']['crossings'],
                wire_before=before['wire_length'], wire_current=after['wire_length']))
    result = dict(passed=True, svg_count=2*len(rows), implementation_sha256=hashes, rows=rows, goal_complete=False)
    assert result['svg_count'] == 38
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

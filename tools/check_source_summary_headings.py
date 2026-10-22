"""Independently audit actual source names, SVG text, bindings and geometry."""
import ast
import copy
import json
import re
import xml.etree.ElementTree as ET
from check_stage_sample_frames import ROOT, read, sha
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
import audit_local_svg as summaries

OUT = ROOT / 'verification/source-summary-headings/current'


def reports():
    return [read(OUT / name) for name in ['small-report.json', 'Transformer-F0-report.json',
        *[f'Transformer-F1-{i}-report.json' for i in range(3)]]]


def fulfilled(d, key):
    return {r['goal'] for r in d[key] if r['status'] == 'fulfilled'}


def structural(d):
    p = copy.deepcopy(d['architecture'])
    for n in p['nodes']:
        for k in ['paper', 'local_pipeline_source_heading', 'local_pipeline_source_label']:
            n.pop(k, None)
    return p


def check_heading(doc, p, node):
    canonical = next(n for n in doc['ir']['nodes'] if n['id'] == p['id'])
    heading = p['source_heading']
    assert canonical['semantic_type'] in ['source-module', 'source-function']
    assert heading == dict(schema='source-summary-heading/1', node=p['id'],
        label=canonical['label'], result_title=p['read_binding_rows']['title'])
    # Check the actual physical source call independently of display labels.
    files = {s['file'] for n in doc['ir']['nodes'] for s in n.get('source', [])}
    selection = canonical.get('module_binding', {}).get('selection')
    assert selection and selection.removeprefix('self.') == canonical['label']
    assert any(ast.unparse(c.func) == selection for file in files for c in ast.walk(ast.parse(open(file).read())) if isinstance(c, ast.Call))
    text = ''.join(''.join(e.itertext()) for e in node if e.tag.endswith('text'))
    norm = lambda s: re.sub(r'\s', '', s)
    assert norm(''.join(p['lines'])) == norm('Source: ' + canonical['label'])
    assert norm('Source: ' + canonical['label']) in norm(text)
    assert norm(heading['result_title'] + ' · Dependency DAG') in norm(text)
    for row in p['read_binding_rows']['rows']:
        assert norm(row['text']) in norm(text)


if __name__ == '__main__':
    captures = reports()
    hashes = captures[0]['implementation_sha256']
    for file, digest in hashes.items():
        assert sha(ROOT / file) == digest, ('stale implementation', file)
    content.OUT = operands.OUT = OUT
    extraction = read(OUT / 'extraction.json')
    assert sha(ROOT / extraction['source']) == extraction['source_sha256']
    assert extraction['runtime_executed'] is False
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
    rows = []
    for report in captures:
        assert report['implementation_sha256'] == hashes
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            docs = []
            for capture in row['results']:
                doc, direct, _ = content.inspect(capture, row['name'] + '-' + capture['suffix'], sequences.check_operation, require_quality=False)
                assert doc['ir'] == read(ROOT / row['input'])
                assert capture['quality'] == doc['diagnostics']['publication']
                operands.check_svg_bindings(capture, doc)
                svg = ET.parse(OUT / capture['svg']).getroot()
                nodes = {n.get('data-node-id'): n for n in svg.iter() if n.get('data-node-id')}
                summaries.audit_pipeline_summaries(doc, {'local_pipelines': doc['publication'].get('local_pipelines')}, nodes)
                summaries.audit_contract_stages(doc, {'contract_stages': doc['publication'].get('contract_stages')}, nodes)
                for p in doc['layout']['nodes']:
                    if p.get('source_heading'):
                        check_heading(doc, p, nodes[p['id']])
                q = capture['quality']
                assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
                docs.append(doc)
            a, b = docs
            decision = b['diagnostics']['routing'].get('source_summary_headings')
            if row['comparison'] == 'coarse-vs-operations':
                assert len(b['layout']['nodes']) > len(a['layout']['nodes'])
                assert not any(p.get('source_heading') for p in b['layout']['nodes'])
            else:
                assert structural(a) == structural(b), row['name']
                for key in ['publication', 'expression_goals', 'summary_goals']:
                    assert a[key] == b[key], (row['name'], key)
                for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
                    assert a['layout'].get(key) == b['layout'].get(key)
                assert {p['id'] for p in a['layout']['nodes']} == {p['id'] for p in b['layout']['nodes']}
                descriptor = lambda d: [{k:v for k,v in e.items() if k != 'route'} for e in d['layout']['edges']]
                assert descriptor(a) == descriptor(b)
                for key in ['expression_coverage', 'summary_coverage']:
                    assert fulfilled(a, key) <= fulfilled(b, key)
                applied = lambda d: {r['id'] for r in d['layout']['constraint_receipts'] if r['status'] == 'applied'}
                assert applied(a) <= applied(b)
                old, new = [c['quality'] for c in row['results']]
                for key in ['native_height_px', 'native_width_px', 'wire_length']:
                    assert new[key] <= old[key]
                assert new['line_geometry']['crossings'] <= old['line_geometry']['crossings']
                assert len(new['line_geometry']['unrelated_contacts']) <= len(old['line_geometry']['unrelated_contacts'])
                assert new['min_canvas_font_px'] >= old['min_canvas_font_px']
            if decision and decision['accepted']:
                assert all(decision[k] for k in ['facts_preserved','goals_preserved','applied_relations_preserved','geometry_preserved'])
                assert decision['max_trials'] == 1
                assert set(decision['nodes']) == {p['id'] for p in b['layout']['nodes'] if p.get('source_heading')}
            if row['name'] == 'LongAlias':
                assert decision and not decision['accepted'] and not decision['geometry_preserved']
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            if row['name'] in ['ProtectedInside','UnnamedWork-roles'] or row['name'].startswith('Transformer-F1-'):
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'], accepted=decision['accepted'] if decision else None,
                nodes=[len(d['layout']['nodes']) for d in docs],headings=[sum(bool(p.get('source_heading')) for p in d['layout']['nodes']) for d in docs],
                summaries=[len(fulfilled(d,'summary_coverage')) for d in docs],
                dimensions=[[c['quality']['native_width_px'],c['quality']['native_height_px']] for c in row['results']]))
    assert len(rows) == 14
    result = dict(schema='source-summary-heading-independent-checks/1', implementation_sha256=hashes, rows=rows,
        svg_checked=28, source_runtime_executed=False, goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result['rows']))

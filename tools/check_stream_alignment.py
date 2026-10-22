"""Independent checks of actual SVGs, source membership and stream geometry."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
import check_transform_operands as operands
import check_title_passages as passages
import audit_local_svg as summaries
from check_normal_returns import normal_returns
from check_composition_suite import drawing_document

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/stream-alignment/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    suite = read(OUT / 'suite-report.json')
    for f, h in suite['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale producer', f)
    from semantic_adapter.analyzer import analyze
    source = ROOT / 'tests/semantic_fixtures/stream_alignment.py'
    assert json.loads(json.dumps(analyze(source, 'SensorFusion'))) == read(OUT / 'SensorFusion.json')
    geometry.OUT = stages.OUT = operands.OUT = OUT
    results = []
    for row in suite['rows']:
        assert sha(OUT / row['svg']) == row['svg_sha256']
        assert sha(OUT / row['document']) == row['document_sha256']
        assert sha(OUT / row['before_svg']) == row['before_sha256']
        doc = read(OUT / row['document'])
        assert doc['ir'] == read(ROOT / row['input'])
        measured = stages.check({**row, 'role_path_stages': doc['publication'].get('role_path_stages')},
            compare_expression=False, require_quality=False, allow_label_notes=True, allow_attached_return_uses=True)
        geometry.inspect(row)
        operands.check_svg_bindings(row, doc)
        normal_returns(doc)
        svg = ET.parse(OUT / row['svg']).getroot()
        nodes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
        summaries.audit_pipeline_summaries(doc, {'local_pipelines': doc['publication'].get('local_pipelines')}, nodes, allow_role_path_parents=True)
        summaries.audit_contract_stages(doc, {'contract_stages': doc['publication'].get('contract_stages')}, nodes)
        titles, bodies = passages.passages(drawing_document(doc), svg)
        assert not bodies, ('body intrusion', row['name'], bodies)
        assert not row['quality']['issues'], (row['name'], row['quality']['issues'])
        if row['name'].startswith('SensorFusion-'):
            pos = {n['id']: n for n in doc['layout']['nodes']}
            labels = {n['label']: n['id'] for n in doc['architecture']['nodes'] if n['id'] in pos}
            a, b = [pos[labels[k]] for k in ['self.image_core', 'self.vector_core']]
            assert a['y'] == b['y'] if row['state']['paperDirection'] == 'up' else a['y'] + a['h'] == b['y'] + b['h']
            assert pos[labels['image']]['y'] == pos[labels['vector']]['y']
            assert row['stream_alignments']
        results.append(dict(name=row['name'], **measured, title_passages=len(titles), alignments=len(row['stream_alignments'])))
    assert (OUT / 'Transformer-F0.svg').read_bytes() == (OUT / 'Transformer-returned.svg').read_bytes()
    native = read(OUT / 'native-text-report.json')
    assert len(native) == len(results)
    for row, actual in zip(suite['rows'], native):
        assert row['name'] == actual['name'] and row['nodes'] == actual['nodes']
        assert actual['texts'] and not actual['issues']
        assert actual['minWidth'] > 0 and actual['minTextHeight'] > 0
    ui = {}
    for name, panel in [('coarse', 'Transformer-F0'), ('detail', 'Transformer-F1'),
                        ('finer', 'Transformer-finer'), ('reopened', 'Transformer-finer'),
                        ('returned', 'Transformer-F0'), ('generic', 'SensorFusion-up')]:
        actual = OUT / ('ui-' + name + '.svg')
        assert actual.read_bytes() == (OUT / (panel + '.svg')).read_bytes(), ('UI differs', name)
        ui[name] = sha(actual)
    assert read(OUT / 'ui-finer.json')['ir'] == read(ROOT / suite['rows'][0]['input'])
    report = dict(schema='stream-alignment-independent/1', passed=True, goal_complete=False,
        panels=len(results), rows=results, source_sha256=sha(source), suite_sha256=sha(OUT / 'suite-report.json'),
        ui_svg_sha256=ui,
        native_text_sha256=sha(OUT / 'native-text-report.json'), auditor_sha256=sha(Path(__file__)))
    (OUT / 'independent-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(passed=True, panels=len(results))))


if __name__ == '__main__':
    main()

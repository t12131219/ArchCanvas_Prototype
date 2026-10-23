"""Independent facts, SVG geometry, column order and browser-export audit."""
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

import check_composition_suite as common
from check_semantic_generalization import features, partition

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/architecture-columns/current'
read, sha = common.read, common.sha


def main():
    suite = read(OUT / 'suite-report.json')
    for path, digest in suite['implementation_sha256'].items():
        assert sha(ROOT / path) == digest, ('stale producer', path)
        if path.startswith('semantic_studio/'):
            old = subprocess.check_output(['git', 'show', suite['baseline_commit'] + ':' + path], cwd=ROOT)
            frozen = Path('/tmp/archcanvas-columns-ade6cde') / path
            assert frozen.read_bytes() == old, ('incorrect frozen implementation', path)
    from semantic_adapter import analyze
    for name in ['SerialModules', 'ParallelModules']:
        assert json.loads(json.dumps(analyze(ROOT / 'tests/semantic_fixtures/module_columns.py', name))) == read(OUT / (name + '.json'))
    common.geometry.OUT = common.stages.OUT = common.operands.OUT = OUT
    checked, inputs = [], {}
    for r in suite['rows']:
        for field, key in [('svg', 'svg_sha256'), ('document', 'document_sha256'),
                           ('before_svg', 'before_sha256'), ('before_document', 'before_document_sha256')]:
            assert sha(OUT / r[field]) == r[key]
        assert sha(ROOT / r['input']) == r['input_sha256']
        doc, before = read(OUT / r['document']), read(OUT / r['before_document'])
        assert doc['ir'] == before['ir'] == read(ROOT / r['input'])
        assert doc['architecture'] == before['architecture']
        for key, source in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
            a, b = doc['layout'][key], before['layout'][key]
            assert partition(a) == partition(b)
            ids = [id for bucket in a.values() for id in bucket]
            assert len(ids) == len(set(ids)) and set(ids) == {x['id'] for x in doc['ir'][source]}
        bindings = lambda d: {e['id']: {k: v for k, v in e.items() if k != 'route'} for e in d['layout']['edges']}
        assert bindings(doc) == bindings(before)
        positions = {p['id']: p for p in doc['layout']['nodes']}
        assert positions.keys() == {p['id'] for p in before['layout']['nodes']}
        for key in ['expression_coverage', 'summary_coverage']:
            complete = lambda d: {x['goal'] for x in d[key] if x['status'] == 'fulfilled'}
            assert complete(before) <= complete(doc), ('lost goal', r['name'], key, complete(before) - complete(doc))
        common.stages.check({**r, 'role_path_stages': doc['publication'].get('role_path_stages')},
            compare_expression=False, require_quality=False, allow_label_notes=True, allow_attached_return_uses=True)
        common.geometry.inspect(r); common.operands.check_svg_bindings(r, doc); common.normal_returns(doc)
        svg = ET.parse(OUT / r['svg']).getroot()
        nodes = {n.get('data-node-id'): n for n in svg.iter() if n.get('data-node-id')}
        common.summaries.audit_pipeline_summaries(doc, {'local_pipelines': doc['publication'].get('local_pipelines')}, nodes, allow_role_path_parents=True)
        common.summaries.audit_contract_stages(doc, {'contract_stages': doc['publication'].get('contract_stages')}, nodes)
        drawing = common.drawing_document(doc)
        titles, bodies = common.passages.passages(drawing, svg)
        assert not bodies, ('body intrusion', r['name'], bodies)
        assert not r['quality']['issues']
        assert r['quality']['line_geometry']['crossings'] <= r['before_quality']['line_geometry']['crossings'], ('added crossings', r['name'])
        parents = {n['id']: n.get('parent') for n in drawing['architecture']['nodes']}
        for column in r['columns']:
            siblings = {id for id, owner in parents.items() if owner == column['owner'] and id in positions}
            def branch(id):
                while id and id not in siblings:
                    id = parents.get(id)
                return id
            flow = {id: set() for id in siblings}
            for e in doc['layout']['edges']:
                members = e.get('bundle_members', [e])
                if e.get('layout_after') or e.get('design_route', {}).get('kind') not in [None, 'bypass'] or any(
                    m['kind'] not in ['data', 'alias', 'interface-binding'] or m.get('condition') or m.get('iteration') for m in members):
                    continue
                a, b = branch(e['source']), branch(e['target'])
                if a and b and a != b:
                    flow[a].add(b)
            def reaches(a, b):
                todo, seen = [a], set()
                while todo:
                    at = todo.pop()
                    if at == b:
                        return True
                    if at not in seen:
                        seen.add(at); todo.extend(flow.get(at, []))
                return False
            for i, a in enumerate(column['members']):
                assert positions[a]['expanded'] and positions[a]['w'] == column['width']
                for b in column['members'][i + 1:]:
                    assert reaches(a, b) != reaches(b, a), ('unordered module column', r['name'], a, b)
            assert all(c['after']['w'] > c['before']['w'] for c in column['changed'])
        checked.append(dict(name=r['name'], changed=r['changed'], columns=len(r['columns']),
            title_passages=len(titles), crossings=[r['before_quality']['line_geometry']['crossings'], r['quality']['line_geometry']['crossings']]))
        inputs.setdefault(r['input'], dict(features=features(doc['ir'])))
    report = dict(schema='architecture-columns-independent/1', passed=True, goal_complete=False,
        panels=len(checked), inputs=len(inputs), rows=checked, feature_coverage=inputs,
        native_text_verified=False, actual_ui_verified=False, suite_sha256=sha(OUT / 'suite-report.json'), auditor_sha256=sha(Path(__file__)),
        limits=['Finite cross-family coverage does not prove every future model has an ideal layout.', 'No giant fully expanded SVG performance claim.'])
    if '--geometry-only' not in sys.argv:
        native = read(OUT / 'native-text-report.json')
        assert len(native) == len(checked)
        html = (OUT / 'native-audit.html').read_text()
        for r, measurement in zip(suite['rows'], native):
            assert r['name'] == measurement['name'] and r['nodes'] == measurement['nodes']
            assert measurement['texts'] and not measurement['issues'] and measurement['minWidth'] > 0 and measurement['minTextHeight'] > 0
            assert (OUT / r['svg']).read_text() in html
        ui_hashes = {}
        for state, case in [('coarse', 'Transformer-F0'), ('detail', 'Transformer-F1'), ('finer', 'Transformer-finer'), ('reopened', 'Transformer-finer'), ('returned', 'Transformer-F0')]:
            assert (OUT / ('ui-'+state+'.svg')).read_bytes() == (OUT / (case+'.svg')).read_bytes(), ('UI differs', state)
            ui_hashes[state] = sha(OUT / ('ui-'+state+'.svg'))
        saved = read(OUT / 'ui-finer.json')
        assert saved['ir'] == read(ROOT / suite['rows'][0]['input'])
        # Import initializes the root open list and empty manual offsets.
        # Check this exact documented normalization, not a loose subset.
        imported = dict(open=[n['id'] for n in saved['ir']['nodes'] if n.get('parent') is None], offsets={}, **suite['rows'][0]['state'])
        assert saved['state']['paperFrontierReturn'] == imported
        for state, case in [('detail', 'SerialModules-F1'), ('returned', 'SerialModules-F0')]:
            assert (OUT / ('ui-generic-'+state+'.svg')).read_bytes() == (OUT / (case+'.svg')).read_bytes()
        report.update(native_text_verified=True, actual_ui_verified=True, native_sha256=sha(OUT / 'native-text-report.json'),
            ui_svg_sha256=ui_hashes, saved_document_sha256=sha(OUT / 'ui-finer.json'))
    (OUT / ('geometry-report.json' if '--geometry-only' in sys.argv else 'independent-report.json')).write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({k: report[k] for k in ['passed', 'panels', 'inputs', 'native_text_verified', 'actual_ui_verified']}))


if __name__ == '__main__':
    main()

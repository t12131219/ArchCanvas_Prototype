"""Audit composition captures against canonical facts and physical SVG paths."""
import copy
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
import check_title_passages as passages
import check_transform_operands as operands
import audit_local_svg as summaries
from check_normal_returns import normal_returns

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/composition-rounds/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def drawing_document(doc):
    """Validate docking first; create a separate drawing ancestry for obstacles."""
    drawing = copy.deepcopy(doc)
    source = {n['id']: n for n in doc['architecture']['nodes']}
    planned = {n['id']: n for n in drawing['architecture']['nodes']}
    visible = {n['id'] for n in doc['layout']['nodes']}
    attached = {r['node'] for r in doc['layout'].get('frame_ownership', [])}
    # The compositor lifts drawing children past frames absent from this cut.
    for n in planned.values():
        if n['id'] not in visible:
            continue
        parent = n.get('parent')
        while parent and parent not in visible:
            parent = source[parent].get('parent')
        n['parent'] = parent

    def ancestors(node):
        result = set()
        while node:
            assert node not in result
            result.add(node)
            node = planned[node].get('parent')
        return result

    docks = doc['publication']['composition']['input_docks']
    assert len({r['node'] for r in docks}) == len(docks)
    for r in docks:
        node, owner = r['node'], r['drawing_parent']
        assert planned[node].get('parent') == r['source_parent']
        assert node in visible and owner in visible and owner not in attached
        assert r['source_parent'] in ancestors(owner)
        assert source[node]['kind'] == 'interface' and source[node]['role'] == 'input'
        assert not any(e['target'] == node for e in doc['layout']['edges'])
        uses = [e for e in doc['layout']['edges'] if e['source'] == node]
        assert r['edges'] == [dict(edge=e['id'], target=e['target'],
            source_port=e.get('source_port'), target_port=e.get('target_port')) for e in uses]
        assert uses and all(owner in ancestors(e['target']) for e in uses)
        for e in uses:
            assert all(m['kind'] in ['data', 'alias', 'interface-binding'] and not m.get('condition')
                and not m.get('iteration') for m in e.get('bundle_members', [e]))
        planned[node]['parent'] = owner
    return drawing


def main():
    suite = read(OUT / 'suite-report.json')
    for f, digest in suite['implementation_sha256'].items():
        assert sha(ROOT / f) == digest, ('stale implementation', f)
    geometry.OUT = stages.OUT = operands.OUT = OUT
    extraction = read(OUT / 'generic-extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    from semantic_adapter.analyzer import analyze
    for r in extraction['rows']:
        assert sha(ROOT / r['input']) == r['sha256']
        assert json.loads(json.dumps(analyze(ROOT / extraction['source'], r['name']))) == read(ROOT / r['input'])
    results = []
    for r in suite['rows']:
        doc = read(OUT / r['document'])
        svg = ET.parse(OUT / r['svg']).getroot()
        measured = stages.check({**r, 'role_path_stages': doc['publication'].get('role_path_stages')},
            compare_expression=False, require_quality=False, allow_label_notes=True,
            allow_attached_return_uses=True)
        geometry.inspect(r)
        operands.check_svg_bindings(r, doc)
        normal_returns(doc)
        nodes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
        summaries.audit_pipeline_summaries(doc,
            {'local_pipelines': doc['publication'].get('local_pipelines')}, nodes,
            allow_role_path_parents=True)
        summaries.audit_contract_stages(doc,
            {'contract_stages': doc['publication'].get('contract_stages')}, nodes)
        titles, bodies = passages.passages(drawing_document(doc), svg)
        assert not bodies, ('body intrusion', r['name'], bodies)
        composition = doc['publication']['composition']
        if composition.get('status') == 'fallback':
            assert not r['quality']['issues'] and composition['rejected_quality']['issues']
            assert not any(composition[k] for k in ['records', 'input_docks', 'facing', 'followers'])
        for n in doc['architecture']['nodes']:
            for op in (n.get('local_pipeline') or {}).get('transform_configurations', []):
                operands.check_operation(doc['ir'], op)
        results.append(dict(name=r['name'], **measured,
            title_passages=len(titles), issues=r['quality']['issues'],
            composition_status=composition.get('status', 'composed'),
            rejected_quality=composition.get('rejected_quality'),
            unplaced_port_labels=r['quality']['unplaced_port_labels']))
    assert (OUT / 'Transformer-F0.svg').read_bytes() == (OUT / 'Transformer-returned.svg').read_bytes()
    ui = {}
    for a, b in [('coarse', 'Transformer-F0'), ('detail', 'Transformer-F1'),
                 ('finer', 'Transformer-finer'), ('reopened', 'Transformer-finer'), ('returned', 'Transformer-F0')]:
        assert (OUT / ('ui-' + a + '.svg')).read_bytes() == (OUT / (b + '.svg')).read_bytes(), ('UI differs', a)
        ui[a] = sha(OUT / ('ui-' + a + '.svg'))
    for f in ['ui-fine.json', 'ui-finer.json']:
        assert read(OUT / f)['ir'] == read(ROOT / suite['rows'][0]['input'])
    for a, b in [('detail', 'F1'), ('returned', 'F0')]:
        assert (OUT / ('ui-generic-' + a + '.svg')).read_bytes() == (OUT / ('ReadWorkshop-' + b + '.svg')).read_bytes()
    assert (OUT / 'ui-gate.svg').read_bytes() == (OUT / 'StateWorkshop-F0.svg').read_bytes()
    native = read(OUT / 'native-text-report.json')
    assert len(native) == len(results)
    for r, measurement in zip(suite['rows'], native):
        assert r['name'] == measurement['name'] and r['nodes'] == measurement['nodes']
        assert measurement['texts'] and not measurement['issues']
        assert measurement['minWidth'] > 0 and measurement['minTextHeight'] > 0
        assert (OUT / r['svg']).read_text() in (OUT / 'native-audit.html').read_text()
    report = dict(schema='architecture-composition-independent/1', passed=True, goal_complete=False,
        panels=len(results), rows=results, ui_svg_sha256=ui,
        native_text_sha256=sha(OUT / 'native-text-report.json'),
        native_html_sha256=sha(OUT / 'native-audit.html'),
        ui_generic_sha256={f: sha(OUT / f) for f in ['ui-generic-detail.svg', 'ui-generic-returned.svg', 'ui-gate.svg']},
        unresolved_quality_panels=[r['name'] for r in results if r['issues']],
        scope='Canonical IR and complete accounting partitions, role path source membership, ports, physical SVG bindings, orthogonal paths, crossings, contacts, overlaps, drawing input ancestry, concrete body obstacles and exact UI roundtrip. Title passages are permitted. Full 3371-node SVG performance is not tested.',
        suite_sha256=sha(OUT / 'suite-report.json'), auditor_sha256=sha(Path(__file__)))
    (OUT / 'independent-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['passed', 'panels', 'unresolved_quality_panels']}))


if __name__ == '__main__':
    main()

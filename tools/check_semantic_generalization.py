"""Audit cross-family facts and physical SVGs independently of the renderer."""
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

import check_composition_suite as common

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/semantic-generalization/current'
read, sha = common.read, common.sha


def partition(buckets):
    return {key: sorted(ids) for key, ids in buckets.items()}


def features(ir):
    return sorted({*('kind:' + n['kind'] for n in ir['nodes']),
        *('semantic:' + n['semantic_type'] for n in ir['nodes'] if n.get('semantic_type')),
        *('framework:' + n['framework_type'] for n in ir['nodes'] if n.get('framework_type')),
        *('edge:' + e['kind'] for e in ir['edges']),
        *('sharing:' + n['repeat_contract']['parameter_sharing'] for n in ir['nodes'] if n.get('repeat_contract')),
        *('guard:' + key for key in ['condition', 'mutable', 'identity_display', 'observed_calls']
          if any(n.get(key) for n in ir['nodes']))})


def main():
    suite = read(OUT / 'suite-report.json')
    for f, digest in suite['implementation_sha256'].items():
        assert sha(ROOT / f) == digest, ('stale implementation', f)
    prior = ROOT / 'verification/architecture-trunks/current/suite-report.json'
    for f, digest in read(prior)['implementation_sha256'].items():
        assert sha(Path('/tmp/archcanvas-generalization-cf3c793') / f) == digest, ('incorrect frozen baseline', f)
    assert sha(OUT / 'extraction.json') == suite['extraction_sha256']
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed']
    from semantic_adapter import analyze
    inputs = {}
    for r in extraction['rows']:
        assert sha(ROOT / r['source']) == r['source_sha256'] and sha(ROOT / r['input']) == r['sha256']
        ir = read(ROOT / r['input'])
        assert json.loads(json.dumps(analyze(ROOT / r['source'], r['entry'], constructor=r['constructor']))) == ir
        inputs[r['input']] = dict(entry=r['entry'], features=features(ir))
    common.geometry.OUT = common.stages.OUT = common.operands.OUT = OUT
    checked = []
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
        assert {p['id'] for p in doc['layout']['nodes']} == {p['id'] for p in before['layout']['nodes']}
        common.stages.check({**r, 'role_path_stages': doc['publication'].get('role_path_stages')},
            compare_expression=False, require_quality=False, allow_label_notes=True, allow_attached_return_uses=True)
        common.geometry.inspect(r); common.operands.check_svg_bindings(r, doc); common.normal_returns(doc)
        svg = ET.parse(OUT / r['svg']).getroot()
        nodes = {n.get('data-node-id'): n for n in svg.iter() if n.get('data-node-id')}
        common.summaries.audit_pipeline_summaries(doc, {'local_pipelines': doc['publication'].get('local_pipelines')}, nodes,
            allow_role_path_parents=True)
        common.summaries.audit_contract_stages(doc, {'contract_stages': doc['publication'].get('contract_stages')}, nodes)
        titles, bodies = common.passages.passages(common.drawing_document(doc), svg)
        assert not bodies, ('body intrusion', r['name'], bodies)
        assert not r['quality']['issues']
        fallback = doc['publication']['composition'].get('status') == 'fallback'
        if fallback:
            assert doc['publication']['composition']['rejected_quality']['issues']
        else:
            assert (OUT / r['svg']).read_bytes() == (OUT / r['before_svg']).read_bytes()
        checked.append(dict(name=r['name'], changed=r['changed'], fallback=fallback, title_passages=len(titles),
            prior_issues=r['before_quality']['issues'], current_issues=r['quality']['issues']))
    for r in suite['retained']:
        assert r['byte_equal'] and sha(ROOT / r['svg']) == r['svg_sha256'] and sha(ROOT / r['input']) == r['input_sha256']
        inputs.setdefault(r['input'], dict(entry=read(ROOT / r['input']).get('title'), features=features(read(ROOT / r['input']))))
    coverage = {}
    for path, r in inputs.items():
        for feature in r['features']:
            coverage.setdefault(feature, []).append(path)
    report = dict(schema='semantic-generalization-independent/1', passed=True,
        new_inputs=len(extraction['rows']), new_panels=len(checked), retained_panels=len(suite['retained']),
        distinct_inputs=len(inputs), features=coverage, rows=checked, goal_complete=False,
        suite_sha256=sha(OUT / 'suite-report.json'), auditor_sha256=sha(Path(__file__)),
        baseline_implementation_verified=True, baseline_suite_sha256=sha(prior),
        native_text_verified=False, actual_ui_verified=False,
        limits=['Finite input coverage; does not prove every future program improves.',
                'All-source node availability checked in capture; no giant fully expanded SVG performance claim.'])
    if '--geometry-only' not in sys.argv:
        native = read(OUT / 'native-text-report.json')
        assert len(native) == len(checked)
        html = (OUT / 'native-audit.html').read_text()
        for r, measurement in zip(suite['rows'], native):
            assert r['name'] == measurement['name'] and measurement['nodes'] == r['nodes']
            assert measurement['texts'] and not measurement['issues'] and measurement['minWidth'] > 0
            assert (OUT / r['svg']).read_text() in html
        for state, case in [('coarse', 'StateStack-F0'), ('detail', 'StateStack-F1'), ('opened', 'StateStack-suffix-open')]:
            assert (OUT / ('ui-'+state+'.svg')).read_bytes() == (OUT / (case+'.svg')).read_bytes()
        report.update(native_text_verified=True, actual_ui_verified=True,
            native_sha256=sha(OUT / 'native-text-report.json'),
            ui_sha256={state: sha(OUT / ('ui-'+state+'.svg')) for state in ['coarse', 'detail', 'opened']})
    (OUT / ('geometry-report.json' if '--geometry-only' in sys.argv else 'independent-report.json')).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['passed', 'new_inputs', 'new_panels', 'retained_panels', 'distinct_inputs', 'native_text_verified', 'actual_ui_verified']}))


if __name__ == '__main__':
    main()

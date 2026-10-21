"""Independent XML, operand, source-contract and freshness verification."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments
from check_final_sample_frames import terminals
from check_title_passages import passages

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.contracts import Contracts
OUT = ROOT / 'verification/value-lineage/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def expressions(d):
    raw = {n['id']: n for n in d['ir']['nodes']}
    planned = {n['id']: n for n in d['architecture']['nodes']}
    engine = Contracts(d['ir'])
    def local_value(identity, slot):
        # Browser architecture preserves explicitly named interface/tuple
        # slots. Its local roles are intentionally less resolved than the
        # strict source recognizer's cross-helper operand binding.
        seen = set()
        while (identity, slot) not in seen:
            seen.add((identity, slot));n = raw[identity];edges = engine.incoming(identity)
            if n['kind'] not in ['interface', 'value-alias'] or n.get('slot') is not None or n.get('operator') or len(edges) != 1 or edges[0].get('condition'):
                break
            identity, slot = edges[0]['source'], edges[0]['source_port']
        return identity, slot
    count = 0
    for f in d['architecture']['findings']:
        if f['rule'] != 'operand-expression':
            continue
        r = f['roles'];output = raw[r['output']]
        assert output['operator'] == r['operator'] and len(r['operands']) == 2
        inputs = engine.incoming(output['id'])
        assert len(inputs) == 2 and not any(e.get('condition') for e in inputs)
        assert r['operands'] == [dict(node=local_value(e['source'], e['source_port'])[0],
            slot=local_value(e['source'], e['source_port'])[1], edge=e['id'], target_port=e['target_port']) for e in inputs]
        a, b = [engine.resolve(e['source'], e['source_port']) for e in inputs]
        # Independent source-contract search must not support a residual in
        # either direction. A re-labelled genuine residual is not the feature.
        assert engine.data_path(a, b) is None and engine.data_path(b, a) is None
        assert not any(c.get('kind') == 'bypass' and c.get('add') == output['id'] for c in d['architecture']['design_constraints'])
        if f['presentation'] == 'group':
            n = planned[f['id']];members = set(n['canonical_members'])
            assert output['id'] in members
            assert n['boundary_ports'] == [{k: v for k, v in dict(id=e['id'],
                direction='input' if e['target'] in members else 'output', source=e['source'], source_port=e['source_port'],
                target=e['target'], target_port=e['target_port'], evidence=e['evidence'],
                **({'condition': e['condition']} if e.get('condition') else {})).items()}
                for e in d['ir']['edges'] if (e['source'] in members) != (e['target'] in members)]
        count += 1
    return count


if __name__ == '__main__':
    reports = [read(OUT / (name + '-report.json')) for name in ['small', 'large']]
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for f, h in reports[0]['implementation_sha256'].items():
        assert sha(ROOT / f) == h, ('stale implementation', f)
    snap = reports[0]['snapshot']
    for f, h in snap['files'].items():
        assert hashlib.sha256(subprocess.check_output(['git', 'show', snap['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    geometry.OUT = OUT
    comparisons = [];example = None
    for report in reports:
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            docs, measured, direct = [], [], []
            for result in row['results']:
                for key in ['svg', 'document']:
                    assert sha(OUT / result[key]) == result[key + '_sha256']
                d = read(OUT / result['document']);svg = ET.parse(OUT / result['svg']).getroot()
                assert d['ir'] == read(ROOT / row['input'])
                assert d['layout']['frame_title_routing'] == 'pass-through'
                for kind, key in [('nodes', 'node_accounting'), ('edges', 'edge_accounting')]:
                    ids = sum(d['layout'][key].values(), [])
                    assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in d['ir'][kind]}
                m = geometry.inspect(dict(name=row['name'] + '-' + result['suffix'], **result))
                titles, bodies = passages(d, svg)
                assert not bodies, ('actual node/body intrusion', row['name'], bodies)
                terminals(d);expression_count = expressions(d)
                if row['name'] == 'ExemplarOnly' and result['suffix'] == 'current':
                    example = d
                goals = d['expression_goals']['goals']
                exposed = {g['id'] for g, ok in zip(goals, assignments(d['ir'], goals, {**d, 'quality': result['quality']}, svg)) if ok}
                direct.append(exposed);docs.append(d)
                generic = [f for f in d['architecture']['findings'] if f['rule'].startswith('residual') and not f.get('certificate')]
                measured.append(dict(nodes=len(m['nodes']), edges=len(m['paths']),
                    width=float(svg.get('width').removesuffix('px')), height=float(svg.get('height').removesuffix('px')), wire=result['quality']['wire_length'],
                    crossings=m['crossings'], contacts=m['contacts'], overlaps=m['overlaps'], title_passages=len(titles),
                    generic_residuals=len(generic), structural_expressions=expression_count,
                    direct_goals=len(exposed), issues=result['quality']['issues']))
            a, b = docs
            assert a['ir'] == b['ir'] and a['architecture']['edges'] == b['architecture']['edges']
            assert a['architecture']['semantic_contracts'] == b['architecture']['semantic_contracts']
            old, new = [{f['id']: f for f in d['architecture']['findings']} for d in docs]
            removed = [f for key, f in old.items() if key not in new]
            assert all(f['rule'].startswith('residual') and not f.get('certificate') for f in removed)
            # Genuine goals must remain exposed; semantic retractions cannot be
            # disguised as presentation gain. Report all removed goal IDs.
            goals = [{g['id'] for g in d['expression_goals']['goals']} for d in docs]
            assert (direct[0] & goals[1]) <= direct[1], ('common direct goal lost', row['name'], sorted((direct[0] & goals[1]) - direct[1]))
            comparisons.append(dict(name=row['name'], before=measured[0], current=measured[1],
                removed_findings=[dict(id=f['id'], rule=f['rule'], roles=f['roles']) for f in removed],
                removed_goals=sorted(goals[0] - goals[1]), lost_common_direct_goals=sorted((direct[0] & goals[1]) - direct[1])))
    certificate_rows = read(OUT / 'certificate-comparison.json')['rows']
    for r in certificate_rows:
        if r['entry'] in ['ConfigurationOnly', 'ExemplarOnly', 'AllocationOnly', 'ShapeOnly', 'ConditionalValues']:
            assert not any(rule.startswith('residual') for rule in r['current'])
        else:
            assert len([rule for rule in r['current'] if rule.startswith('residual')]) == 1
    assert example
    rejected = []
    for kind in ['operand-slot', 'operand-edge', 'boundary-cut', 'false-bypass']:
        bad = copy.deepcopy(example)
        f = next(f for f in bad['architecture']['findings'] if f['rule'] == 'operand-expression')
        if kind == 'operand-slot':
            f['roles']['operands'][0]['slot'] = 'invented'
        elif kind == 'operand-edge':
            f['roles']['operands'][0]['edge'] = 'invented'
        elif kind == 'boundary-cut':
            next(n for n in bad['architecture']['nodes'] if n['id'] == f['id'])['boundary_ports'].pop()
        else:
            bad['architecture']['design_constraints'].append(dict(kind='bypass', add=f['roles']['output']))
        try:
            expressions(bad)
        except AssertionError:
            rejected.append(kind)
        else:
            raise AssertionError(('corruption accepted', kind))
    result = dict(passed=True, goal_complete=False, panels=len(comparisons) * 2, comparisons=comparisons,
        negative_rejections=rejected,
        certificate_comparison=certificate_rows, auditor_sha256=sha(Path(__file__)),
        reports_sha256={name: sha(OUT / (name + '-report.json')) for name in ['small', 'large']})
    (OUT / 'independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(passed=True, panels=result['panels'], retracted_findings=sum(len(r['removed_findings']) for r in comparisons))))

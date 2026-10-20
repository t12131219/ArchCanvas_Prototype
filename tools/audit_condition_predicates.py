"""Reconstruct conditional capsule evidence from source facts and actual SVG."""
import hashlib
import json
from pathlib import Path
import audit_summary_coverage as summaries

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/condition-predicates/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
compact = lambda s: ''.join(s.split())


def main(report_path=None, output_path=None):
    report_path = report_path or OUT / 'render-report.json'
    output_path = output_path or OUT / 'predicate-report.json'
    report = read(report_path)
    summaries.OUT = OUT
    summaries.physical.OUT = OUT
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, file
    extraction = read(ROOT / report['extraction'])
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    for entry in extraction['rows']:
        assert summaries.analyze(ROOT / extraction['source'], entry['entry']) == read(ROOT / entry['input'])
    results = []
    for row in report['rows']:
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        checks = summaries.inspect(row)
        view = summaries.physical.inspect(row)
        doc, visible = view['document'], view['nodes']
        assert doc['ir'] == read(ROOT / row['input'])
        raw = {n['id']: n for n in doc['ir']['nodes']}
        plan = {n['id']: n for n in doc['architecture']['nodes']}
        edges = doc['ir']['edges']
        routes = {}
        for path in doc['layout']['edges']:
            if path['id'] not in view['paths'] or view['paths'][path['id']].get('data-route-valid') != 'true':
                continue
            for member in path.get('bundle_members', [path]):
                for id in {member['id'], *member.get('originals', [])}:
                    routes.setdefault(id, []).append((path, member))
        receipt = doc['publication'].get('condition_predicates')
        assert receipt == row.get('condition_predicates')
        counts = {'summary': 0, 'expanded': 0, 'folded': 0}
        for r in (receipt or {}).get('rows', []):
            group, test, control = plan[r['group']], raw[r['node']], raw[r['control']]
            assert group['condition_predicate'] == {k: r[k] for k in ['node', 'control', 'edge', 'source_port', 'target_port', 'label', 'scope']}
            assert test['operator'] == 'compare' and test['kind'] == 'compute'
            assert control['operator'] == 'if' and control['kind'] == 'control' and r['label'] == control['label']
            assert test['parent'] == control['parent'] and plan[r['node']]['parent'] == r['group']
            ins = [e for e in edges if e['target'] == control['id']]
            uses = [e for e in edges if e['source'] == test['id']]
            assert len(ins) == len(uses) == 1 and ins == uses
            edge = ins[0]
            assert edge['id'] == r['edge'] and edge['kind'] == 'control' and not edge.get('condition')
            assert (edge.get('source_port', 'out'), edge.get('target_port', 'in')) == (r['source_port'], r['target_port'])
            for n in [test, control]:
                assert not any(n.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls', 'runtime_evidence'])
                assert n.get('evidence_status') != 'runtime-only'
            incoming = [e for e in edges if e['target'] == test['id']]
            assert all(e['kind'] in ['data', 'alias', 'interface-binding'] and not e.get('condition') for e in incoming)
            bodies = [n for n in raw.values() if n.get('semantic_type') == 'conditional-region' and n.get('condition', {}).get('branch') == control['id']]
            assert {n['condition']['outcome'] for n in bodies} == {'true', 'false'}
            assert all(n['id'] in r['canonical_members'] for n in bodies)
            members = {group['id']}
            changed = True
            while changed:
                added = {n['id'] for n in plan.values() if n.get('parent') in members} - members
                members.update(added)
                changed = bool(added)
            inside = members & raw.keys()
            assert inside == set(r['canonical_members']) == set(group['canonical_members'])
            cuts = [e for e in edges if (e['source'] in inside) != (e['target'] in inside)]
            assert cuts == r['cuts'] == group['boundary_ports']
            assert not any(e['source'] in inside for e in incoming)
            assert group['boundary_selection']['canonical_members'] == r['canonical_members']
            finding = next(f for f in doc['architecture']['findings'] if f['id'] == group['finding'])
            assert finding['label'] == group['label']
            assert finding['members'] == finding['roles']['units'] == group['boundary_selection']['members']
            assert finding['roles']['boundary_selection'] == group['boundary_selection']
            if r['status'] == 'summary':
                assert r['group'] in visible and test['id'] not in visible and control['id'] not in visible
                text = ''.join(''.join(e.itertext()) for e in visible[r['group']] if e.tag.endswith('text'))
                assert compact('If ' + control['label']) in compact(text)
                for cut in cuts:
                    candidates = routes.get(cut['id'], [])
                    assert any((p['source'] == r['group'] if cut['source'] in inside else p['target'] == r['group']) and
                               m['canonical_target'] == cut['target'] and m['target_port'] == cut['target_port'] for p, m in candidates)
                assert doc['expression_coverage'][next(i for i, c in enumerate(doc['expression_coverage']) if c['goal'] == 'goal:node:' + test['id'])]['status'] != 'fulfilled'
            elif r['status'] == 'expanded':
                assert all(id in visible for id in [r['group'], test['id'], control['id']])
                assert edge['id'] in routes
            else:
                assert r['status'] == 'folded' and r['group'] not in visible
            counts[r['status']] += 1
        for bucket, key in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
            ids = [id for values in doc['layout'][bucket].values() for id in values]
            assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in doc['ir'][key]}
        results.append({'name': row['name'], 'coarse_checks': len(checks), 'condition_predicates': counts, 'passed': True})
    result = {'schema': 'condition-predicates-independent/1', 'render_report_sha256': sha(report_path),
              'auditor_sha256': sha(Path(__file__)), 'summary_auditor_sha256': sha(ROOT / 'tools/audit_summary_coverage.py'),
              'results': results, 'panels': len(results), 'passed': True, 'goal_complete': False,
              'scope': 'Exact exclusive source comparison, source-if branches, canonical membership/cuts, actual printed condition, cut paths and continued expanded control detail; not proof of arbitrary Python comparison behavior or branch reachability.'}
    output_path.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

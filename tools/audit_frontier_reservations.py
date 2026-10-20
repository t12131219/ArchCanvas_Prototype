"""Independent frontier, shared-result, physical-path and tradeoff audit."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/frontier-reservations/current'
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
import audit_adaptive_frontier as physical


def read(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def inspect(row):
    view = physical.inspect(row)  # Recompute geometry from actual XML paths.
    doc = view['document']
    relations = [r for r in doc['architecture']['relation_graph']['relations'] if r['type'] == 'source-uses']
    canonical = {n['id']: n for n in doc['ir']['nodes']}
    incoming = {}
    for e in doc['ir']['edges']:
        incoming.setdefault(e['target'], []).append(e)
    edges = {e['id']: e for e in doc['ir']['edges']}

    def resolve(id, port):
        seen = set()
        while id not in seen:
            seen.add(id)
            n, ins = canonical[id], incoming.get(id, [])
            if n['kind'] not in ['interface', 'value-alias'] or n.get('operator') or len(ins) != 1 or ins[0].get('condition'):
                break
            edge = ins[0]
            if edge['kind'] not in ['data', 'alias', 'interface-binding']:
                break
            outer = n['slot'] if n['kind'] == 'value-alias' and n.get('slot') is not None else edge.get('source_port', 'out')
            port = port if outer == 'out' else outer if port == 'out' else outer + '.' + port
            id = edge['source']
        return id, port

    actual = set()
    for route in doc['layout']['edges']:
        if view['paths'][route['id']].get('data-route-valid') == 'true':
            for member in route.get('bundle_members', [route]):
                actual.update([member['id'], *member.get('originals', [])])
    # Use one rubric for both versions. v1 counted the producer as a plain
    # computation; v2 requires all consumers and their exact shared-result paths.
    producers = {r['node'] for r in relations}
    view['fulfilled'] = {k: g for k, g in view['fulfilled'].items()
                         if not (g['kind'] == 'computation' and g['focus_node'] in producers)}
    claims = {r['goal']: r for r in doc['expression_coverage']}
    goals = {g['id']: g for g in doc['expression_goals']['goals']}
    checked = []
    for r in relations:
        identities = []
        for b in r['bindings']:
            edge = edges[b['edge']]
            assert (edge['source'], edge['target'], edge['source_port'], edge['target_port']) == (b['source'], b['target'], b['source_port'], b['target_port'])
            value = resolve(edge['source'], edge['source_port'])
            assert value == (b['producer'], b['producer_port']), (row['name'], b['edge'], value, b['producer'], b['producer_port'])
            identities.append(value)
        assert len(identities) >= 2 and len(set(identities)) == 1
        core = {r['node'], *(b['target'] for b in r['bindings'])}
        edge_ids = {b['edge'] for b in r['bindings']}
        id = 'goal:' + r['id']
        fulfilled = core <= view['nodes'].keys() and edge_ids <= actual
        if id in goals:
            assert set(goals[id]['core']) == core and set(goals[id]['edges']) == edge_ids
            assert (claims[id]['status'] == 'fulfilled') == fulfilled
        if fulfilled:
            view['fulfilled'][id] = {'id': id, 'kind': 'source-uses', 'priority': 2, 'focus_node': r['node']}
        checked.append({'relation': r['id'], 'fulfilled': fulfilled})
    view['source_use_checks'] = checked
    return view


def main():
    physical.OUT = OUT
    report = read(OUT / 'render-report.json')
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    snapshot = read(ROOT / report['checkpoint'])
    assert sha(ROOT / report['checkpoint']) == report['checkpoint_sha256']
    for file, digest in snapshot['files'].items():
        assert sha(ROOT / Path(report['checkpoint']).parent / 'implementation' / file) == digest
    for r in read(ROOT / report['extraction'])['rows']:
        assert sha(ROOT / r['source']) == r['source_sha256'] and sha(ROOT / r['input']) == r['sha256']
        assert analyze(ROOT / r['source'], r['entry']) == read(ROOT / r['input'])
    rows = {r['name']: r for r in report['rows']}
    views = {name: inspect(r) for name, r in rows.items()}
    comparisons, trials = [], []
    for name, row in rows.items():
        current = views[name]
        doc = current['document']
        assert doc['ir'] == read(ROOT / row['input'])
        assert sha(ROOT / row['input']) == row['input_sha256']
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        if row.get('baseline'):
            before = views[row['baseline']]
            reservation = doc['publication'].get('frontier_reservations')
            assert reservation == row.get('reservations')
            planned = reservation['planned_open'] if reservation else doc['publication']['open']
            assert planned == row['logical_frontier']['open'], ('logical allocation changed', name)
            summaries = reservation['summaries'] if reservation else []
            members = {node for s in summaries for node in s['canonical_members']}
            reserved = [id for s in summaries for id in s['reserved_open']]
            assert len(reserved) == len(set(reserved))
            assert [id for id in planned if id not in reserved] == doc['publication']['open']
            assert current['nodes'].keys() - members == set(row['logical_frontier']['nodes']) - members
            for s in summaries:
                p = next(p for p in doc['publication']['local_pipelines']['rows'] if p['node'] == s['node'])
                assert p['status'] == 'summary' and p['canonical_members'] == s['canonical_members']
                assert set(s['reserved_open']) <= set(p['canonical_members'])
                assert not set(s['reserved_open']) & set(doc['publication']['open'])
            exposed = lambda d: {(r['certificate'], r['role'], r['node']) for r in d['publication']['role_frontier']['roles'] if r['status'] == 'exposed'}
            assert exposed(before['document']) <= exposed(doc)
            assert before['boundaries'] <= current['boundaries']
            lost = before['fulfilled'].keys() - current['fulfilled'].keys()
            critical = {'unknown-boundary', 'state-interface', 'selection', 'conditional-join', 'conditional-region', 'iteration-binding', 'iteration-template', 'same-object-calls', 'observed-parameter-aliases'}
            assert not any(before['fulfilled'][id]['kind'] in critical for id in lost)
            comparisons.append({'name': name, 'svg_unchanged': row['svg_sha256'] == rows[row['baseline']]['svg_sha256'],
                                'reservations': len(summaries), 'logical_frontier_verified': True,
                                'detailed_goals_hidden': [{'goal': id, 'kind': before['fulfilled'][id]['kind']} for id in sorted(lost)],
                                'detailed_goals_added': sorted(current['fulfilled'].keys() - before['fulfilled'].keys())})
        if row.get('adaptive_baseline'):
            before = views[row['adaptive_baseline']]
            assert before['fulfilled'].keys() <= current['fulfilled'].keys()
            assert before['boundaries'] <= current['boundaries']
        if row.get('trial_for'):
            before = views[row['trial_parent']]
            attempt = rows[row['trial_for']]['adaptive']['attempts'][row['attempt']]
            gained = current['fulfilled'].keys() - before['fulfilled'].keys()
            lost = before['fulfilled'].keys() - current['fulfilled'].keys()
            assert gained == {g['id'] for g in attempt['gained_goals']}
            assert lost == set(attempt['lost_goals'])
            gain = sum(current['fulfilled'][id]['priority'] for id in gained)
            assert gain == attempt['gain']
            if row['accepted']:
                assert gain > 0 and not lost and before['boundaries'] <= current['boundaries']
                assert current['contacts'] <= before['contacts'] and current['overlaps'] <= before['overlaps']
                assert current['crossings'] <= before['crossings'] + gain // 2
                b, q = attempt['before'], attempt['candidate']
                assert q['area'] <= b['area'] * 2.5 and q['font'] >= max(12, b['font'])
            else:
                assert attempt['reasons']
            trials.append({'name': name, 'accepted': row['accepted'], 'verified_gain': gain, 'reasons': attempt['reasons']})
    output = {'schema': 'frontier-reservation-independent/1', 'render_report_sha256': sha(OUT / 'render-report.json'),
              'auditor_sha256': sha(Path(__file__)), 'passed': True, 'panels': len(rows), 'comparisons': comparisons, 'trials': trials,
              'source_use_checks': {name: v['source_use_checks'] for name, v in views.items()}, 'goal_complete': False,
              'scope': 'Frozen unsummarized allocation, unchanged external frontier, exact shared result slots and all consumers, independently recomputed SVG geometry, protected boundaries/roles and detailed goal tradeoffs. Baselines use the same source-use rubric; summary membership does not fulfill detailed goals.'}
    (OUT / 'reservation-report.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'panels': len(rows), 'trials': len(trials), 'passed': True}))


if __name__ == '__main__':
    main()

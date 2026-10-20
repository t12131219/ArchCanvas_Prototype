"""Independently check selected SVG geometry, real drawing ownership and exact cuts."""
import hashlib
import json
from pathlib import Path
from audit_label_clearance import identity
import audit_role_detail_receipts as roles

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/rank-clearance/current'


def read(file):
    return json.loads(file.read_text())


def main():
    report = read(OUT / 'render-report.json')
    prior = read(ROOT / report['prior_report'])
    previous = {r['name']: r for r in prior['rows']}
    results = []
    docs = {}
    for row in report['rows']:
        doc = read(OUT / row['document'])
        docs[row['name']] = doc
        assert doc['ir'] == read(ROOT / row['input'])
        if row['comparison']:
            old = previous[row['comparison']['row']]
            before = read(ROOT / Path(report['prior_report']).parent / old['document'])
            assert identity(doc) == identity(before), row['name']
            if row['comparison']['unchanged']:
                assert row['svg_sha256'] == old['svg_sha256']
        receipt = doc['publication'].get('label_clearance')
        assert receipt == row['clearance']
        if not receipt:
            continue
        nodes = {n['id']: dict(n) for n in doc['architecture']['nodes']}
        boxes = {n['id']: n for n in doc['layout']['nodes']}
        removed = {r['node'] for r in doc['layout'].get('frame_ownership', [])}
        for n in nodes.values():
            while n.get('parent') in removed:
                n['parent'] = nodes[n['parent']].get('parent')

        def parents(node):
            result = []
            at = nodes[node].get('parent')
            while at is not None:
                result.append(at)
                at = nodes[at].get('parent')
            return result + [None]

        edges = {}
        for e in doc['layout']['edges']:
            edges.setdefault((e['source'], e['target']), []).append(e)
        expected = {(a, b): (next(p for p in parents(a) if p in parents(b)), [e['id'] for e in es], 32 + 28 * len(es))
                    for (a, b), es in edges.items() if len(es) > 1 and any(e.get('condition') or e.get('bundle_members') for e in es)}
        actual = {(p['source'], p['target']): (r['parent'], p['edges'], p['gap_y']) for r in receipt['regions'] for p in r['pairs']}
        assert actual == expected
        records = receipt.get('rank_layout', [])
        for record in records:
            ranks = record['ranks']
            members = [n for r in ranks for n in r['nodes']]
            assert set(members) == {n for n in boxes if nodes[n].get('parent') == record['parent']}
            assert len(members) == len(set(members))
            lookup = {node: r['rank'] for r in ranks for node in r['nodes']}
            for p in record['pairs']:
                for end in ['source', 'target']:
                    at = p[end]
                    while at not in lookup:
                        at = nodes[at]['parent']
                    assert at == p[end + '_child'] and lookup[at] == p[end + '_rank']
                a, b = p['source_rank'], p['target_rank']
                expected_after = ranks[[r['rank'] for r in ranks].index(max(a, b)) - 1]['rank'] if a != b else None
                assert expected_after == p['after_rank']
                if record['mode'] == 'rank':
                    assert next(r for r in ranks if r['rank'] == expected_after)['gap_after'] >= p['gap_y']
            if record['applied']:
                # Check actual exported rectangles, not the claimed tops alone.
                actual_tops = [min(boxes[n]['y'] for n in r['nodes']) for r in ranks]
                for i, r in enumerate(ranks):
                    height = max(boxes[n]['y'] + boxes[n]['h'] for n in r['nodes']) - actual_tops[i]
                    assert abs(height - r['height']) < 1e-6
                    assert abs(actual_tops[i] - actual_tops[0] - r['top']) < 1e-6
                    if i + 1 < len(ranks):
                        assert abs(actual_tops[i + 1] - actual_tops[i] - height - r['gap_after']) < 1e-6
                        assert r['gap_after'] >= receipt['base_gap_y']
            else:
                assert record['reason']
        decision = row['rank_refinement']
        if decision:
            assert decision == doc['diagnostics']['routing']['rank_clearance_refinement']
            assert len(decision['attempts']) <= 4
            for a in decision['attempts']:
                if not a['accepted']:
                    continue
                b, q = a['before'], a['candidate']
                assert q['area'] < b['area'] * .98 and q['width'] <= b['width'] * 1.05
                for field in ['height', 'crossings', 'contacts', 'wire_length', 'overlaps', 'unplaced_labels']:
                    assert q[field] <= b[field], (row['name'], field)
                assert set(q['issues']) <= set(b['issues'])
            assert decision['accepted'] == any(a['accepted'] for a in decision['attempts'])
        results.append({'name': row['name'], 'pairs': len(actual), 'rank_regions': len(records),
                        'applied_rank_regions': sum(r['applied'] for r in records), 'actual_geometry_verified': True})
    assert identity(docs['ChannelChain-before']) == identity(docs['ChannelChain-auto'])
    for row in report['rows']:
        if row['experiment_for']:
            assert identity(docs[row['name']]) == identity(docs[row['experiment_for']])
    roles.OUT = OUT
    roles.main()
    result = {'schema': 'rank-clearance-receipts/1', 'render_report_sha256': hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest(),
              'results': results, 'exact_frontiers_and_operands': True, 'passed': True}
    (OUT / 'rank-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'panels_with_clearance': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

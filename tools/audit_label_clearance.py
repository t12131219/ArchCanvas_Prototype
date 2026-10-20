"""Check clearance ownership and exact graph identity independently of JS receipts."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/label-clearance/current'


def read(file):
    return json.loads(file.read_text())


def identity(doc):
    fields = ['id', 'source', 'target', 'source_port', 'target_port', 'kind', 'condition', 'originals', 'bundle_members']
    return {'ir': doc['ir'], 'open': doc['publication']['open'], 'nodes': [n['id'] for n in doc['layout']['nodes']],
            'edges': [{k: e[k] for k in fields if k in e} for e in doc['layout']['edges']],
            'roles': doc['publication'].get('role_frontier'), 'cuts': doc['publication']['boundary'],
            'node_accounting': doc['layout']['node_accounting'], 'edge_accounting': doc['layout']['edge_accounting']}


def main():
    report = read(OUT / 'render-report.json')
    rows = {r['name']: r for r in report['rows']}
    docs = {name: read(OUT / r['document']) for name, r in rows.items()}
    results = []
    for name, doc in docs.items():
        receipt = doc['publication'].get('label_clearance')
        assert receipt == rows[name]['clearance']
        if not receipt:
            continue
        nodes = {n['id']: dict(n) for n in doc['architecture']['nodes']}
        ownership = {r['node'] for r in doc['layout'].get('frame_ownership', [])}
        for n in nodes.values():
            while n.get('parent') in ownership:
                n['parent'] = nodes[n['parent']].get('parent')

        def parents(node):
            result = []
            at = nodes[node].get('parent')
            while at is not None:
                result.append(at)
                at = nodes[at].get('parent')
            return result + [None]

        pairs = {}
        for e in doc['layout']['edges']:
            pairs.setdefault((e['source'], e['target']), []).append(e)
        expected = {}
        for (a, b), edges in pairs.items():
            if len(edges) < 2 or not any(e.get('condition') or e.get('bundle_members') for e in edges):
                continue
            owner = next(p for p in parents(a) if p in parents(b))
            expected[(a, b)] = (owner, [e['id'] for e in edges], 32 + 28 * len(edges))
        actual = {(p['source'], p['target']): (r['parent'], p['edges'], p['gap_y']) for r in receipt['regions'] for p in r['pairs']}
        assert actual == expected
        for r in receipt['regions']:
            assert r['gap_y'] == max(p['gap_y'] for p in r['pairs'])
        results.append({'name': name, 'actual_drawing_owners_verified': True, 'pairs': len(actual)})
    for prefix in ['ForeignSignals', 'CrossedSignals']:
        assert identity(docs[prefix + '-global']) == identity(docs[prefix + '-candidate']) == identity(docs[prefix + '-auto'])
    for name in ['transformer-local', 'transformer-selected']:
        assert identity(docs[name]) == identity(docs[name + '-candidate'])
    for name, row in rows.items():
        if row['comparison']:
            old = read(ROOT / report['prior_report'])
            original = next(r for r in old['rows'] if r['name'] == row['comparison']['row'])
            old_doc = read(ROOT / Path(report['prior_report']).parent / original['document'])
            assert identity(docs[name]) == identity(old_doc)
            if row['comparison']['unchanged']:
                assert row['svg_sha256'] == original['svg_sha256']
    for name in ['CrossedSignals-auto', 'transformer-local', 'transformer-selected']:
        decision = rows[name]['refinement']
        assert decision and not decision['accepted']
        candidate = rows[name.replace('-auto', '') + '-candidate']
        assert decision['candidate']['crossings'] == candidate['quality']['line_geometry']['crossings']
        assert decision['candidate']['contacts'] == len(candidate['quality']['line_geometry']['unrelated_contacts'])
        assert decision['candidate']['width'] == candidate['quality']['native_width_px']
        assert decision['candidate']['height'] == candidate['quality']['native_height_px']
    assert rows['ForeignSignals-auto']['refinement']['accepted']
    # Independently inspect each certificate's scope and actual SVG exposure too.
    import audit_role_detail_receipts as roles
    roles.OUT = OUT
    roles.main()
    result = {'schema': 'label-clearance-receipts/1', 'render_report_sha256': hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest(),
              'results': results, 'exact_frontiers_and_operands': True, 'passed': True}
    (OUT / 'clearance-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'regions_checked': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

"""Verify result identities and summary/detail tradeoffs independently of JS."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/dependency-trees/current'
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze


def read(p):
    return json.loads(p.read_text())


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    snapshot = read(ROOT / report['frozen_snapshot'])
    assert sha(ROOT / report['frozen_snapshot']) == report['frozen_snapshot_sha256']
    for file, digest in snapshot['files'].items():
        assert sha(ROOT / Path(report['frozen_snapshot']).parent / 'implementation' / file) == digest
    for entry in read(OUT / 'extraction.json')['rows']:
        source, input = ROOT / entry['source'], ROOT / entry['input']
        assert sha(source) == entry['source_sha256'] and sha(input) == entry['sha256']
        assert analyze(source, entry['entry']) == read(input)
    ref = report['reference']
    assert sha(ROOT / ref['svg']) == ref['svg_sha256']
    rows = {r['name']: r for r in report['rows']}
    results = []
    for row in report['rows']:
        doc = read(OUT / row['document'])
        assert sha(ROOT / row['input']) == row['input_sha256']
        assert read(ROOT / row['input']) == doc['ir']
        nodes = {n['id']: n for n in doc['ir']['nodes']}
        incoming = {}
        for e in doc['ir']['edges']:
            incoming.setdefault(e['target'], []).append(e)

        def resolve(id, port='out'):
            seen = set()
            while id not in seen:
                seen.add(id)
                n, es = nodes[id], incoming.get(id, [])
                if n['kind'] not in ['interface', 'value-alias'] or n.get('operator') or len(es) != 1 or es[0].get('condition'):
                    break
                e = es[0]
                if e['kind'] not in ['data', 'alias', 'interface-binding']:
                    break
                outer = n.get('slot') if n['kind'] == 'value-alias' and n.get('slot') is not None else e.get('source_port', 'out')
                port = port if outer == 'out' else outer if port == 'out' else outer + '.' + port
                id = e['source']
            return id, port

        svg = ET.parse(OUT / row['svg'])
        paths = {e.get('data-edge-id'): e for e in svg.iter() if e.get('data-edge-id')}
        summaries, outputs = 0, 0
        for tree in doc['publication'].get('local_pipelines', {}).get('rows', []):
            if not tree.get('dependency_tree') or tree['status'] != 'summary':
                continue
            summaries += 1
            owner, result = tree['node'], tree['result_operation']
            # Independently follow every displayed output through original
            # aliases/interfaces. Multiple physical consumers keep one result
            # identity and their own canonical receiving slots.
            for route in doc['layout']['edges']:
                if route['source'] != owner:
                    continue
                assert route['route']['ok'] and paths[route['id']].get('data-route-valid') == 'true'
                for member in route.get('bundle_members', [route]):
                    canonical = next(e for e in doc['ir']['edges'] if e['id'] == member['id'])
                    assert canonical['source'] == member['canonical_source']
                    assert canonical['target'] == member['canonical_target']
                    assert canonical['target_port'] == member['target_port']
                    producer, port = resolve(canonical['source'], canonical['source_port'])
                    assert producer == result
                    # A retained boundary interface may delay slot resolution;
                    # the complete chain must still resolve to the same slot.
                    assert resolve(member['resolved_source'], member['source_port']) == (producer, port)
                    outputs += 1
            assert all(r['status'] != 'fulfilled' for r in doc['expression_coverage']
                       if r['goal'] in {'goal:node:' + o['node'] for o in tree['operations']})
        results.append({'name': row['name'], 'folded_trees': summaries, 'verified_output_paths': outputs})
    comparisons = []
    for name, row in rows.items():
        if not name.endswith('-current'):
            continue
        before = rows[name.replace('-current', '-before')]
        b, a = read(OUT / before['document']), read(OUT / row['document'])
        assert a['ir'] == b['ir']
        exposed = lambda d: {(r['certificate'], r['role'], r['node']) for r in d['publication']['role_frontier']['roles'] if r['status'] == 'exposed'}
        assert exposed(b) <= exposed(a), ('certified role lost', name)
        goal_map = lambda d: {r['goal']: r['kind'] for r in d['expression_coverage'] if r['status'] == 'fulfilled'}
        old, new = goal_map(b), goal_map(a)
        lost = [{'goal': k, 'kind': old[k]} for k in sorted(old.keys() - new.keys())]
        critical = {'unknown-boundary', 'state-interface', 'selection', 'conditional-join', 'conditional-region',
                    'iteration-binding', 'iteration-template', 'same-object-calls', 'observed-parameter-aliases'}
        assert not any(r['kind'] in critical for r in lost)
        comparisons.append({'name': name, 'svg_unchanged': row['svg_sha256'] == before['svg_sha256'],
                            'detailed_goals_hidden': lost,
                            'detailed_goals_added': [{'goal': k, 'kind': new[k]} for k in sorted(new.keys() - old.keys())],
                            'size_before': [before['quality']['native_width_px'], before['quality']['native_height_px']],
                            'size_after': [row['quality']['native_width_px'], row['quality']['native_height_px']]})
    result = {'schema': 'dependency-tree-independent/1', 'render_report_sha256': sha(OUT / 'render-report.json'),
              'auditor_sha256': sha(Path(__file__)), 'panels': len(results), 'results': results, 'comparisons': comparisons,
              'passed': True, 'goal_complete': False,
              'scope': 'Original IR, result identities, actual consumer paths and certified roles preserved. Hidden internal goals remain unfulfilled; a summary is not detailed relationship coverage.'}
    (OUT / 'tree-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'output_paths': sum(r['verified_output_paths'] for r in results), 'passed': True}))


if __name__ == '__main__':
    main()

"""Reconstruct coarse coverage from canonical edges and actual SVG, not JS status."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as physical

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/summary-coverage/current'
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compact(text):
    return ''.join(str(text).split())


def inspect(row):
    view = physical.inspect(row)
    d = view['document']
    ir = d['ir']
    nodes = {n['id']: n for n in ir['nodes']}
    planned = {n['id']: n for n in d['architecture']['nodes']}
    incoming, outgoing = {}, {}
    for e in ir['edges']:
        incoming.setdefault(e['target'], []).append(e)
        outgoing.setdefault(e['source'], []).append(e)

    def ordinary(e):
        return e['kind'] in ['data', 'alias', 'interface-binding'] and not e.get('condition')

    def transparent(id):
        n = nodes.get(id, {})
        return n.get('kind') in ['interface', 'value-alias'] and not n.get('operator')

    def resolve(id, port='out'):
        seen = set()
        while id not in seen:
            seen.add(id)
            es = incoming.get(id, [])
            if not transparent(id) or len(es) != 1 or not ordinary(es[0]):
                break
            e = es[0]
            outer = nodes[id].get('slot') if nodes[id]['kind'] == 'value-alias' else None
            outer = e.get('source_port', 'out') if outer is None else outer
            port = port if outer == 'out' else outer if port == 'out' else outer + '.' + port
            id = e['source']
        return id, port

    def reaches(first, last):
        todo, seen = [first], set()
        for at in todo:
            if at == last:
                return True
            if at in seen or not transparent(at):
                continue
            seen.add(at)
            todo += [e['target'] for e in outgoing.get(at, []) if ordinary(e)]
        return False

    routes = {}
    for path in d['layout']['edges']:
        for member in path.get('bundle_members', [path]):
            for id in {member['id'], *member.get('originals', [])}:
                routes.setdefault(id, []).append((path, member))

    def valid_paths(e):
        result = []
        for path, member in routes.get(e['id'], []):
            xml = view['paths'][path['id']]
            if xml.get('data-route-valid') != 'true' or path['source'] not in view['nodes'] or path['target'] not in view['nodes']:
                continue
            if resolve(e['source'], e.get('source_port', 'out')) != resolve(member.get('resolved_source', member.get('canonical_source')), member['source_port']):
                continue
            if not reaches(e['target'], member.get('canonical_target', member['target'])):
                continue
            if member['id'] == e['id'] and member.get('target_port') != e.get('target_port'):
                continue
            result.append(path)
        return result

    layout = {n['id']: n for n in d['layout']['nodes']}
    checks = []
    for goal in d.get('summary_goals', {}).get('goals', []):
        owner = goal['node']
        p = planned[owner]['local_pipeline']
        ids = [o['node'] for o in p['operations']]
        assert ids == [o['node'] for o in goal['operations']]
        uses = []
        for e in ir['edges']:
            source, port = resolve(e['source'], e.get('source_port', 'out'))
            if e['target'] in ids and source in ids:
                uses.append(dict(edge=e['id'], producer=source, source_port=port, target=e['target'], target_port=e['target_port']))
        assert uses == goal['internal_bindings']
        assert all(ids.index(b['producer']) < ids.index(b['target']) for b in uses)
        children = [owner]
        for id in children:
            children += [n['id'] for n in ir['nodes'] if n.get('parent') == id]
        cuts = [e for e in ir['edges'] if (e['source'] in children) != (e['target'] in children)]
        assert cuts == goal['cuts']
        labels = {}
        for id in ids:
            n = nodes[id]
            framework = n.get('source_framework_function') and n.get('source_framework_function') == n.get('function_target')
            labels[id] = n['framework_type'].split('.')[-1] if n.get('framework_type') else n['function_target'].split('.')[-1] if framework else n['operator']
        assert labels == {o['node']: o['label'] for o in goal['operations']}
        bindings = {id: [b for b in uses if b['target'] == id] for id in ids}
        sinks = [id for id in ids if not any(b['producer'] == id for b in uses)]
        assert len(sinks) == 1

        def expression(id):
            return labels[id] + (' ← {' + '; '.join(expression(b['producer']) for b in bindings[id]) + '}' if bindings[id] else '')

        formulas = []
        if p.get('dependency_dag'):
            refs = {id: '#' + str(i + 1) for i, id in enumerate(ids)}
            title = 'Result ' + refs[sinks[0]]
            for id in ids:
                incoming_uses = sorted(bindings[id], key=lambda b: (str(b['target_port']), b['edge']))
                reference = lambda b: refs[b['producer']] + ('[' + b['source_port'] + ']' if b['source_port'] != 'out' else '')
                formulas.append(refs[id] + ' ' + labels[id] + (' ← ' + '; '.join(b['target_port'] + '=' + reference(b) for b in incoming_uses) if incoming_uses else ''))
        else:
            title = expression(sinks[0]) if p.get('dependency_tree') else ' → '.join(labels[id] for id in ids)
        assert title == goal['printed_title'] and formulas == goal['printed_formulas']
        xml = view['nodes'].get(owner)
        folded = owner in layout and not layout[owner].get('expanded')
        texts = [e for e in xml if e.tag.endswith('text')] if xml is not None else []
        titles = compact(''.join(''.join(e.itertext()) for e in texts if e.get('class') == 'paper-title'))
        captions = compact(''.join(''.join(e.itertext()) for e in texts if e.get('class') == 'paper-caption'))
        text_ok = compact(title) in titles and all(compact(line) in captions for line in formulas)
        cuts_ok = all(any(not folded or path['source'] == owner or path['target'] == owner for path in valid_paths(e)) for e in cuts)
        all_nodes = all(id in view['nodes'] for id in ids)
        def printed_label(id):
            label = labels[id]
            expected_symbol = '+' if label == 'add' or label.startswith('aten.add.') else '×' if label in ['mul', 'mult'] or label.startswith('aten.mul.') else None
            text = compact(''.join(''.join(e.itertext()) for e in view['nodes'].get(id, [])
                                   if e.tag.endswith('text') and e.get('class') in ['paper-title', 'paper-caption']))
            return text == expected_symbol if layout.get(id, {}).get('symbol') else compact('Pack values' if label == 'structure' else label) in text

        all_labels = all(printed_label(id) for id in ids)
        all_paths = all(valid_paths(next(e for e in ir['edges'] if e['id'] == b['edge'])) for b in uses)
        # A known current candidate must have a valid canonical proof; synthetic
        # corruptions are covered separately by the production mutation tests.
        assert not goal['proof_errors']
        expected = 'summary' if folded and text_ok and cuts_ok else 'operation-paths' if all_nodes and all_labels and all_paths and cuts_ok else 'deferred'
        actual = next(c for c in d['summary_coverage'] if c['goal'] == goal['id'])
        assert actual['form'] == expected, (row['name'], owner, actual, expected)
        assert actual['status'] == ('unfulfilled' if expected == 'deferred' else 'fulfilled')
        assert actual['detailed_relationships_fulfilled'] is False
        if expected == 'summary':
            hidden = {'goal:node:' + id for id in ids}
            assert all(c['status'] != 'fulfilled' for c in d['expression_coverage'] if c['goal'] in hidden)
        checks.append({'goal': goal['id'], 'form': expected, 'routed_cut_paths': sum(len(valid_paths(e)) for e in cuts)})
    return checks


def main():
    physical.OUT = OUT
    report = read(OUT / 'render-report.json')
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest
    for key in ['checkpoint', 'prior_report', 'extraction']:
        assert sha(ROOT / report[key]) == report[key + '_sha256']
    snapshot = read(ROOT / report['checkpoint'])
    for file, digest in snapshot['files'].items():
        assert sha(ROOT / Path(report['checkpoint']).parent / 'implementation' / file) == digest
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    for row in extraction['rows']:
        assert sha(ROOT / row['input']) == row['sha256']
        assert analyze(ROOT / extraction['source'], row['entry']) == read(ROOT / row['input'])
    results = []
    rows = {r['name']: r for r in report['rows']}
    for row in report['rows']:
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        checks = inspect(row)
        assert read(OUT / row['document'])['ir'] == read(ROOT / row['input'])
        if row['name'].endswith('-current'):
            assert row['svg_sha256'] == rows[row['name'].replace('-current', '-before')]['svg_sha256'], 'unexpected visual change'
        if row.get('adaptive'):
            for attempt in row['adaptive']['attempts']:
                if attempt['accepted']:
                    assert not attempt['lost_summary_goals'] and not attempt['lost_goals']
        results.append({'name': row['name'], 'checks': checks, 'summary': sum(c['form'] == 'summary' for c in checks),
                        'operation_paths': sum(c['form'] == 'operation-paths' for c in checks), 'deferred': sum(c['form'] == 'deferred' for c in checks)})
    result = {'schema': 'summary-coverage-independent/1', 'render_report_sha256': sha(OUT / 'render-report.json'),
              'auditor_sha256': sha(Path(__file__)), 'panels': len(results), 'results': results, 'passed': True, 'goal_complete': False,
              'scope': 'Actual XML operation text/formulas, canonical dependency identities and result slots, original cut routing, detailed-goal separation and adaptive structure retention. Coarse structure is not full operand or runtime behavior coverage.'}
    (OUT / 'coverage-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'checks': sum(len(r['checks']) for r in results), 'passed': True}))


if __name__ == '__main__':
    main()

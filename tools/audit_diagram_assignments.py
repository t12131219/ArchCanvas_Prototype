"""Recompute diagram-set assignments from saved canonical facts and actual SVG.

Does not import the JS planner or trust its coverage receipts. Run the full
SVG/path auditor as well: this check verifies direct expression assignment.
"""
import hashlib
import json
from functools import lru_cache
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/diagram-set/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
FLOW = {'data', 'alias', 'interface-binding'}


def assignments(ir, goals, panel, svg):
    by = {n['id']: n for n in ir['nodes']}
    edges = {e['id']: e for e in ir['edges']}
    ins, outs = {}, {}
    for e in edges.values():
        ins.setdefault(e['target'], []).append(e)
        outs.setdefault(e['source'], []).append(e)
    transparent = lambda at: at in by and by[at]['kind'] in {'interface', 'value-alias'} and not by[at].get('operator')

    @lru_cache(None)
    def resolve(at, slot='out'):
        seen = set()
        while at not in seen and transparent(at) and len(ins.get(at, [])) == 1:
            seen.add(at)
            e, n = ins[at][0], by[at]
            if e['kind'] not in FLOW or e.get('condition'):
                break
            outer = n.get('slot') if n['kind'] == 'value-alias' and n.get('slot') is not None else e.get('source_port', 'out')
            slot = slot if outer == 'out' else outer if slot == 'out' else outer + '.' + slot
            at = e['source']
        return at, slot

    @lru_cache(None)
    def reaches(first, last):
        todo, seen = [first], set()
        while todo:
            at = todo.pop()
            if at == last:
                return True
            if at in seen or not transparent(at):
                continue
            seen.add(at)
            todo += [e['target'] for e in outs.get(at, []) if e['kind'] in FLOW and not e.get('condition')]
        return False

    visible = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
    physical = {e.get('data-edge-id'): e for e in svg.iter() if e.get('data-edge-id')}
    paths = {}
    for path in panel['layout']['edges']:
        element = physical[path['id']]
        assert element.get('data-route-valid') == str(path['route']['ok']).lower()
        for member in path.get('bundle_members', [path]):
            for edge_id in {member['id'], *member.get('originals', [])}:
                paths.setdefault(edge_id, []).append((path, member))

    @lru_cache(None)
    def exact(edge_id):
        original = edges.get(edge_id)
        if not original:
            return False
        for path, member in paths.get(edge_id, []):
            terminal = edges.get(member['id'])
            if not terminal or not path['route']['ok']:
                continue
            if member.get('canonical_source') != terminal['source'] or member.get('canonical_target') != terminal['target']:
                continue
            if any(member.get(k) != terminal.get(k) for k in ['target_port', 'kind', 'condition', 'evidence']):
                continue
            actual_source = member.get('resolved_source', member.get('canonical_source'))
            if resolve(terminal['source'], terminal.get('source_port', 'out')) != resolve(actual_source, member.get('source_port', 'out')):
                continue
            if resolve(original['source'], original.get('source_port', 'out')) != resolve(actual_source, member.get('source_port', 'out')):
                continue
            if reaches(original['target'], terminal['target']):
                return True
        return False

    qualified = True
    q = panel['quality']
    if (q['issues'] or q['route_failures'] or q['unplaced_port_labels'] or
            q['line_geometry']['unrelated_contacts'] or q['min_canvas_font_px'] < 12 or
            any(not p['same_value'] for p in q['line_geometry']['overlapping_paths'])):
        qualified = False
    result = []
    for goal in goals:
        required = set(goal['edges'])
        if goal['kind'] == 'computation':
            required.update(e['id'] for e in ins.get(goal['focus_node'], []) if e['kind'] in FLOW)
        fulfilled = qualified and set(goal['core']) <= visible.keys() and all(exact(e) for e in required)
        # The JS evaluator rejects a goal if any of its reported paths failed.
        fulfilled &= all(all(path['route']['ok'] for path, _ in paths.get(e, [])) for e in goal['edges'])
        fulfilled &= not any(c['status'] == 'conflict' and c['evidence'].get('relation') == goal.get('relation')
                             for c in panel['layout']['constraint_receipts'])
        identity = goal.get('identity')
        if identity:
            ids = identity.get('calls', [identity.get('node')])
            for node in ids:
                element = visible.get(node)
                if element is None:
                    fulfilled = False
                    continue
                text = ''.join(''.join(e.itertext()) for e in element if e.tag.endswith('text'))
                compact = ''.join(text.split())
                actual = json.loads(element.get('data-identity', '{}'))
                fulfilled &= actual.get('relation') == goal['relation']
                if goal['kind'] == 'same-object-calls':
                    fulfilled &= actual.get('reference') == identity['reference']
                    fulfilled &= ''.join(actual.get('label', '').split()) in compact
                    fulfilled &= f"sourcecall{actual.get('invocation')}/{actual.get('count')}" in compact
                else:
                    fulfilled &= all(''.join(a.split()) in compact for a in identity['aliases'])
        result.append(bool(fulfilled))
    return result


def main():
    report = read(OUT / 'render-report.json')
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, ('stale implementation', file)
    results = []
    for entry in report['sets']:
        assert sha(ROOT / entry['input']) == entry['input_sha256']
        assert sha(OUT / entry['manifest']) == entry['manifest_sha256']
        ir, manifest = read(ROOT / entry['input']), read(OUT / entry['manifest'])
        goals = manifest['plan']['goals']
        assert len(goals) == len({g['id'] for g in goals})
        assert len(manifest['panels']) <= manifest['limits']['max_panels']
        assert len(manifest['attempts']) <= manifest['limits']['max_trials']
        assert len([a for a in manifest['attempts'] if a['accepted']]) == len(manifest['panels']) - 1
        assert (OUT / entry['baseline']).read_bytes() == (OUT / entry['main_svg']).read_bytes()
        assert sha(OUT / entry['baseline']) == entry['baseline_sha256']
        actual = [[] for _ in goals]
        for panel in manifest['panels']:
            for key in ['svg', 'document']:
                assert sha((OUT / entry['manifest']).parent / panel[key]) == panel[key + '_sha256']
            doc = read((OUT / entry['manifest']).parent / panel['document'])
            assert doc['ir'] == ir
            all_goals = {g['id']: g for g in doc['expression_goals']['goals']}
            assert all(all_goals[g['id']] == g for g in goals)
            tree = ET.parse((OUT / entry['manifest']).parent / panel['svg'])
            for index, expressed in enumerate(assignments(ir, goals, {**doc, 'quality': panel['quality']}, tree.getroot())):
                if expressed:
                    actual[index].append(panel['id'])
        for g, claimed, ids in zip(goals, manifest['coverage'], actual):
            assert claimed['goal'] == g['id'] and claimed['panels'] == ids, (entry['name'], g['id'], claimed, ids)
            assert claimed['status'] == ('fulfilled' if ids else 'deferred')
            assert claimed['method'] == ('direct-canonical-paths' if ids else None)
        deferred = [g['id'] for g, panels in zip(goals, actual) if not panels]
        assert deferred == manifest['deferred_goals'] and manifest['complete'] == (not deferred)
        results.append({'name': entry['name'], 'goals': len(goals), 'fulfilled': len(goals) - len(deferred),
                        'deferred': len(deferred), 'panels': len(manifest['panels']), 'passed': True})
    result = {'schema': 'diagram-set-assignment-audit/1', 'render_report_sha256': sha(OUT / 'render-report.json'),
              'auditor_sha256': sha(Path(__file__)), 'results': results, 'passed': True,
              'scope': 'Direct physical core nodes and exact canonical paths; distinct original instances; no representative credit.'}
    (OUT / 'assignment-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()

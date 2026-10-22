"""Verify actual SVG geometry, original bindings and external-source width padding."""
import hashlib
import json
from pathlib import Path
import check_transform_configurations as content
import check_transform_operands as operands

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/source-fork-widths/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def verify_forks(doc):
    edges = {e['id']: e for e in doc['layout']['edges']}
    canonical = {e['id']: e for e in doc['ir']['edges']}
    original = {n['id']: n for n in doc['ir']['nodes']}
    boxes = {n['id']: n for n in doc['layout']['nodes']}
    nodes = {n['id']: n for n in doc['architecture']['nodes']}
    for row in doc['layout'].get('source_fork_widths', []):
        widths = {n['node']: n['width'] for n in row['before']}
        assert 2 <= len(widths) <= 3 and row['width'] == max(widths.values())
        assert row['width'] <= min(widths.values()) * 1.2 and row['max_width_ratio'] == 1.2
        assert len(set(widths.values())) > 1
        assert set(widths) == {use['target'] for use in row['uses']}
        current = [boxes[id] for id in widths]
        valid = all(p['w'] == row['width'] and p['y'] == current[0]['y'] for p in current)
        assert valid == row['geometry_verified'] and row['status'] == ('realized' if valid else 'deferred')
        assert valid, ('unrealized width proposal', row)
        for use in row['uses']:
            edge = edges[use['edge']]
            assert edge['source'] == edge['resolved_source'] == row['source']
            assert edge['source_port'] == row['source_port']
            assert edge['target'] == use['target'] and edge['target_port'] == use['target_port']
            assert edge['canonical_target'] == edge['target']
            assert not any(edge.get(k) for k in ['bundle_members', 'condition', 'iteration', 'design_route', 'layout_after'])
            assert edge['evidence'] in ['source-dependency', 'static-source']
            assert nodes[edge['target']]['kind'] == 'compute' and not boxes[edge['target']].get('expanded')
            # Reconstruct the transparent interface path from raw canonical
            # edges. The visible common box alone is not proof of one value.
            raw = canonical[edge['id']]
            assert raw['target'] == edge['target'] and raw['target_port'] == edge['target_port']
            at, port, seen = raw['source'], raw['source_port'], set()
            while at != row['source']:
                assert at not in seen and len(seen) < 128
                seen.add(at)
                assert original[at]['kind'] in ['interface', 'value-alias']
                incoming = [e for e in canonical.values() if e['target'] == at]
                binding, = incoming
                assert binding['id'] in edge['originals'] and operands.exact(binding)
                assert binding['kind'] in ['interface-binding', 'alias']
                at, port = binding['source'], binding['source_port']
            assert port == row['source_port']
    return len(doc['layout'].get('source_fork_widths', []))


if __name__ == '__main__':
    reports = [read(OUT / 'small-report.json')] + [read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    hashes = reports[0]['implementation_sha256']
    for file, digest in hashes.items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    content.OUT = operands.OUT = OUT
    rows = []
    for report in reports:
        assert report['implementation_sha256'] == hashes
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            captures = [content.inspect(c, row['name']+'-'+c['suffix'], operands.check_operation) for c in row['results']]
            (a, ga, _), (b, gb, _) = captures
            for capture, (doc, _, _) in zip(row['results'], captures):
                operands.check_svg_bindings(capture, doc)
            forks = verify_forks(b)
            assert a['ir'] == b['ir'] and a['architecture'] == b['architecture'] and a['publication'] == b['publication']
            assert a['expression_goals'] == b['expression_goals'] and a['summary_coverage'] == b['summary_coverage']
            assert ga <= gb
            for key in ['node_accounting', 'edge_accounting']:
                assert {k: sorted(v) for k,v in a['layout'][key].items()} == {k: sorted(v) for k,v in b['layout'][key].items()}
            assert a['layout']['representatives'] == b['layout']['representatives']
            assert {r['node']:r for r in a['layout'].get('frame_ownership', [])} == {r['node']:r for r in b['layout'].get('frame_ownership', [])}
            descriptors = lambda d: [{k:v for k,v in e.items() if k not in ['route', 'context_lane']} for e in d['layout']['edges']]
            assert descriptors(a) == descriptors(b), ('edge bindings', row['name'])
            before = {r['id'] for r in a['layout']['constraint_receipts'] if r['status'] == 'applied'}
            after = {r['id'] for r in b['layout']['constraint_receipts'] if r['status'] == 'applied'}
            assert before <= after, ('lost constraints', row['name'], before-after)
            lanes = [dict(edge=x['id'], before=x.get('context_lane'), current=y.get('context_lane'))
                     for x,y in zip(a['layout']['edges'], b['layout']['edges']) if x.get('context_lane') != y.get('context_lane')]
            qa, qb = [r['quality'] for r in row['results']]
            assert not qb['route_failures'] and not qb['unplaced_port_labels'] and not (set(qb['issues'])-set(qa['issues']))
            refinement = b['diagnostics']['routing'].get('source_fork_width_refinement')
            if refinement:
                metric = lambda q: dict(width=q['native_width_px'], height=q['native_height_px'],
                    area=q['native_width_px']*q['native_height_px'], crossings=q['line_geometry']['crossings'],
                    contacts=len(q['line_geometry']['unrelated_contacts']), wire_length=q['wire_length'],
                    overlaps=sum(not p['same_value'] for p in q['line_geometry']['overlapping_paths']),
                    unplaced_labels=len(q['unplaced_port_labels']), issues=q['issues'])
                assert refinement['max_trials'] == 1
                assert refinement['before'] == metric(qa)
                assert all(refinement[k] == 1.05 for k in ['max_dimension_ratio', 'max_area_ratio', 'max_wire_ratio'])
                old, new = refinement['before'], refinement['candidate']
                bounded = all(new[k] <= old[k]*1.05 for k in ['width', 'height', 'area', 'wire_length'])
                clean = all(new[k] <= old[k] for k in ['crossings', 'contacts', 'overlaps', 'unplaced_labels'])
                if refinement['accepted']:
                    assert bounded and clean and forks > 0 and refinement['candidate'] == metric(qb)
                    assert all(refinement[k] for k in ['facts_preserved', 'applied_relations_preserved', 'direct_goals_preserved', 'geometry_preserved'])
                    replacements = refinement['optional_context_replacements']
                    assert refinement['optional_contexts_preserved'] == (not replacements)
                    if replacements:
                        assert 'paperContextLanes' not in row['state'] and 'paperContextEdges' not in row['state']
                        assert new['crossings'] < old['crossings'] and new['wire_length'] < old['wire_length']
                        old_edges = {e['id']:e for e in a['layout']['edges']}
                        new_edges = {e['id']:e for e in b['layout']['edges']}
                        previous_contexts = {c['edge'] for c in a['layout'].get('context_lanes', []) if c['status'] == 'realized'}
                        current_contexts = {c['edge'] for c in b['layout'].get('context_lanes', []) if c['status'] == 'realized'}
                        assert {r['edge'] for r in replacements} == previous_contexts-current_contexts
                        for replacement in replacements:
                            x,y = old_edges[replacement['edge']],new_edges[replacement['edge']]
                            assert replacement['binding_preserved'] and x['route']['ok'] and y['route']['ok']
                            assert replacement['before_side'] == x['route']['target_side']
                            assert replacement['candidate_side'] == y['route']['target_side']
                            assert not any(e.get(k) for e in [x,y] for k in ['bundle_members','design_route','condition','iteration'])
                            assert x['kind'] in ['data','alias','interface-binding']
                else:
                    assert not forks and refinement['before'] == metric(qb)
                    assert not all(refinement[k] for k in ['facts_preserved', 'applied_relations_preserved', 'direct_goals_preserved', 'geometry_preserved'])
            if not forks:
                assert row['results'][0]['svg_sha256'] == row['results'][1]['svg_sha256']
            rows.append(dict(name=row['name'], forks=forks, added_applied_constraints=sorted(after-before),
                dimensions_before=[qa['native_width_px'], qa['native_height_px']], dimensions_current=[qb['native_width_px'], qb['native_height_px']],
                crossings_before=qa['line_geometry']['crossings'], crossings_current=qb['line_geometry']['crossings'],
                wire_before=qa['wire_length'], wire_current=qb['wire_length'], direct_before=len(ga), direct_current=len(gb),
                context_route_changes=lanes, refinement=refinement))
    result = dict(passed=True, svg_count=len(rows)*2, implementation_sha256=hashes, rows=rows, goal_complete=False)
    (OUT/'independent-checks.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(rows, indent=2))

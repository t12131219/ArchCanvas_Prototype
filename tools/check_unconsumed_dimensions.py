"""Independent physical-source unpack, operand binding and actual SVG audit."""
import json
from pathlib import Path
import sys
import check_transform_configurations as content
import check_transform_operands as operands
import check_transform_sequences as sequences
from audit_unconsumed_dimension_proofs import audit as dimensions

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/unconsumed-dimensions/current'
read = content.read
sha = content.sha

if __name__ == '__main__':
    reports = [read(OUT / 'small-report.json')]
    if '--small' not in sys.argv:
        reports += [read(OUT / f'Transformer-panel-{i}-report.json') for i in range(3)]
    hashes = reports[0]['implementation_sha256']
    for file, digest in hashes.items():
        assert sha(ROOT / file) == digest, ('stale producer', file)
    content.OUT = operands.OUT = OUT
    rows = []
    for report in reports:
        assert report['implementation_sha256'] == hashes
        for row in report['rows']:
            assert sha(ROOT / row['input']) == row['input_sha256']
            captures = [content.inspect(r, row['name'] + '-' + r['suffix'], sequences.check_operation) for r in row['results']]
            (a, ga, _), (b, gb, _) = captures
            for capture, (doc, _, _) in zip(row['results'], captures):
                operands.check_svg_bindings(capture, doc)
                visible = {n['id'] for n in doc['layout']['nodes']}
                dimensions(doc, dict(configuration_paths=[r for r in doc['publication']['configuration_arithmetic'] if r.get('rule_version') == 'dimension-paths/1']), visible, enabled=capture['suffix'] == 'current')
            assert a['ir'] == b['ir'] and a['expression_goals'] == b['expression_goals']
            by = {n['id']: n for n in b['ir']['nodes']}
            proof = {r['node']: r for r in b['publication']['configuration_arithmetic'] if r.get('rule_version') == 'dimension-paths/1'}
            added = set(b['layout']['node_accounting']['attached']) - set(a['layout']['node_accounting']['attached'])
            assert added <= {at for at, r in proof.items() if r['configuration_only']}, (row['name'], added - proof.keys())
            # A summary is not direct atomic exposure. Record each lost goal and
            # its real current representative; never credit attached shape reads.
            lost = []
            for goal in sorted(ga - gb):
                definition = next(g for g in b['expression_goals']['goals'] if g['id'] == goal)
                lost.append(dict(goal=goal, kind=definition['kind'], core=definition['core'],
                    dispositions={at: next((k for k, ids in b['layout']['node_accounting'].items() if at in ids), 'not-canonical') for at in definition['core']}))
            for at in added:
                assert 'goal:node:' + at not in gb
            # Original boundary calls and their identities remain in the IR;
            # fresh open compositions must still expose their opaque/control nodes.
            if row.get('kind', '').startswith('fresh-source'):
                visible = {n['id'] for n in b['layout']['nodes']}
                assert {n['id'] for n in b['ir']['nodes'] if n['kind'] in {'opaque', 'control'}} <= visible
            qa, qb = [r['quality'] for r in row['results']]
            assert not qb['route_failures'] and not qb['unplaced_port_labels']
            assert not (set(qb['issues']) - set(qa['issues'])), (row['name'], qb['issues'])
            rows.append(dict(name=row['name'], shape_groups=sum(bool(r.get('unconsumed_bindings')) for r in proof.values()),
                unconsumed_slots=sum(len(r.get('unconsumed_bindings', [])) for r in proof.values()),
                added_configuration_nodes=sorted(added), direct_before=len(ga), direct_current=len(gb),
                lost_direct=lost, gained_direct=sorted(gb-ga),
                nodes_before=len(a['layout']['nodes']), nodes_current=len(b['layout']['nodes']),
                dimensions_before=[qa['native_width_px'], qa['native_height_px']], dimensions_current=[qb['native_width_px'], qb['native_height_px']],
                crossings_before=qa['line_geometry']['crossings'], crossings_current=qb['line_geometry']['crossings'],
                wire_before=qa['wire_length'], wire_current=qb['wire_length'],
                new_title_passages_allowed=True))
    result = dict(passed=True, svg_count=len(rows)*2, implementation_sha256=hashes, rows=rows, goal_complete=False)
    (OUT / 'independent-checks.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(rows, indent=2))

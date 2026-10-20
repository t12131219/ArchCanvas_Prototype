"""Audit actual selected SVGs and the bounded measured selection receipts."""
import hashlib
import json
from pathlib import Path
import audit_summary_coverage as summary

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/coverage-selection/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    report = read(OUT / 'render-report.json')
    summary.OUT = OUT
    summary.physical.OUT = OUT
    for file, digest in report['implementation_sha256'].items():
        assert sha(ROOT / file) == digest, file
    snapshot = read(ROOT / report['checkpoint'])
    for file, digest in snapshot['files'].items():
        assert sha(ROOT / Path(report['checkpoint']).parent / 'implementation' / file) == digest
    extraction = read(OUT / 'extraction.json')
    assert not extraction['runtime_executed'] and sha(ROOT / extraction['source']) == extraction['source_sha256']
    for entry in extraction['rows']:
        assert summary.analyze(ROOT / extraction['source'], entry['entry']) == read(ROOT / entry['input'])
    results = []
    for row in report['rows']:
        for key in ['svg', 'document']:
            assert sha(OUT / row[key]) == row[key + '_sha256']
        assert sha(ROOT / row['input']) == row['input_sha256']
        checks = summary.inspect(row)
        doc = read(OUT / row['document'])
        assert doc['ir'] == read(ROOT / row['input'])
        a = row.get('adaptive')
        selected = []
        if row.get('version') == 'current' and a:
            assert a['policy'] == 'structure' and len(a['attempts']) <= 3 and len(a['preflights']) <= 36
            for t in a['attempts']:
                benefit = t['selection_benefit']
                b, q = t['before'], t['candidate']
                cost = max(1, q['area'] / max(1, b['area'])) * (1 + max(0, q['crossings'] - b['crossings']) / max(4, b['crossings'] + 4))
                assert abs(benefit['cost'] - cost) < 1e-8
                assert all(abs(benefit['score'][i] - benefit[k] / cost) < 1e-8 for i, k in enumerate(['critical', 'structure', 'detail']))
                if t['eligible']:
                    assert not t['lost_goals'] and not t['lost_summary_goals']
                    for k in ['contacts', 'overlaps', 'route_failures', 'unplaced_labels']:
                        assert q[k] <= b[k]
                    assert q['font'] >= max(12, b['font'])
                    assert q['crossings'] <= b['crossings'] + t['crossing_allowance']
                if t['accepted']:
                    assert t['eligible'] and not t['reasons']
                    selected.append(t)
                elif t['eligible']:
                    assert 'lower-measured-benefit' in t['reasons']
            for round_id in {t['comparison_round'] for t in a['attempts']}:
                peers = [t for t in a['attempts'] if t['comparison_round'] == round_id]
                eligible = [t for t in peers if t['eligible']]
                accepted = [t for t in peers if t['accepted']]
                assert len(accepted) == bool(eligible)
                if accepted:
                    best = sorted(eligible, key=lambda t: (tuple(-v for v in t['selection_benefit']['score']), t['selection_benefit']['cost'], t['opportunity']['id']))[0]
                    assert accepted[0] is best
            final = selected[-1]['candidate'] if selected else a['baseline']
            assert final == a['selected']
            assert final['nodes'] == row['nodes'] and final['edges'] == row['edges']
            assert (final['width'], final['height']) == (row['quality']['native_width_px'], row['quality']['native_height_px'])
            assert final['crossings'] == row['quality']['line_geometry']['crossings']
            for p in a['preflights']:
                if p['reason'] == 'dependency-structure-already-expressed':
                    assert p['estimated_benefit']['only_summary_internal'] and not p['estimated_benefit']['critical'] and not p['estimated_benefit']['structure']
        results.append({'name': row['name'], 'coarse_checks': len(checks), 'selected_steps': len(selected), 'passed': True})
    result = {'schema': 'coverage-selection-independent/1', 'render_report_sha256': sha(OUT / 'render-report.json'),
              'auditor_sha256': sha(Path(__file__)), 'summary_auditor_sha256': sha(ROOT / 'tools/audit_summary_coverage.py'),
              'panels': len(results), 'results': results, 'passed': True, 'goal_complete': False,
              'scope': 'Actual selected SVG text, canonical dependencies, operand/result slots, source cuts and protected roles; selection receipt arithmetic, safety conditions and within-round choice. Rejected trial geometry is recorded by the producer, not independently re-rendered by this auditor.'}
    (OUT / 'selection-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'passed': True}))


if __name__ == '__main__':
    main()

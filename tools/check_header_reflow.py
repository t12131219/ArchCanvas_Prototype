"""Independent SVG/fact audit for complete header text and monotone compaction."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/header-reflow/current'
sys.path.insert(0, str(ROOT / 'tools'))
import audit_adaptive_frontier as geometry
from audit_diagram_assignments import assignments
from check_title_passages import passages
from check_final_sample_frames import terminals

read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
norm = lambda s: ''.join(s.split())


def compare(a, b, sa, sb):
    for key in ['ir', 'state', 'architecture', 'publication', 'expression_goals', 'expression_coverage', 'summary_goals', 'summary_coverage']:
        assert a.get(key) == b.get(key), ('changed facts', key)
    rec = b['diagnostics']['routing'].get('header_reflow', {})
    records = {r['node']: r for r in rec.get('records', [])} if rec.get('accepted') else {}
    compact = rec.get('compaction', {})
    bands = compact.get('bands', []) if rec.get('accepted') and compact.get('accepted') else []
    def T(y):return y - sum(max(0, min(y, r['bottom']) - r['top']) for r in bands)
    old = {p['id']: p for p in a['layout']['nodes']}
    assert old.keys() == {p['id'] for p in b['layout']['nodes']}
    for p in b['layout']['nodes']:
        was = old[p['id']];expected = {**was, 'y': T(was['y']), 'h': T(was['y'] + was['h']) - T(was['y'])}
        if p['id'] in records:
            r = records[p['id']];saving = r['header_before'] - r['header_after']
            assert r['header_before'] == was['header']
            expected.update(lines=r['lines_after'], captions=r['captions_after'], header=r['header_after'],
                protected_header_height=was['protected_header_height'] - saving)
            assert norm(''.join(r['lines_before'])) == norm(''.join(r['lines_after']))
            assert norm(''.join(r['captions_before'])) == norm(''.join(r['captions_after']))
            if r['shrink_blocked_by']:assert saving == 0
        assert p == expected, ('unexpected node change', p['id'])
        if not p.get('expanded'):assert p['h'] == was['h']
    old = {e['id']: e for e in a['layout']['edges']}
    assert old.keys() == {e['id'] for e in b['layout']['edges']}
    for e in b['layout']['edges']:
        was = old[e['id']]
        expected = {**was, 'route': {**was['route'], 'points': [{**p, 'y': T(p['y'])} for p in was['route']['points']]}}
        assert e == expected, ('path was rerouted or binding changed', e['id'])
    assert b['layout']['labels'] == [{**p, 'y': T(p['y'])} for p in a['layout']['labels']]
    for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership', 'frame_title_routing']:
        assert a['layout'].get(key) == b['layout'].get(key), key
    text = lambda s: {n.get('data-node-id'): [norm(''.join(t.itertext())) for t in n if t.tag.endswith('text')] for n in s.iter() if n.get('data-node-id')}
    assert text(sa) == text(sb), 'visible title/caption facts changed'
    applied = {r['id'] for r in a['layout']['constraint_receipts'] if r['status'] == 'applied'}
    assert applied <= {r['id'] for r in b['layout']['constraint_receipts'] if r['status'] == 'applied'}
    return len(records), bands


def main():
    reports = [read(OUT / (key + '-report.json')) for key in ['small', 'large']]
    assert reports[0]['implementation_sha256'] == reports[1]['implementation_sha256']
    for f, h in reports[0]['implementation_sha256'].items():assert sha(ROOT / f) == h, ('stale producer', f)
    snapshot = reports[0]['snapshot'];assert snapshot == reports[1]['snapshot']
    for f, h in snapshot['files'].items():assert hashlib.sha256(subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)).hexdigest() == h
    blob = subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + snapshot['large_report']['path']], cwd=ROOT)
    assert hashlib.sha256(blob).hexdigest() == snapshot['large_report']['sha256'];prior = json.loads(blob)
    geometry.OUT = OUT
    rows = [];svg_count = 0
    for report in reports:
        for request in report['rows']:
            assert sha(ROOT / request['input']) == request['input_sha256']
            docs = [];svgs = [];direct = [];counts = [];titles = []
            for result in request['results']:
                for key in ['svg', 'document']:assert sha(OUT / result[key]) == result[key + '_sha256']
                d = read(OUT / result['document']);svg = ET.parse(OUT / result['svg']).getroot()
                assert d['ir'] == read(ROOT / request['input']) and d['state'] == {**request['state'], 'view': 'publication'}
                if result.get('reuse'):
                    was = next(r for r in prior['rows'] if r['name'] == request['name'])
                    assert was['state'] == request['state'] and was['input_sha256'] == request['input_sha256']
                    capture = next(r for r in was['results'] if r['suffix'] == 'current')
                    for key in ['svg', 'document']:assert result[key + '_sha256'] == capture[key + '_sha256']
                measured = geometry.inspect({**result, 'name': request['name'] + '-' + result['suffix']})
                title, bodies = passages(d, svg);assert not bodies, bodies
                terminals(d)
                goals = d['expression_goals']['goals']
                direct.append({g['id'] for g, ok in zip(goals, assignments(d['ir'], goals, {**d, 'quality': result['quality']}, svg)) if ok})
                for key, kind in [('node_accounting', 'nodes'), ('edge_accounting', 'edges')]:
                    ids = [id for group in d['layout'][key].values() for id in group]
                    assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in d['ir'][kind]}
                paths = {p.get('data-edge-id'): p for p in svg.iter() if p.get('data-edge-id')}
                for e in d['layout']['edges']:
                    p = paths[e['id']]
                    assert p.get('data-source-port') == e['source_port'] and p.get('data-target-port') == e['target_port']
                    if not e.get('bundle_members'):
                        assert p.get('data-canonical-source') == e['canonical_source'] and p.get('data-canonical-target') == e['canonical_target']
                docs.append(d);svgs.append(svg);counts.append(measured['crossings']);titles.append(len(title));svg_count += 1
            reflowed, bands = compare(*docs, *svgs);assert direct[0] <= direct[1]
            aq, bq = [r['quality'] for r in request['results']]
            assert counts[0] == counts[1] and bq['wire_length'] <= aq['wire_length']
            assert all(bq[k] <= aq[k] for k in ['native_width_px', 'native_height_px'])
            assert bq['min_canvas_font_px'] >= aq['min_canvas_font_px']
            assert set(bq['issues']) <= set(aq['issues'])
            assert not bq['route_failures'] and not bq['line_geometry']['unrelated_contacts']
            assert all(p['same_value'] for p in bq['line_geometry']['overlapping_paths'])
            rows.append(dict(name=request['name'], reflowed=reflowed, bands=bands, crossings=counts,
                dimensions=[[q['native_width_px'], q['native_height_px']] for q in [aq,bq]], wire_length=[aq['wire_length'],bq['wire_length']],
                direct_goals=[len(x) for x in direct], title_passages=titles))
    (OUT / 'independent-report.json').write_text(json.dumps(dict(schema='header-reflow-independent/1',passed=True,svgs=svg_count,rows=rows,
        scope='Actual SVG geometry and full visible text, exact canonical bindings, monotone physical terminal mapping, concrete sizes, title/body boundaries, accounting and prior direct goals. No claim of complete convergence.'),indent=2)+'\n')
    print(json.dumps(dict(passed=True,svgs=svg_count,changed=[r for r in rows if r['reflowed']]),ensure_ascii=False))


if __name__ == '__main__':main()

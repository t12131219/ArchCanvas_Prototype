"""Independently audit original source facts, long-path receipts and actual SVG paths."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET
import audit_local_svg as shared

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/serial-paths/experiment'
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

r = json.loads((OUT / 'render-report.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for f, h in r['implementation_sha256'].items():
    assert sha(ROOT / f) == h, ('stale producer', f)
snapshot = json.loads((ROOT / r['baseline']).read_text())
for f, h in snapshot['files'].items():
    saved = (OUT / 'before' / Path(f).name).read_bytes()
    assert hashlib.sha256(saved).hexdigest() == h
    assert saved == subprocess.check_output(['git', 'show', snapshot['commit'] + ':' + f], cwd=ROOT)
extraction = json.loads((OUT / 'fixture-extraction.json').read_text())
assert sha(ROOT / extraction['source']) == extraction['source_sha256']
for fixture in extraction['rows']:
    assert analyze(ROOT / extraction['source'], fixture['entry']) == json.loads((ROOT / fixture['input']).read_text())
    assert sha(ROOT / fixture['input']) == fixture['input_sha256']
for row in r['rows']:
    source = json.loads((ROOT / row['input']).read_text())
    assert sha(ROOT / row['input']) == row['input_sha256']
    assert sha(OUT / row['document']) == row['document_sha256']
    doc = json.loads((OUT / row['document']).read_text())
    assert doc['ir'] == source
    tree = ET.parse(OUT / row['svg'])
    elements = {e.get('data-node-id'): e for e in tree.iter() if e.get('data-node-id')}
    shared.audit_pipeline_summaries(doc, row, elements)
    if row['case'] == 'Bounded-requested':
        request = row['state']['paperRolePaths'][0]
        cert = next(c for c in doc['ir']['semantic_contracts'] if c['id'] == request['certificate'])
        value = cert['roles']
        for key in request['role']:
            value = value[int(key)] if isinstance(value, list) else value[key]
        assert value in elements
        assert any(role['node'] == value and role['certificate'] == cert['id'] and role['role_keys'] == request['role'] and role['status'] == 'exposed'
                   for role in doc['publication']['role_frontier']['roles'])
        assert not any(value in p['canonical_members'] and p['status'] == 'summary'
                       for p in doc['publication']['local_pipelines']['rows'])
    for key, originals in [('node_accounting', source['nodes']), ('edge_accounting', source['edges'])]:
        ids = [id for group in doc['layout'][key].values() for id in group]
        assert len(ids) == len(set(ids)) and set(ids) == {n['id'] for n in originals}
    for p in doc['publication'].get('local_pipelines', {}).get('rows', []):
        if not p.get('path_display'):
            continue
        goal = next(c for c in doc['summary_coverage'] if c['node'] == p['node'])
        if p['status'] == 'summary' or p['detailed_operations_exposed']:
            assert goal['status'] == 'fulfilled' and not goal['proof_errors']
        assert not goal['detailed_relationships_fulfilled']
        assert [id for run in p['path_display']['runs'] for id in run['operations']] == [o['node'] for o in p['operations']]
        title = ''.join(elements[p['node']].find('{http://www.w3.org/2000/svg}title').itertext())
        for o in p['operations']:
            assert o['node'] in title
shared.OUT = OUT
sys.argv = [__file__]
shared.main()
print(json.dumps({'source_fixtures':len(extraction['rows']), 'svg_panels':len(r['rows']), 'original_bindings_and_accounting':True}))

"""Audit actual role SVG paths plus exact certificate references independently."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import audit_local_svg as shared
from audit_input_dock_receipts import verify as verify_docks
from audit_role_source_frame_receipts import verify as verify_frames

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-identity/experiment'
report = json.loads((OUT / 'render-report.json').read_text())
for row in report['rows']:
    doc, tree = json.loads((OUT / row['document']).read_text()), ET.parse(OUT / row['svg'])
    verify_docks(doc, tree); verify_frames(doc, tree)
    if row['variant'] != 'current':
        continue
    contracts = {c['id']: c for c in doc['architecture']['semantic_contracts']}
    elements = {e.get('data-node-id'): e for e in tree.iter() if e.get('data-node-id')}
    identities = set()
    for role in doc['publication']['role_frontier']['roles']:
        cert = contracts[role['certificate']]; value = cert['roles']
        for key in role['role_keys']:
            value = value.get(key) if isinstance(value, dict) else value[int(key)]
        assert value == role['node'] and cert['node'] == role['owner']
        identity = json.dumps([role['owner'], role['certificate'], role['role_keys']])
        assert identity not in identities; identities.add(identity)
        if role['status'] == 'exposed' and any('.' in k or k.isdigit() for k in role['role_keys']):
            text = ''.join(elements[role['node']].itertext())
            assert 'exact keys: ' + json.dumps(role['role_keys'], ensure_ascii=False, separators=(',', ':')) in text
shared.OUT = OUT; sys.argv = [__file__]; shared.main()
actual = json.loads((OUT / 'svg-report.json').read_text())
actual['render_report_sha256'] = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
(OUT / 'svg-report.json').write_text(json.dumps(actual, indent=2) + '\n')

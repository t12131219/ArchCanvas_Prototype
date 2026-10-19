#!/usr/bin/env python3
"""Load the frozen extractor in a fresh Python process, without model execution."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FROZEN = ROOT / 'verification/local-relations/iteration-05-before-identities'
snapshot = json.loads((FROZEN / 'snapshot.json').read_text())
for file, digest in snapshot['files'].items():
    assert hashlib.sha256((FROZEN / 'implementation' / file).read_bytes()).hexdigest() == digest
sys.path.insert(0, str(FROZEN / 'implementation'))
from semantic_adapter import analyze

source = ROOT / 'tests/semantic_fixtures/identity_bindings.py'
output = ROOT / 'verification/local-relations/current/identity-bindings'
ir = analyze(source, 'AliasCalls')
(output / 'AliasCalls-before.json').write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
(output / 'baseline-extraction.json').write_text(json.dumps({
    'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'ir_sha256': hashlib.sha256((output / 'AliasCalls-before.json').read_bytes()).hexdigest(),
    'frozen_snapshot_sha256': hashlib.sha256((FROZEN / 'snapshot.json').read_bytes()).hexdigest(),
    'model_executed': False}, indent=2) + '\n')
print(json.dumps({'nodes': len(ir['nodes']), 'opaque': sum(n['kind'] == 'opaque' for n in ir['nodes'])}))

#!/usr/bin/env python3
"""Extract new development inputs with the frozen pre-structure implementation."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FROZEN = ROOT / 'verification/local-relations/iteration-06-before-repeat-structure'
snapshot = json.loads((FROZEN / 'snapshot.json').read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for file, expected in snapshot['files'].items():
    assert sha(FROZEN / 'implementation' / file) == expected
sys.path.insert(0, str(FROZEN / 'implementation'))
from semantic_adapter import analyze

source = ROOT / 'tests/semantic_fixtures/structural_repeats.py'
out = ROOT / 'verification/local-relations/current/structural-repeats'
out.mkdir(parents=True, exist_ok=True)
rows = []
for name in ['EquivalentSteps', 'MixedSteps', 'LiteralSteps', 'UnknownSteps', 'ConditionalSteps',
             'AliasPartitionSteps', 'MutableSteps']:
    ir = analyze(source, name)
    target = out / (name + '-before.json')
    target.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
    rows.append({'name': name, 'ir': str(target.relative_to(out.parent)), 'ir_sha256': sha(target)})
(out / 'baseline-extraction.json').write_text(json.dumps({
    'source_sha256': sha(source), 'frozen_snapshot_sha256': sha(FROZEN / 'snapshot.json'),
    'model_executed': False, 'scope': 'Development inputs authored after freezing; not held-out acceptance.',
    'cases': rows}, indent=2) + '\n')
print(json.dumps({'cases': len(rows), 'model_executed': False}))

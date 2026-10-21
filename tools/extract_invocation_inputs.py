"""Extract unfamiliar fixed-invocation fixtures without executing their source."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

source = ROOT / 'tests/semantic_fixtures/invocation_inputs.py'
out = ROOT / 'verification/invocation-inputs/current'
out.mkdir(parents=True, exist_ok=True)
rows = []
for entry in ['BoundCalls', 'OptionalUnknown', 'ConditionalCalls', 'LoopCalls', 'WideBindings']:
    ir = analyze(source, entry)
    assert validate_ir(ir)['ok'], validate_ir(ir)
    file = out / (entry + '.json')
    file.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
    rows.append({'entry': entry, 'input': str(file.relative_to(ROOT)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
(out / 'extraction.json').write_text(json.dumps({'source': str(source.relative_to(ROOT)), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'runtime_executed': False, 'rows': rows}, indent=2) + '\n')
print(json.dumps({'fixtures': len(rows), 'runtime_executed': False}))

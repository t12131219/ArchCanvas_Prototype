"""Static local-granularity fixtures; no model execution."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

if __name__ == '__main__':
    src = ROOT / 'tests/semantic_fixtures/adaptive_role_paths.py'
    out = ROOT / 'verification/adaptive-role-paths/current'; out.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in ['BoundedWeave', 'MixedBoundary', 'ConditionalWeave']:
        ir = analyze(src, entry); assert validate_ir(ir)['ok'] and not ir['runtime']['model_executed']
        file = out / (entry + '.json'); file.write_text(json.dumps(ir, indent=2) + '\n')
        rows.append({'entry': entry, 'input': str(file.relative_to(ROOT)), 'input_sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    (out / 'extraction.json').write_text(json.dumps({'schema': 'adaptive-role-paths-extraction/1',
        'source': str(src.relative_to(ROOT)), 'source_sha256': hashlib.sha256(src.read_bytes()).hexdigest(), 'rows': rows, 'runtime_executed': False}, indent=2) + '\n')

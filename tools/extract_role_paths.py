"""Extract source facts without executing the unfamiliar composition."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
if __name__ == '__main__':
    source = ROOT / 'tests/semantic_fixtures/role_paths.py'
    out = ROOT / 'verification/role-paths/current'
    out.mkdir(parents=True, exist_ok=True)
    file = out / 'SeparateStages.json'
    file.write_text(json.dumps(analyze(source, 'SeparateStages'), indent=2) + '\n')
    (out / 'extraction.json').write_text(json.dumps({'source': str(source.relative_to(ROOT)),
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'entry': 'SeparateStages',
        'input': str(file.relative_to(ROOT)), 'input_sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
        'runtime_executed': False}, indent=2) + '\n')

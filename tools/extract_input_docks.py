"""Extract static fixtures; do not execute unfamiliar or stateful models."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

if __name__ == '__main__':
    source = ROOT / 'tests/semantic_fixtures/input_docks.py'
    out = ROOT / 'verification/input-docks/current'
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in ['LateInputs', 'BraidedInputs', 'GuardedInputs', 'UnknownInputs', 'StatefulInputs']:
        file = out / (entry + '.json')
        file.write_text(json.dumps(analyze(source, entry), ensure_ascii=False, indent=2) + '\n')
        rows.append({'entry': entry, 'input': str(file.relative_to(ROOT)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    (out / 'extraction.json').write_text(json.dumps({'schema': 'input-dock-extraction/1', 'runtime_executed': False,
        'source': str(source.relative_to(ROOT)), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'rows': rows}, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'runtime_executed': False}))

"""Static extraction of ordinary and guarded helpers; no model execution."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

if __name__ == '__main__':
    source = ROOT / 'tests/semantic_fixtures/role_source_frames.py'
    out = ROOT / 'verification/role-source-frames/current'
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for name in ['WrappedStages', 'UnknownStages', 'ConditionalStages']:
        file = out / (name + '.json')
        file.write_text(json.dumps(analyze(source, name), indent=2) + '\n')
        rows.append({'name': name, 'input': str(file.relative_to(ROOT)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    (out / 'extraction.json').write_text(json.dumps({'source': str(source.relative_to(ROOT)), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'runtime_executed': False, 'rows': rows}, indent=2) + '\n')

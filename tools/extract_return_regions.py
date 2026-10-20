"""Statically extract return-boundary inputs, without model execution."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

if __name__ == '__main__':
    source = ROOT / 'tests/semantic_fixtures/return_regions.py'
    out = ROOT / 'verification/return-regions/current'
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in ['ReturnAlternatives', 'PairedReturns', 'UnknownReturns', 'StatefulReturns', 'ComparedReturns']:
        ir = analyze(source, entry)
        file = out / (entry + '.json')
        file.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
        rows.append({'entry': entry, 'input': str(file.relative_to(ROOT)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    (out / 'extraction.json').write_text(json.dumps({'schema': 'return-region-extraction/1', 'runtime_executed': False,
        'source': str(source.relative_to(ROOT)), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'rows': rows}, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'runtime_executed': False}))

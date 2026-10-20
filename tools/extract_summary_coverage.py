"""Extract static facts without importing or running fixture model sources."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

SOURCE = ROOT / 'tests/semantic_fixtures/summary_coverage.py'
OUT = ROOT / 'verification/summary-coverage/current'


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in ['SourceMosaic', 'InterruptedMosaic', 'LateMosaic']:
        ir = analyze(SOURCE, entry)
        p = OUT / (entry + '.json')
        if p.exists():
            assert json.loads(p.read_text()) == ir
        else:
            p.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
        rows.append({'entry': entry, 'input': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    (OUT / 'extraction.json').write_text(json.dumps({'schema': 'summary-coverage-extraction/1', 'runtime_executed': False,
        'source': str(SOURCE.relative_to(ROOT)), 'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'rows': rows}, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'runtime_executed': False}))

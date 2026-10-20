"""Extract modeled fixture facts without executing source."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

SOURCE = ROOT / 'tests/semantic_fixtures/frontier_reservations.py'
OUT = ROOT / 'verification/frontier-reservations/current'
ENTRIES = ['FrontierMosaic', 'UnknownMosaic', 'NestedMosaic']

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for source, entry in [(SOURCE, e) for e in ENTRIES] + [(ROOT / 'tests/semantic_fixtures/branched_mosaic.py', 'BranchedMosaic')]:
        ir = analyze(source, entry)
        p = OUT / (entry + '.json')
        if p.exists():
            assert json.loads(p.read_text()) == ir, ('changed fixture extraction', entry)
        else:
            p.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
        rows.append({'entry': entry, 'input': str(p.relative_to(ROOT)), 'source': str(source.relative_to(ROOT)),
                     'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    (OUT / 'extraction.json').write_text(json.dumps({'schema': 'frontier-reservation-extraction/1',
        'runtime_executed': False, 'source': str(SOURCE.relative_to(ROOT)),
        'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'rows': rows}, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'runtime_executed': False}))

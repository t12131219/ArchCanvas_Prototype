"""Extract fresh programs used for structured source argument checks."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir

OUT = ROOT / 'verification/transform-sequences/current'
SOURCE = ROOT / 'tests/semantic_fixtures/transform_sequences.py'

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in ['TuplePatch', 'ListPatch', 'ArithmeticTuple', 'SingleTuple', 'EmptyTuple',
                  'UnknownTuple', 'ConditionalTuple', 'MutableList', 'StarredTuple',
                  'EscapingTuple', 'MixedTuple']:
        ir = analyze(SOURCE, entry)
        assert validate_ir(ir)['ok']
        file = OUT / (entry + '.json')
        file.write_text(json.dumps(ir, indent=2) + '\n')
        rows.append(dict(entry=entry, input=str(file.relative_to(ROOT)),
                         sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    (OUT / 'extraction.json').write_text(json.dumps(dict(source=str(SOURCE.relative_to(ROOT)),
        source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(), rows=rows), indent=2) + '\n')

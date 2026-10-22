"""Extract fresh source entries; no runtime execution or family naming rule."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir

OUT = ROOT / 'verification/read-binding-rows/current'
SOURCE = ROOT / 'tests/semantic_fixtures/read_binding_rows.py'
ENTRIES = ['ReusedWorkshop', 'SeparateWorkshop', 'TupleWorkshop', 'LongWorkshop',
           'UnknownNeighbor', 'StatefulNeighbor', 'ConditionalNeighbor', 'SharedNeighbor', 'BoundaryChain', 'WideLabelWorkshop']

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in ENTRIES:
        ir = analyze(SOURCE, entry)
        assert validate_ir(ir)['ok']
        target = OUT / (entry + '.json')
        target.write_text(json.dumps(ir, indent=2) + '\n')
        rows.append(dict(entry=entry, input=str(target.relative_to(ROOT)), sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (OUT / 'extraction.json').write_text(json.dumps(dict(source=str(SOURCE.relative_to(ROOT)),
        source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(), runtime_executed=False, rows=rows), indent=2) + '\n')

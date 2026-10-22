"""Fresh static extraction of physical known/partial/unknown read compositions."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir
OUT = ROOT/'verification/call-boundaries/current'
if __name__ == '__main__':
    source = ROOT/'tests/semantic_fixtures/source_read_paths.py'
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for name in ['ReadWorkshop','PairReads','SharedReadWorkshop','EscapingRead','InterruptedRead','ConditionalRead','MutableRead']:
        ir = analyze(source, name); assert validate_ir(ir)['ok']
        assert ir == json.loads((ROOT/f'verification/source-read-paths/current/{name}.json').read_text())
        path = OUT/(name+'.json'); path.write_text(json.dumps(ir, indent=2)+'\n')
        rows.append(dict(entry=name, input=str(path.relative_to(ROOT)), sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    (OUT/'extraction.json').write_text(json.dumps(dict(source=str(source.relative_to(ROOT)), source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtime_executed=False,rows=rows),indent=2)+'\n')

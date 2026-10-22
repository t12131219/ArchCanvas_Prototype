"""Extract physical fixtures without executing their unknown/stateful bodies."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
OUT = ROOT / 'verification/stage-routes/current'
if __name__ == '__main__':
    source = ROOT / 'tests/semantic_fixtures/stage_route_shortcuts.py'
    OUT.mkdir(parents=True, exist_ok=True)
    rows=[]
    for name in ['LayeredPatch','UnknownPatch','ConditionalPatch','StatePatch','SharedPatch','SummarizedPatch']:
        path=OUT/(name+'.json')
        path.write_text(json.dumps(analyze(source,name),ensure_ascii=False,indent=2)+'\n')
        rows.append(dict(entry=name,input=str(path.relative_to(ROOT)),sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    (OUT/'extraction.json').write_text(json.dumps(dict(source=str(source.relative_to(ROOT)),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtime_executed=False,rows=rows),indent=2)+'\n')

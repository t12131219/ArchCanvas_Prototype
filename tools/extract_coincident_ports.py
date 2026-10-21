"""Source-only extraction of unfamiliar conditional return programs."""
from pathlib import Path
import hashlib
import json
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir
source=ROOT/'tests/semantic_fixtures/coincident_ports.py'
out=ROOT/'verification/coincident-ports/current'
if __name__=='__main__':
    out.mkdir(parents=True,exist_ok=True);rows=[]
    for name in ['ForeignReturn','UnknownReturn','NestedReturn']:
        ir=analyze(source,name);assert validate_ir(ir)['ok']
        target=out/(name+'.json');target.write_text(json.dumps(ir,ensure_ascii=False,indent=2)+'\n')
        rows.append(dict(name=name,input=str(target.relative_to(ROOT)),sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (out/'extraction.json').write_text(json.dumps(dict(source=str(source.relative_to(ROOT)),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtime_executed=False,rows=rows),indent=2)+'\n')
    print(json.dumps(dict(fixtures=len(rows),runtime_executed=False)))

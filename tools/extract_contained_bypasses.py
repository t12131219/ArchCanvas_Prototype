"""Static fixture extraction; unknown and stateful programs are never executed."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from semantic_adapter.analyzer import analyze

if __name__=='__main__':
    source=ROOT/'tests/semantic_fixtures/contained_bypasses.py'
    out=ROOT/'verification/contained-bypasses/current';out.mkdir(parents=True,exist_ok=True)
    rows=[]
    for entry in ['ContainedChoice','ConditionalMosaic']:
        file=out/(entry+'.json');file.write_text(json.dumps(analyze(source,entry),ensure_ascii=False,indent=2)+'\n')
        rows.append(dict(entry=entry,input=str(file.relative_to(ROOT)),sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    (out/'extraction.json').write_text(json.dumps(dict(source=str(source.relative_to(ROOT)),source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),runtime_executed=False,rows=rows),indent=2)+'\n')

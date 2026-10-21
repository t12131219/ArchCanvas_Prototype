"""Verify the stored source facts by fresh static extraction, without execution."""
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from semantic_adapter.analyzer import analyze

if __name__=='__main__':
    out=ROOT/'verification/contained-bypasses/current'
    report=json.loads((out/'extraction.json').read_text());source=ROOT/report['source']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==report['source_sha256']
    rows=[]
    for row in report['rows']:
        file=ROOT/row['input'];stored=json.loads(file.read_text());fresh=analyze(source,row['entry'])
        assert hashlib.sha256(file.read_bytes()).hexdigest()==row['sha256'] and fresh==stored
        rows.append(dict(entry=row['entry'],nodes=len(fresh['nodes']),edges=len(fresh['edges']),fresh_equal=True))
    (out/'fresh-extraction.json').write_text(json.dumps(dict(passed=True,runtime_executed=False,rows=rows),indent=2)+'\n')
    print(json.dumps(rows))

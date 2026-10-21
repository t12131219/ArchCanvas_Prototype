"""Verify fresh extraction after protecting unresolved normal-return control."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

if __name__ == '__main__':
    out = ROOT / 'verification/normal-returns/current'
    files = ['verification/helper-contracts/current/Transformer-current.json']
    files += [r['input'] for r in json.loads((out / 'extraction.json').read_text())['rows']]
    rows = []
    for file in files:
        path = ROOT / file;stored = json.loads(path.read_text());entry = stored['entry']
        fresh = analyze(entry['file'], entry['class'], constructor=entry['constructor'], cell=entry['cell'])
        assert validate_ir(fresh)['ok'] and fresh == stored, ('extraction changed', file)
        rows.append(dict(input=file,input_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),canonical_equal=True,
            selected_returns=sum('return_selection' in n for n in fresh['nodes'])))
    (out / 'fresh-extraction.json').write_text(json.dumps(dict(passed=True,runtime_executed=False,rows=rows,
        analyzer_sha256=hashlib.sha256((ROOT / 'semantic_adapter/analyzer.py').read_bytes()).hexdigest()), indent=2) + '\n')
    print(json.dumps(dict(passed=True,inputs=len(rows),runtime_executed=False)))

"""Re-extract rather than treating historical JSON as fresh source evidence."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir
OUT = ROOT / 'verification/value-lineage/current'

if __name__ == '__main__':
    extraction = json.loads((OUT / 'extraction.json').read_text())
    assert hashlib.sha256((ROOT / extraction['source']).read_bytes()).hexdigest() == extraction['source_sha256']
    rows = []
    for row in extraction['rows'] + [dict(entry='Transformer', input='verification/helper-contracts/current/Transformer-current.json')]:
        file = ROOT / row['input'];ir = json.loads(file.read_text());entry = ir['entry']
        fresh = analyze(entry['file'], entry['class'], constructor=entry['constructor'], cell=entry.get('cell'))
        assert validate_ir(fresh)['ok']
        assert fresh == ir, ('fresh extraction changed', row['entry'])
        rows.append(dict(entry=row['entry'], input=row['input'], input_sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
            nodes=len(ir['nodes']), edges=len(ir['edges']), certificates=len(ir.get('semantic_contracts', [])), fresh_equal=True))
    (OUT / 'fresh-extraction.json').write_text(json.dumps(dict(passed=True, rows=rows), indent=2) + '\n')
    print(json.dumps(dict(passed=True, entries=len(rows))))

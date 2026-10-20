"""Extract evaluation inputs without executing fixture source."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

if __name__ == '__main__':
    source = ROOT / 'tests/semantic_fixtures/branch_tail_stages.py'
    out = ROOT / 'verification/branch-tail-stages/current'
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in ['UnaryWeave', 'ReusedWeave', 'InterruptedWeave', 'ConditionalWeave',
                  'ImageWeave', 'StatefulWeave', 'MultipleInputWeave', 'WholeBranchWeave']:
        ir = analyze(source, entry)
        p = out / (entry + '.json')
        if p.exists():
            assert json.loads(p.read_text()) == ir
        else:
            p.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
        rows.append({'entry': entry, 'input': str(p.relative_to(ROOT)),
                     'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    (out / 'extraction.json').write_text(json.dumps({'schema': 'branch-tail-stage-extraction/1',
        'runtime_executed': False, 'source': str(source.relative_to(ROOT)),
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'rows': rows}, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'runtime_executed': False}))

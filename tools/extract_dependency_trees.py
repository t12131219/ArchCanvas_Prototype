#!/usr/bin/env python3
"""Extract new dependency-tree fixtures without executing supplied Python."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

OUT = ROOT / 'verification/dependency-trees/current'
SOURCE = ROOT / 'tests/semantic_fixtures/dependency_trees.py'
ENTRIES = ['MergeWeave', 'ScaledProjection', 'LateTree', 'EscapingTree', 'UnknownTree', 'SharedTree', 'ConditionalTree']
FANOUT = ROOT / 'tests/semantic_fixtures/result_fanout.py'

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for source, entry in [(SOURCE, e) for e in ENTRIES] + [(FANOUT, 'ResultFanout')]:
        ir = analyze(source, entry)
        path = OUT / (entry + '.json')
        data = json.dumps(ir, indent=2, ensure_ascii=False) + '\n'
        if path.exists():
            assert json.loads(path.read_text()) == ir, ('existing extraction differs', entry)
        else:
            path.write_text(data)
        rows.append({'entry': entry, 'input': str(path.relative_to(ROOT)),
                     'source': str(source.relative_to(ROOT)), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     'nodes': len(ir['nodes']), 'edges': len(ir['edges'])})
    report = {'schema': 'dependency-tree-extraction/1', 'runtime_executed': False,
              'source': str(SOURCE.relative_to(ROOT)), 'source_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              'rows': rows}
    (OUT / 'extraction.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'runtime_executed': False}))

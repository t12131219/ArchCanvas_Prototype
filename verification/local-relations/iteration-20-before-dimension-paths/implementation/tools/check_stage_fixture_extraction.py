#!/usr/bin/env python3
"""Reproduce static evaluation IR for certified local role stages."""
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze


def main():
    source = ROOT / 'tests/semantic_fixtures/contract_stages.py'
    out = ROOT / 'verification/contract-stages/current'
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    rows = []
    for entry in ['TailChain', 'TailMosaic', 'EscapingTail', 'InterruptedTail', 'ConditionalTail']:
        path = out / (entry + '.json')
        generated = analyze(source, entry)
        assert generated == json.loads(path.read_text()), ('stale extraction', entry)
        rows.append({'entry': entry, 'ir': str(path.relative_to(ROOT)), 'ir_sha256': sha(path)})
    report = {'schema': 'contract-stage-fixtures/1', 'runtime_executed': False,
              'source': str(source.relative_to(ROOT)), 'source_sha256': sha(source),
              'producer': str(Path(__file__).resolve().relative_to(ROOT)), 'producer_sha256': sha(Path(__file__)), 'rows': rows}
    (out / 'fixture-extraction.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'static_reproduction': True}))


if __name__ == '__main__':
    main()

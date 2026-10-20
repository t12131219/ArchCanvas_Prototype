#!/usr/bin/env python3
"""Reproduce the evaluation fixtures statically, without importing their code."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze


def main():
    source = ROOT / 'tests/semantic_fixtures/local_pipelines.py'
    out = ROOT / 'verification/local-pipelines/current'
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    rows = []
    for entry in ['PipelineMosaic', 'InterruptedPipeline', 'EscapingPipeline']:
        path = out / (entry + '.json')
        generated = analyze(source, entry)
        assert generated == json.loads(path.read_text()), ('stale fixture extraction', entry)
        rows.append({'entry': entry, 'ir': str(path.relative_to(ROOT)), 'ir_sha256': digest(path),
                     'nodes': len(generated['nodes']), 'edges': len(generated['edges'])})
    report = {'schema': 'pipeline-fixture-extraction/1', 'runtime_executed': False,
              'source': str(source.relative_to(ROOT)), 'source_sha256': digest(source),
              'producer': str(Path(__file__).resolve().relative_to(ROOT)),
              'producer_sha256': digest(Path(__file__)), 'rows': rows}
    (out / 'fixture-extraction.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'fixtures': len(rows), 'static_reproduction': True}))


if __name__ == '__main__':
    main()

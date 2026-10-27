#!/usr/bin/env python3
"""Explicit, reproducible CPU supplement capture on an independent fixture."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.probe_assistance import assist
from semantic_adapter.schema import validate_ir


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--interpreter', required=True)
    parser.add_argument('--out', default=str(ROOT/'verification/cpu-assistance/current'))
    args = parser.parse_args()
    source = ROOT/'tests/semantic_fixtures/probe_dynamic.py'
    files = [*ROOT.glob('semantic_adapter/*.py'), ROOT/'tools/serve_semantic_studio.py', Path(__file__),
             *ROOT.glob('yworks_edge_router_lab/*.js'), ROOT/'yworks_edge_router_lab/index.html',
             ROOT/'yworks_edge_router_lab/styles.css', *ROOT.glob('tests/test_*.py'), *ROOT.glob('tests/*.cjs'),source]
    hashes = lambda: {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    before = hashes()
    spec = {'schema': 'semantic-inputs/1', 'constructor': {}, 'modes': ['eval', 'train'],
            'cases': [{'id': name, 'inputs': {'x': {'shape': [1,4], 'fill':'ones'},
                                             'positive': {'value': flag}}} for name,flag in [('left',True),('right',False)]]}
    ir = analyze(source, 'DynamicGate', project_root=source.parent)
    result = assist(ir, args.interpreter, str(source.parent), spec)
    out = Path(args.out);out.mkdir(parents=True, exist_ok=True)
    for name,value in [('source.json',ir),('inputs.json',spec),('assisted.json',result['ir']),('summary.json',result['summary']),
                       ('capture-report.json', {'frozen': before == hashes(), 'implementation_sha256': before,
                                                'validation': validate_ir(result['ir'])})]:
        (out/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'frozen': before == hashes(), **result['summary']}, ensure_ascii=False))
    if before != hashes() or result['summary']['status'] != 'passed': raise SystemExit(2)


if __name__ == '__main__': main()

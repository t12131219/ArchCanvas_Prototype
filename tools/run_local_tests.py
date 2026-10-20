#!/usr/bin/env python3
"""Reproduce the local-relations test evidence; never reuse passing counts."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/local-relations/current'
COMMANDS = {
    'python': ['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'],
    'architecture': ['node', 'tests/architecture.test.cjs'],
    'publication': ['node', 'tests/publication.test.cjs'],
    'projection': ['node', 'tests/semantic-projection.test.cjs'],
    'semantic-design': ['node', 'tests/semantic-design.test.cjs'],
    'local-relations': ['node', 'tests/local-relations.test.cjs'],
    'identity-bindings': ['node', 'tests/identity-bindings.test.cjs'],
    'structural-repeats': ['node', 'tests/structural-repeats.test.cjs'],
    'representative-atlas': ['node', 'tests/representative-atlas.test.cjs'],
    'canvas-medium': ['node', 'tests/canvas-medium.test.cjs'],
    'role-frontier': ['node', 'tests/role-frontier.test.cjs'],
    'role-details': ['node', 'tests/role-details.test.cjs'],
    'label-clearance': ['node', 'tests/label-clearance.test.cjs'],
    'rank-clearance': ['node', 'tests/rank-clearance.test.cjs'],
    'branch-columns': ['node', 'tests/branch-columns.test.cjs'],
    'dimension-paths': ['node', 'tests/dimension-paths.test.cjs'],
    'contract-stages': ['node', 'tests/contract-stages.test.cjs'],
    'local-pipelines': ['node', 'tests/local-pipelines.test.cjs'],
    'composed-paths': ['node', 'tests/composed-paths.test.cjs'],
    'flow-entries': ['node', 'tests/flow-entries.test.cjs'],
    'context-lanes': ['node', 'tests/context-lanes.test.cjs'],
    'local-expressions': ['node', 'tests/local-expressions.test.cjs'],
    'frame-ownership': ['node', 'tests/frame-ownership.test.cjs'],
    'inline-sequences': ['node', 'tests/inline-sequences.test.cjs'],
}


def run(item):
    name, command = item
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    output = result.stdout + result.stderr
    log = 'test-logs/' + name + '.log'
    (OUT / log).write_text(output)
    count = re.search(r'Ran (\d+) tests?' if name == 'python' else r'ℹ tests (\d+)', output)
    assert count, ('missing actual test count', name, output[-1000:])
    return {'name': name, 'command': command, 'exit_code': result.returncode, 'log': log}, int(count[1])


def main():
    (OUT / 'test-logs').mkdir(parents=True, exist_ok=True)
    files = [*ROOT.glob('semantic_studio/*.js'), ROOT / 'semantic_studio/index.html', ROOT / 'semantic_studio/style.css', *ROOT.glob('semantic_adapter/*.py'),
             *ROOT.glob('tests/*.test.cjs'), *ROOT.glob('tests/*fixtures.cjs'), *ROOT.glob('tests/test_*.py'),
             *ROOT.glob('tests/semantic_fixtures/*.py'),
             ROOT / 'tools/export_publication.cjs', ROOT / 'tools/representative_atlas.cjs', ROOT / 'tools/symbolic_values.cjs', Path(__file__).resolve()]
    hashes = {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest() for file in sorted(files)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(run, COMMANDS.items()))
    for file, digest in hashes.items():
        assert hashlib.sha256((ROOT / file).read_bytes()).hexdigest() == digest, ('implementation changed during tests', file)
    report = {'schema': 'local-tests/1', 'commands': [r[0] for r in results],
              'counts': {r[0]['name']: r[1] for r in results}, 'implementation_sha256': hashes}
    (OUT / 'test-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'counts': report['counts'], 'passed': all(r[0]['exit_code'] == 0 for r in results)}))
    raise SystemExit(0 if all(r[0]['exit_code'] == 0 for r in results) else 1)


if __name__ == '__main__':
    main()

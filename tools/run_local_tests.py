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
    'role-paths': ['node', 'tests/role-paths.test.cjs'],
    'role-identity': ['node', 'tests/role-identity.test.cjs'],
    'serial-paths': ['node', 'tests/serial-paths.test.cjs'],
    'role-source-frames': ['node', 'tests/role-source-frames.test.cjs'],
    'helper-contracts': ['node', 'tests/helper-contracts.test.cjs'],
    'role-details': ['node', 'tests/role-details.test.cjs'],
    'label-clearance': ['node', 'tests/label-clearance.test.cjs'],
    'adaptive-frontier': ['node', 'tests/adaptive-frontier.test.cjs'],
    'adaptive-role-paths': ['node', 'tests/adaptive-role-paths.test.cjs'],
    'route-memoization': ['node', 'tests/route-memoization.test.cjs'],
    'rank-clearance': ['node', 'tests/rank-clearance.test.cjs'],
    'branch-columns': ['node', 'tests/branch-columns.test.cjs'],
    'dimension-paths': ['node', 'tests/dimension-paths.test.cjs'],
    'contract-stages': ['node', 'tests/contract-stages.test.cjs'],
    'local-pipelines': ['node', 'tests/local-pipelines.test.cjs'],
    'composed-paths': ['node', 'tests/composed-paths.test.cjs'],
    'dependency-trees': ['node', 'tests/dependency-trees.test.cjs'],
    'frontier-reservations': ['node', 'tests/frontier-reservations.test.cjs'],
    'dependency-dags': ['node', 'tests/dependency-dags.test.cjs'],
    'summary-coverage': ['node', 'tests/summary-coverage.test.cjs'],
    'coverage-selection': ['node', 'tests/coverage-selection.test.cjs'],
    'condition-predicates': ['node', 'tests/condition-predicates.test.cjs'],
    'branch-tail-stages': ['node', 'tests/branch-tail-stages.test.cjs'],
    'diagram-set': ['node', 'tests/diagram-set.test.cjs'],
    'exact-expression': ['node', 'tests/exact-expression.test.cjs'],
    'selected-routes': ['node', 'tests/selected-routes.test.cjs'],
    'title-passages': ['node', 'tests/title-passages.test.cjs'],
    'final-sample-frames': ['node', 'tests/final-sample-frames.test.cjs'],
    'operand-rows': ['node', 'tests/operand-rows.test.cjs'],
    'declared-operands': ['node', 'tests/declared-operands.test.cjs'],
    'consumer-arguments': ['node', 'tests/consumer-arguments.test.cjs'],
    'cross-scope-ports': ['node', 'tests/cross-scope-ports.test.cjs'],
    'final-scope-entries': ['node', 'tests/final-scope-entries.test.cjs'],
    'empty-bands': ['node', 'tests/empty-bands.test.cjs'],
    'coincident-ports': ['node', 'tests/coincident-ports.test.cjs'],
    'local-bypasses': ['node', 'tests/local-bypasses.test.cjs'],
    'contained-bypasses': ['node', 'tests/contained-bypasses.test.cjs'],
    'value-lineage': ['node', 'tests/value-lineage.test.cjs'],
    'coupled-routes': ['node', 'tests/coupled-routes.test.cjs'],
    'header-reflow': ['node', 'tests/header-reflow.test.cjs'],
    'shared-fanouts': ['node', 'tests/shared-fanouts.test.cjs'],
    'transform-configurations': ['node', 'tests/transform-configurations.test.cjs'],
    'source-port-order': ['node', 'tests/source-port-order.test.cjs'],
    'transform-operands': ['node', 'tests/transform-operands.test.cjs'],
    'source-fork-widths': ['node', 'tests/source-fork-widths.test.cjs'],
    'transform-sequences': ['node', 'tests/transform-sequences.test.cjs'],
    'residual-bands': ['node', 'tests/residual-bands.test.cjs'],
    'selected-contexts': ['node', 'tests/selected-contexts.test.cjs'],
    'detail-alternatives': ['node', 'tests/detail-alternatives.test.cjs'],
    'coherent-frontiers': ['node', 'tests/coherent-frontiers.test.cjs'],
    'invocation-inputs': ['node', 'tests/invocation-inputs.test.cjs'],
    'entry-bands': ['node', 'tests/entry-bands.test.cjs'],
    'sample-frames': ['node', 'tests/sample-frames.test.cjs'],
    'input-docks': ['node', 'tests/input-docks.test.cjs'],
    'return-regions': ['node', 'tests/return-regions.test.cjs'],
    'normal-returns': ['node', 'tests/normal-returns.test.cjs'],
    'flow-entries': ['node', 'tests/flow-entries.test.cjs'],
    'region-followers': ['node', 'tests/region-followers.test.cjs'],
    'measured-frontiers': ['node', 'tests/measured-frontiers.test.cjs'],
    'joint-expressions': ['node', 'tests/joint-expressions.test.cjs'],
    'role-operation-stages': ['node', 'tests/role-operation-stages.test.cjs'],
    'role-path-stages': ['node', 'tests/role-path-stages.test.cjs'],
    'prefix-role-paths': ['node', 'tests/prefix-role-paths.test.cjs'],
    'module-arguments': ['node', 'tests/module-arguments.test.cjs'],
    'compact-main': ['node', 'tests/compact-main.test.cjs'],
    'cohort-folds': ['node', 'tests/cohort-folds.test.cjs'],
    'joint-preflights': ['node', 'tests/joint-preflights.test.cjs'],
    'context-sources': ['node', 'tests/context-sources.test.cjs'],
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
             ROOT / 'tools/export_publication.cjs', ROOT / 'tools/export_diagram_set.cjs', ROOT / 'tools/representative_atlas.cjs', ROOT / 'tools/symbolic_values.cjs', Path(__file__).resolve()]
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

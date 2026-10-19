#!/usr/bin/env python3
"""Reproduce static acceptance IR, bound to source and frozen implementations."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir


def main():
    output = ROOT / 'verification/local-relations/current'
    output.mkdir(parents=True, exist_ok=True)
    fixtures = ROOT / 'tests/semantic_fixtures'
    cases = [(fixtures / 'local_compositions.py', name, name) for name in ['MixedCircuit', 'SplitCircuit', 'ChosenCircuit']]
    cases += [(fixtures / 'composed_models.py', name, name) for name in ['ForeignComposition', 'BrokenCell', 'UnknownFusion', 'LoopWithBoundary']]
    cases += [(fixtures / 'design_compositions.py', 'ProjectedMixer', 'ProjectedMixer')]
    cases += [(fixtures / 'local_holdout.py', name, name) for name in ['ConditionalCarry', 'SharedMismatch', 'EarlyBoundary']]
    original = (fixtures / 'design_compositions.py').read_text()
    variants = {
        'InterruptedMixer': original.replace('return torch.matmul(weights, c)', 'return torch.matmul(unknown_kernel(weights), c)'),
        'RenamedMixer': original.replace('ProjectedMixer', 'CircuitAlias').replace('self.left', 'self.delta').replace('self.right', 'self.beta').replace('self.signal', 'self.gamma'),
        'WrappedMixer': original.replace('    def forward(self, x, context, values):', '    def project_first(self, value):\n        return self.divide(self.left(value))\n\n    def forward(self, x, context, values):').replace('a = self.divide(self.left(x))', 'a = self.project_first(x)'),
    }
    for name, source_text in variants.items():
        target = output / 'sources' / (name + '.py')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(source_text)
        cases.append((target, 'CircuitAlias' if name == 'RenamedMixer' else 'ProjectedMixer', name))
    cases += [(fixtures / 'iteration_bindings.py', name, 'iteration-bindings/' + name)
              for name in ['accumulate', 'conditional', 'coupled', 'guarded', 'early',
                           'unknown', 'mutable', 'temporary', 'unbound', 'item_input']]
    rows = []
    for source, entry, name in cases:
        ir = analyze(source, entry, {})
        assert validate_ir(ir)['ok'], validate_ir(ir)
        target = output / (name + '.json')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
        rows.append({'name': name, 'entry': entry, 'source': str(source.relative_to(ROOT)),
                     'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'ir': str(target.relative_to(output)), 'ir_sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                     'nodes': len(ir['nodes']), 'edges': len(ir['edges']), 'runtime_executed': False})
    (output / 'extraction.json').write_text(json.dumps({'cases': rows}, indent=2) + '\n')
    print(json.dumps({'cases': len(rows), 'runtime_executed': False}))


if __name__ == '__main__':
    main()

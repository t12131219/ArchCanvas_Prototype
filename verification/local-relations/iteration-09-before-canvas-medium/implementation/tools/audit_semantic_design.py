#!/usr/bin/env python3
"""Matched old/new source analyses, with independently frozen implementations.

Only AST parsing is performed. Previously captured receipts are explicitly
reused, not presented as new CPU executions. Run the companion .cjs afterward.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.merge import merge
from semantic_adapter.schema import validate_ir

OUT = ROOT / 'verification/semantic-design/current'
BASE = ROOT / 'verification/semantic-design/baseline'


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frozen_analysis(source, entry, ctor):
    code = """import sys,json
sys.path.insert(0,sys.argv[1])
from semantic_adapter.analyzer import analyze
print(json.dumps(analyze(sys.argv[2],sys.argv[3],json.loads(sys.argv[4])),ensure_ascii=False))
"""
    return json.loads(subprocess.check_output([sys.executable, '-B', '-c', code, str(BASE), str(source), entry, json.dumps(ctor)], cwd='/tmp'))


def main():
    manifest = json.loads((BASE / 'manifest.json').read_text())
    for name, expected in manifest['files'].items():
        assert sha(BASE / name) == expected, 'baseline changed: ' + name
    seq = ROOT / 'tests/semantic_fixtures/module_sequences.py'
    comp = ROOT / 'tests/semantic_fixtures/design_compositions.py'
    cases = [(name, seq, name, {}) for name in ['IndependentStack', 'SharedStack', 'ConvStack', 'HeterogeneousStack', 'DynamicStack', 'InterruptedStack']]
    cases += [(name, comp, name, {}) for name in ['VectorBlock', 'ImageResidual', 'VectorResidual', 'ConditionalResidual', 'SameSource', 'TwoSources']]
    for name in ['GatedMixture', 'BranchMosaic', 'ForeignComposition', 'BrokenCell', 'UnknownFusion']:
        old = json.loads((ROOT / 'data/semantic/architecture' / (name + '.json')).read_text())
        cases.append((name, Path(old['entry']['file']), old['entry']['class'], old['entry']['constructor']))
    benchmark = ROOT / 'snapshots/transformer_programmatic_guide/sources/pytorch_transformer_original/transformer.py'
    small = json.loads((ROOT / 'tests/semantic_fixtures/transformer-inputs.json').read_text())['constructor']
    cases += [('comparison-default', benchmark, 'Transformer', {}), ('comparison-small', benchmark, 'Transformer', small)]
    before_sources = {str(p): sha(p) for _, p, _, _ in cases}
    rows = []
    for name, source, entry, ctor in cases:
        old = frozen_analysis(source, entry, ctor)
        current = analyze(source, entry, ctor)
        check = validate_ir(current)
        assert check['ok'], check
        save(OUT / 'before' / (name + '.json'), old)
        save(OUT / 'after' / (name + '.json'), current)
        row = {'name': name, 'source': str(source), 'source_sha256': sha(source), 'entry': entry, 'constructor': ctor,
               'before': {'nodes': len(old['nodes']), 'edges': len(old['edges']), 'opaque': sum(n['kind'] == 'opaque' for n in old['nodes'])},
               'after': {'nodes': len(current['nodes']), 'edges': len(current['edges']), 'opaque': sum(n['kind'] == 'opaque' for n in current['nodes'])},
               'contracts': {kind: sum(c['rule'] == kind for c in current.get('semantic_contracts', [])) for kind in sorted({c['rule'] for c in current.get('semantic_contracts', [])})},
               'sequences': [n['repeat_contract'] for n in current['nodes'] if n.get('repeat_contract')],
               'runtime_executed_by_this_audit': False}
        if name in {'comparison-small', 'ForeignComposition'}:
            file = ROOT / ('data/semantic/transformer-runtime.json' if name == 'comparison-small' else 'data/semantic/architecture/ForeignComposition-runtime.json')
            receipt = json.loads(file.read_text())['runtime']
            receipt_before = json.dumps(receipt, sort_keys=True)
            merged = merge(current, receipt)
            assert validate_ir(merged)['ok'], validate_ir(merged)
            assert json.dumps(merged['runtime'], sort_keys=True) == receipt_before
            save(OUT / 'after' / (name + '-runtime.json'), merged)
            row['reused_receipt'] = {'file': str(file), 'trace_digest': receipt['trace_digest'], 'runs': len(receipt['runs']),
                                     'note': 'unchanged-source/config receipt reused; no new CPU execution',
                                     'associations': len(merged['observation_index']['module_associations']),
                                     'unmatched_calls': len(merged['observation_index']['unmatched_calls'])}
        rows.append(row)
    after_sources = {p: sha(Path(p)) for p in before_sources}
    assert before_sources == after_sources
    implementations = ['semantic_adapter/' + name for name in ['analyzer.py', 'construction.py', 'contracts.py', 'observations.py', 'schema.py', 'merge.py', 'motifs.py', 'sources.py']]
    save(OUT / 'analysis-report.json', {'schema': 'semantic-design-analysis/1', 'baseline_git': manifest['git_head'],
         'cases': rows, 'source_files_unchanged': before_sources, 'models_executed': False,
         'implementation_sha256': {name: sha(ROOT / name) for name in implementations},
         'limits': ['No model-family classification or whole-program equivalence proof.',
                    'Default and small benchmark configurations are separate matched comparisons.',
                    'Zero opaque nodes does not establish execution or branch completeness.']})
    print(json.dumps({'cases': len(rows), 'sources_unchanged': len(before_sources), 'models_executed': False}))


if __name__ == '__main__':
    main()

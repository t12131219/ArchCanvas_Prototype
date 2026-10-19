"""Behavioral checks for source fidelity, unknowns and bounded coverage claims."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir
from semantic_adapter.schema import seal
from semantic_adapter.probe import normalize_spec, finite_domain_check
from semantic_adapter.merge import merge

FIXTURE = ROOT / 'tests/semantic_fixtures/models.py'


class SemanticTests(unittest.TestCase):
    def test_analysis_never_imports_model_and_ids_are_reproducible(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'hazard.py'; sentinel = Path(folder) / 'executed'
            source.write_text(f'from pathlib import Path\nPath({str(sentinel)!r}).touch()\nclass OriginalName:\n def forward(self,x):\n  y=x+1\n  return y\n')
            a = analyze(source, 'OriginalName'); b = analyze(source, 'OriginalName')
            self.assertFalse(sentinel.exists())
            self.assertEqual(a['ir_digest'], b['ir_digest'])
            self.assertTrue(validate_ir(a)['ok'])
            self.assertNotIn('torch', sys.modules)

    def test_unknown_target_preserves_inputs_and_opaque_boundary(self):
        ir = analyze(FIXTURE, 'UnknownCall')
        unknown = next(n for n in ir['nodes'] if n['kind'] == 'opaque')
        self.assertEqual(unknown['operator'], 'custom_external')
        self.assertTrue(any(e['target'] == unknown['id'] for e in ir['edges']))
        self.assertFalse(ir['coverage']['complete'])

    def test_branch_joins_do_not_chain_mutually_exclusive_operators(self):
        ir = analyze(FIXTURE, 'BranchMLP')
        left = next(n for n in ir['nodes'] if n.get('module_path') == 'left')
        right = next(n for n in ir['nodes'] if n.get('module_path') == 'right')
        self.assertNotEqual(left['parent'], right['parent'])
        self.assertFalse(any(e['source'] == left['id'] and e['target'] == right['id'] for e in ir['edges']))
        joins = [n['id'] for n in ir['nodes'] if n.get('operator') == 'phi']
        self.assertTrue(joins)
        outcomes = {e['condition']['outcome'] for e in ir['edges'] if e['target'] in joins and 'condition' in e}
        self.assertEqual(outcomes, {'true', 'false'})

    def test_cnn_composition_is_derived_from_operand_dependencies(self):
        ir = analyze(FIXTURE, 'TinyCNN')
        motif = next(m for m in ir['motifs'] if m['semantic_type'] == 'CNN block')
        self.assertIn('pooling', {n.get('operator') for n in ir['nodes'] if n['id'] in motif['members']})
        self.assertTrue(any(n['parent'] == motif['id'] for n in ir['nodes']))
        self.assertTrue(validate_ir(ir)['ok'])

    def test_local_helper_keeps_module_bindings(self):
        ir = analyze(ROOT / 'snapshots/transformer_programmatic_guide/sources/pytorch_transformer_original/transformer.py', 'Transformer')
        self.assertTrue(any(n.get('operator') == 'embedding' for n in ir['nodes']))
        self.assertEqual([n['repeat_contract']['count'] for n in ir['nodes'] if n.get('repeat_contract')], [6, 6])
        self.assertTrue(any(n.get('operator') == 'exception-exit' for n in ir['nodes']))
        self.assertFalse(ir['coverage']['complete'])

    def test_notebook_cell_identity_and_original_files_read_only(self):
        report = json.loads((ROOT / 'verification/semantic-collections.json').read_text())
        self.assertTrue(report['sources_read_only'])
        inv = json.loads((ROOT / 'data/semantic/source-inventory.json').read_text())
        model = next(m for m in inv['models'] if m['entry'] == 'MultilayerPerceptron' and m['file'].endswith('/mlp-basic.ipynb'))
        ir = analyze(model['file'], model['entry'], cell=model['cell'])
        self.assertTrue(all('#cell=' in s['file'] for n in ir['nodes'] for s in n['source']))
        self.assertFalse(ir['runtime']['model_executed'])

    def test_schema_rejects_missing_edges_and_changed_ir(self):
        ir = analyze(FIXTURE, 'TinyCNN')
        ir['edges'][0]['source'] = 'forged'
        self.assertFalse(validate_ir(ir)['ok'])
        seal(ir)
        self.assertFalse(validate_ir(ir)['ok'])

    def test_random_tensors_and_missing_cases_never_certify_finite_domain(self):
        spec = json.loads((ROOT / 'tests/semantic_fixtures/branch-inputs.json').read_text())
        self.assertTrue(finite_domain_check(normalize_spec(spec))['exhaustive'])
        short = copy.deepcopy(spec); short['cases'].pop()
        self.assertFalse(finite_domain_check(short)['exhaustive'])
        spec['cases'][0]['inputs']['x']['fill'] = 'normal'
        self.assertFalse(finite_domain_check(spec)['exhaustive'])
        spec['cases'][0]['inputs']['x']['shape'] = [10000]
        with self.assertRaises(ValueError): normalize_spec(spec)

    def test_module_aliases_are_distinct_calls_without_unknown_operators(self):
        ir = analyze(FIXTURE, 'ReusedRecurrent')
        linear = [n for n in ir['nodes'] if n.get('operator') == 'linear']
        self.assertEqual(len(linear), 2)
        self.assertEqual({n['module_path'] for n in linear}, {'shared', 'alias'})
        self.assertFalse(any(n['kind'] == 'opaque' for n in ir['nodes']))

    def test_same_line_conditions_have_distinct_source_columns(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'inline.py'
            source.write_text('class Inline:\n def forward(self,x,a,b):\n  return (x+1 if a else x-1) + (x+2 if b else x-2)\n')
            ir = analyze(source, 'Inline')
            self.assertEqual(len(ir['branches']), 2)
            self.assertNotEqual(ir['branches'][0]['column'], ir['branches'][1]['column'])

    def test_real_cpu_receipt_has_branches_isolation_dataflow_and_replay(self):
        path = ROOT / 'data/semantic/branch-mlp.json'
        if not path.exists(): self.skipTest('run explicit CPU probe first')
        ir = json.loads(path.read_text()); r = ir['runtime']
        if r['status'] != 'passed': self.skipTest('isolated runtime unavailable')
        self.assertTrue(all(r['isolation']['checks'].values()))
        self.assertEqual(len(r['runs']), 4)
        self.assertTrue(all(x['replay']['matched'] for x in r['runs']))
        self.assertTrue(any(e['evidence'] == 'runtime-tensor' for e in ir['edges']))
        self.assertTrue(ir['coverage']['complete'])
        receipt = copy.deepcopy(r); receipt['runs'].pop()
        raw = analyze(FIXTURE, 'BranchMLP')
        self.assertFalse(merge(raw, receipt)['coverage']['complete'])
        receipt['binding']['source_sha256'] = 'forged'
        with self.assertRaises(ValueError): merge(analyze(FIXTURE, 'BranchMLP'), receipt)
        receipt = copy.deepcopy(r); receipt['source_unchanged'] = False
        self.assertFalse(merge(analyze(FIXTURE, 'BranchMLP'), receipt)['coverage']['complete'])
        receipt = copy.deepcopy(r); receipt['input_spec']['modes'].pop()
        self.assertFalse(merge(analyze(FIXTURE, 'BranchMLP'), receipt)['coverage']['complete'])
        receipt = copy.deepcopy(r)
        receipt['runs'][0]['events'][0]['inputs'].append({'id': 'unobserved', 'producer': None, 'slot': 0, 'shape': [1], 'dtype': 'torch.float32'})
        self.assertFalse(merge(analyze(FIXTURE, 'BranchMLP'), receipt)['coverage']['complete'])


if __name__ == '__main__': unittest.main()

"""Contracts must follow operands across unrelated compositions and mutations."""
import copy
from pathlib import Path
import tempfile
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.contracts import Contracts
from semantic_adapter.schema import seal, validate_ir

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tests/semantic_fixtures/design_compositions.py'


class DesignContractsTests(unittest.TestCase):
    def contracts(self, entry, rule):
        ir = analyze(SOURCE, entry)
        self.assertTrue(validate_ir(ir)['ok'])
        return ir, [c for c in ir.get('semantic_contracts', []) if c['rule'] == rule]

    def test_context_roles_use_preprojection_producers_not_class_names(self):
        for name, expected in [('SameSource', 'self'), ('TwoSources', 'cross'), ('ProjectedMixer', 'general')]:
            with self.subTest(name=name):
                ir, contracts = self.contracts(name, 'multihead-attention')
                contract, = contracts
                self.assertEqual(contract['roles']['mode'], expected)
                self.assertEqual(contract['roles']['heads'], 2)
                self.assertEqual(len(set(contract['roles']['projections'].values())), 3)
                self.assertIn('automatic causal masking', contract['not_asserted'])
                self.assertEqual(len(contract['dependencies']), 1)
                # A wrapper with one shared input is never named a whole MHA.
                if name != 'ProjectedMixer':
                    self.assertNotEqual(contract['node'], next(n['id'] for n in ir['nodes'] if n['parent'] is None))

    def test_axis_scaling_split_and_output_mutations_do_not_keep_certification(self):
        text = SOURCE.read_text()
        changes = [('dim=-1', 'dim=-2'), ('b.transpose(-2, -1)', 'b.transpose(0, -1)'),
                   ('math.sqrt(a.size(-1))', 'math.sqrt(b.size(-2))'),
                   ('batch, length, self.parts', 'length, batch, self.parts'),
                   ('parts * chunk', 'parts + chunk')]
        for old, new in changes:
            with self.subTest(change=new), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'renamed.py'
                source.write_text(text.replace(old, new))
                ir = analyze(source, 'ProjectedMixer')
                self.assertFalse([c for c in ir.get('semantic_contracts', []) if c['rule'] == 'multihead-attention'])

    def test_head_count_comes_from_executed_axes_not_constructor_variable_names(self):
        # Swapping two factors still gives a valid partition, with four heads
        # of width two. The annotation must follow the actual reshape axes.
        text = SOURCE.read_text().replace('self.parts, self.chunk', 'self.chunk, self.parts')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'changed.py'; source.write_text(text)
            ir = analyze(source, 'ProjectedMixer')
            contract, = [c for c in ir['semantic_contracts'] if c['rule'] == 'multihead-attention']
            self.assertEqual((contract['roles']['heads'], contract['roles']['head_dimension']), (4, 2))

    def test_renaming_every_local_symbol_preserves_the_algebra_contract(self):
        text = SOURCE.read_text().replace('ProjectedMixer', 'ForeignCircuit').replace('combine_values', 'unknown_name').replace('self.left', 'self.a').replace('self.right', 'self.b').replace('self.signal', 'self.c')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'other.py'; source.write_text(text)
            ir = analyze(source, 'ForeignCircuit')
            self.assertEqual(len([c for c in ir['semantic_contracts'] if c['rule'] == 'multihead-attention']), 1)

    def test_vector_and_convolution_contracts_retain_actual_normalizer_types(self):
        _, feed = self.contracts('VectorBlock', 'feed-forward')
        self.assertEqual(len(feed), 1)
        _, post = self.contracts('ImageResidual', 'residual-postnorm')
        self.assertEqual([c['roles']['normalization_type'] for c in post], ['torch.nn.BatchNorm2d'])
        _, pre = self.contracts('VectorResidual', 'residual-prenorm')
        self.assertEqual([c['roles']['normalization_type'] for c in pre], ['torch.nn.LayerNorm'])
        ir = analyze(SOURCE, 'ConditionalResidual')
        self.assertFalse([c for c in ir.get('semantic_contracts', []) if c['rule'].startswith('residual-')])

    def test_unknown_or_mutable_algebra_cannot_be_upgraded(self):
        text = SOURCE.read_text().replace('torch.softmax(scores, dim=-1)', 'unfamiliar_kernel(scores)')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'unknown.py'; source.write_text(text)
            ir = analyze(source, 'ProjectedMixer')
            self.assertFalse([c for c in ir.get('semantic_contracts', []) if c['rule'] == 'multihead-attention'])
            self.assertTrue(any(n['kind'] == 'opaque' for n in ir['nodes']))
        original = analyze(SOURCE, 'ProjectedMixer')
        ir = copy.deepcopy(original)
        next(n for n in ir['nodes'] if n.get('operator') == 'softmax')['mutable'] = True
        self.assertFalse([c for c in Contracts(ir).run() if c['rule'] == 'multihead-attention'])

    def test_entry_optional_values_are_not_specialized_but_explicit_calls_are(self):
        entry = analyze(SOURCE, 'ChosenOutput')
        self.assertFalse(any(n.get('return_selection') for n in entry['nodes']))
        ir = analyze(SOURCE, 'ExplicitChoice')
        selected, = [n['return_selection'] for n in ir['nodes'] if n.get('return_selection')]
        self.assertEqual(selected['call_constants'], {'details': True})
        self.assertTrue(validate_ir(ir)['ok'])

    def test_certificate_and_return_references_are_independently_validated(self):
        ir = analyze(SOURCE, 'ExplicitChoice')
        next(n for n in ir['nodes'] if n.get('return_selection'))['return_selection']['selected'] = 'missing'
        self.assertFalse(validate_ir(seal(ir))['ok'])
        ir = analyze(SOURCE, 'ProjectedMixer')
        ir['semantic_contracts'][0]['members'].append('missing')
        self.assertFalse(validate_ir(seal(ir))['ok'])


if __name__ == '__main__':
    unittest.main()

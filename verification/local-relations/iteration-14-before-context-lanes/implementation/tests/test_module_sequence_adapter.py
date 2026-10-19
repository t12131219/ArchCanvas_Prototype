"""Positive and adversarial contracts for bounded construction and recurrence."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/semantic_fixtures/module_sequences.py'
TRANSFORMER = ROOT / 'snapshots/transformer_programmatic_guide/sources/pytorch_transformer_original/transformer.py'


class ModuleSequenceTests(unittest.TestCase):
    def extract(self, entry, ctor=None):
        ir = analyze(FIXTURE, entry, ctor)
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertFalse(ir['runtime']['model_executed'])
        return ir

    def stacks(self, ir):
        return [n for n in ir['nodes'] if n.get('repeat_contract')]

    def test_cloned_objects_keep_every_call_and_exact_recurrent_dependency(self):
        ir = self.extract('IndependentStack')
        stack, = self.stacks(ir)
        self.assertEqual(stack['repeat_contract']['count'], 3)
        self.assertEqual(stack['repeat_contract']['parameter_sharing'], 'independent')
        calls = [n for n in ir['nodes'] if n.get('source_class') == 'Cell']
        self.assertEqual(len(calls), 3)
        self.assertEqual(len({n['module_identity'] for n in calls}), 3)
        self.assertFalse(any(n['kind'] == 'opaque' for n in ir['nodes']))
        # Each later call must consume the preceding iteration's assigned x,
        # never the original input or an unproven carried-state placeholder.
        by = {n['id']: n for n in ir['nodes']}
        for previous, current in zip(calls, calls[1:]):
            entry = next(n for n in ir['nodes'] if n['parent'] == current['id'] and n['label'] == 'x')
            feed = next(e for e in ir['edges'] if e['target'] == entry['id'])
            alias = by[feed['source']]
            self.assertEqual(alias['label'], 'x')
            returned = next(e for e in ir['edges'] if e['target'] == alias['id'])
            self.assertEqual(by[returned['source']]['parent'], previous['id'])

    def test_shared_object_is_not_misreported_as_independent_parameters(self):
        ir = self.extract('SharedStack')
        stack, = self.stacks(ir)
        self.assertEqual(stack['repeat_contract']['parameter_sharing'], 'shared')
        calls = [n for n in ir['nodes'] if n.get('source_class') == 'Cell']
        self.assertEqual(len({n['module_identity'] for n in calls}), 1)
        self.assertEqual(len({n['module_path'] for n in calls}), 3)
        first = [n for n in ir['nodes'] if n.get('framework_type') == 'torch.nn.Linear' and n['label'].startswith('first')]
        self.assertEqual(len({n['module_identity'] for n in first}), 1)

    def test_heterogeneous_elements_remain_distinct_and_not_a_homogeneous_repeat(self):
        ir = self.extract('HeterogeneousStack')
        stack, = self.stacks(ir)
        self.assertEqual(stack['repeat_contract']['count'], 3)
        self.assertEqual(len([n for n in ir['nodes'] if n.get('source_class') == 'Cell']), 1)
        self.assertEqual(stack['repeat_contract']['parameter_sharing'], 'unresolved')

    def test_zero_iterations_leave_the_original_state_unchanged(self):
        ir = self.extract('IndependentStack', {'count': 0})
        self.assertEqual(self.stacks(ir)[0]['repeat_contract']['count'], 0)
        self.assertFalse(any(n.get('source_class') == 'Cell' for n in ir['nodes']))
        result = next(n for n in ir['nodes'] if n['label'] == 'return')
        source = next(e['source'] for e in ir['edges'] if e['target'] == result['id'])
        self.assertEqual(next(n for n in ir['nodes'] if n['id'] == source)['role'], 'input')

    def test_unknown_counts_control_flow_and_mutations_preserve_unresolved_boundaries(self):
        for entry, ctor in [('DynamicStack', None), ('IndependentStack', {'count': 17}),
                            ('InterruptedStack', None), ('MutatedStack', None), ('ConditionalStack', None)]:
            with self.subTest(entry=entry, ctor=ctor):
                ir = self.extract(entry, ctor)
                self.assertFalse(self.stacks(ir))
                self.assertTrue(any(n.get('reason') == 'iteration-binding-unresolved' for n in ir['nodes']))

    def test_same_rule_handles_convolution_and_indexed_constructor_constants(self):
        conv = self.extract('ConvStack')
        self.assertEqual(len([n for n in conv['nodes'] if n.get('operator') == 'convolution']), 2)
        self.assertEqual(self.stacks(conv)[0]['repeat_contract']['parameter_sharing'], 'independent')
        indexed = self.extract('IndexedConfiguration')
        linear = [n['constructor']['args'] for n in indexed['nodes'] if n.get('operator') == 'linear']
        self.assertEqual(linear, [[8, 9], [9, 10], [10, 11]])

    def test_name_changes_do_not_select_or_disable_the_rule(self):
        content = FIXTURE.read_text().replace('IndependentStack', 'UnfamiliarProgram').replace('assemble', 'build_parts').replace('self.units', 'self.pieces').replace('block', 'part')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'foreign.py'
            source.write_text(content)
            ir = analyze(source, 'UnfamiliarProgram')
            self.assertEqual(self.stacks(ir)[0]['repeat_contract']['count'], 3)
            self.assertFalse(any(n['kind'] == 'opaque' for n in ir['nodes']))

    def test_custom_deepcopy_does_not_certify_independent_objects(self):
        content = FIXTURE.read_text().replace('class Cell(nn.Module):', 'class Cell(nn.Module):\n    def __deepcopy__(self, memo):\n        return self\n')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'foreign.py'
            source.write_text(content)
            self.assertFalse(self.stacks(analyze(source, 'IndependentStack')))

    def test_aliases_escapes_and_local_helpers_cannot_hide_collection_mutation(self):
        original = FIXTURE.read_text()
        variants = [
            original.replace('self.units = assemble(unit, count)', 'self.units = assemble(unit, count)\n        unknown_adjust(collection=self.units)'),
            original.replace('self.units = assemble(unit, count)', 'self.units = assemble(unit, count)\n        alias = self.units\n        alias.clear()'),
            original.replace('for block in self.units:', 'alias = self.units\n        alias.clear()\n        for block in self.units:'),
            original.replace('class IndependentStack(nn.Module):', 'class IndependentStack(nn.Module):\n    def change_parts(self):\n        self.units.clear()\n').replace('for block in self.units:', 'self.change_parts()\n        for block in self.units:'),
        ]
        for content in variants:
            with self.subTest(content=variants.index(content)), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'foreign.py'; source.write_text(content)
                ir = analyze(source, 'IndependentStack')
                self.assertFalse(self.stacks(ir))
                self.assertTrue(any(n.get('reason') == 'iteration-binding-unresolved' for n in ir['nodes']))

    def test_transformer_defaults_and_probe_configuration_are_not_confused(self):
        before = hashlib.sha256(TRANSFORMER.read_bytes()).hexdigest()
        for ctor, count in [({}, 6), (json.loads((ROOT / 'tests/semantic_fixtures/transformer-inputs.json').read_text())['constructor'], 1)]:
            with self.subTest(count=count):
                ir = analyze(TRANSFORMER, 'Transformer', ctor)
                self.assertTrue(validate_ir(ir)['ok'])
                self.assertEqual([n['repeat_contract']['count'] for n in self.stacks(ir)], [count, count])
                self.assertEqual(len([n for n in ir['nodes'] if n.get('source_class') == 'EncoderLayer']), count)
                self.assertEqual(len([n for n in ir['nodes'] if n.get('source_class') == 'DecoderLayer']), count)
                self.assertFalse(any(n.get('reason') == 'iteration-binding-unresolved' for n in ir['nodes']))
        self.assertEqual(hashlib.sha256(TRANSFORMER.read_bytes()).hexdigest(), before)


if __name__ == '__main__':
    unittest.main()

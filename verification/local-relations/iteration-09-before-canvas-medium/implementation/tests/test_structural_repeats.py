"""Semantic correspondence, destruction, refactoring and certificate checks."""
import copy
from pathlib import Path
import tempfile
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import seal, validate_ir

FIXTURE = Path(__file__).parent / 'semantic_fixtures/structural_repeats.py'


class StructuralRepeatTests(unittest.TestCase):
    def extract(self, name, text=None):
        if text is None: ir = analyze(FIXTURE, name)
        else:
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'foreign.py'; path.write_text(text)
                ir = analyze(path, name)
        self.assertTrue(validate_ir(ir)['ok'], validate_ir(ir))
        contract, = [n['repeat_contract'] for n in ir['nodes'] if n.get('repeat_contract')]
        return ir, contract

    def test_different_classes_helper_wrapping_and_unused_configuration_share_structure(self):
        _, c = self.extract('EquivalentSteps')
        self.assertTrue(c['homogeneous'])
        self.assertEqual(c['structure']['groups'][0]['indices'], [0, 1, 2])
        self.assertEqual(len({r['fingerprint'] for r in c['structure']['instances']}), 1)
        self.assertEqual(c['parameter_sharing'], 'unresolved')

    def test_heterogeneous_sequence_keeps_all_positions_and_each_distinct_representative(self):
        ir, c = self.extract('MixedSteps')
        self.assertFalse(c['homogeneous'])
        self.assertEqual([g['indices'] for g in c['structure']['groups']], [[0, 1, 3], [2]])
        self.assertEqual(len([n for n in ir['nodes'] if n.get('semantic_type') == 'repeat-instance']), 4)

    def test_literals_with_the_same_operator_and_ports_remain_distinct(self):
        _, c = self.extract('LiteralSteps')
        self.assertFalse(c['homogeneous'])
        self.assertNotEqual(*[r['fingerprint'] for r in c['structure']['instances']])

    def test_unknown_same_constructor_cannot_be_a_representative_for_another_unknown(self):
        _, c = self.extract('UnknownSteps')
        self.assertFalse(c['homogeneous'])
        self.assertEqual([r['status'] for r in c['structure']['instances']], ['unresolved', 'unresolved', 'proved'])
        self.assertEqual([g['indices'] for g in c['structure']['groups']], [[0], [1], [2]])

    def test_conditions_guards_and_operand_order_are_part_of_the_correspondence(self):
        _, c = self.extract('ConditionalSteps')
        self.assertTrue(c['homogeneous'])
        content = FIXTURE.read_text().replace('return x + 2', 'return 1 + x')
        _, c = self.extract('LiteralSteps', content)
        self.assertFalse(c['homogeneous'])
        changed = FIXTURE.read_text().replace('self.parts = nn.ModuleList([Conditioned(), Conditioned()])',
            'self.parts = nn.ModuleList([Conditioned(), PlusOne()])')
        _, c = self.extract('ConditionalSteps', changed)
        self.assertFalse(c['homogeneous'])

    def test_renaming_does_not_change_the_structural_fingerprints(self):
        _, before = self.extract('EquivalentSteps')
        content = FIXTURE.read_text().replace('OtherSpelling', 'UnseenUnit').replace('self.delta', 'self.omega').replace('apply_piece', 'helper_name').replace('signal', 'input_value')
        _, after = self.extract('EquivalentSteps', content)
        self.assertEqual([r['fingerprint'] for r in before['structure']['instances']], [r['fingerprint'] for r in after['structure']['instances']])

    def test_shared_object_calls_and_distinct_object_calls_have_different_correspondences(self):
        _, c = self.extract('AliasPartitionSteps')
        self.assertFalse(c['homogeneous'])
        rows = c['structure']['instances']
        self.assertTrue(all(r['status'] == 'proved' for r in rows))
        selections = [[o['operation']['object_selection'] for o in r['structure']['operations']
                       if 'object_selection' in o['operation']] for r in rows]
        self.assertEqual(selections, [[0, 0], [0, 1]])

    def test_mutable_computation_is_never_hidden_behind_homogeneous_repetition(self):
        _, c = self.extract('MutableSteps')
        self.assertFalse(c['homogeneous'])
        self.assertTrue(all(r['status'] == 'unresolved' for r in c['structure']['instances']))

    def test_changed_graph_or_forged_groups_invalidate_the_certificate(self):
        ir, _ = self.extract('LiteralSteps')
        forged = copy.deepcopy(ir)
        n = next(n for n in forged['nodes'] if n.get('repeat_contract'))
        n['repeat_contract']['homogeneous'] = True
        seal(forged); self.assertFalse(validate_ir(forged)['ok'])
        bad_count = copy.deepcopy(ir)
        next(n for n in bad_count['nodes'] if n.get('repeat_contract'))['repeat_contract']['count'] = 10
        seal(bad_count); self.assertFalse(validate_ir(bad_count)['ok'])
        changed = copy.deepcopy(ir)
        n = next(n for n in changed['nodes'] if n.get('operator') == 'add')
        n['syntax']['fields']['right']['literal'] = '99'
        seal(changed); self.assertFalse(validate_ir(changed)['ok'])

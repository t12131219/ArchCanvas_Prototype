"""Selection proofs retain distinct calls and stop at unmodeled effects."""
import copy
from pathlib import Path
import unittest

from semantic_adapter import analyze, validate_ir
from semantic_adapter.schema import seal

FIXTURE = Path(__file__).parent / 'semantic_fixtures/identity_bindings.py'


class IdentityBindings(unittest.TestCase):
    def extract(self, entry):
        source = FIXTURE.with_name('identity_effects.py') if entry in {'ReallocatedBinding', 'DynamicAccess', 'ConstructorMethodEffect'} else FIXTURE
        ir = analyze(source, entry)
        self.assertTrue(validate_ir(ir)['ok'], validate_ir(ir))
        self.assertFalse(ir['runtime']['model_executed'])
        return ir

    def test_constructor_alias_resolves_same_object_and_preserves_calls(self):
        ir = self.extract('AliasCalls')
        calls = [n for n in ir['nodes'] if n.get('framework_type') == 'torch.nn.Linear']
        self.assertEqual(len(calls), 3)
        self.assertEqual([n['module_binding']['status'] for n in calls], ['proved'] * 3)
        self.assertEqual(calls[0]['module_identity'], calls[1]['module_identity'])
        self.assertNotEqual(calls[0]['module_identity'], calls[2]['module_identity'])
        self.assertEqual(len({n['id'] for n in calls}), 3)
        self.assertTrue(all(n['module_binding']['parameter_identity'] == 'unresolved' for n in calls))

    def test_nested_alias_keeps_internal_reference_identity(self):
        ir = self.extract('NestedAliasCalls')
        calls = [n for n in ir['nodes'] if n.get('framework_type') == 'torch.nn.Linear']
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]['module_identity'], calls[1]['module_identity'])
        self.assertNotEqual(calls[0]['module_path'], calls[1]['module_path'])

    def test_unknown_call_blocks_later_identity_but_keeps_prior_facts(self):
        calls = [n for n in self.extract('InterruptedCalls')['nodes'] if n.get('module_binding')]
        self.assertEqual([n['module_binding']['status'] for n in calls], ['proved', 'proved', 'unresolved'])
        self.assertTrue(calls[-1]['module_binding']['barrier'])

    def test_rebinding_does_not_reuse_constructor_proof_through_an_alias(self):
        ir = self.extract('ReboundAlias')
        calls = [n for n in ir['nodes'] if n.get('module_binding')]
        self.assertEqual([n['module_binding']['status'] for n in calls], ['proved', 'unresolved'])
        self.assertTrue(any(n.get('reason') == 'rebound-call-target' for n in ir['nodes']))

    def test_constructor_owner_escape_prevents_selection_proof(self):
        ir = self.extract('EscapedOwner')
        self.assertFalse(any(n.get('module_binding') for n in ir['nodes']))

    def test_helper_arguments_keep_call_and_object_identity_separate(self):
        ir = self.extract('HelperCalls')
        calls = [n for n in ir['nodes'] if n.get('module_binding')]
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0]['module_identity'], calls[1]['module_identity'])
        self.assertNotEqual(calls[0]['id'], calls[1]['id'])

    def test_static_distinct_objects_do_not_assert_parameter_independence(self):
        ir = self.extract('TiedParameters')
        calls = [n for n in ir['nodes'] if n.get('module_binding')]
        self.assertEqual(len({n['module_identity'] for n in calls}), 2)
        self.assertTrue(all(n['module_binding']['parameter_identity'] == 'unresolved' for n in calls))
        self.assertTrue(all(n['module_binding']['allocation_distinctness'] == 'not-asserted' for n in calls))

    def test_resealed_forged_selection_and_ignored_barrier_are_rejected(self):
        for entry in ['AliasCalls', 'InterruptedCalls']:
            ir = copy.deepcopy(self.extract(entry))
            n = [n for n in ir['nodes'] if n.get('module_binding')][-1]
            if entry == 'AliasCalls':
                n['module_binding']['invocation'] = 'different-call'
            else:
                n['module_binding']['status'] = 'proved'
                n['module_binding'].pop('barrier')
            seal(ir)
            self.assertFalse(validate_ir(ir)['ok'])

    def test_reallocation_does_not_alias_old_and_new_nested_objects(self):
        ir = self.extract('ReallocatedBinding')
        calls = [n for n in ir['nodes'] if n.get('module_binding')]
        self.assertEqual(len(calls), 4)
        self.assertEqual(len({n['module_identity'] for n in calls}), 4)

    def test_custom_attribute_hooks_and_unknown_constructor_methods_block_identity(self):
        for entry in ['DynamicAccess', 'ConstructorMethodEffect']:
            ir = self.extract(entry)
            self.assertFalse(any(n.get('module_binding') for n in ir['nodes']), entry)

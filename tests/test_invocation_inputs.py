"""Invocation constants are local evidence, including keyword-only defaults."""
from pathlib import Path
import tempfile
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

FIXTURE = Path(__file__).parent / 'semantic_fixtures/invocation_inputs.py'


class InvocationInputsTests(unittest.TestCase):
    def extract(self, entry='BoundCalls', source=None):
        if source is None:
            ir = analyze(FIXTURE, entry)
        else:
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'source.py'
                path.write_text(source)
                ir = analyze(path, entry)
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertFalse(ir['runtime']['model_executed'])
        return ir

    def test_distinct_calls_and_dynamic_overrides_have_distinct_bindings(self):
        ir = self.extract()
        fixed = [n for n in ir['nodes'] if 'source_constant_input' in n]
        self.assertEqual(sorted(n['source_constant_input']['value'] for n in fixed if n['label'] == 'coefficient'), [0.25, 0.75])
        self.assertEqual(sorted(n['source_constant_input']['value'] for n in fixed if n['label'] == 'inspected'), [False, True])
        self.assertEqual(len({n['parent'] for n in fixed}), 2)
        dynamic = [n for n in ir['nodes'] if n['kind'] == 'interface' and n['label'] in ['coefficient', 'inspected'] and n not in fixed]
        self.assertEqual(len(dynamic), 2)
        self.assertTrue(all(any(e['target'] == n['id'] and e['kind'] == 'interface-binding' for e in ir['edges']) for n in dynamic))

    def test_root_default_is_not_a_fixed_call_argument(self):
        ir = self.extract()
        root = next(n for n in ir['nodes'] if n['parent'] is None)
        flag = next(n for n in ir['nodes'] if n['parent'] == root['id'] and n['label'] == 'dynamic_flag')
        self.assertNotIn('source_constant_input', flag)

    def test_literal_controls_retain_conditions_and_all_return_alternatives(self):
        ir = self.extract()
        controls = [n for n in ir['nodes'] if n.get('source_constant_input', {}).get('value') is False and n['label'] == 'inspected']
        self.assertEqual(len(controls), 1)
        self.assertTrue(any(e['source'] == controls[0]['id'] and e['kind'] == 'control' for e in ir['edges']))
        outputs = [n for n in ir['nodes'] if n['parent'] == controls[0]['parent'] and n.get('role') == 'output']
        selected = next(n for n in outputs if n.get('return_selection'))
        self.assertEqual(len([e for e in ir['edges'] if e['target'] == selected['id']]), 2)
        self.assertEqual({n['condition']['outcome'] for n in ir['nodes'] if n['parent'] == controls[0]['parent'] and n.get('condition')}, {'true', 'false'})

    def test_none_default_is_retained_at_an_unknown_consumer(self):
        ir = self.extract('OptionalUnknown')
        option, = [n for n in ir['nodes'] if n.get('source_constant_input')]
        self.assertIsNone(option['source_constant_input']['value'])
        unknowns = {n['id'] for n in ir['nodes'] if n['kind'] == 'opaque'}
        self.assertTrue(any(e['source'] == option['id'] and e['target'] in unknowns for e in ir['edges']))

    def test_required_keyword_and_nonliteral_default_do_not_acquire_a_constant(self):
        source = FIXTURE.read_text().replace('option=None', 'option=unknown_default')
        ir = self.extract('OptionalUnknown', source)
        self.assertFalse(any(n.get('source_constant_input') for n in ir['nodes']))
        source = FIXTURE.read_text().replace('option=None', 'option').replace('self.bridge(x)', 'self.bridge(x, option=x)')
        ir = self.extract('OptionalUnknown', source)
        self.assertFalse(any(n.get('source_constant_input') for n in ir['nodes']))

    def test_parameter_renaming_preserves_constant_values_and_use_slots(self):
        a = self.extract('OptionalUnknown')
        b = self.extract('OptionalUnknown', FIXTURE.read_text().replace('option', 'unfamiliar_parameter'))
        fixed = lambda ir: next(n for n in ir['nodes'] if n.get('source_constant_input'))
        self.assertEqual(fixed(a)['source_constant_input'], fixed(b)['source_constant_input'])
        slots = lambda ir: [(e['source_port'], e['target_port'], e['kind']) for e in ir['edges'] if e['source'] == fixed(ir)['id']]
        self.assertEqual(slots(a), slots(b))


if __name__ == '__main__':
    unittest.main()

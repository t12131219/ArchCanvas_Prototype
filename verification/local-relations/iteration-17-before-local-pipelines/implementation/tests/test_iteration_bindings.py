"""The proof must describe reaching definitions, zero paths and refusal scope."""
import copy
from pathlib import Path
import tempfile
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import seal, validate_ir

FIXTURE = Path(__file__).parent / 'semantic_fixtures/iteration_bindings.py'


class IterationBindingTests(unittest.TestCase):
    def extract(self, name):
        ir = analyze(FIXTURE, name)
        self.assertTrue(validate_ir(ir)['ok'], validate_ir(ir))
        self.assertFalse(ir['runtime']['model_executed'])
        return ir

    def contract(self, ir):
        loop, = [n for n in ir['nodes'] if n.get('iteration_contract')]
        return loop, loop['iteration_contract']

    def test_body_reads_current_entry_and_return_reads_exit_not_initial(self):
        ir = self.extract('accumulate')
        loop, contract = self.contract(ir)
        row, = contract['bindings']
        es = {e['id']: e for e in ir['edges']}
        read, = [es[i] for i in row['read_edges']]
        self.assertEqual(read['source'], row['entry'])
        self.assertNotEqual(read['source'], row['initial'])
        self.assertEqual(es[row['backedge']]['source'], row['body_value'])
        returned = next(n for n in ir['nodes'] if n.get('role') == 'output')
        self.assertEqual(next(e['source'] for e in ir['edges'] if e['target'] == returned['id']), row['exit'])
        self.assertIn('time axis', contract['not_asserted'])
        self.assertIn('count-unproved', loop['loop_semantics'])

    def test_zero_iteration_keeps_initial_at_entry_and_does_not_require_body_execution(self):
        ir = self.extract('accumulate')
        _, contract = self.contract(ir)
        row, = contract['bindings']
        edges = {e['id']: e for e in ir['edges']}
        self.assertEqual(edges[row['initial_edge']]['source'], row['initial'])
        self.assertEqual(edges[row['exit_edge']]['source'], row['entry'])
        self.assertNotEqual(edges[row['exit_edge']]['source'], row['body_value'])
        self.assertEqual(edges[row['completion_edge']]['source'], next(n['id'] for n in ir['nodes'] if n.get('iteration_contract')))
        self.assertEqual(edges[row['completion_edge']]['target'], row['exit'])
        self.assertIn('zero-or-more', contract['scope'])

    def test_conditional_update_carries_the_unchanged_alternative(self):
        ir = self.extract('conditional')
        _, contract = self.contract(ir)
        row, = contract['bindings']
        by = {n['id']: n for n in ir['nodes']}
        self.assertEqual(by[row['body_value']]['operator'], 'phi')
        alternatives = [e for e in ir['edges'] if e['target'] == row['body_value'] and e['kind'] == 'data']
        self.assertEqual({e['condition']['outcome'] for e in alternatives}, {'true', 'false'})
        self.assertEqual(next(e['source'] for e in alternatives if e['condition']['outcome'] == 'false'), row['entry'])

    def test_coupled_tuple_updates_preserve_old_values_and_result_slots(self):
        ir = self.extract('coupled')
        _, contract = self.contract(ir)
        rows = {r['name']: r for r in contract['bindings']}
        by = {n['id']: n for n in ir['nodes']}
        for name, other, slot in [('first', 'second', '0'), ('second', 'first', '1')]:
            row = rows[name]
            alias = by[row['body_value']]
            self.assertEqual(alias['slot'], slot)
            extract = next(e for e in ir['edges'] if e['target'] == alias['id'])
            self.assertEqual(extract['source_port'], slot)
            self.assertTrue(any(e['source'] == rows[other]['entry'] and e['target'] == extract['source'] and e['target_port'] == slot for e in ir['edges']))

    def test_while_guard_uses_current_position_and_both_updates_are_bound(self):
        ir = self.extract('guarded')
        _, contract = self.contract(ir)
        rows = {r['name']: r for r in contract['bindings']}
        edges = {e['id']: e for e in ir['edges']}
        guard = edges[contract['guard_edge']]['source']
        self.assertTrue(any(e['source'] == rows['position']['entry'] and e['target'] == guard for e in ir['edges']))
        self.assertEqual(set(rows), {'position', 'value'})

    def test_loop_item_is_a_separate_interface_not_the_iteration_control_value(self):
        ir = self.extract('item_input')
        loop, contract = self.contract(ir)
        item, = [n for n in ir['nodes'] if n.get('role') == 'iteration-item']
        binding, = [e for e in ir['edges'] if e['target'] == item['id']]
        self.assertEqual((binding['source'], binding['source_port']), (loop['id'], 'item'))
        self.assertEqual([r['name'] for r in contract['bindings']], ['value'])

    def test_body_local_exit_stays_possibly_unbound_while_preexisting_state_is_proved(self):
        ir = self.extract('temporary')
        _, contract = self.contract(ir)
        self.assertEqual([r['name'] for r in contract['bindings']], ['value'])
        self.assertTrue(any(n['kind'] == 'opaque' and n['label'].startswith('projected ·') for n in ir['nodes']))

    def test_unsupported_exits_effects_and_unbound_reads_refuse_the_stronger_contract(self):
        for name in ['early', 'unknown', 'mutable', 'unbound']:
            with self.subTest(name=name):
                ir = self.extract(name)
                outer = next(n for n in ir['nodes'] if n.get('operator') == 'loop')
                self.assertFalse(outer.get('iteration_contract'))
                self.assertTrue(any(n.get('reason') == 'iteration-binding-unresolved' for n in ir['nodes']))
                self.assertFalse(any(n.get('role') == 'iteration-entry' for n in ir['nodes']))

    def test_break_continue_else_and_nested_loops_do_not_get_a_normal_completion_proof(self):
        original = FIXTURE.read_text()
        variants = [original.replace('value = torch.tanh(value + side)', 'continue\n        value = torch.tanh(value + side)', 1),
                    original.replace('    return value\n', '    else:\n        value = side\n    return value\n', 1),
                    original.replace('        value = torch.tanh(value + side)', '        for j in range(steps):\n            value = torch.tanh(value + side)', 1)]
        for content in variants:
            with tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'foreign.py'
                source.write_text(content)
                ir = analyze(source, 'accumulate')
                outer = next(n for n in ir['nodes'] if n.get('operator') == 'loop')
                self.assertFalse(outer.get('iteration_contract'))

    def test_renaming_does_not_enable_or_disable_binding_proof(self):
        source_text = FIXTURE.read_text().replace('accumulate', 'unfamiliar').replace('value', 'carrier').replace('side', 'context')
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'foreign.py'
            source.write_text(source_text)
            ir = analyze(source, 'unfamiliar')
            _, contract = self.contract(ir)
            self.assertEqual([r['name'] for r in contract['bindings']], ['carrier'])

    def test_validator_rejects_initial_value_substituted_for_an_iteration_read(self):
        ir = self.extract('accumulate')
        _, contract = self.contract(ir)
        row, = contract['bindings']
        broken = copy.deepcopy(ir)
        next(e for e in broken['edges'] if e['id'] == row['read_edges'][0])['source'] = row['initial']
        self.assertFalse(validate_ir(seal(broken))['ok'])
        broken = copy.deepcopy(ir)
        next(e for e in broken['edges'] if e['id'] == row['backedge'])['source'] = row['initial']
        self.assertFalse(validate_ir(seal(broken))['ok'])
        broken = copy.deepcopy(ir)
        broken['edges'] = [e for e in broken['edges'] if e['id'] != row['completion_edge']]
        self.assertFalse(validate_ir(seal(broken))['ok'])

    def test_a_direct_while_predicate_is_a_current_iteration_read(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'foreign.py'
            source.write_text('def forward(value, remaining):\n    while remaining:\n        value = value + value\n        remaining = remaining - 1\n    return value\n')
            ir = analyze(source, 'forward')
            self.assertTrue(validate_ir(ir)['ok'], validate_ir(ir))
            _, contract = self.contract(ir)
            row = next(r for r in contract['bindings'] if r['name'] == 'remaining')
            self.assertIn(contract['guard_edge'], row['read_edges'])


if __name__ == '__main__':
    unittest.main()

"""Residual claims require value operands; configuration facts remain intact."""
import copy
from pathlib import Path
import unittest
from semantic_adapter import analyze, validate_ir
from semantic_adapter.contracts import Contracts

SOURCE = Path(__file__).parent / 'semantic_fixtures/value_lineage.py'


class ValueLineageTests(unittest.TestCase):
    def test_configuration_allocation_and_exemplar_are_not_residuals(self):
        for entry in ['ConfigurationOnly', 'ExemplarOnly', 'AllocationOnly', 'ShapeOnly', 'ConditionalValues']:
            with self.subTest(entry=entry):
                ir = analyze(SOURCE, entry)
                self.assertTrue(validate_ir(ir)['ok'])
                self.assertFalse([c for c in ir.get('semantic_contracts', []) if c['rule'].startswith('residual-')])
                self.assertTrue(ir['edges'])

    def test_receiver_and_keyword_input_keep_true_value_paths(self):
        for entry in ['TrueValue', 'FunctionalValue', 'MixedValues', 'IndexValues']:
            with self.subTest(entry=entry):
                ir = analyze(SOURCE, entry)
                self.assertEqual(len([c for c in ir['semantic_contracts'] if c['rule'].startswith('residual-')]), 1)

    def test_real_path_keeps_configuration_and_unknown_edges_without_crossing_them(self):
        ir = analyze(SOURCE, 'MixedValues')
        c, = [c for c in ir['semantic_contracts'] if c['rule'].startswith('residual-')]
        by = {n['id']: n for n in ir['nodes']}
        self.assertNotIn('device-cast', [by[i].get('operator') for i in c['roles']['branch_path']])
        self.assertTrue(any(n['kind'] == 'opaque' for n in ir['nodes']))
        self.assertTrue(any(e['target_port'] == 'receiver' for e in ir['edges']))
        before = copy.deepcopy(ir)
        Contracts(ir).run()
        self.assertEqual(ir, before)

    def test_mutating_actual_branch_still_stops_certification(self):
        ir = analyze(SOURCE, 'TrueValue')
        next(n for n in ir['nodes'] if n.get('operator') == 'activation')['mutable'] = True
        self.assertFalse([c for c in Contracts(ir).run() if c['rule'].startswith('residual-')])


if __name__ == '__main__':
    unittest.main()

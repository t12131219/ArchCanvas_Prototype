"""Check fresh source extraction and the syntax distinction behind defaults."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir


class CellInterfacesTests(unittest.TestCase):
    def test_registered_cells_are_source_compute_calls(self):
        source = ROOT / 'tests/semantic_fixtures/cell_interfaces.py'
        for entry, op in [('StepGate', 'gru-cell'), ('StepPair', 'lstm-cell'), ('ZeroStep', 'rnn-cell')]:
            ir = analyze(source, entry)
            self.assertTrue(validate_ir(ir)['ok'])
            cell = next(n for n in ir['nodes'] if n.get('operator') == op)
            self.assertEqual(cell['kind'], 'compute')
            self.assertEqual(cell['source_framework_module'], cell['framework_type'])
            self.assertEqual(cell['cell_call']['rule_version'], 'source-cell-call/1')
            self.assertNotIn('torch', sys.modules)

    def test_dynamic_expansion_is_not_missing_default_state(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/cell_interfaces.py', 'ExpandedArguments')
        call = next(n for n in ir['nodes'] if n.get('operator') == 'gru-cell')
        self.assertTrue(call['cell_call']['positional_expansion'])
        self.assertEqual(call['cell_call']['positional_count'], 1)

    def test_saved_inputs_match_fresh_source(self):
        for file in (ROOT / 'verification/cell-interfaces/current').glob('*.json'):
            if file.stem not in {'StepGate', 'StepPair', 'ZeroStep', 'NoneStep', 'StateWorkshop',
                                 'ConditionalStep', 'ExpandedArguments', 'ExtraArgument', 'NamedImpostor'}:
                continue
            self.assertEqual(analyze(ROOT / 'tests/semantic_fixtures/cell_interfaces.py', file.stem), json.loads(file.read_text()))

"""Extraction/CPU contracts needed by the architecture projection."""
import copy
import json
from pathlib import Path
import unittest
from semantic_adapter.analyzer import analyze
from semantic_adapter.merge import merge
from semantic_adapter.schema import validate_ir

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tests/semantic_fixtures/composed_models.py'


class ArchitectureAdapterTests(unittest.TestCase):
    def test_partial_cell_exposes_gate_types_and_keeps_original_ownership(self):
        ir = analyze(SOURCE, 'BrokenCell')
        self.assertTrue(validate_ir(ir)['ok'])
        functions = {n.get('function_target') for n in ir['nodes']}
        self.assertTrue({'torch.sigmoid', 'torch.tanh'} <= functions)
        self.assertFalse(any(n.get('operator') == 'lstm' for n in ir['nodes']))
        self.assertTrue(all('source_parent' in n for n in ir['nodes']))
        self.assertFalse(ir['runtime']['model_executed'])

    def test_source_owner_survives_existing_cnn_semantic_promotion(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/models.py', 'TinyCNN')
        root = next(n['id'] for n in ir['nodes'] if n['parent'] is None)
        conv = next(n for n in ir['nodes'] if n.get('operator') == 'convolution')
        self.assertNotEqual(conv['parent'], root)
        self.assertEqual(conv['source_parent'], root)

    def test_explicit_router_operands_and_unknown_boundaries_remain_source_facts(self):
        ir = analyze(SOURCE, 'ForeignComposition')
        self.assertTrue(any(n.get('operator') == 'top-k' for n in ir['nodes']))
        self.assertTrue(ir['branches'])
        self.assertTrue(any(e.get('condition') for e in ir['edges']))
        unknown = analyze(SOURCE, 'UnknownFusion')
        self.assertTrue(any(n['kind'] == 'opaque' and n.get('operator') == 'unfamiliar_kernel' for n in unknown['nodes']))

    def test_cpu_receipt_preserves_operand_and_producer_output_slots(self):
        ir = json.loads((ROOT / 'data/semantic/architecture/ForeignComposition-runtime.json').read_text())
        receipt = ir['runtime']
        self.assertEqual(receipt['status'], 'passed')
        self.assertEqual(len(receipt['runs']), 4)
        self.assertTrue(all(run['replay']['matched'] for run in receipt['runs']))
        self.assertTrue(receipt['source_unchanged'])
        self.assertFalse(ir['coverage']['complete'])
        for i, run in enumerate(receipt['runs']):
            for event in run['events']:
                target = f'runtime:{i}:' + event['id']
                for j, tensor in enumerate(event['inputs']):
                    edge = next(e for e in ir['edges'] if e['target'] == target and e['target_port'] == str(j))
                    self.assertEqual(edge['source_port'], str(tensor.get('slot', 'out')))
        raw = analyze(SOURCE, 'ForeignComposition')
        again = merge(raw, copy.deepcopy(receipt))
        self.assertTrue(validate_ir(again)['ok'])
        self.assertEqual(again['runtime']['trace_digest'], receipt['trace_digest'])


if __name__ == '__main__':
    unittest.main()

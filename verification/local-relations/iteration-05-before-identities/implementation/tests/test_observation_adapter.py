"""Observation aggregation must preserve executions, ambiguity and variants.

The reused CPU receipt is recorded evidence. Duplications/mutations below are
synthetic test data, never additional claims of model execution.
"""
import copy
import json
from pathlib import Path
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.merge import merge
from semantic_adapter.schema import seal, source_graph_digest, validate_ir

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tests/semantic_fixtures/composed_models.py'


class ObservationAdapterTests(unittest.TestCase):
    def receipt(self):
        return copy.deepcopy(json.loads((ROOT / 'data/semantic/architecture/ForeignComposition-runtime.json').read_text())['runtime'])

    def merged(self, receipt=None, source=None):
        ir = merge(source or analyze(SOURCE, 'ForeignComposition'), receipt or self.receipt())
        self.assertTrue(validate_ir(ir)['ok'], validate_ir(ir)['errors'])
        return ir

    def test_runtime_annotations_do_not_invalidate_static_contracts(self):
        source = analyze(SOURCE, 'ForeignComposition')
        basis = source_graph_digest(source)
        self.assertTrue(source['semantic_contracts'])
        ir = self.merged(source=source)
        self.assertEqual(source_graph_digest(ir), basis)
        self.assertTrue(any(n.get('runtime_branch_outcomes') is not None for n in ir['nodes']))
        next(n for n in ir['nodes'] if n.get('operator') == 'softmax')['arguments']['kwargs']['dim'] = 0
        self.assertIn('semantic certificates refer to a different source graph', validate_ir(seal(ir))['errors'])

    def test_unique_module_association_keeps_each_run_call_and_tensor_metadata(self):
        ir = self.merged()
        idx = ir['observation_index']
        association = next(a for a in idx['module_associations'] if a['path'] == 'first.a')
        self.assertEqual(len(association['observations']), 4)
        for o in association['observations']:
            run = ir['runtime']['runs'][o['run']]
            self.assertEqual((o['case'], o['mode']), (run['case'], run['mode']))
            self.assertIn('outputs', o)
            self.assertEqual(o['inputs'][0]['slot'], 'x')
        self.assertFalse(ir['coverage']['complete'])

    def test_same_path_and_class_with_multiple_static_calls_stays_ambiguous(self):
        source = analyze(SOURCE, 'ForeignComposition')
        original = next(n for n in source['nodes'] if n.get('module_path') == 'first.a')
        duplicate = copy.deepcopy(original)
        duplicate['id'] = 'synthetic-second-source-invocation'
        source['nodes'].append(duplicate)
        # Construction of this synthetic graph needs fresh certificates.
        source.pop('semantic_contracts', None)
        source.pop('semantic_contract_basis', None)
        ir = self.merged(source=seal(source))
        idx = ir['observation_index']
        self.assertFalse(any(a['path'] == 'first.a' for a in idx['module_associations']))
        calls = [a for a in idx['unmatched_calls'] if a['path'] == 'first.a']
        self.assertEqual(len(calls), 4)
        self.assertTrue(all(a['reason'] == 'ambiguous-static-invocation' for a in calls))

    def test_repeated_trace_maps_all_original_nodes_without_claiming_equal_values(self):
        receipt = self.receipt()
        receipt['runs'] = [copy.deepcopy(receipt['runs'][0]) for _ in range(2)]
        receipt['runs'][1]['case'] = 'synthetic-equivalent-trace'
        ir = self.merged(receipt)
        group, = ir['observation_index']['trace_groups']
        self.assertEqual(len(group['runs']), 2)
        self.assertIn('equal tensor values or shapes', group['not_asserted'])
        for row in group['node_correspondences']:
            expected = {n['id'] for n in ir['nodes'] if n['id'].startswith(f"runtime:{row['run']}:")}
            self.assertEqual(set(row['mapping']), expected)
            self.assertEqual(len(set(row['mapping'].values())), len(expected))
        mapping = group['node_correspondences'][1]['mapping']
        # Original run and call hierarchy are still present, not replaced by
        # connections between unrelated executions.
        self.assertEqual(mapping['runtime:1:call0'], 'runtime:0:call0')
        self.assertTrue(any(n['id'] == 'runtime:1:call0' for n in ir['nodes']))

    def test_mode_branch_mutation_slot_and_dtype_differences_remain_variants(self):
        def branch(run):
            run['branches'][0]['outcome'] = 'false' if run['branches'][0]['outcome'] == 'true' else 'true'

        def slot(run):
            event = next(e for e in run['events'] if e['inputs'])
            event['inputs'][0]['slot'] = 'different-slot'

        def dtype(run):
            next(e for e in run['events'] if e['outputs'])['outputs'][0]['dtype'] = 'torch.float64'

        for change in [lambda r: r.update(mode='train'), branch, slot, dtype,
                       lambda r: r['events'][0].update(mutable=True), lambda r: r.update(truncated=True)]:
            with self.subTest(change=change):
                receipt = self.receipt()
                receipt['runs'] = [copy.deepcopy(receipt['runs'][0]) for _ in range(2)]
                change(receipt['runs'][1])
                ir = self.merged(receipt)
                self.assertEqual(len(ir['observation_index']['trace_groups']), 2)

    def test_broken_observation_references_are_rejected(self):
        ir = self.merged()
        ir['observation_index']['module_associations'][0]['observations'][0]['call'] = 'runtime:99:missing'
        self.assertFalse(validate_ir(seal(ir))['ok'])

    def test_recorded_shared_alias_paths_do_not_identify_a_static_invocation(self):
        receipts = json.loads((ROOT / 'tests/semantic_fixtures/sequence-receipts.json').read_text())['receipts']
        source = ROOT / 'tests/semantic_fixtures/module_sequences.py'
        for entry in ['SharedStack', 'IndependentStack']:
            with self.subTest(entry=entry):
                ir = merge(analyze(source, entry), copy.deepcopy(receipts[entry]))
                self.assertTrue(validate_ir(ir)['ok'])
                group, = ir['observation_index']['trace_groups']
                self.assertEqual(len(group['runs']), 2)
                calls = ir['observation_index']['module_associations']
                if entry == 'SharedStack':
                    self.assertFalse(any(a['path'].startswith('units.') for a in calls))
                    self.assertTrue(all(len(a['candidates']) == 3 for a in ir['observation_index']['unmatched_calls']))
                    self.assertTrue(all(len(p['aliases']) == 3 for p in receipts[entry]['runs'][0]['parameters']))
                else:
                    self.assertEqual(len(calls), 10)
                    self.assertTrue(all(len(p['aliases']) == 1 for p in receipts[entry]['runs'][0]['parameters']))
        ir = self.merged()
        ir['observation_index']['trace_groups'][0]['node_correspondences'][0]['mapping'].clear()
        self.assertFalse(validate_ir(seal(ir))['ok'])


if __name__ == '__main__':
    unittest.main()

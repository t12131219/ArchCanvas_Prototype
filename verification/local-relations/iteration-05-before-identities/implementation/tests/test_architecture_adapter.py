"""Extraction/CPU contracts needed by the architecture projection."""
import copy
import json
import os
import subprocess
import sys
from pathlib import Path
import unittest
from semantic_adapter.analyzer import analyze
from semantic_adapter.merge import merge
from semantic_adapter.schema import validate_ir

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tests/semantic_fixtures/composed_models.py'


class ArchitectureAdapterTests(unittest.TestCase):
    def test_configuration_case_snapshots_match_static_source(self):
        cases = json.loads((ROOT / 'tests/semantic_fixtures/configuration-ir.json').read_text())['cases']
        source = ROOT / 'tests/semantic_fixtures/configuration_composition.py'
        def comparable(ir):
            value = copy.deepcopy(ir)
            value.pop('ir_digest', None)
            value['entry']['file'] = source.name
            for item in value['sources']:
                item['path'] = item['physical'] = source.name
            for node in value['nodes']:
                for item in node['source']:
                    item['file'] = source.name
            return value
        for name, expected in cases.items():
            with self.subTest(entry=name):
                actual = analyze(source, name)
                self.assertTrue(validate_ir(actual)['ok'])
                self.assertEqual(comparable(actual), comparable(expected))

    def test_shape_composition_preserves_literal_math_and_unknown_fusion(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/configuration_composition.py', 'ShapeDrivenFusion')
        self.assertTrue(validate_ir(ir)['ok'])
        literal = next(n for n in ir['nodes'] if n['source'][0]['expression'] == '4 * 2')
        self.assertEqual(literal['kind'], 'compute')
        view = next(n for n in ir['nodes'] if n.get('function_target', '').endswith('.view'))
        self.assertEqual(view['arguments']['args'], [-1, 8])
        self.assertTrue(any(e['source'] == literal['id'] and e['target'] == view['id'] and e['target_port'] == 'arg:1' for e in ir['edges']))
        self.assertEqual([n['label'] for n in ir['nodes'] if n['kind'] == 'opaque'], ['unfamiliar_fusion'])
        self.assertFalse(ir['runtime']['model_executed'])

    def test_gated_mixture_keeps_framework_calls_products_and_unknown_output(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/gated_composition.py', 'GatedMixture')
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertEqual(sum(n.get('operator') == 'mult' for n in ir['nodes']), 2)
        self.assertEqual(sum(n.get('operator') == 'add' for n in ir['nodes']), 1)
        self.assertTrue(any(n.get('operator') == 'rnn' for n in ir['nodes']))
        self.assertTrue(any(n.get('framework_type', '').endswith('TransformerEncoderLayer') for n in ir['nodes']))
        self.assertEqual([n['label'] for n in ir['nodes'] if n['kind'] == 'opaque'], ['unfamiliar_kernel'])
        self.assertFalse(ir['runtime']['model_executed'])

    def test_local_convolution_does_not_replace_loop_or_conditional_source_contracts(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'ScopedConvolution')
        self.assertTrue(validate_ir(ir)['ok'])
        loop = next(n for n in ir['nodes'] if n['label'] == 'loop body (source template)')
        self.assertEqual(loop['semantic_type'], 'loop-template')
        branch = next(n for n in ir['nodes'] if n['kind'] == 'composite' and n.get('condition'))
        self.assertEqual(branch['semantic_type'], 'conditional-region')
        blocks = [n for n in ir['nodes'] if n.get('semantic_type') == 'CNN block']
        self.assertEqual({n['parent'] for n in blocks}, {loop['id'], branch['id']})
        self.assertFalse(ir['runtime']['model_executed'])

    def test_wide_source_branches_keep_eight_calls_and_unknown_kernels_separate(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'WideBranches')
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertEqual(len([n for n in ir['nodes'] if n.get('framework_type') == 'torch.nn.Linear']), 9)
        self.assertEqual({n['label'] for n in ir['nodes'] if n['kind'] == 'opaque'}, {'unfamiliar_kernel', 'another_kernel'})
        self.assertEqual(next(n for n in ir['nodes'] if n['parent'] is None)['semantic_type'], 'source-module')
        packed = next(n for n in ir['nodes'] if n.get('operator') == 'structure')
        self.assertEqual({e['target_port'] for e in ir['edges'] if e['target'] == packed['id']}, set(map(str, range(8))))
        self.assertFalse(ir['runtime']['model_executed'])

    def test_mixed_unfamiliar_branch_model_preserves_framework_calls_and_unknown_kernel(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'BranchMosaic')
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertEqual([n.get('operator') for n in ir['nodes'] if n['kind'] == 'opaque'], ['unfamiliar_kernel'])
        self.assertTrue({'encoder-layer', 'rnn', 'linear'} <= {n.get('operator') for n in ir['nodes']})
        self.assertTrue(any(n.get('module_path') == 'branches.middle' for n in ir['nodes']))
        branches = next(n for n in ir['nodes'] if n.get('module_path') == 'branches')
        self.assertEqual(branches['semantic_type'], 'source-module')
        self.assertFalse(ir['runtime']['model_executed'])
        self.assertFalse(ir['coverage']['complete'])

    def test_feedforward_container_name_requires_the_whole_local_computation_path(self):
        fixture = ROOT / 'tests/semantic_fixtures/local_composition.py'
        straight = analyze(fixture, 'StraightHead')
        self.assertEqual(next(n for n in straight['nodes'] if n['parent'] is None)['semantic_type'], 'MLP / feed-forward')
        side = analyze(fixture, 'HeadWithSideWork')
        self.assertEqual(next(n for n in side['nodes'] if n['parent'] is None)['semantic_type'], 'source-module')
        branched = analyze(ROOT / 'tests/semantic_fixtures/models.py', 'BranchMLP')
        self.assertEqual(next(n for n in branched['nodes'] if n['parent'] is None)['semantic_type'], 'source-module')

    def test_nested_sequential_keeps_local_partial_module_and_constructor_configuration(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'NestedPipeline')
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertFalse(any(n['kind'] == 'opaque' for n in ir['nodes']))
        local = next(n for n in ir['nodes'] if n.get('module_path') == 'layers.1')
        self.assertEqual(local['constructor'], {'width': 8})
        self.assertTrue(any(n.get('module_path') == 'layers.2.1' for n in ir['nodes']))
        self.assertTrue(any(n.get('framework_type') == 'torch.nn.Tanh' for n in ir['nodes']))
        linear = next(n for n in ir['nodes'] if n.get('module_path') == 'layers.0')
        self.assertEqual(linear['constructor']['args'], [8, 8])
        self.assertFalse(any(n.get('operator') in ('lstm', 'encoder') for n in ir['nodes']))

    def test_chained_receiver_and_slice_dependencies_are_preserved_without_fake_opaque_syntax(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'NestedPipeline')
        view = next(n for n in ir['nodes'] if n.get('operator') == 'reshape')
        self.assertTrue(any(e['target'] == view['id'] and e['target_port'] == 'receiver' for e in ir['edges']))
        selector = next(n for n in ir['nodes'] if n.get('operator') == 'getitem')
        self.assertEqual(selector['selector'], '(:, -1:)')
        self.assertTrue(any(e['source'] == view['id'] and e['target'] == selector['id'] for e in ir['edges']))
        self.assertFalse(any(n.get('operator') == 'unary' for n in ir['nodes']))

    def test_only_single_return_constructor_factories_expand_and_keep_both_source_locations(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'FactoryPipeline')
        conv = next(n for n in ir['nodes'] if n.get('operator') == 'convolution')
        self.assertEqual(conv['constructor_factory'], 'make_conv')
        self.assertEqual(conv['constructor']['args'], [3, 8, 3])
        self.assertEqual(conv['constructor']['kwargs']['stride'], 1)
        self.assertEqual(len(conv['source']), 2)
        self.assertTrue(any(n['kind'] == 'opaque' and n.get('operator') == 'dynamic_factory' for n in ir['nodes']))
        explicit = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'ExplicitForward')
        self.assertTrue(any(n.get('module_path') == 'fragment' and n['kind'] == 'composite' for n in explicit['nodes']))

    def test_overloaded_maximum_does_not_claim_reduction_without_type_evidence(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'OverloadedMaximum')
        maximum = next(n for n in ir['nodes'] if n.get('function_target') == 'torch.max')
        self.assertEqual(maximum['operator'], 'maximum-or-reduction')
        self.assertEqual(len([e for e in ir['edges'] if e['target'] == maximum['id']]), 2)

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

    def test_nested_lstm_destructuring_keeps_exact_producer_slots_and_structure_kind(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'NestedState')
        cell = next(n for n in ir['nodes'] if n.get('operator') == 'lstm')
        aliases = {n['id']: n for n in ir['nodes'] if n['kind'] == 'value-alias'}
        slots = {e['source_port'] for e in ir['edges']
                 if e['source'] == cell['id'] and e['target'] in aliases}
        self.assertEqual(slots, {'0', '1.0', '1.1'})
        packed = next(n for n in ir['nodes'] if n.get('operator') == 'structure')
        self.assertEqual(packed['structure_kind'], 'dict')

    def test_literal_arguments_and_explicit_source_class_are_static_evidence(self):
        ir = analyze(SOURCE, 'ForeignComposition')
        transpose = next(n for n in ir['nodes']
                         if n.get('function_target', '').endswith('.transpose'))
        self.assertEqual(transpose['arguments']['args'], [-2, -1])
        softmax = next(n for n in ir['nodes'] if n.get('operator') == 'softmax')
        self.assertEqual(softmax['arguments']['kwargs']['dim'], -1)
        fragment = next(n for n in ir['nodes'] if n.get('module_path') == 'piece')
        self.assertEqual(fragment['source_class'], 'BrokenCell')
        self.assertFalse(ir['runtime']['model_executed'])

    def test_read_caches_do_not_create_conditional_assignments_or_loop_carried_values(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'ReadOnlyControl')
        self.assertFalse(any(n.get('operator') == 'phi' for n in ir['nodes']))
        joins = [n['label'] for n in ir['nodes'] if n.get('reason') == 'iteration-binding-unresolved']
        self.assertEqual(joins, ['i · loop-carried value'])
        self.assertTrue(any(n['label'] == 'self.training' for n in ir['nodes']))
        self.assertTrue(any(n['label'] == 'x.dtype' for n in ir['nodes']))

    def test_actual_conditional_and_loop_writes_retain_both_source_alternatives(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'WrittenControl')
        phis = [n for n in ir['nodes'] if n.get('operator') == 'phi']
        self.assertEqual([n['label'] for n in phis], ['y · branch join'])
        incoming = [e for e in ir['edges'] if e['target'] == phis[0]['id']]
        self.assertEqual({e['condition']['outcome'] for e in incoming}, {'true', 'false'})
        joins = [n['label'] for n in ir['nodes'] if n.get('reason') == 'iteration-binding-unresolved']
        self.assertEqual(joins, ['i · loop-carried value'])
        loop = next(n for n in ir['nodes'] if n.get('iteration_contract'))
        binding, = loop['iteration_contract']['bindings']
        self.assertEqual(binding['name'], 'y')
        self.assertEqual(binding['initial'], phis[0]['id'])
        self.assertTrue(any(e['target'] == binding['entry'] and e['target_port'] == 'backedge' for e in ir['edges']))

    def test_rebinding_invalidates_attribute_cache_and_annotation_only_does_not_assign(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'VersionedReads')
        reads = [n for n in ir['nodes'] if n.get('operator') == 'attribute' and n['label'] == 'x.shape']
        self.assertEqual(len(reads), 2)
        producers = [next(e['source'] for e in ir['edges'] if e['target'] == n['id']) for n in reads]
        self.assertNotEqual(*producers)
        self.assertFalse(any(n['label'] == 'annotation_only' for n in ir['nodes']))
        self.assertFalse(ir['runtime']['model_executed'])

    def test_merges_invalidate_pre_branch_and_pre_loop_attribute_generations(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'MergedReads')
        reads = [n for n in ir['nodes'] if n.get('operator') == 'attribute' and n['label'] == 'x.shape']
        self.assertEqual(len(reads), 3)
        sources = [next(e['source'] for e in ir['edges'] if e['target'] == n['id']) for n in reads]
        self.assertEqual(len(set(sources)), 3)
        by = {n['id']: n for n in ir['nodes']}
        self.assertEqual(by[sources[1]]['operator'], 'phi')
        self.assertEqual(by[sources[2]]['role'], 'iteration-exit')
        loop = next(n for n in ir['nodes'] if n.get('iteration_contract'))
        self.assertEqual(loop['iteration_contract']['bindings'][0]['exit'], sources[2])

    def test_merge_order_and_digest_are_stable_across_python_hash_seeds(self):
        code = ("from semantic_adapter.analyzer import analyze; "
                "print(analyze('tests/semantic_fixtures/local_composition.py', 'MergedReads')['ir_digest'])")
        digests = [subprocess.check_output([sys.executable, '-c', code], cwd=ROOT,
                    env=dict(os.environ, PYTHONHASHSEED=str(seed)), text=True).strip()
                   for seed in (1, 2, 11)]
        self.assertEqual(len(set(digests)), 1)

    def test_inplace_effect_updates_direct_aliases_and_invalidates_cached_properties(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'DirectMutation')
        effect = next(n for n in ir['nodes'] if n.get('function_target') == 'alias.masked_fill_')
        self.assertTrue(effect['mutable'])
        reads = [n for n in ir['nodes'] if n['label'] == 'x.shape']
        self.assertEqual(len(reads), 2)
        self.assertTrue(any(e['source'] == effect['id'] and e['target'] == reads[1]['id'] for e in ir['edges']))
        packed = next(n for n in ir['nodes'] if n.get('operator') == 'structure')
        returned_slots = {e['target_port'] for e in ir['edges'] if e['source'] == effect['id'] and e['target'] == packed['id']}
        self.assertEqual(returned_slots, {'0', '1'})
        self.assertIn('mutation-alias-coverage-unresolved', {b['kind'] for b in ir['coverage_blockers']})
        self.assertTrue(validate_ir(ir)['ok'])

    def test_subscript_writes_keep_index_value_old_storage_and_control_joins(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'IndexedMutation')
        stores = [n for n in ir['nodes'] if n.get('operator') == 'setitem']
        self.assertEqual(len(stores), 2)
        for store in stores:
            self.assertEqual(store['kind'], 'opaque')
            self.assertTrue(store['mutable'])
            ports = {e['target_port'] for e in ir['edges'] if e['target'] == store['id']}
            self.assertEqual(ports, {'destination', 'previous', 'value'})
        self.assertTrue(any(n.get('operator') == 'phi' and n['label'] == 'x · branch join' for n in ir['nodes']))
        self.assertTrue(any(n['label'] == 'x · loop-carried value' for n in ir['nodes']))
        index = next(n for n in ir['nodes'] if n.get('role') == 'input' and n['label'] == 'index')
        self.assertTrue(any(e['source'] == index['id'] and e['target_port'].startswith('index:') for e in ir['edges']))

    def test_module_reads_keep_constructor_identity_but_writes_invalidate_it(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'ReboundModule')
        linear = [n for n in ir['nodes'] if n.get('framework_type') == 'torch.nn.Linear']
        self.assertEqual(len(linear), 1)
        rebound = [n for n in ir['nodes'] if n.get('reason') == 'rebound-call-target']
        self.assertEqual(len(rebound), 2)
        for call in rebound:
            self.assertEqual(call['kind'], 'opaque')
            self.assertTrue(any(e['target'] == call['id'] and e['target_port'] == 'callable' for e in ir['edges']))
        state = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'ReboundTensorState')
        method = next(n for n in state['nodes'] if n.get('function_target') == 'self.value.unsqueeze')
        self.assertEqual(method['kind'], 'compute')
        self.assertTrue(any(e['target'] == method['id'] and e['target_port'] == 'receiver' for e in state['edges']))

    def test_inplace_module_and_augmented_assignment_are_effect_barriers(self):
        for entry, operator in [('InplaceActivation', 'activation'), ('AugmentedMutation', 'augmented-write')]:
            ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', entry)
            effect = next(n for n in ir['nodes'] if n.get('operator') == operator and n.get('mutable'))
            self.assertTrue(any(e['source'] == effect['id'] and e['target_port'] == '1' for e in ir['edges']))
            self.assertFalse(ir['coverage']['complete'])
            self.assertFalse(ir['runtime']['model_executed'])

    def test_chained_view_mutation_reports_unresolved_storage_aliases(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'ChainedMutation')
        effect = next(n for n in ir['nodes'] if n.get('mutable'))
        self.assertEqual(effect['kind'], 'opaque')
        self.assertEqual(effect['reason'], 'unresolved-mutation-receiver')
        self.assertIn('unresolved', effect['effect_scope'])
        self.assertIn('unresolved-mutation-receiver', {b['kind'] for b in ir['coverage_blockers']})
        self.assertFalse(ir['coverage']['complete'])

    def test_sequential_inplace_children_do_not_lose_effect_boundaries(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'SequentialMutation')
        activation = next(n for n in ir['nodes'] if n.get('framework_type') == 'torch.nn.ReLU')
        self.assertTrue(activation['mutable'])
        self.assertIn('sequential-mutation-alias-unresolved', {b['kind'] for b in ir['coverage_blockers']})
        self.assertFalse(ir['coverage']['complete'])

    def test_shared_result_fusion_preserves_two_consumers_and_unknown_kernel(self):
        ir = analyze(ROOT / 'tests/semantic_fixtures/local_composition.py', 'WovenFusion')
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertEqual(sum(n['kind'] == 'opaque' for n in ir['nodes']), 1)
        self.assertEqual(sum(n.get('framework_type') == 'torch.nn.Linear' and n['kind'] == 'compute' for n in ir['nodes']), 6)
        for label in ['a0', 'a1', 'a2', 'b0', 'b1', 'b2']:
            alias = next(n for n in ir['nodes'] if n['kind'] == 'value-alias' and n['label'] == label)
            self.assertEqual(len([e for e in ir['edges'] if e['source'] == alias['id']]), 2)
        self.assertFalse(ir['coverage']['complete'])

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

"""Source refactoring cannot change a proved chain or erase its boundaries."""
import copy
from pathlib import Path
import tempfile
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.contracts import Contracts
from semantic_adapter.schema import seal, validate_ir

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tests/semantic_fixtures/helper_contracts.py'


class HelperContractTests(unittest.TestCase):
    def get(self, entry):
        ir = analyze(SOURCE, entry)
        self.assertTrue(validate_ir(ir)['ok'])
        self.assertFalse(ir['runtime']['model_executed'])
        return ir, [c for c in ir.get('semantic_contracts', []) if c['rule'] == 'feed-forward']

    def test_inline_wrapped_and_separately_wrapped_phases_share_the_same_proved_operations(self):
        for entry in ['InlineChain', 'WrappedChain', 'SplitChain']:
            with self.subTest(entry=entry):
                ir, certificates = self.get(entry)
                cert, = certificates
                by = {n['id']: n for n in ir['nodes']}
                self.assertEqual([by[cert['roles'][r]]['operator'] for r in ['input_projection', 'activation', 'output_projection']], ['linear', 'activation', 'linear'])
                self.assertEqual({by[cert['roles'][r]]['module_path'] for r in ['input_projection', 'activation', 'output_projection']}, {'start', 'middle', 'finish'})
                self.assertIn('arbitrary-input execution coverage', cert['not_asserted'])

    def test_entire_chain_in_one_child_does_not_relabel_its_outer_wrapper(self):
        ir, certificates = self.get('NestedChain')
        cert, = certificates
        root = next(n for n in ir['nodes'] if n['parent'] is None)
        self.assertNotEqual(cert['node'], root['id'])
        self.assertEqual(next(n for n in ir['nodes'] if n['id'] == cert['node'])['source'][0]['symbol'], 'core')

    def test_unknown_condition_mutation_escape_and_disconnected_work_reject_whole_scope(self):
        for entry in ['UnknownChain', 'ConditionalChain', 'MutableChain', 'EscapingChain', 'DisconnectedChain']:
            with self.subTest(entry=entry):
                ir, certificates = self.get(entry)
                self.assertFalse(certificates)
                self.assertGreater(len(ir['nodes']), 5)

    def test_result_slots_duplicate_operands_and_side_effect_links_are_not_transparent(self):
        original, _ = self.get('WrappedChain')
        for mutation in ['slot', 'duplicate', 'state', 'condition', 'inplace']:
            with self.subTest(mutation=mutation):
                ir = copy.deepcopy(original)
                last = next(n for n in ir['nodes'] if n.get('module_path') == 'finish' and n['kind'] == 'compute')
                edge = next(e for e in ir['edges'] if e['target'] == last['id'] and e['kind'] == 'data')
                if mutation == 'slot': edge['source_port'] = '1'
                elif mutation == 'duplicate': ir['edges'].append({**edge, 'id': 'duplicate'})
                elif mutation == 'state': ir['edges'].append({**edge, 'kind': 'state-write', 'id': 'write'})
                elif mutation == 'condition': edge['condition'] = {'branch': 'guard', 'outcome': 'true'}
                else: next(n for n in ir['nodes'] if n.get('operator') == 'activation')['constructor'] = {'args': [], 'kwargs': {'inplace': True}}
                self.assertFalse([c for c in Contracts(ir).run() if c['rule'] == 'feed-forward'])

    def test_shared_parameters_keep_distinct_invocations_and_cannot_imply_independence(self):
        ir, certificates = self.get('SharedChain')
        cert, = certificates
        self.assertNotEqual(cert['roles']['input_projection'], cert['roles']['output_projection'])
        linears = [n for n in ir['nodes'] if n.get('operator') == 'linear']
        self.assertEqual(len(linears), 2)
        self.assertEqual(len({n['module_identity'] for n in linears}), 1)
        self.assertEqual({n['module_path'] for n in linears}, {'shared'})
        self.assertIn('independent projection parameters', cert['not_asserted'])

    def test_certificate_follows_all_source_members_and_exact_cross_helper_cuts(self):
        ir, certificates = self.get('SplitChain')
        cert, = certificates
        scope = set(cert['members'])
        self.assertEqual(scope, {n['id'] for n in ir['nodes']})
        self.assertEqual(cert['edges'], [e['id'] for e in ir['edges'] if e['source'] in scope or e['target'] in scope])
        source_proof = cert['source_chain']
        self.assertEqual(source_proof['operations'], [cert['roles'][r] for r in ['input_projection', 'activation', 'output_projection']])
        self.assertEqual(len(source_proof['helpers']), 3)
        for helper in source_proof['helpers']:
            members = set(helper['members'])
            self.assertEqual(helper['cuts'], [e['id'] for e in ir['edges'] if (e['source'] in members) != (e['target'] in members)])

    def test_all_local_names_can_change_without_losing_proof(self):
        text = SOURCE.read_text()
        for a, b in [('WrappedChain', 'ForeignCircuit'), ('bridge', 'unfamiliar'), ('self.start', 'self.a'), ('self.middle', 'self.b'), ('self.finish', 'self.c')]:
            text = text.replace(a, b)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'renamed.py'; file.write_text(text)
            ir = analyze(file, 'ForeignCircuit')
            cert, = [c for c in ir.get('semantic_contracts', []) if c['rule'] == 'feed-forward']
            self.assertEqual(cert['rule'], 'feed-forward')

    def test_a_sealed_forged_witness_or_role_is_rejected_without_mutating_the_graph(self):
        original, _ = self.get('SplitChain')
        for mutation in ['operation', 'cut', 'membership', 'role']:
            with self.subTest(mutation=mutation):
                ir = copy.deepcopy(original)
                cert = next(c for c in ir['semantic_contracts'] if c['rule'] == 'feed-forward')
                if mutation == 'operation': cert['source_chain']['operations'].reverse()
                elif mutation == 'cut': cert['source_chain']['helpers'][0]['cuts'].pop()
                elif mutation == 'membership': cert['source_chain']['helpers'][0]['members'].pop()
                else: cert['roles']['activation'] = cert['roles']['input_projection']
                seal(ir)
                before = copy.deepcopy(ir)
                self.assertFalse(validate_ir(ir)['ok'])
                self.assertEqual(ir, before)


if __name__ == '__main__':
    unittest.main()

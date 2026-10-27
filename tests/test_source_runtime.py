"""The bridge is invocation/operand evidence, not source-line equivalence."""
import copy
import json
from pathlib import Path
import unittest
from semantic_adapter.source_runtime import build_index
from semantic_adapter.schema import seal, validate_ir, source_graph_digest

FIXTURE = Path(__file__).resolve().parents[1]/'verification/source-runtime-integration/preflight/assisted.json'

class SourceRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.ir = json.loads(FIXTURE.read_text())
    def test_real_receipt_indexes_each_run_without_rewriting_source(self):
        before = copy.deepcopy(self.ir)
        index = build_index(self.ir)
        self.assertEqual(len(index['regions']), 4)
        self.assertEqual(self.ir, before)
        for region in index['regions']:
            self.assertEqual(region['inputs'][0]['argument_port'], 'arg:0')
            self.assertEqual(region['output']['source_port'], '0')
            self.assertTrue(region['static_unknown_preserved'])
        self.assertEqual(source_graph_digest(self.ir), index['source_graph_digest'])
    def test_failed_truncated_mutating_and_unreplayed_runs_do_not_integrate(self):
        for patch in [{'status':'failed'}, {'truncated':True}, {'replay':{'matched':False}}]:
            ir=copy.deepcopy(self.ir);ir['runtime']['runs'][0].update(patch)
            self.assertFalse(any(r['run']==0 for r in build_index(ir)['regions']))
        ir=copy.deepcopy(self.ir);ir['runtime']['runs'][0]['events'][0]['mutable']=True
        self.assertFalse(any(r['run']==0 for r in build_index(ir)['regions']))
    def test_no_fusion_from_missing_positions_or_structured_return(self):
        for field in ['positions', 'output', 'argument']:
            ir=copy.deepcopy(self.ir);run=ir['runtime']['runs'][0]
            call=next(v for v in run['module_events'] if v['event']=='enter' and v['path']=='projection')
            exit=next(v for v in run['module_events'] if v['event']=='exit' and v['path']=='projection')
            if field=='positions':call['source_stack'][0].pop('column')
            elif field=='output':exit['output_is_tensor']=False
            else:call['input_bindings'][0]['port']='kw:unbound'
            self.assertFalse(any(r['run']==0 for r in build_index(ir)['regions']))
    def test_generation_and_constructor_mismatch_cannot_bridge(self):
        for field in ['source', 'constructor']:
            ir=copy.deepcopy(self.ir)
            if field=='source':ir['runtime']['binding']['source_generation']={}
            else:ir['runtime']['input_spec']['constructor']={'width':8}
            self.assertFalse(build_index(ir)['regions'])
    def test_unique_span_is_required_even_with_multiple_calls_on_one_line(self):
        ir=copy.deepcopy(self.ir)
        n=copy.deepcopy(next(n for n in ir['nodes'] if n['id']==ir['source_runtime_index']['regions'][0]['source']))
        n['id']+=':another-call';ir['nodes'].append(n)
        self.assertFalse(build_index(ir)['regions'])
    def test_resealed_but_corrupted_bridge_index_is_invalid(self):
        ir=copy.deepcopy(self.ir);ir['source_runtime_index']=build_index(ir)
        self.assertTrue(validate_ir(seal(ir))['ok'])
        ir['source_runtime_index']['regions'][0]['inputs'][0]['argument_port']='arg:99'
        result=validate_ir(seal(ir));self.assertFalse(result['ok'])
        self.assertIn('invalid source-runtime integration evidence',result['errors'])

if __name__=='__main__':unittest.main()

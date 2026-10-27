import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from semantic_adapter.analyzer import analyze
from semantic_adapter.probe_assistance import assist
from semantic_adapter.schema import digest, seal, source_graph_digest, validate_ir

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/semantic_fixtures/probe_dynamic.py'


class ProbeAssistanceTests(unittest.TestCase):
    def setUp(self):
        self.ir = analyze(FIXTURE, 'DynamicGate')
        self.spec = {'schema': 'semantic-inputs/1', 'constructor': {}, 'modes': ['eval'],
                     'cases': [{'id': 'one', 'inputs': {'x': {'shape': [1, 4]}}}]}

    def call(self, ir=None, **kwargs):
        return assist(ir or self.ir, '/explicit/environment/bin/python', str(FIXTURE.parent), self.spec, **kwargs)

    def receipt(self):
        node = next(n for n in self.ir['nodes'] if n['kind'] == 'opaque' and n.get('operator') == 'operation')
        line = node['source'][0]['line']
        return {'schema': 'semantic-runtime/1', 'status': 'passed', 'model_executed': True,
                'binding': {'source_root': str(FIXTURE.parent), 'source_sha256': digest(FIXTURE.read_bytes()),
                            'source_generation': {FIXTURE.name: digest(FIXTURE.read_bytes())}, 'spec_digest': digest(self.spec)},
                'input_spec': self.spec, 'source_unchanged': True, 'isolation': {'status': 'passed'},
                'trace_digest': 'test-fixture-receipt', 'finite_domain': {'exhaustive': False},
                'runs': [{'case': 'one', 'mode': 'eval', 'status': 'passed', 'truncated': False,
                          'replay': {'matched': True}, 'branches': [],
                          'module_events': [{'event': 'enter', 'id': 'call0', 'path': 'projection',
                                             'module_type': 'torch.nn.modules.linear.Linear', 'parent_call': None}],
                          'events': [{'id': 'op0', 'operator': 'aten.addmm.default', 'module_call': 'call0',
                                      'source': {'file': FIXTURE.name, 'line': line, 'symbol': 'DynamicGate.forward'},
                                      'inputs': [{'id': 't0', 'producer': 'input:x', 'slot': 'out'}], 'outputs': [], 'mutable': False}]}]}

    def test_supplement_preserves_exact_static_graph_and_unknowns(self):
        before = copy.deepcopy(self.ir)
        with patch('semantic_adapter.probe_assistance.observe', return_value=self.receipt()) as observe:
            result = self.call()
        observe.assert_called_once()
        merged = result['ir']
        self.assertEqual(self.ir, before)
        self.assertEqual(source_graph_digest(merged), source_graph_digest(before))
        self.assertEqual({n['id'] for n in before['nodes'] if n['kind'] == 'opaque'},
                         {b['node'] for b in result['summary']['boundaries']})
        associated = [b for b in result['summary']['boundaries'] if b['observations']]
        self.assertTrue(associated)
        self.assertTrue(all(not b['resolved'] for b in associated))
        self.assertTrue(validate_ir(merged)['ok'])
        self.assertFalse(merged['coverage']['complete'])
        self.assertEqual(merged, json.loads(json.dumps(merged)))

    def test_unavailable_probe_is_a_receipt_not_a_resolution(self):
        receipt = self.receipt();receipt.pop('runs');receipt['status'] = 'unavailable';receipt['model_executed'] = False
        receipt['reason'] = 'isolation unavailable'
        with patch('semantic_adapter.probe_assistance.observe', return_value=receipt):
            result = self.call()
        self.assertEqual(result['ir']['nodes'], self.ir['nodes'])
        self.assertEqual(result['summary']['status'], 'unavailable')
        self.assertFalse(result['summary']['runs'])

    def test_changed_helper_is_rejected_before_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/'part.py').write_text('class Part:\n def forward(self,x): return x+x\n')
            (root/'entry.py').write_text('from part import Part\nclass Entry:\n def __init__(self): self.part=Part()\n def forward(self,x): return self.part(x)\n')
            ir = analyze(root/'entry.py', 'Entry', project_root=root)
            self.assertGreater(len(ir['sources']), 1)
            (root/'part.py').write_text('class Part:\n def forward(self,x): return x-x\n')
            with patch('semantic_adapter.probe_assistance.observe') as observe:
                with self.assertRaisesRegex(ValueError, '源码缺失或已变化'):
                    assist(ir, '/explicit/python', str(root), self.spec)
                observe.assert_not_called()

    def test_source_change_during_observation_does_not_attach(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder)/'model.py';file.write_bytes(FIXTURE.read_bytes())
            ir = analyze(file, 'DynamicGate')
            def change(*args):
                file.write_text(file.read_text()+'\n# changed\n')
                return self.receipt()
            with patch('semantic_adapter.probe_assistance.observe', side_effect=change):
                with self.assertRaisesRegex(ValueError, '源码缺失或已变化'):
                    assist(ir, '/explicit/python', folder, self.spec)

    def test_invalid_generation_configuration_and_repeated_runtime_never_execute(self):
        inputs=[]
        edited=copy.deepcopy(self.ir);edited['authoring']={'edited': True};inputs.append(seal(edited))
        factory=copy.deepcopy(self.ir);factory['analysis']={'entry_kind':'factory'};inputs.append(seal(factory))
        previous=copy.deepcopy(self.ir);previous['runtime']={'status':'passed'};inputs.append(seal(previous))
        forged=copy.deepcopy(self.ir);forged['title']='changed';inputs.append(forged)
        with patch('semantic_adapter.probe_assistance.observe') as observe:
            for ir in inputs:
                with self.subTest(ir=ir['title']), self.assertRaises(ValueError): self.call(ir)
            self.spec['constructor']={'width':9}
            with self.assertRaisesRegex(ValueError,'构造参数'): self.call()
            observe.assert_not_called()

    def test_missing_spec_environment_root_and_limits_never_execute(self):
        with patch('semantic_adapter.probe_assistance.observe') as observe:
            for interpreter,root,spec,timeout in [('',str(FIXTURE.parent),self.spec,45),
                ('/explicit/python','',self.spec,45),('/explicit/python',str(FIXTURE.parent),self.spec,0),
                ('/explicit/python',str(FIXTURE.parent),self.spec,91),('/explicit/python',str(FIXTURE.parent),{},45),
                ('/explicit/python','/tmp',self.spec,45)]:
                with self.subTest(root=root,timeout=timeout),self.assertRaises(ValueError):
                    assist(self.ir,interpreter,root,spec,timeout)
            observe.assert_not_called()


if __name__ == '__main__':
    unittest.main()

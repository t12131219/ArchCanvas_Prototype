import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import seal, validate_ir


def stack_source(elements):
    # Used by fixture builders, never executed by the analyzed program.
    return '''\nclass Stack(nn.Module):
    def __init__(self):
        super().__init__()
        self.parts = nn.ModuleList([''' + ', '.join(elements) + '''])
    def forward(self, x):
        for part in self.parts:
            x = part(x)
        return x
'''


FIXTURE = Path(__file__).parent / 'semantic_fixtures/symbolic_values.py'
ROOT = FIXTURE.parents[2]


class SymbolicValueTests(unittest.TestCase):
    def extract(self, elements, content=None):
        source = (content if content is not None else FIXTURE.read_text()) + stack_source(elements)
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'program.py'; file.write_text(source)
            ir = analyze(file, 'Stack')
        self.assertTrue(validate_ir(ir)['ok'], validate_ir(ir))
        contract, = [n['repeat_contract'] for n in ir['nodes'] if n.get('repeat_contract')]
        return ir, contract

    def test_shape_device_and_dtype_are_bound_operations_not_fabricated_values(self):
        ir, c = self.extract(['ShapeUnit()', 'RenamedShape()'])
        self.assertTrue(c['homogeneous'])
        reads = [n for n in ir['nodes'] if n.get('symbolic_value', {}).get('kind') == 'tensor-attribute']
        self.assertEqual(len(reads), 4)
        self.assertTrue(all('unresolved' in n['value'] for n in reads))
        self.assertTrue(all(any(e['id'] == n['symbolic_value']['edge'] and e['source'] == n['symbolic_value']['receiver'] for e in ir['edges']) for n in reads))
        self.assertFalse(ir['runtime']['model_executed'])

    def test_a_different_attribute_cannot_reuse_the_shape_representative(self):
        content = FIXTURE.read_text().replace('first, second, third = other.shape', 'first, second, third = other.dtype')
        _, c = self.extract(['ShapeUnit()', 'RenamedShape()'], content)
        self.assertFalse(c['homogeneous'])

    def test_resource_selection_and_configuration_survive_helper_arguments(self):
        ir, c = self.extract(['ResourceUnit(0.1)', 'ResourceUnit(0.1)'])
        self.assertTrue(c['homogeneous'])
        reads = [n for n in ir['nodes'] if n.get('module_resource')]
        self.assertEqual(len(reads), 2)
        self.assertTrue(all(n['symbolic_value']['kind'] == 'module-resource' for n in reads))
        _, c = self.extract(['ResourceUnit(0.1)', 'ResourceUnit(0.2)'])
        self.assertFalse(c['homogeneous'])

    def test_exception_exits_preserve_type_message_and_conditional_scope(self):
        _, c = self.extract(['ExitUnit()', 'ExitUnit()'])
        self.assertTrue(c['homogeneous'])
        exits = [o for o in c['structure']['instances'][0]['structure']['operations'] if 'exception_exit' in o['operation']]
        self.assertEqual(len(exits), 1); self.assertTrue(exits[0]['conditions'])
        content = FIXTURE.read_text().replace('class RenamedShape', 'class UnusedShape')
        content += '\nclass DifferentExit(nn.Module):\n    def forward(self, x: Tensor):\n        if x.dim() != 3:\n            raise ValueError("another message")\n        b, t, d = x.shape\n        return x.view(b, t, d)\n'
        _, different = self.extract(['ExitUnit()', 'DifferentExit()'], content)
        self.assertFalse(different['homogeneous'])
        self.assertTrue(all(r['status'] == 'proved' for r in different['structure']['instances']))

    def test_call_defaults_and_all_normal_return_alternatives_are_retained(self):
        _, c = self.extract(['ReturnUnit()', 'ReturnUnit()'])
        self.assertTrue(c['homogeneous'])
        ops = c['structure']['instances'][0]['structure']['operations']
        returns = [o for o in ops if 'normal_returns' in o['operation']]
        self.assertEqual(len(returns), 1); self.assertEqual(len(returns[0]['bindings']), 2)
        self.assertTrue(any('invocation_constant' in o['operation'] for o in ops))
        renamed = FIXTURE.read_text().replace('detailed', 'inspection_flag')
        _, other = self.extract(['ReturnUnit()', 'ReturnUnit()'], renamed)
        self.assertEqual(c['structure']['instances'][0]['fingerprint'], other['structure']['instances'][0]['fingerprint'])

    def test_conditional_tensor_contract_requires_both_alternatives(self):
        _, c = self.extract(['ConditionalTensor()', 'ConditionalTensor()'])
        self.assertTrue(c['homogeneous'])
        ir, c = self.extract(['PartialTensor()', 'PartialTensor()'])
        self.assertFalse(c['homogeneous'])
        self.assertFalse(any(n.get('symbolic_value', {}).get('kind') == 'tensor-attribute' for n in ir['nodes']))

    def test_custom_attributes_unknown_effects_and_mutation_do_not_share_representatives(self):
        for name in ['CustomAttribute', 'UnknownBeforeRead', 'MutableBeforeRead', 'ShadowedNamespace']:
            with self.subTest(name=name):
                _, c = self.extract([name + '()', name + '()'])
                self.assertFalse(c['homogeneous'])
                self.assertTrue(all(r['status'] == 'unresolved' for r in c['structure']['instances']))

    def test_shadowed_builtin_exception_and_cast_are_not_certified(self):
        content = FIXTURE.read_text() + '\ndef ValueError(message):\n    return mystery(message)\n'
        ir, c = self.extract(['ExitUnit()', 'ExitUnit()'], content)
        self.assertFalse(c['homogeneous'])
        self.assertFalse(any(n.get('exception_signature') for n in ir['nodes']))
        content = FIXTURE.read_text() + '\ndef float(value):\n    return mystery(value)\n'
        content += '\nclass CastUnit(nn.Module):\n    def forward(self, x: Tensor):\n        return x + float("-inf")\n'
        _, c = self.extract(['CastUnit()', 'CastUnit()'], content)
        self.assertFalse(c['homogeneous'])

    def test_stale_attribute_receiver_constant_and_exception_certificates_are_rejected(self):
        ir, _ = self.extract(['ShapeUnit()', 'ShapeUnit()'])
        altered = copy.deepcopy(ir); n = next(n for n in altered['nodes'] if n.get('symbolic_value', {}).get('kind') == 'tensor-attribute')
        n['attribute_name'] = 'dtype'; seal(altered); self.assertFalse(validate_ir(altered)['ok'])
        altered = copy.deepcopy(ir); n = next(n for n in altered['nodes'] if n.get('symbolic_value', {}).get('kind') == 'tensor-attribute')
        edge = next(e for e in altered['edges'] if e['id'] == n['symbolic_value']['edge']); edge['source_port'] = 'other'
        seal(altered); self.assertFalse(validate_ir(altered)['ok'])
        ir, _ = self.extract(['ReturnUnit()', 'ReturnUnit()']); n = next(n for n in ir['nodes'] if n.get('source_constant_input'))
        n['source_constant_input']['value'] = True; seal(ir); self.assertFalse(validate_ir(ir)['ok'])
        ir, _ = self.extract(['ExitUnit()', 'ExitUnit()']); n = next(n for n in ir['nodes'] if n.get('exception_signature'))
        n['exception_expression'] = 'ValueError("changed")'; seal(ir); self.assertFalse(validate_ir(ir)['ok'])

    def test_javascript_independently_rechecks_the_supported_symbolic_graphs(self):
        for elements in [['ShapeUnit()', 'RenamedShape()'], ['ResourceUnit()', 'ResourceUnit()'], ['ExitUnit()', 'ExitUnit()'], ['ReturnUnit()', 'ReturnUnit()']]:
            with self.subTest(elements=elements):
                ir, _ = self.extract(elements)
                command = "const fs=require('fs'),M=require('./tools/representative_atlas.cjs');const ir=JSON.parse(fs.readFileSync(0));const r=M.inspect(ir);console.log(JSON.stringify({diagnostics:r.diagnostics,sequences:r.sequences.map(s=>s.groups.map(g=>g.status))}));"
                result = subprocess.run(['node', '-e', command], cwd=ROOT, input=json.dumps(ir), text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                checked = json.loads(result.stdout); self.assertEqual(checked['diagnostics'], [])
                self.assertEqual(checked['sequences'], [['proved']])

    def test_dynamic_exception_arguments_are_required_dependencies(self):
        content = FIXTURE.read_text().replace("ValueError('rank must equal 3')", 'ValueError(x.shape)')
        ir, c = self.extract(['ExitUnit()', 'ExitUnit()'], content)
        self.assertTrue(c['homogeneous'])
        node = next(n for n in ir['nodes'] if n.get('exception_signature'))
        ir['edges'] = [e for e in ir['edges'] if e['target'] != node['id']]
        seal(ir); self.assertFalse(validate_ir(ir)['ok'])

    def test_mutating_a_framework_namespace_does_not_certify_its_constants(self):
        content = FIXTURE.read_text() + '\ntorch.float32 = 7\n'
        ir, c = self.extract(['ShapeUnit()', 'ShapeUnit()'], content)
        self.assertFalse(c['homogeneous'])
        self.assertFalse(any(n.get('symbolic_value', {}).get('kind') == 'framework-attribute' for n in ir['nodes']))

    def test_a_constructor_parameter_cannot_impersonate_the_framework_namespace(self):
        content = FIXTURE.read_text().replace('def __init__(self, probability=0.1):', 'def __init__(self, nn, probability=0.1):')
        ir, c = self.extract(['ResourceUnit(7)', 'ResourceUnit(7)'], content)
        self.assertFalse(c['homogeneous'])
        self.assertFalse(any(n.get('module_resource') for n in ir['nodes']))

    def test_javascript_rejects_stale_symbolic_and_interface_evidence(self):
        for name in ['ShapeUnit', 'ResourceUnit', 'ExitUnit', 'ReturnUnit']:
            with self.subTest(name=name):
                ir, _ = self.extract([name + '()', name + '()'])
                if name == 'ShapeUnit':
                    next(n for n in ir['nodes'] if n.get('symbolic_value', {}).get('kind') == 'tensor-attribute')['attribute_name'] = 'ndim'
                elif name == 'ResourceUnit':
                    next(n for n in ir['nodes'] if n.get('module_resource'))['resource_constructor']['args'] = [0.7]
                elif name == 'ExitUnit':
                    next(n for n in ir['nodes'] if n.get('exception_signature'))['exception_expression'] = 'TypeError("other")'
                else:
                    next(n for n in ir['nodes'] if n.get('source_constant_input'))['source_constant_input']['value'] = True
                command = "const fs=require('fs'),M=require('./tools/representative_atlas.cjs');const r=M.inspect(JSON.parse(fs.readFileSync(0)));console.log(JSON.stringify({diagnostics:r.diagnostics,sequences:r.sequences.length}));"
                result = subprocess.run(['node', '-e', command], cwd=ROOT, input=json.dumps(ir), text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                checked = json.loads(result.stdout); self.assertTrue(checked['diagnostics']); self.assertEqual(checked['sequences'], 0)

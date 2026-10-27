"""Independent unseen projects: source provenance and rejected identity guesses."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir


class ProjectBoundaryTests(unittest.TestCase):
    def project(self, files, entry='Model', constructor=None):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        for name, text in files.items():
            path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text)
        ir = analyze(root / 'entry.py', entry, constructor, project_root=root)
        self.assertTrue(validate_ir(ir)['ok'], validate_ir(ir))
        self.assertFalse(ir['runtime']['model_executed'])
        return root, ir

    def test_relative_reexport_alias_and_injected_module_keep_allocation_files(self):
        root, ir = self.project({
            'entry.py': 'from torch import nn\nfrom pkg import make as factory\nclass Model(nn.Module):\n def __init__(self):\n  self.part=factory(4)\n def forward(self,x):\n  return self.part(x)\n',
            'pkg/__init__.py': 'from .factory import make\n',
            'pkg/factory.py': 'from .parts import Shell as Unit\nfrom torch import nn\ndef make(width):\n core=nn.Linear(width,width)\n model=Unit(core)\n return model\n',
            'pkg/parts.py': 'from torch import nn\nclass Shell(nn.Module):\n def __init__(self,core):\n  self.core=core\n def forward(self,x):\n  return self.core(x)\n'})
        linear = [n for n in ir['nodes'] if n.get('operator') == 'linear']
        self.assertEqual(len(linear), 1)
        self.assertEqual(linear[0]['constructor']['args'], [4, 4])
        self.assertEqual(linear[0]['source'][0]['file'], str(root/'pkg/parts.py'))
        proof = linear[0]['module_binding']['construction_evidence']
        self.assertTrue(any(e['file'] == str(root/'pkg/factory.py') for e in proof))
        self.assertFalse([n for n in ir['nodes'] if n['kind']=='opaque'])
        self.assertEqual(len(ir['sources']),4)

    def test_same_class_names_and_framework_aliases_stay_lexical(self):
        _, ir = self.project({
            'entry.py': 'from torch import nn\nfrom left import Block as A\nfrom right import Block as B\nclass Model(nn.Module):\n def __init__(self):\n  self.a=A()\n  self.b=B()\n def forward(self,x):\n  return self.b(self.a(x))\n',
            'left.py': 'from torch import nn as layers\nclass Block(layers.Module):\n def __init__(self):\n  self.op=layers.Linear(3,3)\n def forward(self,x):\n  return self.op(x)\n',
            'right.py': 'from torch import nn as layers\nclass Block(layers.Module):\n def __init__(self):\n  self.op=layers.ReLU()\n def forward(self,x):\n  return self.op(x)\n'})
        self.assertEqual(sum(n.get('operator')=='linear' for n in ir['nodes']),1)
        self.assertEqual(sum(n.get('operator')=='activation' for n in ir['nodes']),1)

    def test_custom_call_overrides_forward_without_inventing_forward_execution(self):
        _, ir = self.project({'entry.py':'from torch import nn\nclass Model(nn.Module):\n def __call__(self,x):\n  return x+1\n def forward(self,x):\n  return unknown(x)\n'})
        self.assertEqual(ir['nodes'][0]['source'][0]['symbol'],'Model.__call__')
        self.assertFalse(any(n.get('operator')=='unknown' for n in ir['nodes']))

    def test_imported_helper_operands_and_file_ownership(self):
        root, ir = self.project({'entry.py':'from funcs import run\nclass Model:\n def forward(self,x,y):\n  return run(y,x)\n','funcs.py':'def run(a,b):\n return a-b\n'})
        helper=next(n for n in ir['nodes'] if n.get('semantic_type')=='source-function')
        self.assertEqual(helper['source'][0]['file'],str(root/'funcs.py'))
        inputs={n['label']:n['id'] for n in ir['nodes'] if n.get('parent')==ir['nodes'][0]['id'] and n.get('role')=='input'}
        args={n['label']:n['id'] for n in ir['nodes'] if n.get('parent')==helper['id'] and n.get('role')=='input'}
        self.assertTrue(any(e['source']==inputs['y'] and e['target']==args['a'] for e in ir['edges']))
        self.assertTrue(any(e['source']==inputs['x'] and e['target']==args['b'] for e in ir['edges']))

    def test_dynamic_factory_effects_do_not_certify_injected_identity(self):
        _, ir = self.project({'entry.py':'from torch import nn\nfrom factory import make\nclass Model(nn.Module):\n def __init__(self):\n  self.op=make()\n def forward(self,x):\n  return self.op(x)\n','factory.py':'from torch import nn\ndef make():\n model=nn.Linear(4,4)\n mutate(model)\n return model\n'})
        self.assertTrue(any(n['kind']=='opaque' for n in ir['nodes']))
        self.assertFalse(any(n.get('module_binding') for n in ir['nodes']))

    def test_unknown_factory_branch_does_not_choose_a_model(self):
        _, ir = self.project({'entry.py':'from torch import nn\nfrom factory import make\nclass Model(nn.Module):\n def __init__(self,choice):\n  self.op=make(choice)\n def forward(self,x):\n  return self.op(x)\n','factory.py':'from torch import nn\ndef make(flag):\n if flag:\n  return nn.Linear(4,4)\n else:\n  return nn.ReLU()\n'})
        self.assertTrue(any(n['kind']=='opaque' for n in ir['nodes']))
        self.assertFalse(any(n.get('operator') in {'linear','activation'} for n in ir['nodes']))

    def test_rebound_export_and_import_cycles_stay_unknown(self):
        for module in ['from other import Block\nBlock=external()\n','from other import Block\n']:
            with self.subTest(module=module):
                _, ir=self.project({'entry.py':'from torch import nn\nfrom factory import Block\nclass Model(nn.Module):\n def __init__(self):\n  self.op=Block()\n def forward(self,x):\n  return self.op(x)\n','factory.py':module,'other.py':'from factory import Block\n'})
                self.assertTrue(any(n['kind']=='opaque' for n in ir['nodes']))

    def test_imports_are_read_only_and_never_execute_top_level_code(self):
        _, ir = self.project({'entry.py':'from torch import nn\nfrom part import Block\nclass Model(nn.Module):\n def __init__(self):\n  self.op=Block()\n def forward(self,x):\n  return self.op(x)\n','part.py':'raise RuntimeError("must not execute")\nclass Block:\n def forward(self,x):\n  return x+1\n'})
        self.assertTrue(any(n.get('source_class')=='Block' for n in ir['nodes']))
        self.assertNotIn('part',sys.modules)

    def test_project_symlink_cannot_escape_read_root(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        outside=Path(temp.name)/'secret.py';outside.write_text('class Block:\n def forward(self,x): return x+1\n')
        root=Path(temp.name)/'project';root.mkdir();(root/'part.py').symlink_to(outside)
        (root/'entry.py').write_text('from part import Block\nclass Model:\n def __init__(self): self.op=Block()\n def forward(self,x): return self.op(x)\n')
        ir=analyze(root/'entry.py','Model',project_root=root)
        self.assertEqual(len(ir['sources']),1)
        self.assertTrue(any(n['kind']=='opaque' for n in ir['nodes']))


class AdditionalProjectTests(unittest.TestCase):
    project = ProjectBoundaryTests.project
    def test_factory_entry_opens_injected_model_and_preserves_shared_calls(self):
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup);root=Path(temp.name)
        (root/'entry.py').write_text('from torch import nn\nfrom box import Box\ndef create(*,width=5):\n core=nn.Linear(width,width)\n return Box(core,core)\n')
        (root/'box.py').write_text('from torch import nn\nclass Box(nn.Module):\n def __init__(self,a,b):\n  self.a=a\n  self.b=b\n def forward(self,x):\n  return self.b(self.a(x))\n')
        ir=analyze(root/'entry.py','create',{'width':7},project_root=root,factory_entry=True)
        self.assertTrue(validate_ir(ir)['ok'])
        ops=[n for n in ir['nodes'] if n.get('operator')=='linear']
        self.assertEqual(len(ops),2)
        self.assertEqual(ops[0]['module_binding']['reference'],ops[1]['module_binding']['reference'])
        self.assertTrue(all(n['constructor']['args']==[7,7] for n in ops))
        self.assertTrue(ir['nodes'][0]['factory_binding'])

    def test_module_dict_and_module_list_indexing_keep_distinct_operand_calls(self):
        _,ir=self.project({'entry.py':'from torch import nn\nclass Model(nn.Module):\n def __init__(self):\n  self.named=nn.ModuleDict({"a":nn.Linear(2,2),"b":nn.ReLU()})\n  self.seq=nn.ModuleList([nn.Sigmoid()])\n def forward(self,x):\n  return self.seq[0](self.named["b"](self.named["a"](x)))\n'})
        self.assertFalse([n for n in ir['nodes'] if n['kind']=='opaque'])
        self.assertEqual(sum(n.get('operator')=='linear' for n in ir['nodes']),1)
        self.assertEqual(sum(n.get('operator')=='activation' for n in ir['nodes']),2)

    def test_literal_constructor_branch_and_factory_branch(self):
        _,ir=self.project({'entry.py':'from torch import nn\nfrom factory import make\nclass Model(nn.Module):\n def __init__(self):\n  if True:\n   self.op=make(True)\n  else:\n   self.op=external()\n def forward(self,x):\n  return self.op(x)\n','factory.py':'from torch import nn\ndef make(flag):\n if flag:\n  return nn.Linear(4,4)\n return nn.ReLU()\n'})
        self.assertFalse([n for n in ir['nodes'] if n['kind']=='opaque'])
        self.assertEqual(sum(n.get('operator')=='linear' for n in ir['nodes']),1)

    def test_new_framework_contracts_and_same_named_external_boundary(self):
        _,ir=self.project({'entry.py':'from torch import nn\nimport torch\nfrom mystery import RMSNorm\nclass Model(nn.Module):\n def __init__(self):\n  self.a=nn.RMSNorm(8)\n  self.b=RMSNorm(8)\n def forward(self,x):\n  return self.b(self.a(x)).repeat(2,1)+torch.full((2,8),1)\n'})
        self.assertEqual(sum(n.get('operator')=='normalization' for n in ir['nodes']),1)
        self.assertTrue(any(n['kind']=='opaque' and n.get('framework_type')=='mystery.RMSNorm' for n in ir['nodes']))
        self.assertTrue(any(n.get('operator')=='repeat' for n in ir['nodes']))

    def test_dynamic_index_and_decorated_call_remain_unknown(self):
        for body in ['def forward(self,x,i):\n  return self.ops[i](x)\n','@wrap\n def __call__(self,x):\n  return x+1\n']:
            with self.subTest(body=body):
                _,ir=self.project({'entry.py':'from torch import nn\nclass Model(nn.Module):\n def __init__(self):\n  self.ops=nn.ModuleList([nn.Linear(2,2)])\n '+body})
                self.assertTrue(any(n['kind']=='opaque' for n in ir['nodes']))


class NamespaceBoundaryTests(unittest.TestCase):
    project = ProjectBoundaryTests.project

    def test_defaults_use_defining_file_globals_not_callers(self):
        _,ir=self.project({'entry.py':'from torch import nn\nfrom other import Block\nWIDTH=99\nclass Model(nn.Module):\n def __init__(self): self.op=Block()\n def forward(self,x): return self.op(x)\n','other.py':'from torch import nn\nWIDTH=3\nclass Block(nn.Module):\n def __init__(self,width=WIDTH): self.op=nn.Linear(width,width)\n def forward(self,x): return self.op(x)\n'})
        op=next(n for n in ir['nodes'] if n.get('operator')=='linear')
        self.assertEqual(op['constructor']['args'],[3,3])

    def test_rebound_constructor_condition_cannot_reuse_old_argument(self):
        _,ir=self.project({'entry.py':'from torch import nn\nclass Model(nn.Module):\n def __init__(self,flag=True):\n  flag=unknown()\n  if flag:\n   self.op=nn.Linear(2,2)\n  else:\n   self.op=nn.ReLU()\n def forward(self,x): return self.op(x)\n'})
        self.assertTrue(any(n['kind']=='opaque' for n in ir['nodes']))
        self.assertFalse(any(n.get('module_binding') for n in ir['nodes']))

    def test_absolute_module_imports_reexport_and_file_budget(self):
        from semantic_adapter.project import Project
        root,ir=self.project({'entry.py':'from torch import nn\nimport pkg.layer as unit\nclass Model(nn.Module):\n def __init__(self): self.op=unit.Block()\n def forward(self,x): return self.op(x)\n','pkg/layer.py':'class Block:\n def forward(self,x): return x+1\n'})
        self.assertTrue(any(n.get('source_class')=='Block' for n in ir['nodes']))
        project=Project(root/'entry.py',root,max_files=1)
        from semantic_adapter.sources import units
        project.register(root/'entry.py',units(root/'entry.py')[0])
        self.assertEqual(project.load(root/'pkg/layer.py'),[])
        self.assertEqual(project.diagnostics[0]['kind'],'project-file-budget')


class FrameworkBoundaryTests(unittest.TestCase):
    project = ProjectBoundaryTests.project

    def test_local_torch_and_fake_subnamespace_do_not_get_framework_contracts(self):
        for files in [
            {'entry.py':'from torch import nn\nclass Model:\n def __init__(self): self.op=nn.RMSNorm(8)\n def forward(self,x): return self.op(x)\n','torch.py':'nn=unknown()\n'},
            {'entry.py':'import torch\nclass Model:\n def __init__(self): self.op=torch.nn.custom.RMSNorm(8)\n def forward(self,x): return self.op(x)\n'},
            {'entry.py':'import torch\nclass Model:\n def forward(self,x): return torch.custom.full(x)\n'}]:
            with self.subTest(files=files):
                _,ir=self.project(files)
                self.assertTrue(any(n['kind']=='opaque' for n in ir['nodes']))
                self.assertFalse(any(n.get('operator') in ('normalization','create') for n in ir['nodes']))


class EntryDiscoveryTests(unittest.TestCase):
    project = ProjectBoundaryTests.project

    def test_inventory_finds_explicit_call_without_running_project(self):
        from semantic_adapter.sources import inventory
        root,ir=self.project({'entry.py':'class Model:\n def __call__(self,x): return x+1\n'})
        found=inventory([root])
        self.assertEqual([m['entry'] for m in found['models']],['Model'])
        self.assertFalse(found['model_executed'])

    def test_buffer_registration_does_not_invalidate_unrelated_injected_module(self):
        _,ir=self.project({'entry.py':'from torch import nn\nfrom box import Box\nclass Model(nn.Module):\n def __init__(self): self.box=Box(nn.Linear(3,3))\n def forward(self,x): return self.box(x)\n','box.py':'from torch import nn\nimport torch\nclass Box(nn.Module):\n def __init__(self,core):\n  self.core=core\n  self.register_buffer("scale",torch.ones(1))\n def forward(self,x): return self.core(x)*self.scale\n'})
        op=next(n for n in ir['nodes'] if n.get('operator')=='linear')
        self.assertEqual(op['module_binding']['status'],'proved')


if __name__=='__main__': unittest.main()

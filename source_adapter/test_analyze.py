import json
import tempfile
import unittest
from pathlib import Path
from analyze import analyze, AdapterError


class StaticAdapterTests(unittest.TestCase):
    def test_unfamiliar_composition_alias_and_source_spans(self):
        text=(Path(__file__).parent/'examples/novel_model.py').read_text()
        b=analyze({'novel_model.py':text},'RiverNet',{'width':24})
        self.assertFalse(b['ir']['modelExecuted'])
        self.assertEqual(b,analyze({'novel_model.py':text},'RiverNet',{'width':24}))
        nodes=b['ir']['nodes'];self.assertEqual(sum(n['kind']=='multiply' for n in nodes),1)
        shared=[v for k,v in b['ir']['instances'].items() if k.endswith('.shared')]
        self.assertEqual(len(shared[0]),2)
        self.assertTrue(any(n['kind']=='group' and n['label']=='Sequential' for n in nodes))
        for e in b['evidence'].values():
            lines=text.encode().split(b'\n');snippet=b'\n'.join(lines[e['line']-1:e['endLine']])
            self.assertIn(e['expression'].encode(),snippet)

    def test_never_imports_or_executes_source(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'executed'
            text=f"from torch import nn\nopen({str(p)!r}, 'w').write('bad')\nclass Comet(nn.Module):\n def forward(self,x):\n  return x + x\n"
            b=analyze({'model.py':text},'Comet');self.assertFalse(p.exists());self.assertFalse(b['ir']['modelExecuted'])

    def test_multifile_keywords_and_structured_returns(self):
        files={'pkg/leaf.py':"from torch import nn\nclass Leaf(nn.Module):\n def forward(self,x,y):\n  return {'sum':x+y,'product':x*y}\n",
               'pkg/model.py':"from torch import nn\nfrom .leaf import Leaf\nclass NewName(nn.Module):\n def __init__(self):\n  super().__init__()\n  self.unit=Leaf()\n def forward(self,x,y):\n  r=self.unit(y=y,x=x)\n  return r['sum']\n"}
        b=analyze(files,'NewName');self.assertEqual(b['diagnostics'],[])
        self.assertEqual(sum(n['kind']=='add' for n in b['ir']['nodes']),1)
        self.assertEqual(sum(n['kind']=='multiply' for n in b['ir']['nodes']),1)
        self.assertTrue(any(n['label']=='return[sum]' for n in b['ir']['nodes']))

    def test_dynamic_control_flow_is_one_region_without_invented_branch_chain(self):
        text="from torch import nn\nclass Fork(nn.Module):\n def forward(self,x):\n  if x.sum()>0:\n   y=x+1\n  else:\n   y=x*2\n  return y\n"
        b=analyze({'model.py':text},'Fork');self.assertEqual(sum(n['kind']=='opaque' for n in b['ir']['nodes']),1)
        self.assertFalse(any(n['kind'] in ('add','multiply') for n in b['ir']['nodes']))
        self.assertIn('if x.sum()',next(e['expression'] for e in b['evidence'].values() if e['expression'].startswith('if ')))

    def test_unknown_decorator_inheritance_inplace_and_constructor_helper(self):
        cases=[
            "class A(nn.Module):\n @modify\n def forward(self,x):\n  return x+x\n",
            "class A(Other):\n def forward(self,x):\n  return x+x\n",
            "class A(nn.Module):\n def forward(self,x):\n  x.add_(1)\n  return x+x\n",
            "class A(nn.Module):\n def __init__(self):\n  self.op=nn.ReLU(inplace=True)\n def forward(self,x):\n  y=self.op(x)\n  return x+y\n",
            "class A(nn.Module):\n def __init__(self):\n  self.op=nn.Linear(3,3)\n  self.replace_all()\n def forward(self,x):\n  return self.op(x)\n"
        ]
        for code in cases:
            with self.subTest(code=code):
                b=analyze({'m.py':'from torch import nn\n'+code},'A');self.assertTrue(b['diagnostics']);self.assertFalse(any(n['kind']=='add' for n in b['ir']['nodes']))

    def test_ambiguity_invalid_paths_budget_and_syntax(self):
        with self.assertRaises(AdapterError):analyze({'../x.py':'x=1'})
        with self.assertRaises(AdapterError):analyze({'x.py':'class'})
        with self.assertRaises(AdapterError):analyze({'x.py':'#'*2_000_001})
        with self.assertRaises(AdapterError):analyze({'x.py':"from torch import nn\nclass A(nn.Module):\n def forward(self,x):return x\nclass B(nn.Module):\n def forward(self,x):return x\n"})

    def test_positional_inplace_and_out_preserve_remaining_region(self):
        for init, statement in [
            ('self.op=nn.ReLU(True)','y=self.op(x)'),
            ('self.op=nn.Dropout(0.2,True)','y=self.op(x)'),
            ('pass','y=F.relu(x,True)'),
            ('pass','y=torch.add(x,x,out=x)'),
            ('pass','x[0]=x')
        ]:
            text=f'from torch import nn\nimport torch\nimport torch.nn.functional as F\nclass A(nn.Module):\n def __init__(self):\n  {init}\n def forward(self,x):\n  {statement}\n  return x+x\n'
            b=analyze({'model.py':text},'A')
            self.assertTrue(b['diagnostics']);self.assertFalse(any(n['kind']=='add' for n in b['ir']['nodes']))
            self.assertTrue(any('return x+x' in e['expression'] for e in b['evidence'].values()))

    def test_invalid_signature_is_opaque_but_valid_kwonly_keeps_distinct_bindings(self):
        leaf='class Leaf(nn.Module):\n def forward(self,x,/,*,y):\n  return x+y\n'
        for call, valid in [('self.op(x,y=x)',True),('self.op(x,x)',False),('self.op(x=x,y=x)',False),('self.op(x)',False)]:
            text='from torch import nn\n'+leaf+f'class A(nn.Module):\n def __init__(self):\n  self.op=Leaf()\n def forward(self,x):\n  return {call}\n'
            b=analyze({'model.py':text},'A')
            self.assertEqual(any(n['kind']=='add' for n in b['ir']['nodes']),valid)
            self.assertEqual(bool(b['diagnostics']),not valid)

    def test_unicode_spans_and_overridden_call_are_conservative(self):
        b=analyze({'model.py':'from torch import nn\nclass Moon(nn.Module):\n def forward(self,张量):\n  return 张量+张量\n'},'Moon')
        self.assertEqual(b['diagnostics'],[])
        b=analyze({'model.py':'from torch import nn\nclass Moon(nn.Module):\n def __call__(self,x):return x\n def forward(self,x):return x+x\n'},'Moon')
        self.assertTrue(b['diagnostics']);self.assertEqual(b['ir']['nodes'][0]['kind'],'opaque')


if __name__=='__main__':unittest.main()

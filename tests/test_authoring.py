import json
import unittest
from pathlib import Path
from semantic_adapter.authoring import compile_module,preset_definitions,certify_assembly

class AuthoringTests(unittest.TestCase):
    def test_custom_source_exact_bindings_and_parameters(self):
        source='''from torch import nn
class MyBlock(nn.Module):
    def __init__(self, width=8):
        super().__init__()
        self.proj=nn.Linear(width,width)
    def forward(self, x, skip):
        return self.proj(x)+skip
'''
        a=compile_module(source,'MyBlock',{'width':16})
        b=compile_module(source,'MyBlock',{'width':32})
        linear=lambda m:next(n for n in m['ir']['nodes'] if n.get('operator')=='linear')
        self.assertEqual(linear(a)['constructor']['args'],[16,16])
        self.assertEqual(linear(b)['constructor']['args'],[32,32])
        add=next(n for n in a['ir']['nodes'] if n.get('operator')=='add')
        self.assertEqual({e['target_port'] for e in a['ir']['edges'] if e['target']==add['id']},{'0','2'})
        self.assertEqual(a['source'],source)
        self.assertFalse(a['analysis']['executed'])
    def test_submitted_source_is_not_executed(self):
        marker=Path('/tmp/archcanvas-authoring-must-not-execute')
        if marker.exists():marker.unlink()
        source=f'''from pathlib import Path
Path({str(marker)!r}).write_text("executed")
def Custom(x):
    return x+x
'''
        result=compile_module(source,'Custom')
        self.assertFalse(result['analysis']['executed'])
        self.assertFalse(marker.exists())
    def test_presets_compile_at_two_parameter_sizes_and_preserve_sources(self):
        for preset in preset_definitions():
            a=compile_module(preset['source'],preset['entry'],preset['constructor'])
            self.assertEqual(a['source'],preset['source'])
            self.assertTrue(a['analysis']['validation']['ok'])
            self.assertFalse(any(n['kind']=='opaque' for n in a['ir']['nodes']),preset['title'])
    def test_assembly_contracts_are_recomputed_with_explicit_evidence_scope(self):
        import copy
        source=next(p for p in preset_definitions() if p['title']=='Residual')
        module=compile_module(source['source'],source['entry'],source['constructor'])
        ir=copy.deepcopy(module['ir']);ir['authoring']={'edited':True};ir['semantic_contracts']=[{'id':'stale-invalid'}]
        result=certify_assembly(ir)
        self.assertTrue(result['authoring']['local_contracts_recomputed'])
        self.assertTrue(result['semantic_contracts'])
        self.assertTrue(all('declared user assembly' in c['scope'] for c in result['semantic_contracts']))
        # Destroy the required add operand: the residual proof must disappear.
        add=next(n for n in ir['nodes'] if n.get('operator')=='add')
        ir['edges']=[e for e in ir['edges'] if not(e['target']==add['id'] and e['target_port']=='2')]
        self.assertFalse(any(c['rule'].startswith('residual') for c in certify_assembly(ir)['semantic_contracts']))
    def test_invalid_source_and_entry_are_rejected(self):
        for source,entry in [('def broken(', 'broken'),('def Other(x): return x','Missing')]:
            with self.assertRaises((ValueError,SyntaxError)):compile_module(source,entry)
        with self.assertRaises(ValueError):compile_module('x'*120001,'Custom')

if __name__=='__main__':unittest.main()

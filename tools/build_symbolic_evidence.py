#!/usr/bin/env python3
"""Re-extract frozen/current symbolic-read examples without executing models."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/symbolic-values/current'
FROZEN = ROOT / 'verification/local-relations/iteration-08-before-symbolic-values'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stack(elements):
    return '\nclass Stack(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.parts = nn.ModuleList([' + ', '.join(elements) + '])\n    def forward(self, x):\n        for part in self.parts:\n            x = part(x)\n        return x\n'


def main():
    OUT.mkdir(parents=True, exist_ok=True); (OUT / 'sources').mkdir(exist_ok=True)
    snapshot = json.loads((FROZEN / 'snapshot.json').read_text())
    for file, digest in snapshot['files'].items():
        assert sha(FROZEN / 'implementation' / file) == digest
    original = (ROOT / 'tests/semantic_fixtures/symbolic_values.py').read_text()
    specs = {
        'shape-rename': ['ShapeUnit()', 'RenamedShape()'],
        'resource-same': ['ResourceUnit()', 'ResourceUnit()'],
        'resource-config': ['ResourceUnit(0.1)', 'ResourceUnit(0.2)'],
        'exit-same': ['ExitUnit()', 'ExitUnit()'],
        'normal-returns': ['ReturnUnit()', 'ReturnUnit()'],
        'conditional-tensor': ['ConditionalTensor()', 'ConditionalTensor()'],
        'partial-tensor': ['PartialTensor()', 'PartialTensor()'],
        'custom-attribute': ['CustomAttribute()', 'CustomAttribute()'],
        'unknown-effect': ['UnknownBeforeRead()', 'UnknownBeforeRead()'],
        'mutable-effect': ['MutableBeforeRead()', 'MutableBeforeRead()'],
        'shadowed-namespace': ['ShadowedNamespace()', 'ShadowedNamespace()'],
        'changed-attribute': ['ShapeUnit()', 'RenamedShape()'],
        'shadowed-exception': ['ExitUnit()', 'ExitUnit()'],
        'conditional-mixed': ['ConditionalTensor()', 'PartialTensor()'],
    }
    rows = []
    for name, elements in specs.items():
        content = original
        if name == 'changed-attribute': content = content.replace('first, second, third = other.shape', 'first, second, third = other.dtype')
        if name == 'shadowed-exception': content += '\ndef ValueError(message):\n    return mystery(message)\n'
        source = OUT / 'sources' / (name + '.py'); source.write_text(content + stack(elements))
        rows.append({'name': name, 'source': str(source.relative_to(ROOT)), 'entry': 'Stack'})
    rows.append({'name': 'transformer', 'source': 'snapshots/transformer_programmatic_guide/sources/pytorch_transformer_original/transformer.py', 'entry': 'Transformer'})
    # Each interpreter imports exactly one implementation, so frozen extraction
    # never accidentally reuses already-imported current modules.
    script = '''import json,sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir
root=Path(sys.argv[2]);out=Path(sys.argv[3]);version=sys.argv[4]
for row in json.loads(sys.stdin.read()):
 ir=analyze(root/row['source'],row['entry']);assert validate_ir(ir)['ok'],validate_ir(ir)
 file=out/(row['name']+'-'+version+'.json');file.write_text(json.dumps(ir,ensure_ascii=False,indent=2)+'\\n')
 print(json.dumps({'name':row['name'],'version':version,'nodes':len(ir['nodes'])}),flush=True)
'''
    for version, implementation in [('before', FROZEN / 'implementation'), ('current', ROOT)]:
        result = subprocess.run([sys.executable, '-c', script, str(implementation), str(ROOT), str(OUT), version], input=json.dumps(rows), text=True, capture_output=True)
        assert result.returncode == 0, result.stderr
        print(result.stdout, end='', flush=True)
    for row in rows:
        row['source_sha256'] = sha(ROOT / row['source'])
        for version in ['before', 'current']:
            file = OUT / (row['name'] + '-' + version + '.json')
            ir = json.loads(file.read_text())
            assert ir['sources'][0]['sha256'] == row['source_sha256']
            row[version] = {'ir': str(file.relative_to(OUT)), 'ir_sha256': sha(file),
                            'groups': [n['repeat_contract']['structure'] for n in ir['nodes'] if n.get('repeat_contract')],
                            'nodes': len(ir['nodes']), 'edges': len(ir['edges'])}
    report = {'schema': 'symbolic-value-extraction/1', 'frozen_snapshot_sha256': sha(FROZEN / 'snapshot.json'),
              'builder_sha256': sha(Path(__file__)), 'source_fixture_sha256': sha(ROOT / 'tests/semantic_fixtures/symbolic_values.py'),
              'rows': rows, 'runtime_executed': False,
              'scope': '14 development inputs plus same-source Transformer evaluation; no runtime type, value, purity or parameter-stability assertion.'}
    (OUT / 'extraction.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'cases': len(rows), 'runtime_executed': False}), flush=True)


if __name__ == '__main__':
    main()

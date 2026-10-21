"""Extract source fixtures and freeze the exact pre-change renderer."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

OUT = ROOT / 'verification/module-arguments/current'
SOURCE = ROOT / 'tests/semantic_fixtures/module_arguments.py'
CACHE = Path('/tmp/archcanvas-module-arguments-before-2213a19')

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    rows = []
    for name in ['SuppliedCurve', 'UnusedCurve', 'SharedCurve', 'GuardedCurve', 'UnprovedCurve', 'MixedSuppliers']:
        ir = analyze(SOURCE, name)
        assert validate_ir(ir)['ok']
        target = OUT / (name + '.json')
        target.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
        rows.append(dict(name=name, input=str(target.relative_to(ROOT)), sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (OUT / 'extraction.json').write_text(json.dumps(dict(source=str(SOURCE.relative_to(ROOT)), source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(), runtime_executed=False, rows=rows), indent=2) + '\n')
    files = {}
    paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', '2213a19', 'semantic_studio'], cwd=ROOT).decode().splitlines()
    for relative in paths:
        if not relative.endswith('.js'):
            continue
        blob = subprocess.check_output(['git', 'show', '2213a19:' + relative], cwd=ROOT)
        (CACHE / Path(relative).name).write_bytes(blob)
        files[relative] = hashlib.sha256(blob).hexdigest()
    (OUT / 'snapshot.json').write_text(json.dumps(dict(commit='2213a19', files=files), indent=2) + '\n')
    print(json.dumps(dict(fixtures=len(rows), runtime_executed=False)))

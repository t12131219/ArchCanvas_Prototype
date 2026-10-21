"""Extract static source fixtures; freeze the renderer used for comparison."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir

OUT = ROOT / 'verification/prefix-role-paths/current'
SOURCE = ROOT / 'tests/semantic_fixtures/prefix_role_paths.py'
CACHE = Path('/tmp/archcanvas-prefix-role-paths-before-ef94501')

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    rows = []
    for name in ['PreparedCurve', 'RenamedCurve', 'EscapingCurve', 'InterruptedCurve', 'MixedPreparation']:
        ir = analyze(SOURCE, name)
        assert validate_ir(ir)['ok']
        target = OUT / (name + '.json')
        target.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
        rows.append(dict(name=name, input=str(target.relative_to(ROOT)), sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (OUT/'extraction.json').write_text(json.dumps(dict(source=str(SOURCE.relative_to(ROOT)), source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(), runtime_executed=False, rows=rows), indent=2)+'\n')
    files = {}
    for f in sorted((ROOT/'semantic_studio').glob('*.js')):
        relative = str(f.relative_to(ROOT))
        blob = subprocess.check_output(['git', 'show', 'ef94501:'+relative], cwd=ROOT)
        (CACHE/f.name).write_bytes(blob)
        files[relative] = hashlib.sha256(blob).hexdigest()
    (OUT/'snapshot.json').write_text(json.dumps(dict(commit='ef94501', files=files), indent=2)+'\n')
    print(json.dumps(dict(fixtures=len(rows), runtime_executed=False)))

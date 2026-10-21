"""Freeze the preceding production renderer, without executing the source models."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/exact-expression/current'
CACHE = Path('/tmp/archcanvas-exact-before-d2b43b8')
COMMIT = 'd2b43b8'
if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    files = {}
    for f in sorted((ROOT / 'semantic_studio').glob('*.js')):
        relative = str(f.relative_to(ROOT))
        blob = subprocess.check_output(['git', 'show', COMMIT + ':' + relative], cwd=ROOT)
        (CACHE / f.name).write_bytes(blob)
        files[relative] = hashlib.sha256(blob).hexdigest()
    snapshot = dict(commit=COMMIT, files=files)
    (OUT / 'snapshot.json').write_text(json.dumps(snapshot, indent=2) + '\n')

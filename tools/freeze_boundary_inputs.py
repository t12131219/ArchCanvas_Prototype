"""Pin the previous renderer and measured SVG baseline to a Git commit."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMIT = '33c38ba'
OUT = ROOT / 'verification/boundary-inputs/current'
CACHE = Path('/tmp/archcanvas-boundary-before-33c38ba')
if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(exist_ok=True)
    files, artifacts = {}, {}
    for p in (ROOT / 'semantic_studio').glob('*.js'):
        f = str(p.relative_to(ROOT))
        data = subprocess.check_output(['git', 'show', COMMIT + ':' + f], cwd=ROOT)
        (CACHE / p.name).write_bytes(data)
        files[f] = hashlib.sha256(data).hexdigest()
    for i in range(1, 4):
        f = f'verification/cohort-folds/current/Transformer-current-trial-{i}.svg'
        artifacts[f] = hashlib.sha256(subprocess.check_output(['git', 'show', COMMIT + ':' + f], cwd=ROOT)).hexdigest()
    (OUT / 'snapshot.json').write_text(json.dumps(dict(commit=COMMIT, files=files, artifacts=artifacts), indent=2) + '\n')

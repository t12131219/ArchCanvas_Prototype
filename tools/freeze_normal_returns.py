"""Freeze the committed renderer before invocation-return presentation changes."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = '445a201'
CACHE = Path('/tmp/archcanvas-normal-returns-before-' + BASE)
OUT = ROOT / 'verification/normal-returns/current'

if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for file in json.loads((ROOT / 'verification/local-bypasses/current/snapshot.json').read_text())['files']:
        blob = subprocess.check_output(['git', 'show', BASE + ':' + file], cwd=ROOT)
        (CACHE / Path(file).name).write_bytes(blob)
        files[file] = hashlib.sha256(blob).hexdigest()
    (OUT / 'snapshot.json').write_text(json.dumps(dict(commit=BASE, files=files), indent=2) + '\n')

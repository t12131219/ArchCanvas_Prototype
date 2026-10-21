"""Freeze the committed renderer and its actual large SVG captures."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = '0dcab92'
CACHE = Path('/tmp/archcanvas-residual-bands-before-' + BASE)
OUT = ROOT / 'verification/residual-bands/current'
if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    files = {}
    for file in subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASE, 'semantic_studio'], cwd=ROOT).decode().splitlines():
        if not file.endswith('.js'):continue
        blob = subprocess.check_output(['git', 'show', BASE + ':' + file], cwd=ROOT)
        (CACHE / Path(file).name).write_bytes(blob)
        files[file] = hashlib.sha256(blob).hexdigest()
    report = 'verification/header-reflow/current/large-report.json'
    blob = subprocess.check_output(['git', 'show', BASE + ':' + report], cwd=ROOT)
    (CACHE / 'large-report.json').write_bytes(blob)
    (OUT / 'snapshot.json').write_text(json.dumps(dict(commit=BASE, files=files,
        large_report=dict(path=report, sha256=hashlib.sha256(blob).hexdigest())), indent=2) + '\n')

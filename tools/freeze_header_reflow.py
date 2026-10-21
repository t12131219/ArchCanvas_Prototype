"""Freeze the committed renderer used by the expanded header reflow comparison."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = '1d66171'
CACHE = Path('/tmp/archcanvas-header-reflow-before-' + BASE)
OUT = ROOT / 'verification/header-reflow/current'
if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    prior = json.loads(subprocess.check_output(['git', 'show', BASE + ':verification/coupled-routes/current/snapshot.json'], cwd=ROOT))
    files = {}
    for file in prior['files']:
        if not file.startswith('semantic_studio/'):continue
        blob = subprocess.check_output(['git', 'show', BASE + ':' + file], cwd=ROOT)
        (CACHE / Path(file).name).write_bytes(blob)
        files[file] = hashlib.sha256(blob).hexdigest()
    report = 'verification/coupled-routes/current/large-report.json'
    blob = subprocess.check_output(['git', 'show', BASE + ':' + report], cwd=ROOT)
    (CACHE / 'large-report.json').write_bytes(blob)
    (OUT / 'snapshot.json').write_text(json.dumps(dict(commit=BASE, files=files,
        large_report=dict(path=report, sha256=hashlib.sha256(blob).hexdigest())), indent=2) + '\n')

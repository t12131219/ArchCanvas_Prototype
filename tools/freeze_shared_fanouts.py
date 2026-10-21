"""Reconstruct the committed comparison renderer without shared-path layout."""
import hashlib
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
BASE='ea77524'
CACHE=Path('/tmp/archcanvas-fanout-before-'+BASE)
OUT=ROOT/'verification/shared-fanouts/current'
if __name__=='__main__':
    CACHE.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);files={}
    for f in subprocess.check_output(['git','ls-tree','-r','--name-only',BASE,'semantic_studio'],cwd=ROOT).decode().splitlines():
        if not f.endswith('.js'):continue
        data=subprocess.check_output(['git','show',BASE+':'+f],cwd=ROOT)
        (CACHE/Path(f).name).write_bytes(data);files[f]=hashlib.sha256(data).hexdigest()
    (OUT/'snapshot.json').write_text(json.dumps(dict(commit=BASE,files=files),indent=2)+'\n')

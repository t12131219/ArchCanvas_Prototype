"""Freeze the committed renderer before local bypass geometry changes."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE='58124c7'
CACHE=Path('/tmp/archcanvas-local-bypasses-before-'+BASE)
OUT=ROOT/'verification/local-bypasses/current'

if __name__=='__main__':
    CACHE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    files={}
    for file in json.loads((ROOT/'verification/source-corridors/current/snapshot.json').read_text())['files']:
        blob=subprocess.check_output(['git','show',BASE+':'+file],cwd=ROOT)
        (CACHE/Path(file).name).write_bytes(blob)
        files[file]=hashlib.sha256(blob).hexdigest()
    (OUT/'snapshot.json').write_text(json.dumps(dict(commit=BASE,files=files),indent=2)+'\n')

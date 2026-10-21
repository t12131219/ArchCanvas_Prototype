"""Freeze the committed implementation used for the before SVGs."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1];BASE='daaa217'
CACHE=Path('/tmp/archcanvas-contained-bypasses-before-'+BASE)
OUT=ROOT/'verification/contained-bypasses/current'
if __name__=='__main__':
    CACHE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    files={}
    for file in json.loads((ROOT/'verification/normal-returns/current/snapshot.json').read_text())['files']:
        blob=subprocess.check_output(['git','show',BASE+':'+file],cwd=ROOT)
        (CACHE/Path(file).name).write_bytes(blob);files[file]=hashlib.sha256(blob).hexdigest()
    (OUT/'snapshot.json').write_text(json.dumps(dict(commit=BASE,files=files),indent=2)+'\n')

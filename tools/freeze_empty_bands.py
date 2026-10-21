"""Freeze the committed implementation before global empty-band compaction."""
import hashlib
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification/empty-bands/current'
CACHE=Path('/tmp/archcanvas-empty-bands-before-b37c74e');COMMIT='b37c74e'
if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True);files={}
    for f in sorted((ROOT/'semantic_studio').glob('*.js')):
        relative=str(f.relative_to(ROOT));blob=subprocess.check_output(['git','show',COMMIT+':'+relative],cwd=ROOT)
        (CACHE/f.name).write_bytes(blob);files[relative]=hashlib.sha256(blob).hexdigest()
    (OUT/'snapshot.json').write_text(json.dumps(dict(commit=COMMIT,files=files),indent=2)+'\n')

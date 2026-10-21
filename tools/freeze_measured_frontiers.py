"""Freeze the exact pre-selection-measurement producer for isolated comparisons."""
import hashlib
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=Path('/tmp/archcanvas-joint-frontiers-before')
OUT.mkdir(exist_ok=True)
files={}
for p in sorted((ROOT/'semantic_studio').iterdir()):
    if p.suffix not in ['.js','.html','.css']:continue
    f=str(p.relative_to(ROOT))
    data=subprocess.check_output(['git','show','83bdb82:'+f],cwd=ROOT)
    (OUT/p.name).write_bytes(data)
    files[f]=hashlib.sha256(data).hexdigest()
(OUT/'snapshot.json').write_text(json.dumps({'commit':'83bdb82','files':files},indent=2)+'\n')
print(OUT)

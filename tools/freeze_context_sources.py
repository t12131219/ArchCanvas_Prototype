"""Freeze the authorized previous commit for an isolated renderer comparison."""
import hashlib
import json
from pathlib import Path
import subprocess
ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/archcanvas-context-source-before')
OUT.mkdir(exist_ok=True)
files = {}
for path in sorted((ROOT/'semantic_studio').iterdir()):
    if path.suffix not in ['.js', '.html', '.css']:
        continue
    relative = str(path.relative_to(ROOT))
    data = subprocess.check_output(['git', 'show', '2426ab3:'+relative], cwd=ROOT)
    (OUT/path.name).write_bytes(data)
    files[relative] = hashlib.sha256(data).hexdigest()
(OUT/'snapshot.json').write_text(json.dumps({'commit':'2426ab3', 'files': files}, indent=2))
print(OUT)

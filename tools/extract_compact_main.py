"""Fresh static inputs and an immutable pre-planner implementation."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze

OUT = ROOT / 'verification/compact-main/current'
OUT.mkdir(parents=True, exist_ok=True)
source = ROOT / 'tests/semantic_fixtures/role_path_stages.py'
rows = []
for name in ['PrismPath', 'OtherNames', 'SharedPath', 'UnknownPath', 'ConditionalPaths', 'MixedPaths', 'ParallelPaths', 'InterleavedPaths']:
    file = OUT / (name + '.json')
    file.write_text(json.dumps(analyze(source, name), ensure_ascii=False, indent=2) + '\n')
    rows.append(dict(name=name, input=str(file.relative_to(ROOT)), input_sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
(OUT / 'extraction.json').write_text(json.dumps(dict(source=str(source.relative_to(ROOT)), source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(), runtime_executed=False, rows=rows), indent=2) + '\n')
baseline = Path('/tmp/archcanvas-compact-main-before')
baseline.mkdir(exist_ok=True)
files = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', 'f6d98e9', '--', 'semantic_studio'], cwd=ROOT, text=True).splitlines()
hashes = {}
for f in files:
    if Path(f).suffix not in {'.js', '.html', '.css'}:
        continue
    data = subprocess.check_output(['git', 'show', 'f6d98e9:' + f], cwd=ROOT)
    dest = baseline / Path(f).name
    if dest.exists():
        assert dest.read_bytes() == data
    else:
        dest.write_bytes(data)
    hashes[f] = hashlib.sha256(data).hexdigest()
(baseline / 'snapshot.json').write_text(json.dumps(dict(commit='f6d98e9', files=hashes), indent=2) + '\n')
print(json.dumps(dict(fixtures=len(rows), baseline='f6d98e9', runtime_executed=False)))

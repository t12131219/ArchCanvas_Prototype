"""Freeze the committed implementation, including its source certificates."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
BASE = '15d39ee'
CACHE = Path('/tmp/archcanvas-value-lineage-before-' + BASE)
OUT = ROOT / 'verification/value-lineage/current'

if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    files = {}
    previous = json.loads((ROOT / 'verification/contained-bypasses/current/small-report.json').read_text())
    for file in [f for f in previous['implementation_sha256'] if f.startswith('semantic_studio/')]:
        blob = subprocess.check_output(['git', 'show', BASE + ':' + file], cwd=ROOT)
        (CACHE / Path(file).name).write_bytes(blob)
        files[file] = hashlib.sha256(blob).hexdigest()
    blob = subprocess.check_output(['git', 'show', BASE + ':semantic_adapter/contracts.py'], cwd=ROOT)
    (CACHE / 'contracts.py').write_bytes(blob)
    files['semantic_adapter/contracts.py'] = hashlib.sha256(blob).hexdigest()
    (OUT / 'snapshot.json').write_text(json.dumps(dict(commit=BASE, files=files), indent=2) + '\n')
    spec = importlib.util.spec_from_file_location('semantic_adapter._value_before_contracts', CACHE / 'contracts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rows = []
    for row in json.loads((OUT / 'extraction.json').read_text())['rows']:
        ir = json.loads((ROOT / row['input']).read_text())
        rows.append(dict(entry=row['entry'], before=[c['rule'] for c in module.Contracts(ir).run()],
                         current=[c['rule'] for c in ir.get('semantic_contracts', [])]))
    (OUT / 'certificate-comparison.json').write_text(json.dumps(dict(rows=rows), indent=2) + '\n')

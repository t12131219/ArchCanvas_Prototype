"""Reproduce unfamiliar presentation-budget inputs without executing their code."""
from pathlib import Path
import hashlib
import json
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
source = ROOT / 'tests/semantic_fixtures/coherent_frontiers.py'
out = ROOT / 'verification/coherent-frontiers/current'
out.mkdir(parents=True, exist_ok=True)
rows = []
for entry in ['CoherentMosaic', 'BrokenMosaic', 'ConditionalMosaic', 'UnequalMosaic']:
    ir = analyze(source, entry)
    file = out / (entry + '.json')
    file.write_text(json.dumps(ir, ensure_ascii=False, indent=2) + '\n')
    rows.append({'entry':entry, 'input':str(file.relative_to(ROOT)), 'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(out / 'extraction.json').write_text(json.dumps({'source':str(source.relative_to(ROOT)), 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'runtime_executed':False, 'rows':rows}, indent=2) + '\n')
print(json.dumps({'fixtures':len(rows), 'runtime_executed':False}))

"""Fresh static inputs for cross-family architecture review; no model runs."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter import analyze, validate_ir

OUT = ROOT / 'verification/semantic-generalization/current'
REQUESTS = [
    ('tests/semantic_fixtures/stage_sample_frames.py', entry, {})
    for entry in ['SignalStack', 'TwinStacks', 'ConditionalStack', 'UnknownStack',
                  'StateStack', 'SharedStack', 'MixedStack']
] + [
    ('tests/semantic_fixtures/module_sequences.py', entry, configuration)
    for entry, configuration in [('ConvStack', {'count': 4}), ('IndependentStack', {'count': 4}),
        ('HeterogeneousStack', {}), ('InterruptedStack', {}), ('MutatedStack', {})]
]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for source, entry, constructor in REQUESTS:
        ir = analyze(ROOT / source, entry, constructor=constructor)
        assert validate_ir(ir)['ok']
        target = OUT / (entry + '.json')
        target.write_text(json.dumps(ir, indent=2) + '\n')
        rows.append(dict(source=source, source_sha256=hashlib.sha256((ROOT / source).read_bytes()).hexdigest(),
            entry=entry, constructor=constructor, input=str(target.relative_to(ROOT)),
            sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    (OUT / 'extraction.json').write_text(json.dumps(dict(runtime_executed=False, rows=rows), indent=2) + '\n')


if __name__ == '__main__':
    main()

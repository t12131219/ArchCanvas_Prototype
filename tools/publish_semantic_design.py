#!/usr/bin/env python3
"""Publish reviewed generic examples; rendering never selects by these names."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.cli import publish, save
from semantic_adapter.schema import seal, validate_ir


def main():
    source = ROOT / 'verification/semantic-design/current/after'
    catalog = ROOT / 'data/semantic/catalog.json'
    for name in ['ImageResidual', 'VectorResidual', 'VectorBlock', 'ConditionalResidual', 'ConvStack',
                 'HeterogeneousStack', 'SameSource', 'TwoSources', 'SharedStack-runtime', 'IndependentStack-runtime']:
        ir = json.loads((source / (name + '.json')).read_text())
        assert validate_ir(ir)['ok']
        target = ROOT / 'data/semantic/design' / (name + '.json')
        save(target, ir); publish(target, catalog)
    # Refresh the existing generic comparison entries. The dedicated adapter
    # and its original assets stay outside this publication path.
    for name, target, title in [('comparison-small-runtime', 'transformer-runtime.json', 'Transformer')]:
        ir = json.loads((source / (name + '.json')).read_text())
        ir['title'] = title
        seal(ir)
        assert validate_ir(ir)['ok']
        file = ROOT / 'data/semantic' / target
        save(file, ir); publish(file, catalog)
    # Source publication now follows the latest accepted dual-frontier audit,
    # rather than rolling the product back to this historical stage's IR.
    from tools.publish_reviewed_presentation import main as publish_reviewed
    publish_reviewed()
    print(json.dumps({'catalog': str(catalog), 'generic_examples': 10, 'comparison_entries_refreshed': 2}))


if __name__ == '__main__':
    main()

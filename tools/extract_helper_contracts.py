"""Extract identical sources with frozen/current semantic adapters; no execution."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.schema import validate_ir


def main():
    checkpoint = ROOT / 'verification/local-relations/iteration-40-before-helper-contracts'
    package = checkpoint / 'implementation/semantic_adapter'
    spec = importlib.util.spec_from_file_location('before_helper_adapter', package / '__init__.py', submodule_search_locations=[str(package)])
    old = importlib.util.module_from_spec(spec); sys.modules[spec.name] = old; spec.loader.exec_module(old)
    out = ROOT / 'verification/helper-contracts/current'; out.mkdir(parents=True, exist_ok=True)
    sources = [(ROOT / 'tests/semantic_fixtures/helper_contracts.py', name) for name in [
        'InlineChain', 'WrappedChain', 'SplitChain', 'NestedChain', 'UnknownChain', 'ConditionalChain', 'MutableChain', 'EscapingChain', 'DisconnectedChain', 'SharedChain']]
    sources += [(ROOT / 'tests/semantic_fixtures/role_source_frames.py', 'WrappedStages'),
        (ROOT / 'snapshots/transformer_programmatic_guide/sources/pytorch_transformer_original/transformer.py', 'Transformer')]
    rows = []
    for source, entry in sources:
        states = {}
        for suffix, adapter in [('before', old.analyze), ('current', analyze)]:
            ir = adapter(source, entry); assert validate_ir(ir)['ok'], entry
            assert not ir['runtime']['model_executed']
            file = out / (entry + '-' + suffix + '.json')
            file.write_text(json.dumps(ir, indent=2) + '\n')
            states[suffix] = {'input': str(file.relative_to(ROOT)), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                'nodes': len(ir['nodes']), 'edges': len(ir['edges']), 'contracts': [{'id': c['id'], 'rule': c['rule'], 'node': c['node']} for c in ir.get('semantic_contracts', [])]}
        def facts(suffix):
            return {k: v for k, v in json.loads((ROOT / states[suffix]['input']).read_text()).items() if k not in ['semantic_contracts', 'semantic_contract_basis', 'ir_digest']}
        assert facts('before') == facts('current'), ('source facts changed', entry)
        rows.append({'entry': entry, 'source': str(source.relative_to(ROOT)), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'before': states['before'], 'current': states['current'], 'same_source_facts': True})
        print(json.dumps({'entry': entry, 'before_ffn': sum(c['rule'] == 'feed-forward' for c in states['before']['contracts']), 'current_ffn': sum(c['rule'] == 'feed-forward' for c in states['current']['contracts'])}))
    (out / 'extraction.json').write_text(json.dumps({'schema': 'helper-contracts-extraction/1', 'runtime_executed': False, 'checkpoint': str((checkpoint / 'snapshot.json').relative_to(ROOT)), 'rows': rows}, indent=2) + '\n')


if __name__ == '__main__':
    main()

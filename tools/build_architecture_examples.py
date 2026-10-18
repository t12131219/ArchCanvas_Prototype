"""Build original unfamiliar compositions without importing or running models."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.cli import save, publish
from semantic_adapter.schema import validate_ir
from semantic_adapter.merge import merge

ENTRIES = ['ForeignComposition', 'BrokenCell', 'BeforeNorm', 'DisconnectedNorm',
           'UnknownFusion', 'SharedBranches', 'LoopWithBoundary', 'RepeatedFragments', 'BranchMosaic', 'WideBranches', 'WovenFusion', 'GatedMixture', 'ShapeDrivenFusion']

def main():
    for entry in ENTRIES:
        filename = 'configuration_composition.py' if entry == 'ShapeDrivenFusion' else 'gated_composition.py' if entry == 'GatedMixture' else 'local_composition.py' if entry in {'BranchMosaic', 'WideBranches', 'WovenFusion'} else 'composed_models.py'
        source = ROOT / 'tests/semantic_fixtures' / filename
        ir = analyze(source, entry)
        assert validate_ir(ir)['ok']
        output = ROOT / 'data/semantic/architecture' / (entry + '.json')
        save(output, ir)
        static_counts = (len(ir['nodes']), len(ir['edges']))
        # Keep an explicitly collected receipt in the browser catalog when its
        # entry and source generation still match this static rebuild.
        runtime_path = output.with_name(entry + '-runtime.json')
        published = output
        if runtime_path.exists():
            observed = json.loads(runtime_path.read_text())
            if (validate_ir(observed)['ok'] and observed.get('entry') == ir['entry']
                    and observed.get('runtime', {}).get('status') == 'passed'
                    and {(s['path'], s['sha256']) for s in ir['sources']}
                    <= {(s['path'], s['sha256']) for s in observed['sources']}):
                # Reuse measured events, re-associate them with the current
                # static extraction. A matching source hash is required above.
                refreshed = merge(ir, observed['runtime'])
                assert validate_ir(refreshed)['ok']
                save(runtime_path, refreshed)
                published = runtime_path
        publish(published, ROOT / 'data/semantic/catalog.json')
        print(entry, *static_counts, 'static-only',
              'matching CPU receipt reused' if published == runtime_path else 'no CPU receipt')
    source = ROOT / 'tests/semantic_fixtures/configuration_composition.py'
    cases = ['ShapeDrivenFusion', 'ReturnedDimension', 'ConfigurationBinding', 'FeatureCoefficient', 'UnknownConfiguration']
    save(ROOT / 'tests/semantic_fixtures/configuration-ir.json',
         {'schema': 'configuration-source-cases/1', 'cases': {entry: analyze(source, entry) for entry in cases}})

if __name__ == '__main__':
    main()

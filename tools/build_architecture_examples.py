"""Build original unfamiliar compositions without importing or running models."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.cli import save, publish
from semantic_adapter.schema import validate_ir

ENTRIES = ['ForeignComposition', 'BrokenCell', 'BeforeNorm', 'DisconnectedNorm',
           'UnknownFusion', 'SharedBranches', 'LoopWithBoundary', 'RepeatedFragments']

def main():
    source = ROOT / 'tests/semantic_fixtures/composed_models.py'
    for entry in ENTRIES:
        ir = analyze(source, entry)
        assert validate_ir(ir)['ok']
        output = ROOT / 'data/semantic/architecture' / (entry + '.json')
        save(output, ir)
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
                published = runtime_path
        publish(published, ROOT / 'data/semantic/catalog.json')
        print(entry, len(ir['nodes']), len(ir['edges']), 'static-only')

if __name__ == '__main__':
    main()

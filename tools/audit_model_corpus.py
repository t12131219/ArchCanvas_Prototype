#!/usr/bin/env python3
"""Read external PyTorch notebooks as data; never import/execute their code."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.cli import save
from semantic_adapter.schema import digest, validate_ir
from semantic_adapter.sources import inventory


def manifest(root):
    # Include every file, not only candidates, to detect accidental caches too.
    return [{'path': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(root.rglob('*')) if p.is_file()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT.parents[1] / 'Source_Code_Project/deeplearning-models-master/deeplearning-models-master')
    args = parser.parse_args()
    source = args.source.resolve()
    if not source.is_dir():
        parser.error('source collection is missing')
    output = ROOT / 'verification/architecture/corpus'
    output.mkdir(parents=True, exist_ok=True)
    before = manifest(source)
    listing = inventory([source])
    save(output / 'manifest-before.json', before)
    results = []
    for candidate in listing['models']:
        if not any('pytorch' in part for part in Path(candidate['file']).relative_to(source).parts):
            continue
        key = digest([candidate['file'], candidate['cell'], candidate['entry']])[:12]
        row = dict(candidate, id=key)
        try:
            ir = analyze(candidate['file'], candidate['entry'], cell=candidate['cell'])
            check = validate_ir(ir)
            if not check['ok']:
                raise ValueError(check['errors'])
            operations = [n for n in ir['nodes'] if n['kind'] in ('compute', 'opaque')]
            opaque = [n for n in operations if n['kind'] == 'opaque']
            row.update(status='extracted-static', ir='ir/' + key + '.json', nodes=len(ir['nodes']), operations=len(operations), opaque=len(opaque),
                       unknown=sorted({n.get('operator') or n.get('reason', '') for n in opaque}), coverage=ir['coverage'])
            save(output / row['ir'], ir)
        except Exception as exc:
            row.update(status='failed', reason=str(exc))
        results.append(row)
    after = manifest(source)
    report = {'schema': 'architecture-corpus/1', 'source_root': str(source), 'source_files': len(before),
              'inventory_files': len(listing['files']), 'candidates': len(results), 'model_executed': False,
              'sources_read_only': before == after, 'extracted': sum(r['status'] == 'extracted-static' for r in results),
              'opaque': sum(r.get('opaque', 0) for r in results), 'without_opaque': sum(r.get('opaque') == 0 for r in results),
              'implementation_sha256': {name: digest((ROOT / name).read_bytes()) for name in
                                        ['semantic_adapter/analyzer.py', 'semantic_adapter/motifs.py', 'semantic_adapter/sources.py', 'tools/audit_model_corpus.py']},
              'limitations': ['Successful extraction is not complete semantic or runtime support.',
                              'Notebook cell identity is retained; no training, downloads or model initialization is executed.',
                              'External wrappers, dynamic constructor factories and loop binding can remain opaque.'],
              'results': results, 'diagnostics': listing['diagnostics']}
    save(output / 'manifest-after.json', after)
    save(output / 'extraction.json', report)
    if not report['sources_read_only'] or report['extracted'] != report['candidates']:
        raise SystemExit('source changed or candidate extraction failed; inspect extraction.json')
    subprocess.run(['node', str(ROOT / 'tools/audit_model_corpus.cjs'), str(output)], cwd=ROOT, check=True)
    print(json.dumps({k: v for k, v in report.items() if k not in ('results', 'diagnostics', 'limitations')}, ensure_ascii=False))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Analyze reference collections read-only. Write only derived IR/evidence here."""
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.analyzer import analyze
from semantic_adapter.cli import save
from semantic_adapter.schema import digest, validate_ir
from semantic_adapter.sources import inventory


def main():
    source_root = ROOT.parents[1] / 'Source_Code_Project'
    roots = [source_root / 'Awesome-pytorch-list-master', source_root / 'deeplearning-models-master']
    before = inventory(roots)
    save(ROOT / 'data/semantic/source-inventory.json', before)
    references = roots[1] / 'deeplearning-models-master/pytorch_ipynb'
    selected = [
        ('mlp/mlp-basic.ipynb', 'MultilayerPerceptron', 8),
        ('cnn/cnn-basic.ipynb', 'ConvNet', 9),
        ('cnn/cnn-lenet5-mnist.ipynb', 'LeNet5', 12),
        ('autoencoder/ae-basic.ipynb', 'Autoencoder', 8),
        ('autoencoder/ae-var.ipynb', 'VariationalAutoencoder', 9),
        ('rnn/rnn_lstm_bi_imdb.ipynb', 'RNN', 17),
        ('gnn/gnn-basic-1.ipynb', 'GraphNet', 15),
    ]
    entries = [(references / path, cls, cell) for path, cls, cell in selected]
    entries.insert(0, (ROOT / 'snapshots/transformer_programmatic_guide/sources/pytorch_transformer_original/transformer.py', 'Transformer', None))
    catalog_path = ROOT / 'data/semantic/catalog.json'
    existing = json.loads(catalog_path.read_text()) if catalog_path.exists() else {'schema': 'semantic-studio/1', 'models': []}
    models, results = [], []
    for path, cls, cell in entries:
        try:
            ir = analyze(path, cls, cell=cell)
            check = validate_ir(ir)
            if not check['ok']: raise ValueError(check)
            identity = digest(ir['entry'])[:16]
            name = identity + '.json'
            save(catalog_path.parent / name, ir)
            models.append({'id': identity, 'title': cls + (' · source Transformer' if cls == 'Transformer' else ' · ' + path.parent.name),
                           'ir': name, 'source': ir['entry'], 'digest': ir['ir_digest'], 'nodes': len(ir['nodes']), 'edges': len(ir['edges']),
                           'motifs': len(ir['motifs']), 'runtime': ir['runtime']['status'], 'coverage': ir['coverage']['status']})
            results.append({'source': str(path), 'entry': cls, 'cell': cell, 'status': 'passed', 'nodes': len(ir['nodes']), 'opaque': sum(n['kind'] == 'opaque' for n in ir['nodes'])})
        except Exception as exc:
            results.append({'source': str(path), 'entry': cls, 'status': 'failed', 'reason': str(exc)})
    # Retain explicitly published probe cases. Never replace the original
    # Transformer/source-atomic catalog or any saved editor document.
    known = {m['id'] for m in models}
    models += [m for m in existing['models'] if m['id'] not in known]
    save(catalog_path, {'schema': 'semantic-studio/1', 'models': models})
    # Catalog regeneration must keep the accepted product presentation, not
    # replace it with a fresh unreviewed extraction and discard its profile.
    from tools.publish_reviewed_presentation import publish_reviewed
    presentation = publish_reviewed(ROOT)
    after = inventory(roots)
    unchanged = before['files'] == after['files']
    report = {'schema': 'semantic-collection-check/1', 'sources_read_only': unchanged, 'source_files': len(before['files']),
              'candidates': len(before['models']), 'github_links': len(before['github_links']),
              'link_only_repositories': True, 'downloaded_models': [], 'model_code_copied': False,
              'model_executed': False, 'results': results, 'presentation': presentation,
              'passed': unchanged and all(r['status'] == 'passed' for r in results)}
    save(ROOT / 'verification/semantic-collections.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not report['passed']: raise SystemExit(2)


if __name__ == '__main__': main()

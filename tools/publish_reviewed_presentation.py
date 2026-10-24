#!/usr/bin/env python3
"""Promote an audited source IR and its exact canvas frontier to the catalog.

This is publication policy, not a model selector in semantic/layout rules.
No source model is executed and the dedicated comparison assets are untouched.
"""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from semantic_adapter.cli import publish, save
from semantic_adapter.schema import validate_ir


def publish_reviewed(root=ROOT):
    report_path = root / 'verification/input-placement/current/suite-report.json'
    report = json.loads(report_path.read_text())
    rows = {row['name']: row for row in report['rows']}
    detail = rows['Transformer-F1']
    source = root / detail['input']
    payload = source.read_bytes()
    if hashlib.sha256(payload).hexdigest() != detail['input_sha256']:
        raise ValueError('Audited source IR changed; recapture before publication')
    ir = json.loads(payload)
    check = validate_ir(ir)
    if not check['ok']:
        raise ValueError(check)
    for name in ['Transformer-F0', 'Transformer-finer']:
        if rows[name]['input_sha256'] != detail['input_sha256']:
            raise ValueError('Frontiers do not use the same canonical IR')
    target = root / 'data/semantic/0216717d966327f4.json'
    target.write_bytes(payload)
    catalog_path = root / 'data/semantic/catalog.json'
    existing = json.loads(catalog_path.read_text())
    order = {m['id']: i for i, m in enumerate(existing['models'])}
    descriptor = publish(target, catalog_path)
    profile_path = root / 'data/semantic/presentations/transformer.json'
    report_sha = hashlib.sha256(report_path.read_bytes()).hexdigest()
    save(profile_path, {
        'schema': 'semantic-presentation/1',
        'revision': report_sha,
        'ir_digest': ir['ir_digest'],
        'default_state': detail['state'],
        'audit': {'report': str(report_path.relative_to(root)),
                  'report_sha256': report_sha, 'input': detail['input'],
                  'input_sha256': detail['input_sha256'],
                  'overview': 'Transformer-F0', 'detail': 'Transformer-F1',
                  'finer': 'Transformer-finer'},
    })
    catalog = json.loads(catalog_path.read_text())
    catalog['default_model'] = descriptor['id']
    for model in catalog['models']:
        if model['id'] == descriptor['id']:
            model.update(title='Transformer · 语义架构', presentation='presentations/transformer.json')
        elif model['ir'] == 'transformer-runtime.json':
            model['title'] = 'Transformer · CPU 运行证据'
    catalog['models'].sort(key=lambda model: (model['id'] != descriptor['id'], order.get(model['id'], len(order))))
    save(catalog_path, catalog)
    return {'default_model': descriptor['id'], 'ir': str(target.relative_to(root)),
            'profile': str(profile_path.relative_to(root)),
            'nodes': len(ir['nodes']), 'edges': len(ir['edges']),
            'initial_frontier': detail['name']}


def main():
    print(json.dumps(publish_reviewed(), ensure_ascii=False))


if __name__ == '__main__':
    main()

"""Verify direct cross-instance fanout alongside structural representatives."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from audit_local_svg import audit_atlas_coverage
import audit_frontier_reservations as audit

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/frontier-reservations/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    receipt = read(OUT / 'atlas-report.json')
    directory = ROOT / receipt['directory']
    manifest = read(directory / 'manifest.json')
    assert sha(directory / 'manifest.json') == receipt['manifest_sha256']
    assert sha(ROOT / receipt['input']) == receipt['input_sha256']
    for file, digest in receipt['files'].items():
        assert sha(directory / file) == digest
    for file, digest in manifest['implementation_sha256'].items():
        assert sha(ROOT / file) == digest
    audit.physical.OUT = directory
    results = []
    for panel in manifest['panels']:
        doc = read(directory / panel['document'])
        assert doc['ir'] == read(ROOT / receipt['input'])
        tree = ET.parse(directory / panel['svg'])
        nodes = {e.get('data-node-id'): e for e in tree.iter() if e.get('data-node-id')}
        paths = {e.get('data-edge-id'): e for e in tree.iter() if e.get('data-edge-id')}
        audit_atlas_coverage(manifest, panel, doc, nodes, paths)
        physical = audit.inspect({**panel, 'name': panel['label']})
        results.append({'panel': panel['svg'], 'source_use_checks': physical['source_use_checks'], 'passed': True})
    fanout = [g for g in manifest['expression_goals'] if g['kind'] == 'source-uses']
    assert len(fanout) == 3 and len(manifest['panels']) == 6
    assert all(g['status'] == 'fulfilled' and g['coverage_methods'] == ['direct'] for g in fanout)
    assert manifest['complete'] and manifest['quality_pass']
    output = {'schema': 'frontier-atlas-independent/1', 'atlas_report_sha256': sha(OUT / 'atlas-report.json'),
              'auditor_sha256': sha(Path(__file__)), 'panels': len(results), 'results': results, 'passed': True,
              'scope': 'Original IR, actual physical source-use result/consumer slots, direct cross-instance coverage, reconstructed common-structure mappings and actual paths; six readable panels cover this fixture only.'}
    (OUT / 'atlas-verification.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'panels': len(results), 'source_use_goals': len(fanout), 'passed': True}))


if __name__ == '__main__':
    main()

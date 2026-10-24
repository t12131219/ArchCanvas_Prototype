#!/usr/bin/env python3
"""Compare the live retained SVG instances with an independently rendered SVG."""
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

actual_path, expected_path = map(Path, sys.argv[1:3])
actual = json.loads(actual_path.read_text())
expected = ET.fromstring(expected_path.read_text())
tag = lambda e: e.tag.rsplit('}', 1)[-1]

def signature(e):
    return [tag(e), sorted(e.attrib.items()), e.text or '', [signature(c) for c in e]]

def body(e):
    # The tooltip and explicit expansion control are added by the editor.
    return [signature(c) for c in e if tag(c) != 'title' and not (
        tag(c) == 'text' and 'pointer-events: auto' in c.attrib.get('style', '')
        and c.text in ('+', '−'))]

expected_nodes = {e.attrib['data-id']: e for e in expected.iter() if 'data-id' in e.attrib}
expected_edges = {e.attrib['data-edge-id']: e for e in expected.iter() if 'data-edge-id' in e.attrib}
assert len(actual['nodes']) == len(expected_nodes)
assert len(actual['edges']) == len(expected_edges)
for raw in actual['nodes']:
    a = ET.fromstring(raw)
    b = expected_nodes.pop(a.attrib['data-id'])
    assert a.attrib['transform'] == b.attrib['transform'], a.attrib['data-id']
    assert body(a) == body(b), a.attrib['data-id']
for raw in actual['edges']:
    a = ET.fromstring(raw)
    b = expected_edges.pop(a.attrib['data-edge-id'])
    assert signature(a) == signature(b), a.attrib['data-edge-id']
assert not expected_nodes and not expected_edges
receipt = {'schema': 'retained-dom-check/1', 'nodes': len(actual['nodes']),
           'edges': len(actual['edges']), 'geometry_body_bindings_exact': True,
           'actual_sha256': hashlib.sha256(actual_path.read_bytes()).hexdigest(),
           'expected_sha256': hashlib.sha256(expected_path.read_bytes()).hexdigest(),
           'checker_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
print(json.dumps(receipt, ensure_ascii=False))

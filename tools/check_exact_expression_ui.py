"""Check the actual editor's text exports against the audited atomic figure."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/exact-expression/current'


def main():
    read = lambda name: json.loads((OUT / name).read_text())
    saved = read('ui-atomic-saved.json')
    audited = read('SameSource-recovery.layout.json')
    assert saved['ir'] == audited['ir']
    assert all(saved['state'].get(k) == v for k, v in audited['state'].items())
    assert set(saved['state']) - set(audited['state']) <= {'open'}
    assert (OUT / 'ui-atomic.svg').read_bytes() == (OUT / 'ui-atomic-reopened.svg').read_bytes()
    actual = ET.parse(OUT / 'ui-atomic.svg').getroot()
    formal = ET.parse(OUT / 'SameSource-recovery.svg').getroot()
    # Editor-only controls may differ, but physical nodes and exact paths must agree.
    def physical(svg):
        return [ET.tostring(e) for e in svg.iter()
                if 'data-node-id' in e.attrib or 'data-edge-id' in e.attrib]
    assert actual.attrib == formal.attrib and physical(actual) == physical(formal)
    nodes = [e for e in actual.iter() if 'data-node-id' in e.attrib]
    paths = [e for e in actual.iter() if 'data-edge-id' in e.attrib]
    assert len(nodes) == 4 and len(paths) == 2
    text = read('browser-text-report.json')
    assert len(text['results']) == 23 and not text['failures']
    names = ['ui-atomic-saved.json', 'ui-atomic.svg', 'ui-atomic-reopened.svg',
             'ui-atomic-browser.png', 'browser-text-report.json']
    report = dict(passed=True, canonical_ir_unchanged=True, svg_identical_after_reopen=True,
                  matches_audited_geometry=True, visible_nodes=len(nodes), visible_edges=len(paths),
                  browser_text_panels=23, export_method='visible application export text',
                  scope='SameSource atomic detail only; no Transformer editor interaction or full raw routing claim',
                  files={n: hashlib.sha256((OUT / n).read_bytes()).hexdigest() for n in names})
    (OUT / 'ui-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()

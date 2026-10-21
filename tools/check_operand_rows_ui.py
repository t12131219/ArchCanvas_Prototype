"""Verify real editor captures; no simulated UI operations."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/operand-rows/current'
read = lambda name: json.loads((OUT / name).read_text())
sha = lambda name: hashlib.sha256((OUT / name).read_bytes()).hexdigest()

if __name__ == '__main__':
    ir = read('ui-SameSource-input.json')['ir']
    folded, opened, raw = [read(n) for n in ['ui-saved.json', 'ui-expanded-saved.json', 'ui-source-saved.json']]
    assert all(d['schema'] == 'semantic-canvas/1' and d['ir'] == ir for d in [folded, opened, raw])
    group = 'model/44:4:composite:1/31:4:composite:1/27:4:composite:1'
    effective = read('SameSource-current.layout.json')['publication']['open']
    assert set(opened['state']['open']) == set(effective) | {group}
    assert set(read('ui-refolded-saved.json')['state']['open']) == set(effective)
    assert sha('StaggeredOperands-current.svg') == sha('ui-staggered.svg')
    assert sha('SameSource-current.svg') == sha('ui-initial.svg') == sha('ui-restored-auto.svg')
    assert sha('ui-expanded.svg') == sha('ui-expanded-reopened.svg')
    rows = []
    for name, counts in [('ui-staggered.svg', (11, 9)), ('ui-initial.svg', (17, 17)), ('ui-expanded.svg', (22, 25)), ('ui-expanded-reopened.svg', (22, 25)), ('ui-refolded.svg', (17, 17)), ('ui-restored-auto.svg', (17, 17)), ('ui-source.svg', (82, 87))]:
        svg = ET.fromstring((OUT / name).read_bytes())
        nodes = {e.get('data-id') for e in svg.findall('.//*[@data-id]')}
        edges = {e.get('data-edge-id'): e for e in svg.findall('.//*[@data-edge-id]')}
        assert (len(nodes), len(edges)) == counts, name
        original = {e['id']: e for e in ir['edges']}
        if name.startswith('ui-expanded'):
            source_nodes = {n['id']: n for n in ir['nodes']}
            internal = [e for e in original.values() if e['source'].startswith(group + '/') and e['target'].startswith(group + '/') and source_nodes[e['source']]['kind'] in {'compute', 'value-alias'} and source_nodes[e['target']]['kind'] == 'compute']
            assert len(internal) == 7
            for e in internal:
                actual = edges[e['id']]
                for attr, key in [('data-canonical-source', 'source'), ('data-canonical-target', 'target'), ('data-source-port', 'source_port'), ('data-target-port', 'target_port')]:
                    expected_value = source_nodes[e['source']].get('slot', e[key]) if key == 'source_port' else e[key]
                    assert actual.get(attr) == expected_value, (name, e['id'], key)
        if name == 'ui-source.svg':
            assert nodes == {n['id'] for n in ir['nodes']} and set(edges) == set(original)
        if name == 'ui-refolded.svg':
            initial = ET.parse(OUT / 'ui-initial.svg').getroot()
            initial_edges = {e.get('data-edge-id'): e for e in initial.findall('.//*[@data-edge-id]')}
            assert nodes == {e.get('data-id') for e in initial.findall('.//*[@data-id]')} and edges.keys() == initial_edges.keys()
            for id, e in edges.items():
                assert {k: v for k, v in e.attrib.items() if k.startswith('data-')} == {k: v for k, v in initial_edges[id].attrib.items() if k.startswith('data-')}
        rows.append(dict(file=name, nodes=len(nodes), edges=len(edges), sha256=sha(name)))
    expected = {r['name']: r for name in ['small-report.json', 'large-report.json'] for r in read(name)['rows']}
    browser = read('browser-text-report.json')
    assert len(browser['rows']) == len(expected) == 34
    for row in browser['rows']:
        formal = expected[row['panel']]
        assert not row['issues'] and row['texts'] > 0
        assert (row['nodes'], row['edges']) == (formal['nodes'], formal['edges'])
    assert sum(r['labels'] for r in browser['rows']) == 46
    shots = ['mixed-review.png', 'main-browser.png', 'editor-browser.png', 'reference-browser.png']
    result = dict(passed=True, method='Actual file chooser import, Save/SVG dialogs, double-click helper expansion, frame minus refold, restore automatic granularity, save/reimport, source Expand all.', rows=rows,
                  native_text_panels=34, port_labels=46, screenshots={n: sha(n) for n in shots}, canonical_ir_unchanged=True,
                  limits='Small fixture UI only; full large SVG routing/browser performance is unverified.')
    (OUT / 'ui-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(passed=True, states=len(rows), native_text_panels=34)))

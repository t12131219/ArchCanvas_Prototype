"""Check exports captured through the real editor; does not simulate UI actions."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/consumer-arguments/current'
read = lambda name: json.loads((OUT / name).read_text())
sha = lambda name: hashlib.sha256((OUT / name).read_bytes()).hexdigest()

if __name__ == '__main__':
    ir = read('MixedChoices.json')
    folded, opened, raw = [read(n) for n in ['ui-saved.json', 'ui-expanded-saved.json', 'ui-source-saved.json']]
    assert all(d['schema'] == 'semantic-canvas/1' and d['ir'] == ir for d in [folded, opened, raw])
    group = 'paper:conditional-collection:7f3772eb'
    assert set(opened['state']['open']) == set(folded['state']['open']) | {group}
    assert sha('MixedChoices-current.svg') == sha('ui-initial.svg') == sha('ui-reopened.svg') == sha('ui-refolded.svg')
    assert sha('ui-expanded.svg') == sha('ui-expanded-reopened.svg')
    rows = []
    for name, counts in [('ui-initial.svg', (23, 25)), ('ui-reopened.svg', (23, 25)), ('ui-expanded.svg', (30, 30)), ('ui-expanded-reopened.svg', (30, 30)), ('ui-refolded.svg', (23, 25)), ('ui-source.svg', (41, 42))]:
        svg = ET.fromstring((OUT / name).read_bytes())
        nodes = {e.get('data-id') for e in svg.findall('.//*[@data-id]')}
        edges = {e.get('data-edge-id'): e for e in svg.findall('.//*[@data-edge-id]')}
        assert (len(nodes), len(edges)) == counts
        if name.startswith('ui-expanded'):
            original = {e['id']: e for e in ir['edges']}
            for id in ['e00018', 'e00022']:
                e = edges[id];c = original[id]
                assert e.get('data-canonical-source') == c['source'] and e.get('data-canonical-target') == c['target']
                assert e.get('data-target-port') == c['target_port']
                assert any(b['edge'] == id and b['role'] == 'condition' for b in json.loads(e.get('data-semantic-bindings')))
        if name == 'ui-source.svg':
            assert nodes == {n['id'] for n in ir['nodes']} and set(edges) == {e['id'] for e in ir['edges']}
        rows.append(dict(file=name, nodes=len(nodes), edges=len(edges), sha256=sha(name)))
    reports = [read(n) for n in ['small-report.json', 'large-report.json']]
    expected = {r['name']: r for d in reports for r in d['rows']}
    browser = read('browser-text-report.json')
    assert len(browser['rows']) == len(expected) == 30
    for row in browser['rows']:
        formal = expected[row['panel']]
        assert not row['issues'] and row['texts'] > 0
        assert (row['nodes'], row['edges']) == (formal['nodes'], formal['edges'])
    shots = ['main-browser.png', 'mixed-browser.png', 'mixed-full-browser.png', 'editor-browser.png', 'reference-browser.png']
    result = dict(passed=True, method='Actual file chooser import, Save and SVG dialogs, double-click expand/refold, save/reimport, source view Expand all; captured via browser UI.', rows=rows, native_text_panels=30,
                  screenshots={n: sha(n) for n in shots}, canonical_ir_unchanged=True,
                  limits='Small real-source fixture UI only. 3371-node source projection is checked separately; full large SVG routing/browser performance is unverified.')
    (OUT / 'ui-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(passed=True, states=len(rows), native_text_panels=30)))

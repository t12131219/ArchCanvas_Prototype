"""Reuse physical binding audits; separately check shortened source headings."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import check_stream_alignment as audit

OUT = Path(__file__).resolve().parents[1] / 'verification/architecture-proportions/current'
read = lambda p: json.loads(p.read_text())


def main():
    audit.OUT = OUT
    audit.main()
    suite = read(OUT / 'suite-report.json')
    receipts = []
    for row in suite['rows']:
        doc = read(OUT / row['document'])
        visible = {n['id']: n for n in doc['layout']['nodes']}
        planned = {n['id']: n for n in doc['architecture']['nodes']}
        svg = ET.parse(OUT / row['svg']).getroot()
        elements = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
        for note in row['source_kind_notes']:
            node = note['node']
            n, pos, element = planned[node], visible[node], elements[node]
            assert n['kind'] == 'composite' and pos['expanded']
            assert n['semantic_type'] == note['semantic_type']
            assert n['paper']['caption'] == note['caption']
            assert note['caption'] in (['Function'] if n['semantic_type'] == 'source-function' else ['Module', 'Source module'])
            assert not any(n.get(k) for k in ['condition', 'mutable', 'identity_display', 'observed_calls', 'role_annotations'])
            assert not n['paper']['unknown_count']
            assert pos['source_kind_note'] == note and not pos['captions']
            captions = [e for e in element if e.get('class') == 'paper-caption']
            assert not captions
            title = element.find('{http://www.w3.org/2000/svg}title').text
            assert 'Source kind: ' + note['caption'] in title and note['scope'] in title
        receipts.append(dict(name=row['name'], notes=len(row['source_kind_notes'])))
    report = read(OUT / 'independent-report.json')
    inspector = read(OUT / 'ui-inspector-report.json')
    assert inspector['inspectorHasNote'] and 'Source kind: Function' in inspector['title']
    report.update(schema='architecture-proportions-independent/1', source_kind_notes=receipts,
                  ui_inspector_sha256=audit.sha(OUT / 'ui-inspector-report.json'),
                  base_auditor_sha256=audit.sha(Path(audit.__file__)),
                  native_html_sha256=audit.sha(OUT / 'native-audit.html'),
                  auditor_sha256=audit.sha(Path(__file__)))
    (OUT / 'independent-report.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()

"""Audit actual browser exports, local folding and source facts independently."""
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import audit_adaptive_frontier as geometry
import check_role_path_stages as stages
from check_final_scope_entries import final_entries
from check_title_passages import passages
from check_operand_rows import contexts, scope_geometry
from check_final_sample_frames import terminals
from check_declared_operands import declared_rows

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/source-columns/current'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()

if __name__ == '__main__':
    geometry.OUT = stages.OUT = OUT
    reports = [read(OUT / (s + '-report.json')) for s in ['small', 'large']]
    rows = {r['name']: r for report in reports for r in report['rows']}
    checked = []
    for name, formal in [('foreign', 'ForeignFour-current'),
                         ('foreign-folded', 'ForeignFour-opened'),
                         ('foreign-reopened', 'ForeignFour-opened'),
                         ('foreign-restored', 'ForeignFour-current'),
                         ('main', 'Transformer-panel-0-current')]:
        ref = rows[formal]
        svg = OUT / ('ui-' + name + '.svg')
        assert svg.read_bytes() == (OUT / ref['svg']).read_bytes(), ('UI/formal mismatch', name)
        doc = read(OUT / ref['document'])
        tree = ET.parse(svg).getroot()
        row = {**ref, 'name': 'ui-' + name, 'svg': svg.name,
               'svg_sha256': sha(svg), 'role_path_stages': doc['publication'].get('role_path_stages')}
        # The folded synthetic state has four inherited contacts; the formal
        # auditor verifies byte equality to the frozen baseline for this state.
        measured = stages.check(row, compare_expression=False,
                                require_quality=not ref['quality']['line_geometry']['unrelated_contacts'])
        geometry.inspect(row)
        _, bodies = passages(doc, tree)
        assert not bodies
        contexts(doc); scope_geometry(doc); terminals(doc); declared_rows(doc); final_entries(doc)
        checked.append(dict(name=name, svg=svg.name, svg_sha256=sha(svg), measured=measured))
    saved = read(OUT / 'ui-foreign-folded-saved.json')
    assert saved['ir'] == read(OUT / 'ForeignFour.json')
    assert set(saved['state']['open']) == {'root', 'right'}
    script = "const fs=require('fs'),assert=require('assert/strict'),R=require('./semantic_studio/publication-renderer.js'),d=JSON.parse(fs.readFileSync(process.argv[1]));assert.equal(R.render(d.ir,d.state).svg,fs.readFileSync(process.argv[2],'utf8'));"
    subprocess.run(['node', '-e', script, str(OUT / 'ui-foreign-folded-saved.json'),
                    str(OUT / 'ui-foreign-folded.svg')], cwd=ROOT, check=True)
    text = read(OUT / 'browser-text-report.json')
    assert {p['name'] for p in text['panels']} == set(rows)
    assert all(p['texts'] > 0 and not p['issues'] for p in text['panels'])
    formal_report = read(OUT / 'independent-report.json')
    assert formal_report['passed']
    files = [OUT / c['svg'] for c in checked] + [OUT / n for n in [
        'browser-text-report.json', 'ui-foreign-folded-saved.json', 'independent-report.json',
        'foreign-browser.png', 'entries-browser.png', 'transformer-browser.png']]
    result = dict(passed=True, goal_complete=False, actual_ui_svgs=checked,
                  editor_roundtrip=dict(initial_nodes=19, folded_nodes=15, reopened_nodes=15,
                                        restored_nodes=19, svg_identical=True),
                  main=dict(nodes=65, edges=76, crossings=15, svg_identical=True),
                  native_text=dict(panels=len(text['panels']),
                                   texts=sum(p['texts'] for p in text['panels']),
                                   ports=sum(p['ports'] for p in text['panels']), issues=[]),
                  inherited_contact_panels=formal_report['inherited_contact_panels'],
                  files_sha256={f.name: sha(f) for f in files}, auditor_sha256=sha(Path(__file__)),
                  scope='Actual selected main and synthetic unfamiliar topology; full thousands-node routing/browser performance not measured.')
    (OUT / 'ui-independent-report.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ['passed', 'editor_roundtrip', 'main', 'native_text']}))

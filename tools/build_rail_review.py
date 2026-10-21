"""Compare actual pre-repair/current SVGs without changing their geometry."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cohort-folds/current'
BASE = '41db091'
REPORT = OUT / 'large-render-report.json'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def main():
    report = json.loads(REPORT.read_text())
    candidates = []
    for row in report['rows']:
        if '-current-' not in row['name']:
            continue
        doc = json.loads((OUT / row['document']).read_text())
        receipt = doc['diagnostics']['routing'].get('parallel_rail_repair')
        if receipt and receipt['accepted']:
            candidates.append((row, receipt))
    assert candidates, 'No accepted final rail repair was measured.'
    checks, sections = [], []
    for row, receipt in candidates:
        old_name = row['name'] + '-previous.svg'
        old_path = OUT / old_name
        old_path.write_bytes(subprocess.check_output(
            ['git', 'show', BASE + ':' + str((OUT / row['svg']).relative_to(ROOT))], cwd=ROOT))
        old, new = [ET.fromstring(p.read_text()) for p in [old_path, OUT / row['svg']]]
        select = lambda t, key: {n.get(key): n for n in t.iter() if n.get(key)}
        old_nodes, new_nodes = select(old, 'data-node-id'), select(new, 'data-node-id')
        assert set(old_nodes) == set(new_nodes)
        assert all(ET.tostring(old_nodes[n]) == ET.tostring(new_nodes[n]) for n in old_nodes)
        old_edges, new_edges = select(old, 'data-edge-id'), select(new, 'data-edge-id')
        assert set(old_edges) == set(new_edges)
        changed = []
        for key, a in old_edges.items():
            b = new_edges[key]
            assert {k: v for k, v in a.attrib.items() if k != 'd'} == {k: v for k, v in b.attrib.items() if k != 'd'}
            if a.get('d') != b.get('d'):
                changed.append(key)
                terminals = lambda n: re.findall(r'[ML](-?[\d.eE+]+),(-?[\d.eE+]+)', n.get('d'))
                aa, bb = terminals(a), terminals(b)
                assert aa[0] == bb[0] and aa[-1] == bb[-1]
        assert changed
        check = dict(name=row['name'], previous_commit=BASE, previous=old_name,
                     current=row['svg'], previous_sha256=sha(old_path), current_sha256=sha(OUT / row['svg']),
                     changed_edges=changed, nodes_byte_identical=True,
                     canonical_edge_attributes_identical=True, terminals_identical=True, receipt=receipt)
        checks.append(check)
        # Clip the full native SVG with CSS only; all actual paths and nodes
        # remain available in the full comparison page linked below.
        sections.append('<h2>' + row['name'] + '</h2><div class="pair">' + ''.join(
            '<section><h3>' + label + '</h3><div class="crop">' + p.read_text() + '</div></section>'
            for label, p in [('修复前', old_path), ('修复后', OUT / row['svg'])]) + '</div>')
    (OUT / 'rail-review.html').write_text('<!doctype html><meta charset="utf-8"><title>固定节点与端口的局部绕线对照</title>'
        '<style>body{font:16px Arial;margin:24px;background:#f6f8fb;color:#293746}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}'
        'section{min-width:0;background:white;border:1px solid #ccd5e1;padding:12px}.crop{width:100%;height:420px;overflow:auto}'
        '.crop svg{max-width:none;display:block;position:relative;top:-60px}</style>'
        '<h1>固定节点与端口的局部绕线对照</h1><p>原生 SVG 局部。所有节点、端口和依赖属性不变；'
        '仅在障碍检查通过后选择更窄的平行通道。字号、面积和交叉数不退化。</p>'
        '<p><a href="review-transformer.html">完整图组与专用参考</a></p>' + ''.join(sections))
    (OUT / 'rail-report.json').write_text(json.dumps(dict(schema='rail-comparison/1', passed=True,
        auditor_sha256=sha(Path(__file__)), report_sha256=sha(REPORT), checks=checks), indent=2) + '\n')
    print(json.dumps(dict(passed=True, panels=len(checks), changed_edges=[c['changed_edges'] for c in checks])))


if __name__ == '__main__':
    main()

"""Audit rejected exploratory geometry alternatives; never change production.

The initial archival mode consumes completed /tmp probes from the 2026-10-22
continuation. Subsequent audits use the archived, ignored full layouts. Restore
those captures before running this audit if storage cleanup has removed them.
"""
from pathlib import Path
import argparse
import difflib
import hashlib
import json
import re
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/stage-geometry-probes/current'
FROZEN = Path('/tmp/archcanvas-stage-spacing-before-ecee8d4/semantic_studio')
SOURCES = {
    'baseline': ROOT / 'verification/source-summary-headings/current/Transformer-F0-current',
    'uniform24': Path('/tmp/stage-spacing-24-probe'),
    'repeat24': Path('/tmp/repeat-spacing-probe'),
    'shortcuts': Path('/tmp/archcanvas-stage-shortcut-probe/current'),
}
SNAPSHOTS = {
    'uniform16': Path('/tmp/archcanvas-stage-spacing-probe/semantic_studio'),
    'uniform20': Path('/tmp/archcanvas-stage-spacing-20-probe/semantic_studio'),
    'uniform24': Path('/tmp/archcanvas-stage-spacing-24-probe/semantic_studio'),
    'repeat24': Path('/tmp/archcanvas-repeat-spacing-probe/semantic_studio'),
    'shortcuts': Path('/tmp/archcanvas-stage-shortcut-probe/semantic_studio'),
}
LOGS = {
    'uniform16-small.log': '/tmp/stage-spacing-small-probe.log',
    'uniform20-small.log': '/tmp/stage-spacing-20-probe.log',
    'uniform24.log': '/tmp/stage-spacing-24-probe.log',
    'repeat24.log': '/tmp/repeat-spacing-probe.log',
    'repeat24-small.log': '/tmp/repeat-spacing-small-probe.log',
    'ordinary-shortcuts.log': '/tmp/archcanvas-stage-shortcut-probe/run.log',
    'ordinary-shortcuts-small.log': '/tmp/archcanvas-stage-shortcut-probe/small.log',
    'bundle-shortcuts.log': '/tmp/archcanvas-stage-shortcut-probe/bundle.log',
}
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())


def archive():
    OUT.mkdir(parents=True, exist_ok=True)
    baseline_report = read(ROOT / 'verification/source-summary-headings/current/Transformer-F0-report.json')
    baseline = baseline_report['rows'][0]['results'][1]
    assert sha(Path(str(SOURCES['baseline']) + '.svg')) == baseline['svg_sha256']
    assert sha(Path(str(SOURCES['baseline']) + '.layout.json')) == baseline['document_sha256']
    for f in FROZEN.glob('*.js'):
        assert f.read_bytes() == (ROOT / 'semantic_studio' / f.name).read_bytes(), f
    for name, stem in SOURCES.items():
        for ext in ['.svg', '.layout.json']:
            shutil.copyfile(Path(str(stem) + ext), OUT / (name + ext))
    for name, p in LOGS.items():
        shutil.copyfile(p, OUT / name)
    patches = {}
    for name, directory in SNAPSHOTS.items():
        delta = ''
        for file in sorted(FROZEN.glob('*.js')):
            other = directory / file.name
            if file.read_bytes() != other.read_bytes():
                delta += ''.join(difflib.unified_diff(file.read_text().splitlines(True), other.read_text().splitlines(True),
                    fromfile='a/semantic_studio/' + file.name, tofile='b/semantic_studio/' + file.name))
        assert delta, name
        (OUT / (name + '.patch')).write_text(delta)
        patches[name] = sha(OUT / (name + '.patch'))
    provenance = dict(baseline='ecee8d4339f8940077e8637e5f5e09836f72dffd',
        production_sha256={str(f.relative_to(ROOT)): sha(f) for f in sorted((ROOT / 'semantic_studio').glob('*.js'))},
        patches=patches, source_logs={n: sha(OUT / n) for n in LOGS},
        incomplete_runs=dict(uniform16_transformer='deliberately cancelled after generic route failures; no completed Transformer result',
            uniform20_transformer='deliberately cancelled after generic route failures; no completed Transformer result'))
    (OUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')


def inspect(name):
    doc = read(OUT / (name + '.layout.json'))
    svg = ET.parse(OUT / (name + '.svg')).getroot()
    nodes = {e.get('data-node-id'): e for e in svg.iter() if e.get('data-node-id')}
    edges = {e.get('data-edge-id'): e for e in svg.iter() if e.get('data-edge-id')}
    assert set(nodes) == {n['id'] for n in doc['layout']['nodes']}
    assert set(edges) == {e['id'] for e in doc['layout']['edges']}
    for e in doc['layout']['edges']:
        physical = edges[e['id']]
        coords = [float(s) for s in re.findall(r'[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?', physical.get('d'))]
        points = e['route']['points']
        assert coords == [v for p in points for v in [p['x'], p['y']]]
        assert e['route']['ok']
        assert all(a['x'] == b['x'] or a['y'] == b['y'] for a, b in zip(points, points[1:]))
    q = doc['diagnostics']['publication']
    assert not q['issues'] and not q['route_failures'] and not q['unplaced_port_labels']
    return doc, nodes, edges


def audit():
    provenance = read(OUT / 'provenance.json')
    for f, h in provenance['production_sha256'].items():
        assert sha(ROOT / f) == h, ('changed production; use the frozen baseline for this historical audit', f)
    for n, h in provenance['patches'].items():
        assert sha(OUT / (n + '.patch')) == h
    for n, h in provenance['source_logs'].items():
        assert sha(OUT / n) == h
    base, nodes, edges = inspect('baseline')
    rows = []
    for name in SOURCES:
        d, ns, es = inspect(name)
        for key in ['ir', 'architecture', 'publication', 'expression_goals', 'summary_goals', 'expression_coverage', 'summary_coverage']:
            assert base[key] == d[key], (name, key)
        for key in ['node_accounting', 'edge_accounting', 'representatives', 'frame_ownership']:
            assert base['layout'][key] == d['layout'][key], (name, key)
        without_route = lambda doc: [{k: v for k, v in e.items() if k != 'route'} for e in doc['layout']['edges']]
        assert without_route(base) == without_route(d)
        for n, element in ns.items():
            texts = lambda x: [''.join(t.itertext()) for t in x if t.tag.endswith('text')]
            assert texts(element) == texts(nodes[n]), (name, n)
        for e, element in es.items():
            assert {k:v for k,v in element.attrib.items() if k != 'd'} == {k:v for k,v in edges[e].attrib.items() if k != 'd'}
        q = d['diagnostics']['publication']
        row = dict(name=name, svg_sha256=sha(OUT / (name + '.svg')), document_sha256=sha(OUT / (name + '.layout.json')),
            nodes=len(ns), edges=len(es), width=q['native_width_px'], height=q['native_height_px'],
            wire_length=q['wire_length'], crossings=q['line_geometry']['crossings'],
            font_px=q['min_canvas_font_px'], route_failures=len(q['route_failures']),
            same_facts_frontier_goals_bindings_and_text=True, adopted=False)
        rows.append(row)
    assert rows[0]['svg_sha256'] == rows[-1]['svg_sha256'], 'shortcut probe must remain an actual no-op'
    assert rows[1]['width'] > rows[0]['width'] and rows[1]['wire_length'] > rows[0]['wire_length']
    assert rows[2]['wire_length'] > rows[0]['wire_length']
    small = [json.loads(line) for line in (OUT / 'ordinary-shortcuts-small.log').read_text().splitlines()]
    assert small
    gains = [r for r in small if r['before'] != r['after']]
    assert all(r['after'][0] < r['before'][0] and r['after'][1] < r['before'][1] and r.get('record', {}).get('selected') for r in gains)
    result = dict(schema='stage-geometry-probes/1', baseline=provenance['baseline'], production_changed=False,
        formal_regression_rerun=False, exploratory=True, rows=rows, ordinary_shortcut_small_cases=len(small), ordinary_shortcut_small_gains=gains,
        shortcut_promotion='not promoted: complete final-stage summary-goal safeguards and formal generic validation still required; Transformer unchanged',
        incomplete_runs=provenance['incomplete_runs'], goal_complete=False)
    (OUT / 'audit.json').write_text(json.dumps(result, indent=2) + '\n')
    cards = ''.join('<article><h3>' + r['name'] + '</h3><p>' + str(r['width']) + ' × ' + str(r['height']) +
        ' · 线长 ' + str(r['wire_length']) + ' · 交叉 ' + str(r['crossings']) + '</p><a href="' + r['name'] +
        '.svg"><img src="' + r['name'] + '.svg" alt="' + r['name'] + '"></a></article>' for r in rows[:3])
    html = '\n'.join(['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>粗档几何试算 · 未采用候选审核</title>',
        '<style>body{font:15px system-ui;margin:24px;color:#293746;background:#f5f7fa}h1{font-size:24px}p{line-height:1.6}.comparison,.trials{display:grid;gap:16px}.comparison{grid-template-columns:1fr 1fr}.trials{grid-template-columns:repeat(3,1fr)}article{background:white;padding:16px;border:1px solid #dae1e9;border-radius:8px}img{width:100%;height:630px;object-fit:contain;object-position:top}h2{font-size:19px}h3{margin:0}a{color:#265e99}</style>',
        '<h1>F0 粗档几何试算：本轮未采用布局变更</h1>',
        '<p>双目标继续有效：F0 接近专用折叠图；F1 接近专用展开图；均保留更细事实入口。此页是探索对照，未宣称目标收敛。</p>',
        '<div class="comparison"><article><h2>专用折叠参考 · 仅供评估</h2><img src="../../generic-convergence/current/reference-collapsed.svg" alt="专用折叠参考"></article>',
        '<article><h2>当前通用 F0 · 保留基线</h2><p>28 图元 / 37 连接 · 848 × 1676 · 线长 15059.3 · 9 交叉</p><img src="baseline.svg" alt="当前通用粗档"></article></div>',
        '<h2>间距候选：少一处交叉，但线长增加</h2><p>uniform24 增宽约 3.6%、线长增加约 3.6%；repeat24 高度减少 18px、线长增加约 3.1%。均不采用。</p>',
        '<div class="trials">' + cards + '</div>',
        '<h2>固定端点捷径</h2><p>普通连线及束线试算均未改变 Transformer SVG。57 个小案例中 MutableShape 有局部收益；尚未补齐最终阶段摘要目标的验证，因此不提升为正式规则。</p>',
        '<p>四份完整布局通过事实、前沿、摘要/直接目标、原始绑定、XML 路径和文字保留检查。未修改生产规则，未重跑全量回归或展开交互。</p>',
        '<p><a href="audit.json">审核结果</a> · <a href="provenance.json">实现与补丁哈希</a> · <a href="shortcuts.svg">捷径试算 SVG</a> · <a href="ordinary-shortcuts-small.log">57 个小案例原始日志</a></p></html>'])
    (OUT / 'review.html').write_text(html)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', action='store_true', help='archive completed temporary probes before auditing')
    args = parser.parse_args()
    if args.archive:
        archive()
    audit()

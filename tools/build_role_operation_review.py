"""Build an actual-SVG comparison, local crops and a native text audit page."""
import hashlib
import html
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/role-operation-stages/current'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())


def main():
    report = read(OUT / 'render-report.json')
    metrics = read(OUT / 'independent-report.json')['metrics']
    crops = []
    for variant in ['before', 'grouped']:
        row = next(r for r in report['rows'] if r['name'] == 'Transformer-' + variant)
        doc = read(OUT / row['document'])
        reference = read(OUT / 'Transformer-grouped.layout.json')['publication']['role_operation_stages']['rows'][0]
        owner = reference['roles'][0]['owner']
        box = next(n for n in doc['layout']['nodes'] if n['id'] == owner)
        svg = (OUT / row['svg']).read_text()
        x, y, w, h = box['x'] - 16, box['y'] - 16, box['w'] + 32, box['h'] + 32
        tag = re.search(r'<svg\b[^>]*>', svg)[0]
        changed = re.sub(r'viewBox="[^"]+"', f'viewBox="{x} {y} {w} {h}"', tag)
        changed = re.sub(r'\bwidth="[^"]+"', f'width="{w}px"', changed)
        changed = re.sub(r'\bheight="[^"]+"', f'height="{h}px"', changed)
        filename = 'Transformer-' + variant + '-local.svg'
        (OUT / filename).write_text(svg.replace(tag, changed, 1))
        crops.append(dict(file=filename, source=row['svg'], source_sha256=sha(OUT / row['svg']), sha256=sha(OUT / filename), owner=owner, viewbox=[x, y, w, h]))
    (OUT / 'crop-report.json').write_text(json.dumps(dict(schema='actual-svg-crops/1', rows=crops), indent=2) + '\n')
    css = 'body{font:15px system-ui;color:#233348;background:#edf2f7;margin:24px}h1{font-size:26px}p{max-width:1100px;line-height:1.6}table{border-collapse:collapse;background:white}td,th{border:1px solid #cbd5e1;padding:8px;text-align:left}.grid{display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap}.panel{background:white;padding:14px;border:1px solid #cbd5e1}.panel img{display:block;max-width:100%;height:auto}.whole{width:500px}.local{width:310px}section{margin:28px 0}a{color:#1d4ed8}'
    body = ['<!doctype html><meta charset="utf-8"><title>角色与后续运算合组审核</title><style>' + css + '</style>',
            '<h1>角色与后续运算合组：可展开的语义中间状态</h1>',
            '<p>可选开关：角色与后续运算合组。基于证书角色和独占依赖，将角色及其后续普通一元运算放入一个展示阶段；摘要仍列出每一步运算。规则不按模型名称选择。默认 SVG 与冻结基线逐字节相同。</p>',
            '<p>这是局部表达改进。宽度、原子计算直接覆盖及展开后尺寸都可能付出代价；它尚未使整张图达到专用参考的模块组织和版式，也未验证数千节点完整 SVG 的交互性能。</p>',
            '<p><a href="text-qa.html">全部原始 SVG 与原生文字审核页</a> · <a href="independent-report.json">独立事实及几何审核</a></p>',
            '<table><tr><th>输入</th><th>节点 / 边</th><th>宽 × 高</th><th>面积变化</th><th>交叉</th><th>直接表达目标</th></tr>']
    for entry in report['comparisons']:
        a, b = [metrics[entry[k]] for k in ['before', 'current']]
        body.append(f'<tr><td>{entry["name"]}</td><td>{a["nodes"]}/{a["edges"]} → {b["nodes"]}/{b["edges"]}</td><td>{a["width"]:g} × {a["height"]:g} → {b["width"]:g} × {b["height"]:g}</td><td>{(b["area"]/a["area"]-1)*100:+.1f}%</td><td>{a["crossings"]} → {b["crossings"]}</td><td>{a["direct_goals"]} → {b["direct_goals"]} / {b["expression_goals"]}</td></tr>')
    body += ['</table><h2>Transformer 前馈局部：同一实际 SVG 的裁切</h2>',
             '<p>左为基线，右为开启合组。ReLU → Dropout 明确打印在摘要中；双击后恢复两个原始运算。此处仅调整查看窗口，内部坐标和连线保持实际输出。</p><div class="grid">']
    for variant, label in [('before', '基线'), ('grouped', '合组')]:
        body.append(f'<div class="panel local"><h3>{label}</h3><img src="Transformer-{variant}-local.svg"></div>')
    body += ['</div><h2>陌生、残缺与混合结构</h2>']
    for name in ['QuartzPath', 'RenamedPath', 'EscapingPath', 'InterruptedPath', 'ConditionalStageWeave', 'MixedStageWeave']:
        entry = next(r for r in report['comparisons'] if r['name'] == name)
        body.append(f'<section><h3>{name}</h3><div class="grid">')
        for variant, label in [('before', '基线'), ('grouped', '合组'), ('opened', '展开')]:
            f = OUT / (name + '-' + variant + '.svg')
            if f.exists():
                body.append(f'<div class="panel" style="max-width:440px"><h4>{label}</h4><img src="{f.name}" style="max-height:720px"></div>')
        body.append('</div></section>')
    body += ['<h2>完整 Transformer 与专用参考</h2><p>专用详细图作为表达质量参照。整体差距仍然存在；本次只改变两个局部运算阶段。隐藏原始运算仍记为未直接表达，不能用摘要冒充原子计算覆盖。</p><div class="grid">']
    for f, label in [('Transformer-before.svg', '通用基线'), ('Transformer-grouped.svg', '通用合组'), ('../../../snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg', '专用详细图')]:
        body.append(f'<div class="panel whole"><h3>{label}</h3><a href="{f}"><img src="{f}"></a></div>')
    body.append('</div>')
    (OUT / 'review.html').write_text('\n'.join(body))
    for name, title, images in [
        ('local', 'Transformer 前馈局部：实际 SVG 裁切', [('Transformer-before-local.svg', '基线'), ('Transformer-grouped-local.svg', '合组')]),
        ('quartz', '陌生链路：摘要仍可展开', [('QuartzPath-before.svg', '基线'), ('QuartzPath-grouped.svg', '合组'), ('QuartzPath-opened.svg', '展开')]),
        ('mixed', '未知调用、GRU 状态与独立合组共存', [('MixedStageWeave-before.svg', '基线'), ('MixedStageWeave-grouped.svg', '合组')]),
        ('transformer', 'Transformer 全图与专用详细参考', [('Transformer-before.svg', '通用基线'), ('Transformer-grouped.svg', '通用合组'), ('../../../snapshots/transformer_programmatic_guide/generated/figure3_detailed.svg', '专用详细图')])]:
        content = ['<!doctype html><meta charset="utf-8"><title>' + title + '</title><style>' + css + '.grid{flex-wrap:nowrap}.panel{min-width:0;flex:1}.panel img{max-height:950px;margin:auto}</style>',
                   '<p><a href="review.html">返回完整审核</a></p><h1>' + title + '</h1><div class="grid">']
        content += [f'<div class="panel"><h3>{label}</h3><img src="{f}"></div>' for f, label in images]
        content.append('</div>')
        (OUT / ('review-' + name + '.html')).write_text('\n'.join(content))
    expected = {r['name']: r['svg'] for r in report['rows']}
    for f in ['ui-QuartzPath-summary.svg', 'ui-QuartzPath-opened.svg', 'ui-QuartzPath-raw.svg', 'ui-MixedStageWeave-grouped.svg', 'ui-Transformer-grouped.svg']:
        if (OUT / f).exists():
            expected[f] = f
    sections = ['<!doctype html><meta charset="utf-8"><meta name="inline-render-report-sha256" content="' + sha(OUT / 'render-report.json') + '"><title>角色运算合组原生 SVG 文字审核</title><style>body{font:14px system-ui;background:#edf2f7}section{background:white;margin:20px;padding:12px;width:max-content}svg{display:block}</style>']
    for name, f in expected.items():
        sections.append('<section data-panel="' + html.escape(name) + '"><h2>' + html.escape(name) + '</h2>' + (OUT / f).read_text() + '</section>')
    (OUT / 'text-qa.html').write_text('\n'.join(sections))
    shutil.copyfile(ROOT / 'verification/joint-preflights/current/browser-text-probe.js', OUT / 'browser-text-probe.js')
    print(json.dumps(dict(panels=len(expected), crops=len(crops))))


if __name__ == '__main__':
    main()

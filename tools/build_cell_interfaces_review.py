"""Build review pages from actual frozen/current SVG captures."""
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/cell-interfaces/current'
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def page(title, rows):
    html = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px Arial,sans-serif;margin:24px;color:#293746;background:#f4f6f8}}h1{{font-size:23px}}h2{{font-size:19px}}p{{line-height:1.7}}.columns{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}}article{{background:white;border:1px solid #ced5df;border-radius:8px;padding:14px;overflow:hidden}}article h3{{margin:0 0 8px;font-size:16px}}article svg{{width:100%;height:auto;display:block}}a{{color:#315c96}}section{{margin:26px 0}}.metrics{{font:13px monospace}}nav{{display:flex;gap:22px;flex-wrap:wrap}}</style>
<h1>{title}</h1><p>同一份新抽取 IR，对比旧版与当前展示。新增的是已注册框架单步接口：当前输入、传入状态与返回状态；不推断时间循环或内部门结构。另行对照旧抽取器，核对原先未知的单元调用及全部源码操作数。模块标题允许穿线。</p>
<nav><a href="review.html">状态接口详图</a><a href="mixed-review.html">混合与条件组合</a><a href="all-review.html">全部正式 SVG</a><a href="independent-checks.json">独立 SVG / 源码审核</a><a href="extraction-audit.json">抽取器真实对照</a></nav>'''
    for row in rows:
        html += f'<section id="{escape(row["name"], quote=True)}"><h2>{escape(row["name"])}</h2><div class="columns">'
        for capture in row['results']:
            file = capture['svg']
            svg = ET.parse(OUT / file).getroot()
            svg.set('width', '100%');svg.set('height', 'auto')
            q = capture['quality']
            title = '本轮前 · 同一 IR' if capture['suffix'] == 'before' else '当前'
            metric = f"{q['native_width_px']} × {q['native_height_px']} · crossings {q['line_geometry']['crossings']} · wire {q['wire_length']} · issues {q['issues']}"
            html += f'<article data-artifact="{escape(file)}"><h3>{title}</h3><p class="metrics">{escape(metric)}</p>{ET.tostring(svg, encoding="unicode")}<a href="{escape(file)}">原尺寸 SVG</a></article>'
        html += '</div></section>'
    return html + '<p>单步接口不会证明完整时间递归、专家路由或隐藏的内部门结构。状态通道与标签有版式成本；双状态汇合图交叉增加，不能称为全图紧凑度改善。完整架构收敛目标仍未完成。</p></html>'


if __name__ == '__main__':
    read = lambda f: json.loads((OUT / f).read_text())
    small = read('small-report.json')['rows']
    by = {r['name']: r for r in small}
    selected = [by[n] for n in ['StepPair-detail', 'StepGate-detail', 'ZeroStep-detail', 'NoneStep-detail', 'ConditionalStep-detail']]
    (OUT / 'review.html').write_text(page('单步状态接口：明确输入、隐藏状态与细胞状态', selected))
    mixed = [by[n] for n in ['StateWorkshop', 'StateWorkshop-open', 'StateWorkshop-detail', 'StepPair', 'ConditionalStep', 'ExpandedArguments', 'ExtraArgument', 'NamedImpostor']]
    (OUT / 'mixed-review.html').write_text(page('单步状态接口与门控、条件及未知调用组合', mixed))
    (OUT / 'all-review.html').write_text(page('单步状态接口：全部正式 SVG 对照', small + [read(f'Transformer-panel-{i}-report.json')['rows'][0] for i in range(3)]))

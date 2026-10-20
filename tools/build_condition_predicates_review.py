"""Compare actual conditional summaries, continued detail and full-model costs."""
import hashlib
from html import escape
import json
from pathlib import Path
from build_dependency_tree_review import svg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/condition-predicates/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    digest = hashlib.sha256((OUT / 'render-report.json').read_bytes()).hexdigest()
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>条件区域摘要与继续展开</title>'
            f'<meta name="render-report-sha256" content="{digest}">'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:20px}h1{font-size:23px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:18px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:620px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}a{color:#176093}</style>'
            '<h1>条件区域摘要与继续展开</h1><p class="notice">当一个源码比较仅被直接相连的 if 消费，且区域没有未知、状态、共享或运行观测边界，'
            '可将比较放入已有条件区域。摘要打印真实条件；展开保留原比较、控制与分支。规则在细节分配后执行，展开集合保持不变。'
            '此处没有证明任意 Python 比较行为、分支可达性或完整模型语义。</p>')

    def card(name):
        r, q = rows[name], rows[name]['quality']
        predicates = (r.get('condition_predicates') or {}).get('rows', [])
        counts = {status: sum(p['status'] == status for p in predicates) for status in ['summary', 'expanded', 'folded']}
        return (f'<article data-case="{escape(name)}"><h2>{escape(name)}</h2><p>{r["nodes"]} 图元 / {r["edges"]} 边 · '
                f'{q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉 · '
                f'{len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p>'
                f'<p>条件区域：摘要 {counts["summary"]} / 展开 {counts["expanded"]} / 上层折叠 {counts["folded"]}；'
                f'几何限制：{escape(", ".join(q["issues"]) or "无已报告限制")}。<a href="{escape(r["svg"])}">原始 SVG</a></p>'
                + svg(OUT / r['svg'], name) + '</article>')

    groups = [(['ConditionalSplice-summary-before', 'ConditionalSplice-summary', 'ConditionalSplice-opened'],
               '同一手动展开范围：两处条件摘要的图元 17 → 15，边 19 → 15；再展开一处恢复到 20 个图元。'),
              (['ConditionalSplice-before', 'ConditionalSplice-current'],
               '自动状态：图元数量不变，交叉减少，但图高增加。不能将局部组织收益表述为全面紧凑。')]
    for name in ['EscapingDecision', 'UnknownDecision', 'MixedWeave', 'ConditionalCarry']:
        groups.append(([name + '-before', name + '-current'],
                       '保留原有边界；复用的比较、未知决策或已有独立结构不因本规则而被合并。'))
    text = head
    for names, note in groups:
        text += '<p class="notice">' + note + '</p><div class="cards">' + ''.join(card(n) for n in names) + '</div>'
    (OUT / 'comparison.html').write_text(text + '</html>')

    before, current = rows['transformer-before'], rows['transformer-current']
    text = head + '<p class="notice">专用图的全展开状态，是通用图某个中间语义状态的评价参考。默认 Transformer 图与冻结基线'
    text += '逐字节一致' if before['svg_sha256'] == current['svg_sha256'] else '存在变化'
    text += '。下方保留同一显式角色细化请求的前后结果，展示实际几何成本；该请求不是自动采用的默认状态。'
    text += '条件局部规则不代表专用参考接近度已经改善。全部 3371 节点 / 3663 边的原始投影可恢复；数千节点同屏路由与交互性能未验证。</p>'
    text += '<div class="cards">' + card('transformer-before') + card('transformer-current') + '</div>'
    a, b = rows['transformer-role-before'], rows['transformer-role-current']
    text += ('<p class="notice">同一显式角色展开：'
             f'{a["nodes"]} → {b["nodes"]} 图元，{a["edges"]} → {b["edges"]} 边，'
             f'交叉 {a["quality"]["line_geometry"]["crossings"]} → {b["quality"]["line_geometry"]["crossings"]}，'
             f'高度 {a["quality"]["native_height_px"]} → {b["quality"]["native_height_px"]}。'
             '前后均超出画布面积预算；这不是已通过预算的默认状态，也不证明整图更接近专用参考。</p>')
    text += '<div class="cards">' + card('transformer-role-before') + card('transformer-role-current') + '</div>'
    text += '<div class="cards"><article data-case="reference"><h2>专用完全展开参考（仅评价）</h2>'
    text += svg(ROOT / report['reference']['svg'], 'reference') + '</article>' + card('transformer-current') + '</div></html>'
    (OUT / 'transformer-comparison.html').write_text(text)
    (OUT / 'text-qa.html').write_text(head + ''.join(card(n) for n in rows) + '</html>')
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()

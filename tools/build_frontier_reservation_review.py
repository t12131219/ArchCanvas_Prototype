"""Build visual review from actual measured states and rejected trials."""
import hashlib
from html import escape
import json
from pathlib import Path

from build_dependency_tree_review import svg

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/frontier-reservations/current'


def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    rows = {r['name']: r for r in report['rows']}
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>语义前沿与摘要预算审核</title>'
            f'<meta name="render-report-sha256" content="{hashlib.sha256((OUT / "render-report.json").read_bytes()).hexdigest()}">'
            '<style>body{font:15px Arial,sans-serif;color:#26364a;margin:20px}h1{font-size:23px}h2{font-size:17px}'
            '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px;margin-bottom:18px}'
            'article{border:1px solid #bbc9d7;padding:12px;min-width:0}svg{width:100%;height:600px;display:block}'
            '.notice{background:#fff1d3;padding:14px}p{overflow-wrap:anywhere}</style>'
            '<h1>语义前沿与摘要预算审核</h1><p class="notice">先确定逻辑细节前沿，再降低为可逆摘要；'
            '摘要省出的节点名额不自动展开邻区。同一结果的多处使用可以独立申请细节，必须露出生产者、全部消费者及真实端口路径，'
            '再通过实际布局成本审核。它不表示并行执行，也不表示完整模型认证。</p>')

    def card(name):
        r = rows[name]
        q = r['quality']
        text = (f'<article data-case="{escape(name)}"><h2>{escape(name)}</h2><p>{r["nodes"]} 图元 / {r["edges"]} 边 · '
                f'{q["native_width_px"]} × {q["native_height_px"]} px · {q["line_geometry"]["crossings"]} 交叉 · '
                f'{len(q["line_geometry"]["unrelated_contacts"])} 无关接触</p>')
        if r.get('adaptive'):
            text += '<p>' + escape('; '.join(('采用' if a['accepted'] else '未采用') + ' ' + a['opportunity'].get('type', a['opportunity']['kind']) +
                ' · 表达收益 ' + str(a['gain']) + (' · ' + ', '.join(a['reasons']) if a['reasons'] else '') for a in r['adaptive']['attempts']) or '没有可测量的新机会') + '</p>'
        return text + svg(OUT / r['svg'], name) + '</article>'

    def group(names):
        return '<div class="cards">' + ''.join(card(n) for n in names) + '</div>'

    text = head + '<p class="notice">FrontierMosaic：默认图保持紧凑；多处使用细节候选虽有收益，但面积超过基线的 2.5 倍而未采用。'
    text += 'BranchedMosaic：另一份陌生组合的相同关系候选通过成本审核。不同决定来自实测成本。</p>'
    for name in ['FrontierMosaic', 'BranchedMosaic', 'UnknownMosaic', 'NestedMosaic']:
        text += group([name + '-before', name + '-current', name + '-adaptive'])
        trials = [r['name'] for r in report['rows'] if r.get('trial_for') == name + '-adaptive']
        text += group(trials + [name + '-opened'])
    (OUT / 'comparison.html').write_text(text + '</html>')
    text = head + '<p class="notice">Transformer：默认图 98 → 94 图元，2588 × 4634 → 2588 × 4364。'
    text += '保留 32 个已露出的认证角色和全部原始展开能力；交叉 56 → 57，无关接触均为 0。'
    text += '相邻可选计算恢复为较粗粒度，这不是同等细节下的纯几何压缩。整体仍明显没有达到专用参考。</p>'
    text += group(['transformer-before', 'transformer-current'])
    text += group(['transformer-focused', 'transformer-focused-open'])
    text += group(['transformer-current', 'transformer-adaptive'])
    trials = [r['name'] for r in report['rows'] if r.get('trial_for') == 'transformer-adaptive']
    if trials:
        text += '<h2>自适应候选的真实结果（含未采用状态）</h2>' + group(trials)
    text += '<div class="cards"><article><h2>专用完全展开参考（仅评价）</h2>' + svg(ROOT / report['reference']['svg'], 'reference') + '</article>' + card('transformer-current') + '</div></html>'
    (OUT / 'transformer-comparison.html').write_text(text)
    names = list(rows)
    (OUT / 'text-qa.html').write_text(head + ''.join(group(names[i:i+2]) for i in range(0, len(names), 2)) + '</html>')
    print(json.dumps({'panels': len(rows)}))


if __name__ == '__main__':
    main()

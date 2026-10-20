#!/usr/bin/env python3
"""Review only the hashed output of the producer; no diagram regeneration."""
import hashlib
from html import escape
import json
import sys
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/inline-sequences/current'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    global OUT
    if '--stages' in sys.argv:
        sys.argv.append('--pipelines')
    if '--pipelines' in sys.argv:
        sys.argv.append('--flows')
    if '--flows' in sys.argv:
        sys.argv.append('--branches')
    if '--branches' in sys.argv:
        sys.argv.append('--context')
    if '--context' in sys.argv:
        sys.argv.append('--expressions')
    if '--expressions' in sys.argv:
        OUT = ROOT / 'verification/local-expressions/current'
    if '--roles' in sys.argv:
        OUT = ROOT / 'verification/role-frontier/current'
    if '--frames' in sys.argv:
        OUT = ROOT / 'verification/frame-ownership/current'
    if '--context' in sys.argv:
        OUT = ROOT / 'verification/context-lanes/current'
    if '--branches' in sys.argv:
        OUT = ROOT / 'verification/branch-columns/current'
    if '--flows' in sys.argv:
        OUT = ROOT / 'verification/flow-entries/current'
    if '--pipelines' in sys.argv:
        OUT = ROOT / 'verification/local-pipelines/current'
    if '--stages' in sys.argv:
        OUT = ROOT / 'verification/contract-stages/current'
    report = json.loads((OUT / 'render-report.json').read_text())
    serial = 0

    def svg(file, digest, viewport=None):
        nonlocal serial
        assert sha(file) == digest
        element = ET.parse(file).getroot()
        if viewport:
            element.set('viewBox', ' '.join(str(v) for v in viewport))
            element.set('width', str(viewport[2]) + 'px')
            element.set('height', str(viewport[3]) + 'px')
        ids = {e.get('id'): f'panel-{serial}-' + e.get('id') for e in element.iter() if e.get('id')}
        serial += 1
        for e in element.iter():
            for key, value in list(e.attrib.items()):
                if key == 'id':
                    e.set(key, ids[value])
                else:
                    for old, new in ids.items():
                        value = value.replace('url(#' + old + ')', 'url(#' + new + ')')
                    e.set(key, value)
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        return ET.tostring(element, encoding='unicode')

    def card(row):
        q = row['quality']
        return (f'<article data-case="{escape(row["name"])}"><h2>{escape(row["name"])}</h2>'
                f'<p>{row["nodes"]} 图元 / {row["edges"]} 条连接 · {q.get("native_width_px", "—")} × {q.get("native_height_px", "—")} px'
                f' · {q["line_geometry"]["crossings"]} 处交叉 · {escape(", ".join(q["issues"]) or "当前几何检查通过")}</p>'
                + svg(OUT / row['svg'], row['svg_sha256'])
                + f'<p><a href="{row["svg"]}">原始 SVG</a> · <a href="{row["document"]}">布局与完整事实</a></p></article>')

    digest = sha(OUT / 'render-report.json')
    head = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
            f'<meta name="inline-render-report-sha256" content="{digest}"><title>通用语义折叠：仍未达到参考前沿</title>'
            '<style>body{font:15px Arial,sans-serif;color:#253448;margin:24px}h2{font-size:18px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{border:1px solid #cbd3dd;padding:16px;min-width:0}svg{width:100%;height:720px;display:block}.notice{padding:16px;background:#fff2dc}p{overflow-wrap:anywhere}a{color:#315a91}</style>'
            '<h1>通用语义折叠与组合布局</h1><p class="notice">目标尚未完成。对照的是通用图的适当中间前沿；通用图保留更细的展开能力。参考图只用于评价。当前已形成整图中的具体代表调用、连续后续调用摘要及独立输入流程的端口对齐；仍未证明与参考图的角色、边界和视觉组织相对应。</p>'
            '<p><a href="render-report.json">生产记录</a> · <a href="svg-report.json">独立 SVG 检查</a> · <a href="ui-report.json">实际 UI 保存与重开</a></p>')
    if '--roles' in sys.argv or '--expressions' in sys.argv:
        head = head.replace('当前已形成整图中的具体代表调用、连续后续调用摘要及独立输入流程的端口对齐', '本轮依据已有证书角色选择局部内部层级；嵌套契约、条件与未知边界保留进一步展开')
    if '--frames' in sys.argv:
        head = head.replace('当前已形成整图中的具体代表调用、连续后续调用摘要及独立输入流程的端口对齐', '本轮将已展开的冗余源码外框转为可恢复的来源附注；逐条操作数和控制边界仍保留')
    if '--expressions' in sys.argv:
        head = head.replace('本轮依据已有证书角色选择局部内部层级；嵌套契约、条件与未知边界保留进一步展开', '本轮将独立门控、状态、选择、条件、未知与身份关系纳入局部表达请求和预算；证书及控制边界保留')
    if '--context' in sys.argv:
        head = head.replace('本轮将独立门控、状态、选择、条件、未知与身份关系纳入局部表达请求和预算；证书及控制边界保留', '本轮比较按真实跨边生成的侧端口与通道候选，只有实际几何改善才采用；模块与更深的展开能力保留')
    if '--branches' in sys.argv:
        head = head.replace('本轮比较按真实跨边生成的侧端口与通道候选，只有实际几何改善才采用；模块与更深的展开能力保留', '本轮按真实依赖路径建立分支列对应；仅已展开的纯展示分带转为可恢复附注。未知及条件节点独立保留')
    if '--flows' in sys.argv:
        head = head.replace('本轮按真实依赖路径建立分支列对应；仅已展开的纯展示分带转为可恢复附注。未知及条件节点独立保留', '本轮按独立入口组织相邻计算区域，真实上下文箭头可以向上连接。分列、已实现通道及更细展开能力保留')
    if '--pipelines' in sys.argv:
        head = head.replace('本轮按独立入口组织相邻计算区域，真实上下文箭头可以向上连接。分列、已实现通道及更细展开能力保留', '本轮用真实局部依赖解释折叠源码区域，保留原始操作数与继续展开能力。未知、条件及中间结果外流区域保持原边界')
    if '--stages' in sys.argv:
        head = head.replace('本轮用真实局部依赖解释折叠源码区域，保留原始操作数与继续展开能力。未知、条件及中间结果外流区域保持原边界', '本轮将已认证的相加与后置归一化角色形成可展开阶段，原始绑定保留；更细展开的整图布局仍有退化')
    rows = {r['name']: r for r in report['rows']}
    reference_cards = {}
    for ref in report['reference']:
        reference_cards[ref['view']] = ('<article data-reference="' + ref['view'] + '"><h2>专用图 · ' + ref['view'] + '</h2><p>实际编辑器 DOM；仅作为评价资料。</p>'
                                        + svg(ROOT / ref['svg'], ref['svg_sha256']) + '</article>')
    compare = head + '<h2>摘要状态</h2><div class="cards">' + reference_cards['collapsed'] + card(rows['transformer-overview']) + '</div>'
    compare += '<h2>参考展开状态与通用语义边界</h2><div class="cards">' + reference_cards['expanded'] + card(rows['transformer-semantic']) + '</div>'
    if '--roles' in sys.argv or '--expressions' in sys.argv:
        rows['transformer-detailed'] = rows['transformer-roles']
    compare += '<h2>通用图仍可继续展开</h2><div class="cards">' + card(rows['transformer-before']) + card(rows['transformer-detailed']) + '</div>'
    compare += '<h2>其他通用组合</h2><div class="cards">' + ''.join(card(r) for r in report['rows'] if not r['name'].startswith('transformer')) + '</div></html>'
    (OUT / 'review.html').write_text(compare)
    compact = head.replace('height:720px', 'height:560px')
    compact += '<h2>参考展开状态与通用语义边界</h2><div class="cards">' + reference_cards['expanded'] + card(rows['transformer-roles'] if '--roles' in sys.argv or '--expressions' in sys.argv else rows['transformer-semantic']) + '</div></html>'
    (OUT / 'transformer-comparison.html').write_text(compact)
    browser = head.replace('svg{width:100%;height:720px;display:block}', 'svg{max-width:100%;height:auto;display:block}')
    browser += ''.join(card(r) for r in report['rows']) + '</html>'
    (OUT / 'browser-review.html').write_text(browser)
    if '--expressions' in sys.argv:
        gate = next(r for r in rows['MixedCircuit-roles']['local_expressions']['requests'] if r['type'] == 'gated-product')
        detail = head.replace('height:720px', 'height:420px')
        detail += '<h2>同一混合图的门控片段：实际 SVG 的局部视窗</h2><p>只调整 SVG viewBox 以便目视比较；完整 SVG 和原始连线保留在各自文件中。前后都不宣称完整循环单元或状态更新。</p><div class="cards">'
        for key in ['MixedCircuit-before', 'MixedCircuit-roles']:
            row = rows[key]
            document = json.loads((OUT / row['document']).read_text())
            scope = next(n for n in document['layout']['nodes'] if n['id'] == gate['scope'])
            viewport = [scope['x'] - 28, scope['y'] - 28, scope['w'] + 56, scope['h'] + 56]
            detail += f'<article><h2>{escape(key)}</h2><p>{"局部乘积仍在摘要中" if key.endswith("before") else "显示 gate / signal 与实际乘积"}</p>' + svg(OUT / row['svg'], row['svg_sha256'], viewport) + '</article>'
        (OUT / 'mixed-detail-comparison.html').write_text(detail + '</div></html>')
    if '--context' in sys.argv:
        current = rows['transformer-roles']
        entry = max(current['context_lanes'], key=lambda entry: len(entry['internal_inputs']))
        detail = head.replace('height:720px', 'height:700px')
        detail += '<h2>外部输入进入内部阶段：实际 SVG 局部比较</h2><p>按最多内部输入选取同一容器，仅调整 viewBox。左侧是冻结基线；右侧是通过整图测量后采用的侧端口候选。通道未全部兑现，不能把侧端口等同于完整总线。</p><div class="cards">'
        for key in ['transformer-before', 'transformer-roles']:
            row = rows[key]
            document = json.loads((OUT / row['document']).read_text())
            scope = next(n for n in document['layout']['nodes'] if n['id'] == entry['owner'])
            viewport = [scope['x'] - 36, scope['y'] - 36, scope['w'] + 72, scope['h'] + 72]
            detail += f'<article><h2>{escape(key)}</h2><p>整图交叉 {row["quality"]["line_geometry"]["crossings"]}；{row["nodes"]} 图元 / {row["edges"]} 边</p>' + svg(OUT / row['svg'], row['svg_sha256'], viewport) + '</article>'
        (OUT / 'context-comparison.html').write_text(detail + '</div></html>')
    if '--branches' in sys.argv:
        simple = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
                  f'<meta name="render-report-sha256" content="{digest}"><title>通用依赖路径分列审核</title>'
                  '<style>body{font:14px Arial,sans-serif;color:#253448;margin:12px}h1{font-size:20px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{min-width:0;border:1px solid #cbd3dd;padding:10px}svg{width:100%;height:510px}h2{font-size:16px}</style>')
        group = rows['transformer-roles']['branch_columns'][0]
        view = simple + '<h1>同一语义前沿：依赖路径的分支列对应</h1><p>左侧冻结基线；右侧通用路径规则。仅修改实际 SVG 的 viewBox。没有推断并行执行、阶段等价或新的模型语义。</p><div class="cards">'
        for key in ['transformer-before', 'transformer-roles']:
            row = rows[key]
            document = json.loads((OUT / row['document']).read_text())
            scope = next(n for n in document['layout']['nodes'] if n['id'] == group['parent'])
            viewport = [scope['x'] - 24, scope['y'] - 24, scope['w'] + 48, scope['h'] + 48]
            view += f'<article><h2>{escape(key)}</h2><p>{row["nodes"]} 图元 / {row["edges"]} 边 · 整图交叉 {row["quality"]["line_geometry"]["crossings"]}</p>' + svg(OUT / row['svg'], row['svg_sha256'], viewport) + '</article>'
        (OUT / 'branch-visual.html').write_text(view + '</div></html>')
        for name in ['WovenInputs', 'InterruptedPaths']:
            view = simple + '<h1>陌生路径组合：' + name + '</h1><p>同一通用规则；不需要完整家族证书。未知调用保留独立边界。明确区分自动采用与未采用的实验。</p><div class="cards">'
            keys = [name + '-before', name + '-roles']
            if name == 'InterruptedPaths':
                keys.append(name + '-explicit')
            for key in keys:
                row = rows[key]
                decision = row['branch_refinement']
                note = '冻结基线'
                if key.endswith('-explicit'):
                    note = '手动启用实验：两条已知路径分列，未知调用仍保留；此版式未被自动采用。'
                elif decision:
                    note = ('自动采用' if decision['accepted'] else '候选未采用，保留原拓扑布局')
                    note += f'；候选交叉 {decision["crossings_before"]} → {decision["crossings_candidate"]}，线长 {decision["wire_before"]} → {decision["wire_candidate"]}；线长增长上限 10%。'
                view += '<article><h2>' + key + '</h2><p>' + escape(note) + '</p>' + svg(OUT / row['svg'], row['svg_sha256']) + '</article>'
            (OUT / (name + '-comparison.html')).write_text(view + '</div></html>')
    if '--flows' in sys.argv:
        for name in ['transformer', 'ContextWeave', 'BoundaryWeave']:
            view = simple + '<h1>独立入口与跨区域上下文：' + name + '</h1><p>左侧冻结基线，右侧通用入口候选。箭头表达真实值依赖；区域位置不代表执行时间。未知调用保留自身边界。</p><div class="cards">'
            for key in [name + '-before', name + '-roles']:
                view += card(rows[key])
            (OUT / (name + '-flow-comparison.html')).write_text(view + '</div></html>')
    if '--pipelines' in sys.argv:
        for name in ['PipelineMosaic','InterruptedPipeline','EscapingPipeline']:
            view = simple + '<h1>折叠区域的局部依赖路径：' + name + '</h1><p>摘要说明已提取操作的依赖路径，未知与外流结果保留边界；继续展开仍显示原始计算。</p><div class="cards">'
            for key in [name+'-before',name+'-roles']+([name+'-opened'] if name=='PipelineMosaic' else []):
                view += card(rows[key])
            (OUT / (name+'-pipeline-comparison.html')).write_text(view+'</div></html>')
    if '--stages' in sys.argv:
        simple = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8">'
                  f'<meta name="render-report-sha256" content="{digest}"><title>认证局部阶段审核</title>'
                  '<style>body{font:14px Arial,sans-serif;color:#253448;margin:16px}h1{font-size:20px}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}article{min-width:0;border:1px solid #cbd3dd;padding:10px}svg{width:100%;height:540px}h2{font-size:16px}p{overflow-wrap:anywhere}</style>')
        for name in ['TailChain', 'TailMosaic', 'EscapingTail', 'InterruptedTail', 'ConditionalTail', 'ImageResidual']:
            view = simple + '<h1>通用认证角色阶段：' + name + '</h1><p>左：冻结基线；中：认证的相加与后置归一化阶段；右：继续展开原始操作。未知、条件、中间结果外流只限制受影响范围。</p><div class="cards">'
            for key in [name + '-before', name + '-roles', name + '-opened']:
                view += card(rows[key])
            (OUT / (name + '-stage-comparison.html')).write_text(view + '</div></html>')
        current = json.loads((OUT / rows['transformer-roles']['document']).read_text())
        stage = next(r for r in current['publication']['contract_stages']['rows'] if r['status'] == 'summary')
        view = simple + '<h1>Transformer 评估案例：局部阶段与更深展开</h1><p>同一套通用规则，仅截取实际 SVG 的已认证尾部。分支 Dropout 保留在阶段外；当前仍未建立与专用参考图的完整对应。</p><div class="cards">'
        for key in ['transformer-before', 'transformer-roles', 'transformer-stage-open']:
            row = rows[key]
            document = json.loads((OUT / row['document']).read_text())
            ids = set(stage['canonical_members'] + [stage['roles']['branch'], stage['node']])
            geometry = [n for n in document['layout']['nodes'] if n['id'] in ids]
            x, y = min(n['x'] for n in geometry) - 36, min(n['y'] for n in geometry) - 36
            viewport = [x, y, max(n['x'] + n['w'] for n in geometry) + 36 - x, max(n['y'] + n['h'] for n in geometry) + 36 - y]
            view += f'<article><h2>{key}</h2><p>{row["nodes"]} 图元 / {row["edges"]} 边 · 整图交叉 {row["quality"]["line_geometry"]["crossings"]}</p>' + svg(OUT / row['svg'], row['svg_sha256'], viewport) + '</article>'
        (OUT / 'transformer-stage-comparison.html').write_text(view + '</div></html>')
    print(json.dumps({'panels': len(report['rows']), 'render_report_sha256': digest}))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Build the same-source evaluation page; never supplies production layout rules."""
import argparse
from collections import Counter
import hashlib
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/generic-convergence/current'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name):
    return json.loads((OUT / name).read_text())


def svg_info(name):
    tree = ET.parse(OUT / name)
    return {'view_box': tree.getroot().get('viewBox'),
            'width': tree.getroot().get('width'), 'height': tree.getroot().get('height'),
            'printed_nodes': len([e for e in tree.iter() if 'data-node-id' in e.attrib]),
            'printed_edges': len([e for e in tree.iter() if 'data-edge-id' in e.attrib])}


def generic(name):
    document = read(name + '.layout.json')
    svg = svg_info(name + '.svg')
    assert svg['printed_nodes'] == len(document['layout']['nodes'])
    assert svg['printed_edges'] == len(document['layout']['edges'])
    assert document['ir']['ir_digest'] == read('source.json')['ir_digest']
    return {'svg': name + '.svg', 'document': name + '.layout.json', **svg,
            'requested_state': document['state'], 'selected': document['publication']['granularity'],
            'quality': document['diagnostics']['publication'],
            'refinement': document['diagnostics']['routing'].get('granularity_refinement'),
            'expression_goals': dict(Counter(r['status'] for r in document['expression_coverage']))}


def display_svg(name, prefix):
    # Inline copies need unique marker and node IDs across the comparison page.
    # Canonical SVGs and their recorded hashes remain untouched.
    tree = ET.parse(OUT / name)
    svg = tree.getroot()
    identifiers = {e.get('id'): prefix + e.get('id') for e in svg.iter() if e.get('id')}
    for e in svg.iter():
        for key, value in list(e.attrib.items()):
            if key == 'id':
                e.set(key, identifiers[value])
            else:
                for old, new in identifiers.items():
                    value = value.replace('url(#' + old + ')', 'url(#' + new + ')')
                    if value == '#' + old:
                        value = '#' + new
                e.set(key, value)
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    return ET.tostring(svg, encoding='unicode')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--full-status', choices=['running', 'not-produced', 'interrupted'], default='interrupted')
    args = parser.parse_args()
    ir = read('source.json')
    source = ir['sources'][0]
    assert sha(Path(source['physical'])) == source['sha256']
    reference_ir_file = ROOT / 'snapshots/transformer_programmatic_guide/generated/semantic_ir.json'
    reference_ir = json.loads(reference_ir_file.read_text())
    assert reference_ir['source_sha256'] == source['sha256']
    references = {}
    for name in ['reference-collapsed', 'reference-expanded']:
        graph = read(name + '.graph.json')
        assert graph['irSha256'] == sha(reference_ir_file)
        assert graph['caseId'] == '01093cc06a87b35a'
        ET.parse(OUT / (name + '.dom.svg'))
        references[name] = {'svg': name + '.svg', 'graph': name + '.graph.json',
                            'nodes': len(graph['nodes']), 'edges': len(graph['edges']), 'canvas': graph['canvas'],
                            'origin': 'Normalized actual editor DOM, not a downloaded SVG export.',
                            'editor_screenshot': name + '.png'}
    generics = {name: generic(name) for name in ['overview', 'detailed']}
    canvas_names = ['transformer-overview-canvas', 'transformer-detailed-canvas', 'transformer-layer-0-canvas', 'transformer-layer-1-canvas']
    canvas = {name: generic(name) for name in canvas_names} if all((OUT / (name + '.svg')).exists() for name in canvas_names) else {}
    full = {'status': args.full_status, 'artifact_available': False,
              'scope': 'Raw source-container full expansion is outside the reference convergence target; generic deeper expansion remains a separate capability.'}
    if all((OUT / ('full-expanded' + ext)).exists() for ext in ['.svg', '.layout.json']):
        generics['full-expanded'] = generic('full-expanded')
        full.update(status='rendered', artifact_available=True)
    repeats = [n for n in ir['nodes'] if n.get('repeat_contract')]
    unresolved_repeats = [n for n in repeats if any(r['status'] != 'proved' for r in n['repeat_contract']['structure']['instances'])]
    report = {'schema': 'generic-reference-convergence/1', 'source_sha256': source['sha256'],
              'same_source': True, 'converged': False, 'goal_complete': False,
              'canonical': {'nodes': len(ir['nodes']), 'edges': len(ir['edges']),
                            'opaque': sum(n['kind'] == 'opaque' for n in ir['nodes']),
                            'contracts': dict(Counter(c['rule'] for c in ir['semantic_contracts']))},
              'repeat_comparisons': [{'node': n['id'], 'count': n['repeat_contract']['count'],
                                     'instances': [{k: r[k] for k in ['instance', 'status', 'reason'] if k in r}
                                                   for r in n['repeat_contract']['structure']['instances']]}
                                    for n in repeats],
              'reference': references, 'generic': generics, 'canvas': canvas, 'raw_full_expansion': full,
              'frontier_targets': {
                  'reference_collapsed': 'A generic semantic folding frontier should express the reference overview.',
                  'reference_expanded': 'A finer generic folding frontier should express the fully expanded reference, while retaining further generic expansion.',
                  'generic_deeper': 'Optional further generic calculation/source detail; no equality with the reference full expansion is required.',
                  'current_match_found': False,
                  'selection_policy': 'Production selects frontiers from generic facts and constraints; the reference is evaluation data only.'},
              'unmet_requirements': [
                  'Single-page print detailed still falls back to overview. Canvas retains detailed, but no matching semantic frontier for the expanded reference has been demonstrated.',
                  ('Repeated layer comparisons remain unresolved; common representative coverage is not available for this input.' if unresolved_repeats else
                   'Repeated source structures are proved, but their readable semantic integration into a matching whole-model frontier has not been demonstrated.'),
                  'Logical architecture regions, role/source correspondence and context channels still differ from the reference.',
                  'Need corresponding generic folding frontiers for both reference states, with retained further expansion, fold/unfold continuity and UI/export agreement.',
                  'No numerical similarity threshold or completed semantic correspondence mapping has been established.'],
              'reference_exceptions': ['Softmax outside forward is explanatory context in the reference; generic execution must not invent this call.'],
              'scope': 'Concrete evaluation reference only; case ID/source SHA/model name do not select production rules.'}
    implementation = [*ROOT.glob('semantic_adapter/*.py'), *ROOT.glob('semantic_studio/*.js'), Path(__file__).resolve()]
    report['implementation_sha256'] = {str(p.relative_to(ROOT)): sha(p) for p in sorted(implementation)}
    artifacts = [p for p in OUT.iterdir() if p.suffix in {'.json', '.svg', '.png'} and p.name not in {'comparison-report.json', 'browser-text-report.json', 'comparison.png'}]
    report['artifacts_sha256'] = {p.name: sha(p) for p in sorted(artifacts)}
    report['reference_ir_sha256'] = sha(reference_ir_file)
    (OUT / 'comparison-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    digest = sha(OUT / 'comparison-report.json')
    cards = []
    for title, ref_name, name in [('参考概览与通用折叠前沿', 'reference-collapsed', 'overview'), ('参考全展开与通用中间折叠前沿目标', 'reference-expanded', 'detailed')]:
        ref, gen = references[ref_name], generics[name]
        cards.append(f'<section><h2>{title}</h2><div class="pair"><article data-case="{ref_name}"><h3>专用参考：{ref["nodes"]}节点 / {ref["edges"]}边</h3><p>实际编辑器DOM的规范化副本；画布{ref["canvas"][0]} × {ref["canvas"][1]}</p>{display_svg(ref["svg"], ref_name + "-")}</article><article data-case="{name}"><h3>通用：{gen["printed_nodes"]}节点 / {gen["printed_edges"]}边</h3><p>最终粒度：{gen["selected"]}；{gen["quality"]["min_print_font_pt"]} pt；未完成视觉收敛</p>{display_svg(gen["svg"], name + "-")}</article></div></section>')
    if canvas:
        cards.append('<section><h2>可缩放画布：保留请求粒度，尚未达到参考前沿</h2><div class="pair">' + ''.join(f'<article data-case="{name}"><h3>{name}: {gen["printed_nodes"]} nodes / {gen["printed_edges"]} edges</h3><p>{gen["quality"]["min_canvas_font_px"]} native px; {escape(str(gen["quality"]["issues"]))}</p>{display_svg(gen["svg"], name + "-")}</article>' for name, gen in canvas.items()) + '</div></section>')
    full_message = {'running': '原始源码容器全部展开的任务仍在运行，尚无产物；未计为展开验收通过。',
                    'not-produced': '尚无原始源码容器全部展开产物；未计为展开验收通过。',
                    'interrupted': '原始源码容器全部展开任务已停止：它不属于本次参考对照目标。通用图仍应保留继续向计算/源码细节展开的能力。',
                    'rendered': '原始源码容器全部展开产物已生成，需单独审核；它不等于语义架构全部展开。'}[full['status']]
    html = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="generic-convergence-report-sha256" content="{digest}"><title>同源码架构图对照：尚未收敛</title><style>body{{font:16px Arial,'Noto Sans SC',sans-serif;line-height:1.5;margin:24px;color:#263348}}h1{{font-size:26px}}h2{{font-size:21px}}h3{{font-size:17px}}.notice{{background:#fff3df;padding:14px;border-left:4px solid #a66b20}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}article{{min-width:0;border:1px solid #cad2dc;padding:12px}}article>svg{{width:100%;height:760px;display:block}}article p{{min-height:48px}}code{{overflow-wrap:anywhere}}@media(max-width:800px){{.pair{{grid-template-columns:1fr}}}}</style><h1>同源码 Transformer：参考状态与通用折叠前沿</h1><p class="notice">当前结论：尚未接近目标。专用全展开应对应通用图的某个中间折叠状态，通用层可继续展开。单页打印的细节预设仍降级；画布已保留细节，但结构与视觉组织尚未接近参考，仍有路径重合，尚未找到合适前沿。</p><p>源码SHA：<code>{source['sha256']}</code>。专用参考仅作为评估输入，不参与通用生产规则选择。</p>{''.join(cards)}<p>{escape(full_message)}</p><p>参考中的“Softmax outside forward”属于说明性上下文，不要求通用层伪造forward调用。</p><p><a href="comparison-report.json">完整报告与输入、实现和产物摘要</a></p></html>'''
    (OUT / 'comparison.html').write_text(html)
    print(json.dumps({'report_sha256': digest, 'same_source': True, 'converged': False,
                      'generic_detailed_selected': generics['detailed']['selected'], 'raw_full_expansion': full['status']}))


if __name__ == '__main__':
    main()

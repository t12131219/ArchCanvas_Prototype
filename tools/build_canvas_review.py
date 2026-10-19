#!/usr/bin/env python3
"""Build a browser QA page from already-hashed SVG artifacts, without rerendering."""
import hashlib
from html import escape
import json
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'verification/canvas-medium/current'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    report = json.loads((OUT / 'render-report.json').read_text())
    cards = []
    for i, row in enumerate(report['rows']):
        file = OUT / row['svg']
        assert sha(file) == row['svg_sha256']
        tree = ET.parse(file)
        svg = tree.getroot()
        ids = {e.get('id'): f'panel-{i}-' + e.get('id') for e in svg.iter() if e.get('id')}
        for e in svg.iter():
            for key, value in list(e.attrib.items()):
                if key == 'id':
                    e.set(key, ids[value])
                else:
                    for old, new in ids.items():
                        value = value.replace('url(#' + old + ')', 'url(#' + new + ')')
                    e.set(key, value)
        ET.register_namespace('', 'http://www.w3.org/2000/svg')
        cards.append('<article data-case="' + escape(row['name']) + '"><h2>' + escape(row['name']) + '</h2>' + ET.tostring(svg, encoding='unicode') + '</article>')
    digest = sha(OUT / 'render-report.json')
    html = '<!doctype html><html><meta charset="utf-8"><meta name="canvas-render-report-sha256" content="' + digest + '"><title>画布 SVG 文字边界审核</title><style>body{font:16px Arial;margin:20px}article{border:1px solid #ccc;margin:20px 0;padding:20px}svg{display:block;max-width:100%;height:auto}</style><h1>19 张实际 SVG 文字边界审核</h1>' + ''.join(cards) + '</html>'
    (OUT / 'browser-review.html').write_text(html)
    print(json.dumps({'panels': len(cards), 'report_sha256': digest}))
if __name__ == '__main__':
    main()

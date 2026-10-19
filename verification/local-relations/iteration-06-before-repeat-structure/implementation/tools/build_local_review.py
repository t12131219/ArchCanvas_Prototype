#!/usr/bin/env python3
"""Assemble current, artifact-bound screenshot pages without changing layouts."""
import hashlib
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'verification/local-relations/current'


def report(name):
    return json.loads((ROOT / name).read_text())


def card(title, svg, quality):
    return (f'<article><h2>{escape(title)}</h2><p>{quality["min_print_font_pt"]} pt · '
            f'{quality["line_geometry"]["crossings"]} crossings</p>{(ROOT / svg).read_text()}</article>')


def page(file, title, description, cards, evidence):
    digest = hashlib.sha256((ROOT / evidence).read_bytes()).hexdigest()
    (ROOT / file).write_text(f'''<!doctype html><html><meta charset="utf-8">
<meta name="evidence-report-sha256" content="{digest}"><title>{escape(title)}</title>
<style>body{{font:15px Arial;margin:16px}}.pair{{display:flex;gap:16px}}article{{flex:1;min-width:0;border:1px solid #bbb;padding:12px}}svg{{display:block;width:100%;height:620px}}h2{{font-size:17px}}</style>
<h1>{escape(title)}</h1><p>{escape(description)}</p><div class="pair">{''.join(cards)}</div></html>''')


render = report('render-report.json')
mixed = [next(r for r in render['rows'] if r['name'] == 'MixedCircuit-' + stage) for stage in ['before', 'after']]
page('overview-review.html', 'Mixed computation: frozen and current', 'Same canonical input and display configuration.',
     [card(label, r['svg'], r['quality']) for label, r in zip(['Frozen renderer', 'Current renderer'], mixed)], 'render-report.json')
regression = next(r for r in report('holdout-report.json')['rows'] if r['name'] == 'SharedMismatch')
old = regression['before']
page('regression-review.html', 'Shared calls in a mixed computation', old['comparison_scope'],
     [card('First held-out failure', old['directory'] + '/' + old['svg'], old['quality']),
      card('Current regression', regression['svg'], regression['quality'])], 'holdout-report.json')
identities = report('identity-report.json')
selected = [next(r for r in identities['rows'] if r['name'] == name) for name in ['ConditionalCalls-1', 'parameter-run-0']]
page('identity-boundaries-review.html', 'Conditions and measured parameter aliases',
     'Left: mutually exclusive source call sites. Right: parameter aliases enumerated at the start of one CPU run.',
     [card(label, r['svg'], r['quality']) for label, r in zip(['Shared object under a condition', 'Run-start parameter aliases'], selected)], 'identity-report.json')
iteration = next(r for r in report('iteration-report.json')['rows'] if r['name'] == 'conditional-update')
page('iteration-update-review.html', 'Conditional update computation',
     'Supplementary computation detail; the iteration panel separately retains entry, feedback and completion control.',
     [card('Actual conditional update', iteration['svg'], iteration['quality'])], 'iteration-report.json')
print(json.dumps({'review_pages': 4}))

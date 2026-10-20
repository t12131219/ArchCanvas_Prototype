#!/usr/bin/env python3
"""Consolidate existing test/browser evidence, refusing stale implementation hashes.

Run the commands in docs/publication-view.md first. Copy their four unit-test
logs into verification/publication/test-logs; this tool never runs models.
"""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / 'verification/publication'


def read(name):
    return json.loads((ROOT / name).read_text())


def save(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def sha(name):
    return hashlib.sha256((ROOT / name).read_bytes()).hexdigest()


def current(report):
    for name, expected in report['implementation_sha256'].items():
        assert sha(name) == expected, ('stale implementation', name)


def main():
    publication = read('verification/publication/corpus-report.json')
    browser = read('verification/publication/browser-text-report.json')
    extraction = read('verification/architecture/corpus/extraction.json')
    catalog = read('verification/architecture/report.json')
    stress = read('verification/publication/stress-report.json')
    weave = read('verification/publication/weave-report.json')
    ui = read('verification/publication/WovenFusion-ui-report.json')
    text_ui = read('verification/publication/TextCNN-ui-report.json')
    graph_ui = read('verification/publication/GraphNet-ui-report.json')
    dense_ui = read('verification/publication/DenseLayer-ui-report.json')
    block_ui = read('verification/publication/DenseBlock-ui-report.json')
    gated_ui = read('verification/publication/GatedMixture-ui-report.json')
    sum_ui = read('verification/publication/GatedMixture-sum-ui-report.json')
    ui_reports = [ui, text_ui, graph_ui, dense_ui, block_ui, gated_ui, sum_ui]
    comparison = read('verification/publication/shared-output-comparison.json')
    routing = read('verification/publication/routing-comparison.json')
    refinement = read('verification/publication/refinement-comparison.json')
    contact = read('verification/publication/contact-repair-comparison.json')
    separation = read('verification/publication/contact-separation-comparison.json')
    content = read('verification/publication/content-inventory-comparison.json')
    responsive = read('verification/publication/inspector-responsive-report.json')
    gated = read('verification/publication/gated-sum-comparison.json')
    for report in [publication, extraction, catalog, stress, weave, *ui_reports, comparison, routing, refinement, contact, separation, content, responsive, gated]:
        current(report)
    assert gated['current_digest'] == publication['audit_digest'] and not gated['regressions']
    assert gated['external_panels'] == publication['panels'] and gated['external_svg_identical']
    assert gated['external_accounting_identical'] and gated['external_cuts_identical']
    assert gated['external_gated_sum_findings'] == 0 and gated['external_layout_retries'] == 0
    assert not gated['original']['after']['issues'] and gated['original']['unknowns'] == 1
    assert [r['viewport'] for r in responsive['checks']] == [1280, 1088]
    assert all(r['overlap'] == 0 and r['scroll_width'] == r['client_width'] for r in responsive['checks'])
    assert content['current_digest'] == publication['audit_digest'] and not content['regressions']
    assert content['same_node_geometry'] and content['same_routes_and_operands'] and content['same_accounting'] and content['same_canonical_cuts']
    assert content['before_crossings'] == content['after_crossings']
    assert content['before_contacts'] == content['after_contacts'] == publication['unrelated_contacts']
    assert contact['current_digest'] == publication['audit_digest'] and not contact['regressions']
    assert contact['same_node_positions'] and contact['same_accounting']
    assert contact['after_crossings'] == sum(
        panel['line_geometry']['crossings'] for panel in publication['results'])
    assert contact['after_contacts'] <= contact['before_contacts']
    assert contact['after_contacts'] == publication['unrelated_contacts']
    assert separation['current_digest'] == publication['audit_digest'] and not separation['regressions']
    assert separation['same_node_positions'] and separation['same_accounting']
    assert separation['after_contacts'] == publication['unrelated_contacts']
    assert separation['after_crossings'] == contact['after_crossings']
    assert separation['after_crossings'] - separation['before_crossings'] == sum(
        row['crossings'][1] - row['crossings'][0] for row in separation['contact_separation_tradeoffs'])
    for row in separation['contact_separation_tradeoffs']:
        assert 0 < row['crossings'][1] - row['crossings'][0] <= 1
        assert row['contacts'][0] - row['contacts'][1] > row['crossings'][1] - row['crossings'][0]
    assert comparison['current_digest'] == publication['audit_digest'] and not comparison['regressions']
    assert routing['current_digest'] == publication['audit_digest'] and not routing['regressions']
    assert refinement['current_digest'] == publication['audit_digest'] and not refinement['regressions']
    assert refinement['same_node_positions'] and refinement['same_accounting']
    assert refinement['after_contacts'] <= refinement['before_contacts']
    assert refinement['after_contacts'] == publication['unrelated_contacts']
    assert not publication['orphan_boundary_ports'] and not routing['after_orphan_boundary_ports']
    assert all(r['restored_visible_dependencies'] for r in routing['crossing_increases'])
    assert publication['quality_pass'] == publication['panels'] and not publication['errors']
    assert publication['complete_accounting'] and not publication['missing_boundary_ports']
    assert publication['audit_digest'] == browser['audit_digest']
    assert browser['panels'] == publication['panels'] and not browser['failures']
    assert all(page['audit_digest'] == browser['audit_digest'] for page in browser['page_results'])
    assert not stress['failures'] and not weave['failures']
    for report in ui_reports:
        assert report['byte_identical'] and not report['quality']['issues']
        for field in ['svg', 'document']:
            assert sha('verification/publication/' + report[field]) == report[field + '_sha256']
    before = read('verification/architecture/corpus/manifest-before.json')
    assert before == read('verification/architecture/corpus/manifest-after.json')
    source = Path(extraction['source_root'])
    now = [{'path': str(p.relative_to(source)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
           for p in sorted(source.rglob('*')) if p.is_file()]
    assert now == before, 'external source changed after extraction'
    commands = []
    logs = [('architecture-current.log', 'node tests/architecture.test.cjs'),
            ('projection-current.log', 'node tests/semantic-projection.test.cjs'),
            ('adapter-current.log', "python3 -m unittest discover -s tests -p 'test_*adapter.py' -q"),
            ('publication-current.log', 'node tests/publication.test.cjs')]
    for file, command in logs:
        log = (PUB / 'test-logs' / file).read_text()
        if file.startswith('adapter'):
            count = int(re.search(r'Ran (\d+) tests', log)[1])
            assert re.search(r'^OK$', log, re.M)
        else:
            count = int(re.search(r'ℹ tests (\d+)', log)[1])
            assert re.search(r'^ℹ fail 0$', log, re.M)
        commands.append({'command': command, 'tests': count, 'exit_code': 0,
                         'log': 'test-logs/' + file, 'log_sha256': sha('verification/publication/test-logs/' + file)})
    for command in ['python3 tools/audit_model_corpus.py', 'node tools/audit_architecture.cjs',
                    'node tools/audit_publication.cjs --strict --text-qa',
                    'node tools/audit_publication_stress.cjs', 'node tools/audit_publication_weave.cjs',
                    'node tools/inspect_publication_snapshot.cjs verification/publication/routing-baseline verification/publication/routing-baseline/inspection.json',
                    'node tools/compare_routing.cjs', 'node tools/compare_shared_outputs.cjs', 'node tools/compare_refinement.cjs', 'node tools/compare_content_inventory.cjs', 'node tools/compare_gated_sum.cjs',
                    'node tools/verify_publication_ui_exports.cjs']:
        commands.append({'command': command, 'exit_code': 0})
    tests = sum(row.get('tests', 0) for row in commands)
    originals = {}
    for name in ['BranchMosaic', 'WideBranches', 'WovenFusion', 'Weave7', 'Weave8',
                 'TextCNN', 'DenseLayer', 'ConditionalVAE', 'ForeignComposition', 'VGG16', 'LSTM', 'GatedMixture']:
        atlas = read(f'verification/publication/{name}-atlas/manifest.json')
        b = read(f'verification/publication/{name}-browser-text-report.json')
        current(atlas)
        assert atlas['audit_digest'] == b['audit_digest'] and not b['failures']
        assert atlas['quality_pass'] and atlas['complete'] and len(atlas['panels']) == b['panels']
        originals[name] = {'entry': name, 'nodes': atlas['canonical_nodes'], 'edges': atlas['canonical_edges'],
                           'opaque': len(atlas['unknown_operations']), 'panels': len(atlas['panels']),
                           'quality_pass': True, 'min_print_font_pt': min(p['quality']['min_print_font_pt'] for p in atlas['panels']),
                           'audit_digest': atlas['audit_digest'], 'browser_node_texts': b['nodeTexts'],
                           'browser_port_label_texts': b['portTexts'], 'browser_text_overflow': 0,
                           'branch_regions': sum(p['id'].startswith('paper:branch-region:') for p in atlas['panels']),
                           'dependency_bands': sum(p['id'].startswith('paper:dependency-band:') for p in atlas['panels'])}
    pstats = {k: v for k, v in publication.items() if k not in ['results', 'implementation_sha256', 'extraction_implementation_sha256']}
    pstats.update(browser_node_texts=browser['node_texts'], browser_port_label_texts=browser['port_label_texts'],
                  browser_text_overflow=0, browser_text_report='../publication/browser-text-report.json')
    compact = lambda report: {k: v for k, v in report.items() if k not in ['results', 'implementation_sha256']}
    summary = read('verification/publication/test-summary.json')
    files = set(summary['implementation_sha256']) | {'tools/audit_publication_weave.cjs', 'tools/summarize_publication_checks.py', 'tools/compare_shared_outputs.cjs', 'tools/compare_routing.cjs', 'tools/inspect_publication_snapshot.cjs', 'tools/verify_publication_ui_exports.cjs', 'tools/compare_refinement.cjs', 'tools/load_publication_renderer.cjs', 'tools/compare_content_inventory.cjs', 'tools/compare_gated_sum.cjs', 'tests/semantic_fixtures/gated_composition.py'}
    implementation = {name: sha(name) for name in sorted(files)}
    checks = [check for report in ui_reports for check in report['checks']] + [f"{browser['panels']} external panels: {browser['node_texts']} node texts, {browser['port_label_texts']} port labels, no overflow.",
                             f'{len(originals)} complete atlases measured with matching current renderer digests; no text overflow.',
                             'Actual 1280px and 1088px inspector review: no sidebar overlap or horizontal document overflow; Tanh/ReLU/unresolved inventory readable.',
                             'Current visual review: DenseBlock overview trades the final two contacts for one explicit extra overpass. Actual UI overview export, TextCNN source input and WovenFusion/GraphNet actual ribbon clicks rechecked.']
    note = f'{tests} regression tests passed. External source collection parsed only; {len(now)} files unchanged. Existing original CPU receipt reused, not rerun. Geometry/text checks do not prove arbitrary-model semantics or publication quality.'
    for file, schema in [('verification/publication/test-summary.json', 'publication-validation/2'),
                         ('verification/architecture/test-summary.json', 'architecture-validation/4')]:
        previous = read(file)
        report = {'schema': schema, 'date': '2026-10-18', 'test_cases': tests, 'commands': commands,
                  'publication': pstats, 'original_hybrid': originals['BranchMosaic'], 'original_wide': originals['WideBranches'],
                  'original_woven': originals['WovenFusion'], 'atlas_validation': originals,
                  'topology_stress': compact(stress), 'weave_stress': compact(weave), 'browser_checks': checks,
                  'historical_browser_checks': previous.get('historical_browser_checks', previous.get('browser_checks', previous.get('publication_browser_checks', []))),
                  'ui_roundtrip_report': '../publication/WovenFusion-ui-report.json',
                  'ui_roundtrip_reports': ['../publication/WovenFusion-ui-report.json', '../publication/TextCNN-ui-report.json', '../publication/GraphNet-ui-report.json', '../publication/DenseLayer-ui-report.json', '../publication/DenseBlock-ui-report.json', '../publication/GatedMixture-ui-report.json', '../publication/GatedMixture-sum-ui-report.json'],
                  'shared_output_comparison': compact(comparison),
                  'routing_comparison': compact(routing),
                  'refinement_comparison': compact(refinement),
                  'contact_repair_comparison': compact(contact),
                  'contact_separation_comparison': compact(separation),
                  'content_inventory_comparison': compact(content),
                  'gated_sum_comparison': compact(gated),
                  'external_source_files': len(now), 'external_sources_unchanged': True, 'external_models_executed': False,
                  'catalog_models': catalog['models'], 'catalog_states': catalog['states'],
                  'implementation_sha256': implementation, 'note': note}
        save(file, report)
    review = read('verification/publication/self-review.json')
    review.update(audit_digest=publication['audit_digest'], original_hybrid=originals['BranchMosaic'],
                  original_wide=originals['WideBranches'], original_woven=originals['WovenFusion'],
                  topology_stress=compact(stress), weave_stress=compact(weave), implementation_sha256=implementation,
                  historical_browser_checks=review.get('historical_browser_checks', review.get('browser_checks', [])),
                  browser_checks=checks, browser_export_scope=ui['scope'])
    review['coverage'].update(external_panels=publication['panels'], external_dependency_bands=publication['dependency_bands'],
                              external_models_with_dependency_bands=publication['models_with_dependency_bands'],
                              shared_result_terminals=publication['shared_result_terminals'], shared_result_uses=publication['shared_result_uses'],
                              catalog_models=catalog['models'], catalog_states=catalog['states'], regression_tests=tests)
    review['shared_output_comparison'] = compact(comparison)
    review['routing_comparison'] = compact(routing)
    review['refinement_comparison'] = compact(refinement)
    review['contact_repair_comparison'] = compact(contact)
    review['contact_separation_comparison'] = compact(separation)
    review['content_inventory_comparison'] = compact(content)
    review['gated_sum_comparison'] = compact(gated)
    review['original_gated'] = originals['GatedMixture']
    gated_limit = 'GatedMixture remains a tall 240mm overview with four crossings; its local gated-sum panel is clearer but does not establish whole-model publication quality.'
    if gated_limit not in review['visual_limits']:
        review['visual_limits'].append(gated_limit)
    review['coverage'].update(orphan_boundary_ports=publication['orphan_boundary_ports'],
                              unrelated_contacts=publication['unrelated_contacts'], crossings=contact['after_crossings'],
                              content_inventories=publication['content_inventories'], content_captions=publication['content_captions'])
    changes = [
        ('Shared intermediates prevented independent-path grouping; original 3/6/8-wide cases had 30/103/196 overview crossings.',
         'Use dependency depth bands and recursive panels; wrap singleton remainders; preserve exact cuts, aliases and unknowns.',
         '77 cyclic-neighbor DAGs, 1669 panels; overview zero crossings where bands apply. Six WovenFusion panels pass browser text QA. Baseline implementation was not archived.'),
        ('Output groups counted repeated uses as distinct source values.',
         'Resolve canonical source identity and slot; record separate value/use counts with one terminal per eligible result and separate cut records.',
         'Eight values, eight result terminals and sixteen uses/cuts; browser widths 7/8 and boundary regression.'),
        ('Four DenseLayer and two ConditionalVAE detail panels could not place parallel labels.',
         'Size the gap using all parallel edges when a ribbon or condition requires a label.',
         'All six affected panels and all 1346 corpus panels pass; differing evidence remains separate.'),
        ('Local CNN classification overwrote loop-template; TextCNN loop detail fell to 6.8pt.',
         'Retain loop/conditional control types; do not depth-group loop templates.',
         'Original ScopedConvolution AST regression, loop negative regression and current external TextCNN atlas; local CNN blocks remain.'),
        ('Six external outputs all named add obscured target identity and operand use.',
         'Add panel-local target references plus exact target operand captions; preserve separate cuts.',
         'WovenFusion regression, browser screenshot and six-panel text measurements.'),
        ('Visual review found orphan size configuration inputs in ConditionalVAE.',
         'Keep metadata boundary cuts as attached annotations, without synthetic data ports.',
         'Configuration-boundary regression; ConditionalVAE stage screenshot and all 34 current atlas panels measured.'),
        ('Focused panels duplicated a single result for each external use, producing redundant crossings.',
         'Share result terminals only for the same resolved producer/slot, kind and evidence; keep every original cut/use. Conditions and state remain separate. SVG tooltips and the inspector expose all consumers.',
         'Historical shared-output-only measurement: 663 to 636 crossings. Current cumulative comparison also includes routing and boundary corrections. WovenFusion band 3: 5 to 0 crossings, 126.6 to 99.9mm height.'),
        ('Canonical edge order created braided ports and long control paths in unfamiliar detail panels.',
         'Compare bounded canonical/neighbor port orders, short/long edge orders and crossing penalties. Expanded ancestor controls may attach to the header; keep quality gates, exact slots and selected cache.',
         'Current routing-comparison.json records every candidate family and archived before-state; independent-path and woven stress sweeps remain checked.'),
        ('Visual review found disconnected loop-variable terminals; the same defect occurred at external alias consumers.',
         'Use the explicit binding policy as the complete set; bind focused incoming aliases to panel inputs and retain explicit output cuts into external aliases. Label local bindings with their source variable name.',
         'Archived renderer reproduced all 1346 before panels and 351 orphan boundary terminals. Current full corpus has zero orphan terminals. Pass-through and external-alias cut regressions; crossing increases with restored dependencies remain explicitly reported.'),
        ('Opening a CLI layout document discarded saved module focus when open/offsets were absent.',
         'Accept partial presentation state and supply missing root expansion and offsets defaults.',
         'Actual browser import of TextCNN-loop.layout.json restored the loop selector; local convolution source was inspected. UI SVG reconstruction was byte-identical and selected neighbors-header-long, with 5 crossings versus 18 for the same-projection baseline.'),
        ('Early greedy routes never considered later wires and left avoidable crossings.',
         'Revisit at most eight crossed wires over two passes, reserving all other selected routes. Accept only strictly fewer crossings with no increase in unrelated contacts or new contacting edge pairs, and with font/label/path gates preserved; restore the final route cache.',
         f"Archived comparison: {refinement['before_crossings']} to {refinement['after_crossings']} crossings, {refinement['improved_panels']} panels reduce crossings; four DenseBlock overviews separately add one crossing each to remove contacts. All 1346 positions and accounting records identical. DenseLayer accepted and GraphNet rejected rerouting verified in the actual UI. Longer wires remain a tradeoff."),
        ('Strict crossing counts missed unrelated elbows touching; a rejected rerouting prototype looked better numerically while introducing misleading junctions.',
         'Record unrelated contacts separately, penalize endpoint contact during rerouting and reject new contacting pairs or contact count increases. Compare renderer versions in separate VM globals to avoid shared CommonJS registries mixing engines.',
         f"Rejected prototype: {refinement['rejected_prototype']['crossings']} crossings and {refinement['rejected_prototype']['contacts']} contacts, with {refinement['rejected_prototype']['panels_with_more_contacts']} panels adding contacts. Corrected contact count: {refinement['before_contacts']} to {refinement['after_contacts']}; contact-diagnosis/contacts.json preserves the evidence.")]
    changes += [
        ('Contact-only diagrams never entered crossing repair, and equal-crossing improvements were rejected.',
         'Run a separate contact phase after crossing repair; require strictly fewer contacts with no crossing, contacting-pair or quality regression.',
         f"Archived cumulative contact comparison: {contact['before_contacts']} to {contact['after_contacts']} contacts across {contact['improved_panels']} improved panels; all {contact['panels']} positions and accounting records unchanged. Crossings {contact['before_crossings']} to {contact['after_crossings']} include the four later separation tradeoffs. Zero-crossing original DAG regression included."),
        ('Fixed 16-unit terminal stubs could meet across a 32-unit row gap.',
         'Contact repair also tries 12/8-unit lead-ins without moving physical terminals or changing operand identity. The two monotone stages use at most 96 attempts.',
         'Tight-gap route regression and current ConditionalVAE before/after visual review; TextCNN actual UI export retains four crossings and zero contacts. A later separation pass handles the eight remaining contacts.'),
        ('The final eight contacts could not be removed while forbidding every crossing increase; source-sharing and coordinated-route prototypes did not give a suitable result.',
         'After the monotone stages, try at most four implicated edges once. Permit at most one extra crossing per diagram only when more contacts disappear than crossings are added, no new contacting pair appears, and all existing quality gates remain valid. At most 112 total attempts.',
         f"All {separation['panels']} archived diagrams reproduced: contacts {separation['before_contacts']} to {separation['after_contacts']}, crossings {separation['before_crossings']} to {separation['after_crossings']}. Four DenseBlock overviews each trade two contacts for one explicit overpass. Actual UI SVG reconstruction and original tight-geometry regression confirm the result; this is an explicit readability tradeoff.")]
    changes += [
        ('Dependency-band captions exposed only depth and unit count, so a compact overview still gave little computational meaning.',
         'Inventory each direct semantic unit using confirmed operators or local findings; keep unknowns explicit. Compact text lists operation kinds/counts and +N kinds when needed, while documents, SVG titles and the inspector retain every unit. Counts imply neither serial repetition nor parameter sharing.',
         f"{publication['content_inventories']} external inventories, {publication['content_captions']} with content captions; {content['changed_panels']} panels have changed captions. All {content['panels']} node geometries, selected routes, operands, accounting and cuts match the archived renderer. WovenFusion actual overview and inspector show Linear × 3 and Tanh/ReLU plus one unresolved unit. Original suggestive-name and nested-inventory regressions included."),
        ('The first compact-caption prototype shortened expanded headers and moved internal nodes despite keeping collapsed box sizes.',
         'Retain the original caption-row allocation for expanded headers as well as closed-node height. Geometry comparisons exclude label fields that deliberately change, but compare all placement coordinates and selected paths.',
         'The full archived comparison initially rejected a ConditionalVAE singleton panel (header 76 to 66); current comparison and original nested-header regression prove unchanged placement.'),
        ('At the two-column breakpoint, the sticky model list overlapped the inspector in the next grid row and hid inventory terms.',
         'Let the model list scroll with the document below 1100px and wrap long model names. Refresh the stylesheet asset reference.',
         'Actual 1280px and 1088px DOM measurements and screenshots show all three inventory terms, zero list/inspector overlap and no horizontal document overflow. Evidence is bound to stylesheet and HTML hashes; smaller mobile widths were not checked.')]
    changes += [
        ('Two recognized sigmoid-gated products feeding addition remained unrelated local findings in unfamiliar hybrid models.',
         'Compose an exact gated-sum finding with both product/gate/value/sum edges and operand slots, retaining nested gate groups and external uses. Reject mutation, conditional operands, ambiguous slots, mixed evidence and nonunit alpha.',
         'Original GatedMixture source combines EncoderLayer, RNN, two partial gates and an unresolved kernel. Four panels pass. The extra product output remains a cut to return slot 2. Pure-gate guards and single-output ATen evidence have adversarial regressions. No state update, normalized weights or model family is asserted; external corpus positives: zero.'),
        ('A compact layout fitted the print size but left three recurrent interface labels in export notes.',
         'Shared prepareFigure retries three bounded row gaps only after actual label placement fails. Accept strictly fewer missing labels without new quality issues, crossings or contacts, retaining manual positions.',
         'GatedMixture overview: 13 to 11 visible nodes; row-gap retry removes all three missing labels, retaining four crossings and zero contacts at 8.25pt. Actual UI SVG/doc reconstruction and complete 12-atlas text measurements pass. All 1346 external SVGs remain byte-identical to the archived implementation; none exercised this fallback.')]
    for problem, change, evidence in changes:
        existing = next((f for f in review['findings'] if f['problem'] == problem), None)
        if existing:
            existing.update(change=change, evidence=evidence)
        else:
            review['findings'].append({'problem': problem, 'change': change, 'evidence': evidence})
    review['visual_limits'] = [s for s in review['visual_limits'] if not s.startswith(('Rerouting can lengthen wires:', 'There remain '))]
    review['visual_limits'] += [s for s in [
        'Dependency-band/Units labels describe topology, not algorithm meaning; detailed panels retain cross-links.',
        'TextCNN loop and ConditionalVAE detail remain dense; 8pt and no overlap are necessary but insufficient.',
        'Weave stress covers cyclic-neighbor DAGs only; full sweep has no per-panel browser text measurements. Widths 7/8 were measured separately.',
        'Some panels have more crossings after previously missing dependencies are restored; inspect routing-comparison.json crossing_increases. These remain visual limitations.',
        f"Rerouting can lengthen wires: {refinement['longer_wire_panels']} corpus panels have longer paths, with a maximum total-length ratio {refinement['largest_wire_detour']['ratio']:.2f}. The reviewed DenseLayer detour eliminates four crossings within the same frame; longer paths remain a readability tradeoff, not global optimality.",
        f"There remain {refinement['after_contacts']} unrelated contacts in the measured corpus. Four DenseBlock diagrams gain one explicit crossing each to remove their final contacts; other topologies can still contain contacts. The green font/path gates alone do not prove this diagnostic is clear."
    ] if s not in review['visual_limits']]
    review['artifacts'] = list(dict.fromkeys(review['artifacts'] + ['WovenFusion.svg', 'WovenFusion-band.svg',
        'WovenFusion-band-preview.png', 'WovenFusion-preview.png', 'WovenFusion-studio.png',
        'WovenFusion-browser-text-report.json', 'WovenFusion-ui-report.json', 'weave-report.json',
        'Weave7-band-preview.png', 'Weave8-band-preview.png', 'ConditionalVAE-stage-preview.png', 'TextCNN-loop-preview.png',
        'shared-output-baseline/baseline.json', 'shared-output-comparison.json', 'routing-baseline/baseline.json',
        'routing-baseline/inspection.json', 'routing-comparison.json', 'TextCNN-loop.svg', 'TextCNN-loop.layout.json',
        'TextCNN-studio.png', 'TextCNN-ui-report.json', 'ConditionalVAE-overview.svg', 'ConditionalVAE-overview-preview.png']))
    review['artifacts'] = list(dict.fromkeys(review['artifacts'] + ['refinement-comparison.json', 'reroute-baseline/baseline.json',
        'DenseBlock-loop.svg', 'DenseBlock-loop-preview.png', 'DenseLayer-detour.svg', 'DenseLayer-detour-preview.png',
        'DenseLayer-detour-before.svg', 'DenseLayer-detour-before-preview.png', 'GraphNet-panel.svg', 'GraphNet-panel-preview.png',
        'GraphNet-studio.png', 'GraphNet-ui-report.json', 'DenseLayer-ui-report.json', 'contact-diagnosis/contacts.json']))
    review['artifacts'] = list(dict.fromkeys(review['artifacts'] + ['contact-repair-comparison.json',
        'contact-repair-baseline/baseline.json', 'DenseBlock-overview.svg', 'DenseBlock-overview-preview.png',
        'DenseBlock-overview-before-contact.svg', 'ConditionalVAE-contact.svg', 'ConditionalVAE-contact-preview.png',
        'ConditionalVAE-contact-before-contact.svg', 'TextCNN-loop-before-contact.svg', 'DenseLayer-studio.png']))
    review['artifacts'] = list(dict.fromkeys(review['artifacts'] + ['contact-separation-comparison.json',
        'contact-separation-baseline/baseline.json', 'DenseBlock-studio.png', 'DenseBlock-ui-report.json']))
    review['artifacts'] = list(dict.fromkeys(review['artifacts'] + ['DenseBlock-overview-before-separation-preview.png',
        'contact-separation-baseline/experiments/shared-source.cjs', 'contact-separation-baseline/experiments/shared-source.log',
        'contact-separation-baseline/experiments/route-pairs.cjs', 'contact-separation-baseline/experiments/route-pairs.log']))
    review['artifacts'] = list(dict.fromkeys(review['artifacts'] + ['content-inventory-comparison.json',
        'content-inventory-baseline/baseline.json', 'WovenFusion-inventory-studio.png', 'inspector-responsive-report.json', 'WovenFusion-overview-studio.png',
        'gated-sum-comparison.json', 'gated-sum-baseline/baseline.json', 'GatedMixture-studio.png', 'GatedMixture-sum-preview.png']))
    save('verification/publication/self-review.json', review)
    print(json.dumps({'tests': tests, 'external_panels': publication['panels'], 'browser_node_texts': browser['node_texts'],
                      'external_files_unchanged': len(now), 'atlases': len(originals)}))


if __name__ == '__main__':
    # Layout changes intentionally invalidate the previous fixed-position
    # comparisons. Validate the new stage against its immutable baseline rather
    # than stamping older measurements with the current implementation hashes.
    if (PUB / 'active-stage.json').exists():
        stage = read('verification/publication/active-stage.json')['stage']
        if stage == 'stage-stability':
            from summarize_stage_stability import main as summarize_stage
        elif stage == 'contract-stages':
            from summarize_contract_stages import main as summarize_stage
        elif stage == 'local-pipelines':
            from summarize_local_pipelines import main as summarize_stage
        elif stage == 'flow-entries':
            from summarize_flow_entries import main as summarize_stage
        elif stage == 'branch-columns':
            from summarize_branch_columns import main as summarize_stage
        elif stage == 'context-lanes':
            from summarize_context_lanes import main as summarize_stage
        elif stage == 'local-expressions':
            from summarize_local_expressions import main as summarize_stage
        elif stage == 'role-frontier':
            from summarize_role_frontier import main as summarize_stage
        elif stage == 'frame-ownership':
            from summarize_frame_ownership import main as summarize_stage
        elif stage == 'inline-sequences':
            from summarize_inline_sequences import main as summarize_stage
        elif stage == 'local-relations':
            from summarize_local_relations import main as summarize_stage
        elif stage == 'semantic-design':
            from summarize_semantic_design import main as summarize_stage
        elif stage == 'configuration':
            from summarize_configuration import main as summarize_stage
        else:
            assert stage == 'topology-layout', ('unknown active stage', stage)
            from summarize_topology_layout import main as summarize_stage
        summarize_stage()
    else:
        main()

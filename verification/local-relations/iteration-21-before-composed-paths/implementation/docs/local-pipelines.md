# Local dependency path summaries

Folded source functions and source modules can show the modeled operation path instead of only a helper name. For example, an unfamiliar helper becomes `relu → sin → tanh`. The same rule describes source-backed reshape/transpose/copy helpers in the Transformer evaluation. No model name, class name, source hash or case ID selects this representation.

The rule requires 2–6 operations forming one dependency chain within one source boundary. It retains every canonical member, exact operand binding, auxiliary tensor-attribute read and cut edge. Configuration-only values remain attached with their existing evidence. Unknown calls, runtime-only evidence, control/condition/effect/identity boundaries, certificates, iteration/repeat scopes, nested modules, forks, cycles and escaping intermediate results prevent a single-path summary. An unaffected neighboring helper may still receive a summary. The arrow describes extracted dependency order; it does not certify fusion, purity, execution order or concurrent execution.

This is a reversible presentation in the canvas roles view. The title and Inspector retain the original helper identity and proof scope. Expanding a summary exposes the original operations and ports, and does not count hidden atomic expression goals as already fulfilled. `paperPipelineSummaries: false`, other granularities and print output retain their existing policy.

## Reproduce

```sh
python3 tools/check_pipeline_fixture_extraction.py
python3 tools/run_local_tests.py
node tools/audit_local_expressions.cjs --pipelines
python3 tools/audit_local_svg.py --pipelines
python3 tools/build_inline_review.py --pipelines
node tools/audit_pipeline_ui.cjs
python3 tools/summarize_publication_checks.py
```

Browser evidence is captured from the actual editor's import, Inspector and export dialog. The three source fixtures cover an unfamiliar composition, an inserted unknown call and an escaping intermediate result. `PipelineMosaic` verifies 7 → 10 → 10 → 7 nodes through expand, save/reopen and refold; exported SVG equals independent CLI rendering. All 334 tests and 43 independent SVG and browser text checks pass. The Python SVG auditor separately resolves bindings, preserving producer output slots across named input interfaces and handling explicit null alias slots.

The immutable baseline is `verification/local-relations/iteration-17-before-local-pipelines`; current reports are in `verification/local-pipelines/current`. Same-source Transformer roles retain 105 nodes, 111 edges and 57 crossings, while nine folded helpers now describe their local operation paths. Height changes from 4702 to 4730px because the descriptions require an extra line; width remains 2588px. This stage improves explanations inside folded boundaries; it does not establish correspondence with the dedicated reference's semantic frontier or solve global layout. Broader adaptive frontier selection, remaining channels, dense crossings, responsive reading and cross-language numeric digest consistency remain unfinished. Validation exits 2 when evidence is consistent but the overall goal is still incomplete.

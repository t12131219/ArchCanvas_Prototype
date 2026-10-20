# Independently entered regions

A region that receives a late context value can also have its own independently sourced entry. In a zoomable canvas, those two expanded source regions may start in neighboring lanes. The exact context arrow may point upward. Vertical placement is a reading convention, not an execution schedule, concurrency claim or purity proof.

The rule uses visible unconditional value/alias/interface dependencies and sibling reachability. It requires expanded producer/receiver regions and an early receiving entry whose external source is not reachable from the producer. A serial helper alone is insufficient. Conditional, control, mutable, unknown and identity-bearing context endpoints or owning regions cannot authorize the relaxation. Unknown calls elsewhere in the receiving region remain visible with their real interfaces; they are not made transparent. Cross-region cycles keep their existing representation.

Automatic selection freezes the current frontier, branch columns, context side and rank strategy. It compares actual routed output with the baseline: identical visible IDs and exact edges/operands/conditions, at least one verified entry group, at least 10% height and area reduction, at most 10% extra width/wire length, no extra crossings/contacts/failures/missing labels/quality issues or smaller native text, no new constraint conflicts, and no loss of realized columns or context channels. Explicit settings, manual frontiers, offsets and print output preserve their chosen policy. `paperFlowAlignment: 'ports'` selects the previous endpoint-alignment convention; `'entries'` explicitly requests the new candidate.

Receipts separate geometric eligibility, automatic acceptance, and final geometry/route realization. The independent SVG audit reconstructs owning frames, source reachability and exact dependency endpoints from saved IR and actual XML, and verifies the exported final paths. No model, class, role spelling, source digest or evaluation case ID selects this layout.

## Verification

```sh
python3 tools/run_local_tests.py
python3 tools/check_flow_fixture_extraction.py
node tools/audit_local_expressions.cjs --flows
python3 tools/audit_local_svg.py --flows
python3 tools/build_inline_review.py --flows
node tools/audit_local_expression_ui.cjs --flows
python3 tools/summarize_publication_checks.py
```

The immutable `iteration-16-before-flow-entries` snapshot is the baseline. Evidence is stored separately in `verification/flow-entries/current`; previous stage receipts remain historical. The two new source fixtures use ordinary helper computations and different operators, with no model-family certificate. One inserts an unresolved call on the receiving entry. Both retain 13 visible nodes and 9 exact edges while reducing height by 92px. Tests cover renamed labels/operators/ports, serial and conditional use, effects and identities, cycles, save/reopen determinism, manual offsets/frontiers and printing.

On the same-source reference evaluation, 105 visible nodes and 111 edges are retained. Canvas height decreases from 5568 to 4702px at unchanged 2588px width; crossings decrease from 60 to 57 and wire length from 84020.3 to 78544.3. One compound entry group with three context bindings is realized. The existing three path-column groups and three context channels remain realized. Fifteen projection declarations and nine context channels remain deferred.

This geometry improvement does not establish correspondence with the dedicated reference's semantic frontier. Whole-graph expression selection, role correspondence, remaining channels, responsiveness and cross-language numeric export digests remain unfinished. The summary intentionally exits 2 with `evidence_consistent: true` and `goal_complete: false`. The deeper manual mixed view still reports `port-label-requires-note`; it is retained explicitly rather than suppressed.

The final suite passes 326 tests. All 36 SVG views pass independent XML/path/endpoint/crossing checks and actual browser node/port text bounds. Actual mixed UI documents verify 29 → 33 → 29 nodes through expansion, save, reopen and refold. The boundary fixture's actual browser export exactly equals CLI output and retains its unresolved call. Updated script resource versions remove a stale browser-cache mismatch observed during review; final UI captures use the current implementation.

# Registered single-step state interfaces

This increment makes current input, supplied state and returned state independently expressible for registered `torch.nn.RNNCell`, `GRUCell` and `LSTMCell` calls. It does not recognize a whole model or infer a time loop. Expanded module titles remain pass-through for wires, including unrelated titles; concrete children and unrelated module bodies remain obstacles. No model name, case ID, source hash or fixture coordinates select a production rule.

The analyzer previously lowered these calls as opaque operations. It now records the registered framework identity and call argument shape. A separate expansion receipt is necessary because the abstract syntax intentionally hides dynamic expressions: `cell(*(x, h))` must not be mistaken for a one-argument call with default state. Missing receipts, expanded arguments, duplicate/extra inputs, inconsistent dependency edges, runtime-only evidence and mutations do not prove a state interface.

The local relation reuses `state-interface`, with `interface_kind: single-step`. It requires the actual source call, a matching registered operator, exact dynamic argument edges and explicit evidence of omitted or literal-None state. Input roles are `step-input` and `initial-state`; tensor returns are hidden state, while LSTM pair slots 0/1 are hidden/cell state. Output labels come from these proven properties. Omitted/None state is labeled as the framework zero-state default. The relation does not assert time recurrence, internal gates, storage identity, input/output equality or a fixed invocation count. Conditions enclosing a call remain in its context and detail view.

Presentation metadata protects the interface from source helper pipeline summaries. Existing state constraints reserve side channels; no new global model layout is introduced. This is a bounded framework interface contract, not proof of custom recurrent computations. Unknown constructors bearing the same name remain unknown. Arbitrary dynamic tuple shapes and runtime calls remain outside this rule.

## Evidence and costs

`verification/cell-interfaces/current/extraction-audit.json` compares the real frozen e098d10 analyzer and current analyzer on the same physical Python file. All node counts, source spans and exact operand edges survive ID mapping; previously opaque registered calls become compute calls. Chained calls at the same start position can renumber compute IDs, so mapping checks lowering order and the full source span. This does not claim that the entire extracted IR is identical: newly known calls can also permit framework identity proofs.

The 54 formal SVGs compare old and current renderers on the **same newly extracted IR**: 9 programs in summary/open states, 6 atomic cell details, and 3 Transformer regression panels, each before/current. The extraction comparison is separate. Saved layouts are reproducible audit intermediates and are ignored by Git. All current captures have no quality issues, failed routes, unplaced port labels or independently detected unrelated-body intrusions. The browser checked actual node text and label bounds with tolerance one native SVG unit, and its paths, node text and junctions are matched to the SVG files.

| View | Crossings before → current | Dimensions before → current |
|---|---:|---|
| StepGate | 0 → 0 | 424 × 340 → 492 × 341 |
| StepPair | 0 → 2 | 606 × 508 → 694 × 508 |
| StepPair atomic detail | 0 → 0 | 424 × 386 → 515.41 × 386 |
| StateWorkshop | 4 → 5 | 606 × 1448 → 654 × 1557.35 |
| ConditionalStep | 3 → 3 | 722 × 586 → 791 × 586 |
| Transformer three panels | 10/13/11 → 10/13/11 | byte-identical SVG and saved documents |

State labels and separate lanes often cost width and wire length. This is an interface-expression improvement, **not an overall compactness improvement**. StateWorkshop wire length falls from 7974.6 to 7736.8, but its height and crossings increase. Its old summary cannot qualify as an assigned figure: it has unplaced gate/values labels and unrelated contacts. Its raw direct goal count remains 18; quality-qualified goals change from 0 to 18. Other direct goal counts remain the same, with generic computation goals replaced by stronger state-interface goals rather than counted as additional computation. The independent report records both raw and quality-qualified goal sets.

The capture producer originally retained a mutable quality-object reference. The final captures deep-copy quality at capture time; all 54 were captured again and the independent checker compares every snapshot with its saved document. Baseline defects are retained, not waived by raw-binding checks.

The final full regression passes 86 groups / 957 tests, including 9 new JS tests and 3 Python tests. Tests cover argument expansion, wrong framework identity, effects, runtime evidence, missing/mismatched edges, conditional context, mixed helper composition, renaming, saved rerender and source expansion. The real UI imported StepPair, exported its document/SVG, reopened the document with byte-identical SVG output, then switched to fully expanded source view with all 10 nodes and 9 edges. This UI exercise uses default overview selection; it does not claim that the role-granularity selector was exercised (it is disabled for this fixture).

The Transformer raw source projection separately preserves all 3371 nodes and 3663 edges. That check does not verify full-source SVG routing or browser performance. Registered cells remain atomic framework operations; there is no claim that their hidden framework implementation can be expanded into gates. Intermediate semantic folding and source-level inspection remain distinct views over preserved evidence.

## Reproduction

Freeze the baseline with `git archive e098d10 semantic_studio semantic_adapter`, extracted into `/tmp/archcanvas-cell-interfaces-before-e098d10` with those two directories intact. Run `python3 tools/extract_cell_interfaces.py`, `python3 tools/audit_cell_extraction.py`, `node tools/audit_cell_interfaces.cjs`, and the same producer with `--case=Transformer-panel-0`, `-1`, `-2`. Then run `python3 tools/check_cell_interfaces.py` and `python3 tools/build_cell_interfaces_review.py`. Browser measurements and UI exports require real browser interaction; `tools/finalize_cell_interfaces.py` binds their evidence to the checked files and test report.

The overall architecture convergence goal remains incomplete. Custom recurrence, partial expert dispatch and broader unseen compositions still require independently proven local facts, while the additional crossings in these state diagrams remain a concrete layout follow-up.

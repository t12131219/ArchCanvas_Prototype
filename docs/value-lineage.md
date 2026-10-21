# Value operands for residual evidence

Source dependencies include configuration as well as tensor values. Before this
change, the generic backward dependency search interpreted
`x + resource[:, :x.size(1)].to(dtype=x.dtype)` as a residual. The size and dtype
dependencies do not show that the resource branch transforms x's tensor value.
The strict source recognizer already stopped shape/attribute paths, but still
accepted `x + resource.to(x)` and `x + torch.zeros_like(x)` through exemplar and
allocation inputs. A conditional branch could inherit that incorrect proof.

Both searches now restrict the operands allowed to establish a residual value
path. Shape, attribute, scalar metadata and allocation operations cannot establish
that path. For supported transformations, the explicit receiver or functional
input carries the value; additional dtype/device/shape/axis arguments cannot
independently establish it. The browser-side search also handles the corresponding
observed ATen operand ports. Ordinary arithmetic, index and mask values keep their
dependencies. Opaque calls, mutations, conditions and result slots retain their
existing boundaries. This is a bounded operand policy, not a complete tensor type
system or a claim to recover arbitrary Python behavior.

If binary operands have a source dependency but no proved value branch path,
the browser can retain a structural `operand-expression` group. Its title names
the terminal operation (for example `Add expression`), its roles record both
exact operand edges and slots, and it generates no residual/bypass assertion.
The rule applies to add, subtract, multiply, divide and matrix multiplication.
Effect, conditional, unknown and observed boundaries prevent this grouping.

No dependency is deleted. Configuration and resource inputs remain in canonical
IR, summary cuts and further source expansion. Support members of a genuinely
proved branch can still include its configuration dependencies; only the proof
path is restricted. No model name, class name, fixture ID or layout coordinate
selects this behavior. Expanded frame titles remain passable by wires, with
concrete nodes and unrelated frame bodies protected.

The generic architecture rules are now `architecture-rules/5`. Strict certificates
retain the existing `source-contracts/1` format. Fresh extraction is the evidence
for the new source claims; this change does not rewrite historical saved IR.

## Reproduction

Run from `prototype/Summary_Merge`:

```bash
python3 tools/extract_value_lineage.py
python3 tools/check_value_extraction.py
python3 tools/freeze_value_lineage.py
node tools/audit_value_lineage.cjs
node tools/audit_value_lineage.cjs --large
python3 tools/check_value_lineage.py
node tools/audit_value_lineage_roundtrip.cjs
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/value-lineage/current/source-expandability.json
python3 tools/build_value_lineage_review.py
python3 tools/run_local_tests.py
```

The before implementation is committed `15d39ee`, loaded in an isolated script
registry. Before/current SVGs use identical canonical input and requested state;
the separate certificate comparison runs the frozen Python recognizer on those
same facts. It exposes the strict recognizer's earlier errors rather than silently
removing them from the baseline. The independent audit reads actual XML paths,
checks geometry and canonical accounting, reports retracted findings and goals,
and requires common direct expression goals to survive.

Nine unfamiliar source programs exercise configuration, exemplars, allocation,
shape, genuine transformed values, functional keyword inputs, helper composition,
unknown calls, conditional alternatives and index values. Tests also exercise
renaming, exact source preservation, observed ports and mutation boundaries.

The full regression has 74 groups / 849 passing tests. Fresh extraction exactly
reproduces all nine fixtures and the Transformer canonical IR: 3371 nodes, 3663
edges and 78 strict certificates. Saved-document rendering and close/reopen are
deterministic in four local cases. Source projection recovers every canonical
node/edge; this does not rerun the historical full-source SVG routing/performance
or editor import/save UI exercise.

The first attempt removed the false summaries without a structural alternative;
the automatic main frontier changed and crossings rose from 12 to 41. It is
retained in `verification/value-lineage/attempt-1` as a rejected intermediate
result. The final implementation keeps ordinary expressions foldable instead
of reinstating the false residual. This iteration claims a semantic correction,
not a compactness improvement. The fixed main/detail SVG measurements and browser
inspection are stored in `verification/value-lineage/current`. Overall convergence
towards the dedicated reference remains incomplete; later grouping must summarize
the corrected dependencies honestly rather than restore the false residual.

The final independent audit checks 24 SVGs and rejects four corruption classes:
operand slots, operand edges, boundary cuts and false bypasses. All three fixed
Transformer views preserve their geometry and common direct expression goals:

| View | Nodes / wires | Dimensions | Crossings | Wire length |
|---|---|---|---|---|
| Main | 65 / 70 | 1968 × 3278 | 12 | 35043.7 |
| Detail 1 | 44 / 48 | 1404 × 2466 | 3 | 15340.3 |
| Detail 2 | 64 / 63 | 1710 × 3180 | 9 | 24904.2 |

The two positional computations lose their incorrect residual interpretation
and retain `Add expression` summaries. The 78 strict source certificates are
unchanged; 24 other generic residual findings remain. Main/detail direct goal
counts remain 21 / 25 / 37. Main title passages remain 41, with concrete nodes
and unrelated module bodies protected. Browser inspection covers eight inline
comparison views, 182 node shapes and 315 text bounds without overflow. Screenshots
and the measured browser report accompany the review page.

# Long source paths with reversible detail

This stage makes a long, proved source dependency path usable as a compact architecture element. The previous compiler accepted at most six operations, and rejected a source helper once publication had partitioned it into synthetic Stage frames. It now inspects through exact `structural-region` display partitions. Each partition must retain its complete canonical membership and its actual original cut edges. Other synthetic semantic regions do not authorize composition.

Serial paths no longer have the six-operation limit. Converging trees and reused-result DAGs keep their existing bounded formula policy. Unknown operations, runtime-only regions, observations, conditions, mutable effects, state writes, shared identity, certificates and iteration boundaries continue to prevent composition across that boundary. Escaping intermediate results reject a single-result path. A later external value prevents automatic summary lowering, preserving its precise consumer. An independently proved neighboring helper may still be summarized next to an unknown call or state write.

For long paths, consecutive calls with the same operator/type/label basis can share a call-count description: `sin · 8 calls → tanh · 3 calls → nan_to_num · 2 calls → cos`. This only compresses labels. It does not prove identical configurations, idempotence, shared parameters, equal outputs, purity, fusion or execution order. The source fixture intentionally contains `nan=0.0` and `nan=1.0`; both original call records and configurations remain distinct. Different operation labels remain in full dependency order. The SVG tooltip and Inspector retain the individual call IDs and exact operand receipts.

No model name, class name, case ID, hash or dedicated coordinate selects this representation. `local-pipelines/5` and `summary-goals/2` independently check source ownership, display partitions and label-run membership/count/order. A displayed summary earns coarse dependency-structure coverage only. Hidden operation or full operand goals remain unfulfilled. Explicit role requests retain priority over automatic source-path compression.

## Measured results

Baseline: `verification/serial-paths/experiment/before`, copied byte for byte from commit `8da4f97cd51007c059f729952b5667955387a2a9`. All producer JavaScript files are frozen and verified against Git. Current paired SVGs are freshly generated from the same source-derived IRs. Canonical IR, object accounting, bindings and source cuts are independently audited.

| Input | Before → current nodes | Before → current height | Crossings |
|---|---:|---:|---:|
| LongCurve | 19 → 5 | 1728 → 498px | 0 → 0 |
| MixedCurve | 21 → 7 | 1836 → 606px | 0 → 0 |
| StatefulCurve | 21 → 7 | 1758 → 528px | 0 → 0 |
| RefactoredCurve | 21 → 5 | 1908 → 518px | 0 → 0 |
| VariedCurve | 13 → 5 | 1176 → 498px | 0 → 0 |
| BoundedWeave | 28 → 19 | 2374 → 1430px | 1 → 1 |
| MixedBoundary | 30 → 21 | 2482 → 1538px | 3 → 3 |
| ConditionalWeave | 32 → 23 | 2486 → 1542px | 3 → 3 |

EscapingCurve, fixed-policy Transformer, SameSource and GatedMixture retain byte-identical complete SVGs. LateCurve retains identical geometry/routes; its expanded helper now includes the path proof in its tooltip. The default adaptive strategy may choose different internal detail once a compact path becomes available. Explicit role selections are checked separately and must stay visible.

Final evidence contains 559 passing tests, including 10 new regressions, and 30 actual SVG panels. The browser measured 1208 node texts and 28 edge labels with no bounds failures. An additional pair explicitly requesting the first numerical-guard role retains a byte-identical complete SVG and the original exact role identity. The mutable `add_` in StatefulCurve remains an unresolved effect boundary; this case does not certify a complete state-update contract.

The real editor sequence is `5 summary → 12 frames → save/reopen 12 → 19 operations → refold 5 → 34 raw source → restore 5`. The reopened, refolded and restored SVGs are byte-identical to their corresponding originals. Three actual UI exports also equal independent CLI rendering; all 34 canonical source node IDs are visible in the raw source export. The separate Transformer raw-source projection still restores 3371 nodes and 3663 edges without changing the IR. This projection check does not verify thousands-node SVG routing or browser performance.

## Reproduce and review

```sh
python3 tools/run_local_tests.py
node tools/audit_serial_paths.cjs
python3 tools/check_serial_paths.py
node tools/audit_serial_paths_ui.cjs
python3 tools/build_serial_paths_review.py
python3 tools/summarize_publication_checks.py
```

Use the actual editor to import `verification/serial-paths/experiment/LongCurve-ui-import.json`, exercise expansion/save/import/source/refold, and export the corresponding UI files before the UI audit. Open `review.html` for the real paired SVGs and `text-qa.html` for native browser text bounds. Browser measurement and screenshots are actual observations; the scripts do not manufacture them. Ignored `.layout.json` documents are regenerated by the render audit.

The last command intentionally exits 2 when evidence is consistent but the full objective remains incomplete. Complete Transformer adaptive comparison remains in the original live session 51885; it must be polled rather than restarted because observation times out. Its current renderer loads after the frozen before renderer has finished writing its outputs. `install-record.json` records current hashes and confirms outputs were absent when this semantic update was installed.

This is progress in generic long-path expression. It does not establish convergence with the dedicated Transformer reference. Fixed-policy Transformer remains 86 nodes / 94 edges / 47 crossings at 2230 × 3776px. Main-graph detail planning, useful detail panels, long context routes, fit-to-viewport reading, broad held-out state/control/routing/effect compositions and thousands-node rendering remain unfinished.

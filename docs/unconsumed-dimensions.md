# Unconsumed dimension unpack bindings

Canvas role views may attach a Tensor shape read to configuration evidence when its consumed slots lead only to known configuration ports and all remaining uses are exact, local, unconsumed unpack aliases. This is a presentation policy over the extracted source graph, not dead-code elimination. Tensor rank, unpack validity, actual values and successful execution remain unproved.

The policy does not use model, class, variable, case or hash names. It checks all outgoing uses of the shape read, all incoming/outgoing edges of each terminal alias, matching decimal source/target/alias slots, source scope, ordinary static evidence and a recomputed Tensor dimension contract. Duplicate alias slots, effects, conditions, runtime evidence, missing/cyclic ownership, unknown calls, returned values and feature consumers block the corresponding group. A shape read whose slots are all unconsumed has no configuration consumer and is not licensed by this policy.

`dimension-paths.js` records each unconsumed slot, the original dependency edge and source range in `unconsumed_bindings`. Every alias has an `unconsumed_binding_of` receipt. Configuration consumer inspector notes include the upstream shape proof, including these slots. The original IR is unchanged. Opening a path summary restores its actual operations; configuration-only reads stay attached at role granularity, while raw source projection restores every original node/edge. Opening a helper alone is therefore not a claim that every configuration read becomes a feature computation again.

The same change corrects `reshape` port classification: for a method with a receiver edge, `arg:0` is a dimension argument; for functional `torch.reshape`, `arg:0` remains the feature input. `paperUnconsumedDimensions:false` restores the previous classification and unused-slot policy, allowing exact frozen SVG comparison. `paperDimensionPaths:false`, print views and other semantic granularities also opt out. Browser script query versions have been refreshed.

## Evidence

Baseline is the actual `e631829` implementation, loaded in an isolated VM. Small baselines were rendered from its frozen scripts and current optout SVGs must match them byte for byte. Three large baselines reuse hash-checked actual SVG/layout captures from that implementation; input, state, implementation and capture hashes are checked before reuse.

Commands from the repository root (first freeze the actual baseline once with `git archive e631829 semantic_studio`, extracting it with `--strip-components=1` into `/tmp/archcanvas-unconsumed-dimensions-before-e631829`):

```sh
python3 tools/extract_unconsumed_dimensions.py
node tools/audit_unconsumed_dimensions.cjs
node tools/audit_unconsumed_dimensions.cjs --case=Transformer-panel-0
node tools/audit_unconsumed_dimensions.cjs --case=Transformer-panel-1
node tools/audit_unconsumed_dimensions.cjs --case=Transformer-panel-2
python3 tools/check_unconsumed_dimensions.py
python3 tools/build_unconsumed_dimensions_review.py
python3 tools/run_local_tests.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/unconsumed-dimensions/current/source-expandability.json
python3 tools/finalize_unconsumed_dimensions.py
```

The independent proof audit reads the hash-checked physical Python AST, verifies Tensor parameter annotations and the exact unpack target corresponding to each unconsumed slot, recomputes symbolic dimension facts and configuration-only use closure, and checks original dependencies/uses. Actual SVG/XML checks cover port bindings, canonical accounting, expression assignments, body obstacles and geometry. Expanded module titles may be crossed. Browser DOM measurements use one native SVG unit tolerance and are bound to the actual file text, paths and junctions by the finalizer.

84 test groups / 936 tests pass, including 13 new tests. Two source-fork-width tests require their original shape-read/transform fork to exist; those tests explicitly disable this new configuration policy so they continue to exercise width refinement and rejection, retaining their existing assertions. New policy behavior is separately tested and audited in the same unfamiliar programs.

108 formal SVGs (54 before/current pairs) pass the independent audit. The real browser measured 1,375 nodes, 2,306 node text elements and 60 port labels without text overflow. Nine fresh programs cover partial dimensions, feature/escaping/unknown consumers, all-unused slots, conditional/untyped inputs, GRU/unknown composition and interrupted paths. Manual expansion states are included.

| State | Before | Current | Crossings before → current |
|---|---:|---:|---:|
| PartialDimensions summary | 330 × 700 / 8 nodes | 300 × 390 / 4 nodes | 0 → 0 |
| PartialDimensions open | 330 × 700 | 330 × 596 | 0 → 0 |
| MixedDimensions | 424 × 1129 | 424 × 897 | 1 → 0 |
| Transformer main panel | 1968 × 3255 | 1968 × 3255 | 10 → 10 |
| Transformer detail panel 1 | 1461 × 2536 / 44 nodes | 837 × 2686 / 41 nodes | 3 → 14 |
| Transformer detail panel 2 | 1800 × 3160 / 64 nodes | 937 × 3136 / 58 nodes | 8 → 12 |

The two Transformer detail panels stop rendering respectively three/six shape reads as feature computations. Width drops about 43%/48%. This is **not** an across-the-board layout improvement: panel 1 grows in height and wire length (14535.5 → 18292.7), and both detail panels have more crossings. MixedGrid also has one more crossing (2 → 3). There are no new failed routes, unplaced port labels or measured quality issues; these facts do not erase the recorded crossing costs. Further generic route organization remains necessary.

Direct expression exposure drops from 25 → 19 and 37 → 25 in the detail panels, including source-use relationships and the attached atomic reads. The independent report lists every lost direct goal and its current node dispositions. It does not count receipts, attachment or dependency summaries as direct atomic coverage. The main panel SVG is byte-identical to the baseline. Full extracted configuration evidence includes 54 licensed shape groups, each retaining an unconsumed slot receipt; this number is not the count of newly visible groups in a panel.

Raw source projection preserves all 3,371 nodes and 3,663 edges of the same Transformer input (SHA-256 `b1848176e4dc66c7cf4add5656684e5cc686a97532e39fe3e0d51eafff2315cb`). Full-source SVG routing/performance and a new editor UI import/export exercise were not validated. Saved-state rerender and raw/source expansion are tested.

The overall semantic folding and layout convergence goal remains incomplete. Dedicated `01093cc06a87b35a` is a review reference, never a production selection condition. Current artifacts and screenshots are in `verification/unconsumed-dimensions/current/`.

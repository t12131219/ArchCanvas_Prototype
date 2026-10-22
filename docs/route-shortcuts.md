# Final shortcuts of crossed polylines

The previous configuration folding made two Transformer detail panels narrower but increased their crossings. Inspecting actual SVG polylines found long, interlaced input/context detours. This change learns a generic geometric operation from that problem: remove an unnecessary subpath only when the actual final drawing gets fewer crossings and shorter total wire, while every fact and physical endpoint stays intact.

`architecture-layout.js:routeShortcuts` proposes orthogonal replacements between points of an existing crossed route. It uses nearby route coordinates and obstacle boundaries, not model/class/operator labels, case IDs, source hashes or case coordinates. Both physical terminals and their approach directions stay fixed. Candidates must be shorter, obstacle-free and free of self intersections or immediate reversals. Expanded titles remain pass-through; real nodes, unrelated module bodies and existing port labels remain obstacles.

`publication-renderer.js:prepareRouteShortcuts` runs after final semantic/folding/profile selection. It does not feed altered geometry costs back into adaptive folding or earlier arrangement selection. All other paths stay fixed. Complete figure measurements must show strictly fewer crossings and shorter wire, no dimension/font/route/label regression, and preservation of canonical identities, prior applied constraints, realized entry/column/context relations and direct expression goals. Even same-value shared stems cannot be introduced implicitly; pairwise overlap lengths and contacts cannot grow. Existing marked shared fanout paths are excluded.

The pass applies to canvas role views only. It skips manual geometry, print, other semantic granularities, graphs with more than 128 edges, failed routes and unplaced labels. State/feedback/control dependencies, explicit design/context channels, iterations and bundles keep their prior policies. An ordinary wire may end at an opaque or mutable boundary without changing that boundary or interpreting its computation. Exact conditions remain attached. `paperRouteShortcuts:false` restores the frozen baseline SVG byte for byte.

Work is bounded by 12 crossed edges, input paths of at most 24 points, 8,192 generated alternatives per edge, 64 retained candidates per edge and four complete figure measurements per edge. It is a local search and cannot guarantee the global crossing minimum or fix node arrangement problems.

## Verification

Baseline is actual commit `b3eb8b1`, loaded in an isolated VM. Small states rerender that implementation; large states reuse its hash-verified actual SVG/layout captures, after checking source scripts, input, state and artifact hashes. Current optout renders are compared byte for byte to small frozen baselines. Production/test sources remain fixed during the final captures and regression run.

```sh
mkdir -p /tmp/archcanvas-route-shortcuts-before-b3eb8b1
git archive b3eb8b1 semantic_studio | tar -x -C /tmp/archcanvas-route-shortcuts-before-b3eb8b1 --strip-components=1
python3 tools/extract_route_shortcuts.py
node tools/audit_route_shortcuts.cjs
node tools/audit_route_shortcuts.cjs --case=Transformer-panel-0
node tools/audit_route_shortcuts.cjs --case=Transformer-panel-1
node tools/audit_route_shortcuts.cjs --case=Transformer-panel-2
python3 tools/check_route_shortcuts.py
python3 tools/build_route_shortcuts_review.py
python3 tools/run_local_tests.py
node tools/audit_source_expandability.cjs verification/helper-contracts/current/Transformer-current.json verification/route-shortcuts/current/source-expandability.json
python3 tools/finalize_route_shortcuts.py
```

The independent checker reads actual SVG/XML coordinates and polylines, validates canonical endpoint/slot metadata, body obstacles and labels, and independently checks path orthogonality, self crossings, approach directions and length. It requires identical IR, architecture, publication/folding, node positions, labels, canonical accounting, expression goals/coverage, summaries and marked junctions. All unchanged edge routes must remain identical. Source argument and dimension receipts continue to be checked against physical Python source AST and hash-verified bindings. The finalizer binds actual browser DOM texts, paths and junctions to the saved SVG files.

Nine new tests cover a crossing detour, obstacle/title policy, bounds, exact terminals, unknown/conditional boundaries, a real mutable source program, rejected cache isolation, saved-state rerender and composition with previous scope-port selection. The prior scope-port test disables this later path pass to retain its original stage-specific assertions; the new composition test verifies both passes together (8 → 7 crossings). A frozen semantic-view test exposed accidental application outside role granularity; the production guard was corrected, retaining that test unchanged.

Three new physical-source programs cover interlaced helpers and context, unknown/conditional interruptions and GRU state composition; each has summary/open states. They are included with the existing unfamiliar, incomplete, shared, escaping, mutable and conditional cases. These new programs remain byte-identical rather than being claimed as additional visual improvements.

Final verification passed 85 test groups / 945 tests and 120 actual SVG captures (60 before/current pairs). Independent XML/source checks found exactly three changed paths; all other captures remained byte-identical. Browser DOM inspection covered 1,512 node instances across the 120 SVGs with no node-text or port-label overflow at one native SVG unit tolerance. Saved browser paths, node texts and marked junctions are bound to the captured SVG files by the finalizer.

| View | Crossings before → current | Total wire before → current | Dimensions |
|---|---:|---:|---|
| MutableShape | 1 → 0 | 803.7 → 537 | 424 × 548 |
| Transformer main panel | 10 → 10 | 35106.2 → 35106.2 | 1968 × 3255 |
| Transformer detail panel 1 | 14 → 13 | 18292.7 → 18276.7 | 837 × 2686 |
| Transformer detail panel 2 | 12 → 11 | 19949 → 19933.4 | 937 × 3136 |

The before/current browser screenshots show the removed detour in MutableShape and the unchanged node organization of the attention detail. Numerous crossings and long paths remain, especially around context and mask inputs. This is a small routing improvement, not evidence that the overall architecture has reached the dedicated reference's clarity.

The overall convergence goal remains incomplete. The semantic folding state still allows finer source expansion; raw source projection must retain all 3,371 nodes and 3,663 edges. Full-source SVG routing/performance and a new editor UI import/export exercise are outside this round's evidence. Dedicated Transformer `01093cc06a87b35a` remains a review reference, never a production selection condition.

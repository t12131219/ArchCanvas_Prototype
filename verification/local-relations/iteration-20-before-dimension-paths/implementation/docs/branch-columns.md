# Dependency path columns

A zoomable canvas role view can align independent visible dependency paths that enter a common consumer. The rule uses exact local edges and their consumer operand slots. It does not read model names, class names, operator names or role spellings. It does not assert concurrent execution, stage equivalence, parameter sharing or a complete model family.

At a common consumer, walk backwards along unconditional ordinary value dependencies through visible compute or collapsed composite nodes. Each path node must have only the next path node as its visible consumer. Stop at a fork, unknown/control/conditional/mutable/identity boundary, expanded source frame, state/iteration/bypass route, or unresolved cycle. Two to six disjoint paths, each at least two nodes long, qualify when their topological rank sequences match. Matching ranks are a placement prerequisite, not proof that the computations implement corresponding algorithm stages. Original consumer-edge order determines column order; operands themselves are unchanged.

The layout puts the paths in separate columns, keeping each path centered through its measured node widths. Non-path nodes keep their own row band; they cannot wrap a path into another column. The final receipt verifies row and center alignment, separate horizontal extents, forward vertical order, and every final route. The existing `parallel-projections` soft declaration is consumed only when its exact visible members belong to distinct realized paths; folded declarations remain deferred.

Already-expanded presentation-only dependency bands/panels may become reversible ownership annotations in the canvas role view. Their complete membership/cuts and labels remain inspectable in the saved plan and annotations. This removes count/rank outlines, not unknown, conditional, state or source boundaries enclosed by them. A focused or folded band keeps its frame. Source frames retain their existing guards. Printing and the source-frame view keep their old behavior.

Automatic selection compares a candidate with the established frontier and selected context channels. It requires strictly more realized path groups, identical visible nodes and exact presented edges, no additional crossings, contacts, route failures, missing labels or quality issues, no smaller native text, and at most 10% additional area or wire length. Manual offsets/frontiers and explicit settings are preserved. A candidate can be rejected even when crossings decrease.

## Verification

```sh
python3 tools/run_local_tests.py
python3 tools/check_branch_fixture_extraction.py
node tools/audit_local_expressions.cjs --branches
python3 tools/audit_local_svg.py --branches
python3 tools/build_inline_review.py --branches
node tools/audit_local_expression_ui.cjs --branches
python3 tools/summarize_publication_checks.py
```

`iteration-15-before-branch-columns` freezes the prior implementation. This stage has a separate evidence directory; earlier context-lane evidence remains historical. New source examples include different operators and independent inputs with no semantic family certificate, plus an inserted unresolved call. The latter can retain known path fragments while its unknown boundary stays visible; automatic geometry acceptance is a separate question. Tests also alter labels, ports, conditions, effects, identity, escaping uses, cycles, chain lengths and manual positions.

Independent XML/path checks verify the actual SVG node transforms, dimensions, path columns, original bindings, final terminal locations and segment crossings. Actual browser text bounds and visual comparison complement these checks. Green checks do not prove reference correspondence or arbitrary-model readability. The full objective remains active, including semantic frontier/reference correspondence, adaptive expression selection, unknown/mixed composition, clearer global organization, performance and export contracts.

The candidate's nonregression budget is relative to the current frame policy, not to the frozen implementation. Removing rank bands can trade crossings for less enclosure and area: the new woven example changes from 0 to 2 crossings against the freeze, and the interrupted example from 0 to 3. Within the new frame policy, columns reduce the woven candidate from 3 to 2 crossings. The interrupted candidate reduces 3 to 1 but increases wire length by about 25%, so automatic selection rejects it. Its explicitly enabled two-path view is an experiment only. These are distinct comparisons, all retained in the audit.

The same-source reference evaluation retains 105 visible nodes and 111 edges, with three realized three-path groups. Crossings change from 65 to 60 and wire length from 87508.6 to 84020.3; the 2588 × 5568 canvas is unchanged. Three exact projection declarations are now applied and route-verified; fifteen remain deferred at the current frontier. Only three of twelve context channels are realized. The overall diagram remains taller and more staggered than the dedicated reference.

The final suite passes 319 tests, including a separate feedback component beside aligned paths. Thirty-two actual SVG views have independent XML/path/crossing audits and browser node/port text checks. Real UI documents verify 29 → 33 → 29 mixed-graph expansion, save, reopen and refold, plus the unfamiliar woven graph's exported SVG. The deeper manual view retains its existing `port-label-requires-note` issue. Candidate rendering adds bounded evaluation work; interactive responsiveness remains an unresolved concern. `summarize_publication_checks.py` intentionally exits 2 with `evidence_consistent:true` and `goal_complete:false` until the broader objective is met.

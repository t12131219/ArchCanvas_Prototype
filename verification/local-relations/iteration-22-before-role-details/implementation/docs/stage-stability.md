# Evidence detail and canvas layout stability

A reversible presentation stage must not determine how much unrelated evidence
is exposed. `publication.js` now selects the automatic evidence frontier on the
stage-free plan, then forms certified presentation stages. The stage still owns
only its certified subset and exact cuts; its closed boundary remains expandable.
Conditional, unknown and independent branches retain the same automatic `open`
list as the stage-disabled projection, including under different budgets.

On the canvas, `paperAuto:false` specifies manual **folding**. It does not specify
manual node positions. `publication-renderer.js` now keeps the existing bounded,
measured label, topology, context, column and independent-entry proposals active
for a manually selected canvas frontier. Their quality gates and exact-binding
checks still decide acceptance. Actual `offsets` continue to bypass these layout
refinements; explicit candidate profiles remain respected. The print behavior is
unchanged. No new model-family detection or geometry template is introduced.

The change fixes a generic coupling: toggling one module previously disabled
layout refinements for the entire graph. It does not guarantee that all nodes
keep their prior coordinates after any expansion. Maintaining local geometry
under changes to compound sizes is still an open task.

Reproduce from `prototype/Summary_Merge`:

```sh
python3 tools/run_local_tests.py
node tools/audit_local_expressions.cjs --stability
python3 tools/audit_local_svg.py --stability
python3 tools/build_inline_review.py --stability
node tools/audit_stage_ui.cjs --stability
python3 tools/summarize_publication_checks.py
```

The UI audit uses new exports from the actual editor: inspect a stage, expand,
save, reopen, refold, and expand all. The browser text report checks all produced
SVG node and port-label bounding rectangles. Visual screenshots are actual
browser captures. Review `verification/stage-stability/current/README.md` for
results and tradeoffs. The summary deliberately returns 2 while the wider goal
remains incomplete.

The baseline is the immutable snapshot
`verification/local-relations/iteration-19-before-stage-stability`, made at
`f5413598c4e3c782c09b2f8b2ddeeee73a69645a`. For exact prior input/state pairs,
the producer copies hashed prior outputs without altering them, including their
stage receipts. New baseline states execute the frozen implementation. Existing
`contract-stages/current` evidence remains historical.

The production rules use evidence and visible topology. Transformer is one
comparison input alongside conditional, unknown, chained, image, independent
entry and mixed computations; source names and IDs select evaluation inputs
only. Reference-frontier equivalence and the wider architecture goal have not
been established.

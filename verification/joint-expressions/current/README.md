# Joint expression evidence

See `docs/joint-expressions.md` for semantics, measurements and limitations.
Open `review.html` for actual comparisons and `text-qa.html` for native SVGs.

`small-render-report.json` and `large-render-report.json` capture 84 actual figures (including rejected trials), 24 before/current sets and all measured choices. `independent-report.json` independently recomputes the decisions. `test-report.json` and 51 named logs preserve the completed 630 tests. `ui-report.json` binds actual chooser/save/reopen/return operations to SVG bytes; `browser-text-report.json` binds 88 panels to native DOM measurements.

Stage evidence is not full-goal completion. At the fixed two-trial budget, Transformer coverage regresses from 49/1855 to 41/1855, with an unchanged main SVG. SourceMosaic reduces two figures to one at equal coverage; MixedWeave adds three goals with fewer figures but more total area. Conditional and unfamiliar protected regions still contain deferred work. Dedicated-reference convergence and thousands-node SVG/UI performance remain unverified.

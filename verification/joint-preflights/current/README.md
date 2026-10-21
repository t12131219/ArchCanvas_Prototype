# Joint preflight evidence

See `docs/joint-preflights.md`. `review.html` presents actual before/current figures; `text-qa.html` inlines 87 formal SVGs plus five actual UI exports at native size.

Frozen baseline is joint planner `eac5953`. Reports bind production, inputs, exports and frozen bytes. `projection-report.json` independently replays 13 projections across 12 current sets without importing the planner; `independent-report.json` recomputes physical goals and actual joint choices. `test-report.json` and 52 named logs preserve 635 completed tests. Actual file chooser/save/reopen/detail-return operations are bound by `ui-report.json`.

Transformer coverage recovers 41/1855 -> 49/1855 at two routed trials, with an unchanged main and 2 -> 3 figures. MixedWeave gains five goals with 2 -> 3 figures and more total area. Nested/broken inputs keep coverage with 4 -> 2 routed trials. No main/reference convergence, timing benchmark, global optimum or thousands-node SVG/UI claim is made. Full objective remains active.

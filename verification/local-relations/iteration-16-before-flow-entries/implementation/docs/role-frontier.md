# Generic certificate role frontier

The canvas “角色关系” preset (`paperGranularity:'roles'`) adds one local layer inside certificate-owned modules. It is an intermediate frontier; nested certified computations and ordinary source helpers can still be opened manually. The previous overview/modules/semantic/detailed presets remain available.

`role-frontier.js` traverses the existing certificate roles as node references. It uses node IDs, parent containment and certificate scope, with no model name, class name, source hash, case ID or family-specific role registry. Arbitrary nested role dictionaries are supported. Top-level certificate-owned containers get a local frontier budget, just as concrete sequence representatives have their own budgets.

For each role, it opens only the ancestor path needed to reach that role. A nested certificate, condition/control frame, unknown, mutable boundary, observation or identity boundary stops the automatic path. All other visible direct children stay represented: an unselected helper remains folded, a dropout remains an actual computation, and no auxiliary operation is treated as transparent. Roles outside the module are recorded as external context. No edge or value is replaced by a guessed role-to-role shortcut.

Drawing titles use the existing role path and preserve the operation type in the caption; original labels and complete evidence remain in SVG titles and the inspector. `publication.role_frontier` records each certificate, original role path, original node, selected boundary, visible destination, evidence scope and status. Exposed, boundary, contracted, attached, folded and outside are distinct statuses. A folded role is not counted as an exposed internal computation.

Compact canvas spacing is the default for this preset. A general contact-repair pass now reaches graphs with up to 128 edges; graphs above 64 edges receive bounded contact repairs without the more expensive crossing pass. It preserves canonical edges and physical terminals. Crossings are still reported separately and remain a substantial visual problem in the larger development case.

## Verification

```sh
python3 tools/run_local_tests.py
node tools/audit_role_frontier.cjs
python3 tools/audit_local_svg.py --roles
python3 tools/build_inline_review.py --roles
python3 tools/summarize_publication_checks.py
```

The last command intentionally exits 2 while the full goal remains incomplete. Browser text and real UI export checks must accompany the producer output in `verification/role-frontier/current`. Per-view layout documents repeat the complete IR and are generated locally by the producer rather than versioned. SVGs, compact receipts, screenshots and exact input references are versioned.

Current regression coverage includes an unfamiliar role schema, renamed labels, focused nested contracts, unknown/mutable/conditional boundaries, missing certificate handling, exact projection consumer operands, explicit dropout paths, budget deferral, frozen pre-role view comparison and deterministic save/reopen/expand/refold. Evaluation cases also include mixed circuits, unknown insertion, heterogeneous and mutable sequences. These are development inputs, not a claim of held-out generalization.

## Remaining scope

This is certificate-role consumption, not a complete solution for all local relation fragments. Gate/state/selection relations keep their existing exact ports and focused panels, but still need a common local expression choice alongside certificate-owned modules. Full reference role correspondence has not been established. Source helper frames, long context connections and whole-graph geometry remain substantially different from the dedicated reference.

The reference is evaluation data only. The target remains an appropriate generic intermediate state approaching the reference's expanded semantics, with deeper details retained below it. Passing SVG, accounting and text checks does not prove that target has been achieved. The cross-language JSON numeric-digest issue documented in `inline-sequence-frontier.md` also remains unresolved; original hashed IR is validated and exported facts are compared by JSON value without silently resealing certificates.

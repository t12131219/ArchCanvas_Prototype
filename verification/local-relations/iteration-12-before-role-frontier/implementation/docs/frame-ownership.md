# Source ownership and drawing frames

The generic canvas can now attach an already-expanded redundant source frame as an ownership annotation. This is a presentation transformation: canonical nodes, parent hierarchy, certificate scope, operands, result slots and conditions remain unchanged.

Selection uses local facts only:

- An ordinary source wrapper directly inside a concrete repeat call can attach to that call only when both explicitly bind the same module object.
- An expanded presentation-only dependency/computation region can attach to its visible parent.
- A source enclosure with one visible compound child can attach its ownership to that child. Distinct source identities remain distinct records; this rule does not establish object equality.

Closed frames and focused roots stay visible. The selected frame cannot carry a canonical incident edge, its own contract, condition, mutable flag, shared identity display or observations. Unknown or mutable descendants, shared identity displays, observations and state writes protect affected source boundaries. Conditional descendants keep their actual conditional frame and bindings.

The drawing index reparents visible children past selected frames. `frame_ownership` receipts retain node ID, source label, source locations, source parent, module identity, destination and rule. The canonical presentation plan remains available separately. SVG titles and the inspector expose these receipts. Exported renderer documents include them in layout and publication metadata. Interactive saved documents preserve the IR and view state, from which they are deterministically regenerated.

The canvas control “来源外框 → 保留源码外框” (`paperFrameView:'source'`) restores the previous geometric source frames. Print output retains its earlier policy. Further folding and expansion continue to use the same original IDs.

## Current evidence and limits

Run:

```sh
python3 tools/run_local_tests.py
node tools/audit_frame_ownership.cjs
python3 tools/audit_local_svg.py --frames
python3 tools/build_inline_review.py --frames
```

Browser text checks and actual UI save/reopen/expand/refold evidence belong in `verification/frame-ownership/current`. Previous iteration evidence is frozen in `verification/local-relations/iteration-11-before-frame-ownership`.

This step reduces source nesting. It does not establish correspondence to the dedicated reference's role frontier or solve internal role expression. Reference model names and case IDs occur only in evaluation tools. The production selector has no model-family, source-name, case-ID or source-hash trigger.

The cross-language JSON numeric-digest limitation described in `inline-sequence-frontier.md` remains: independently validate original hashed IR, compare exported canonical facts by JSON value, and do not silently reseal source certificates.
